/**
 * Trusted server orchestration for enrollment-certificate PDF Storage Saga.
 * Prepare → Generate → Upload → Finalize (or Fail). No client Storage writes.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OFFICIAL_DOCUMENTS_BUCKET,
  buildOfficialDocumentStoragePath,
  evaluateDownloadAuthorization,
} from "@/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";
import {
  buildEnrollmentCertificatePdfBytes,
  type EnrollmentCertificateSnapshot,
} from "@/lib/documents/enrollment-certificate-pdf";

const BLOCKED_TRIAL_REQUEST_ID = "93807768-a281-42de-bfb4-0c0c03786b20";

function publicAppOrigin(): string {
  return (
    process.env.VITE_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.SITE_URL?.replace(/\/$/, "") ||
    "https://example.invalid"
  );
}

async function rpcAuthed(
  sessionClient: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  fn: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await sessionClient.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

export const executeEnrollmentCertificatePdfStorageSaga = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stepId: z.string().uuid(),
        requestId: z.string().uuid(),
        idempotencyKey: z.string().trim().min(8).max(120),
        comment: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.requestId === BLOCKED_TRIAL_REQUEST_ID) {
      throw new Error("الطلب التجريبي محظور من التنفيذ في هذه المرحلة");
    }

    const prepared = await rpcAuthed(
      context.supabase as never,
      "prepare_enrollment_certificate_document_generation",
      {
        p_step_id: data.stepId,
        p_idempotency_key: data.idempotencyKey,
      },
    );

    if (!prepared?.success) {
      throw new Error(String(prepared?.message_ar ?? prepared?.code ?? "تعذر تحضير الإصدار"));
    }

    const attemptId = String(prepared.attempt_id);
    const storagePath =
      String(prepared.storage_path ?? "") ||
      buildOfficialDocumentStoragePath(data.requestId, attemptId);
    const snapshot = (prepared.snapshot ?? {}) as EnrollmentCertificateSnapshot;
    const verificationToken = prepared.verification_token
      ? String(prepared.verification_token)
      : null;

    if (prepared.status === "finalized" && prepared.official_document_id) {
      return {
        ok: true as const,
        idempotent: true,
        attemptId,
        officialDocumentId: String(prepared.official_document_id),
        status: "finalized" as const,
      };
    }

    // Recovery: uploaded but not finalized → finalize exactly once
    if (prepared.status === "uploaded") {
      const finalized = await rpcAuthed(
        context.supabase as never,
        "finalize_enrollment_certificate_document_generation",
        {
          p_attempt_id: attemptId,
          p_comment: data.comment ?? null,
          p_verification_token: verificationToken,
        },
      );
      return {
        ok: true as const,
        idempotent: Boolean(finalized.idempotent),
        attemptId,
        officialDocumentId: String(finalized.official_document_id ?? ""),
        documentNumber: finalized.document_number ? String(finalized.document_number) : null,
        status: "finalized" as const,
      };
    }

    try {
      await rpcAuthed(
        context.supabase as never,
        "mark_enrollment_certificate_document_generating",
        { p_attempt_id: attemptId },
      );

      if (!verificationToken) {
        throw new Error("رمز التحقق مفقود من محاولة التوليد");
      }

      const verifyUrl = `${publicAppOrigin()}/verify-document?code=${encodeURIComponent(verificationToken)}`;

      const built = await buildEnrollmentCertificatePdfBytes({
        snapshot: {
          student_name_ar: String(snapshot.student_name_ar ?? ""),
          academic_number: String(snapshot.academic_number ?? ""),
          department_name_ar: String(snapshot.department_name_ar ?? ""),
          program_name_ar: String(snapshot.program_name_ar ?? ""),
          academic_year_name: String(snapshot.academic_year_name ?? ""),
          semester_name: String(snapshot.semester_name ?? ""),
          level_name: String(snapshot.level_name ?? ""),
        },
        documentNumber: `PENDING-${attemptId.slice(0, 8)}`,
        verificationUrl: verifyUrl,
      });

      const upload = await supabaseAdmin.storage
        .from(OFFICIAL_DOCUMENTS_BUCKET)
        .upload(storagePath, built.pdfBytes, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (upload.error) {
        const folder = storagePath.split("/").slice(0, -1).join("/");
        const fileName = storagePath.split("/").pop() ?? "";
        const listing = await supabaseAdmin.storage
          .from(OFFICIAL_DOCUMENTS_BUCKET)
          .list(folder, { search: fileName });
        const exists = (listing.data ?? []).some((f) => f.name === fileName);
        if (!exists) {
          await rpcAuthed(
            context.supabase as never,
            "fail_enrollment_certificate_document_generation",
            {
              p_attempt_id: attemptId,
              p_error_code: "UPLOAD_FAILED",
              p_error_message: upload.error.message,
            },
          );
          throw new Error(upload.error.message);
        }
      }

      await rpcAuthed(context.supabase as never, "mark_enrollment_certificate_document_uploaded", {
        p_attempt_id: attemptId,
        p_sha256: built.sha256,
        p_byte_length: built.byteLength,
      });

      const finalized = await rpcAuthed(
        context.supabase as never,
        "finalize_enrollment_certificate_document_generation",
        {
          p_attempt_id: attemptId,
          p_comment: data.comment ?? null,
          p_verification_token: verificationToken,
        },
      );

      return {
        ok: true as const,
        idempotent: Boolean(finalized.idempotent),
        attemptId,
        officialDocumentId: String(finalized.official_document_id ?? ""),
        documentNumber: finalized.document_number ? String(finalized.document_number) : null,
        status: "finalized" as const,
      };
    } catch (err) {
      try {
        await rpcAuthed(
          context.supabase as never,
          "fail_enrollment_certificate_document_generation",
          {
            p_attempt_id: attemptId,
            p_error_code: "SAGA_FAILED",
            p_error_message: err instanceof Error ? err.message : String(err),
          },
        );
      } catch {
        /* best-effort fail mark */
      }
      throw err;
    }
  });

export const getEnrollmentCertificateDocumentSignedUrl = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ officialDocumentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await supabaseAdmin
      .from("official_documents")
      .select("id, pdf_url, student_profile_id, student_request_id, status")
      .eq("id", data.officialDocumentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc?.pdf_url) throw new Error("الوثيقة أو الملف غير موجود");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleKeys = (roles ?? []).map((r) => String((r as { role: string }).role));
    const isAdmin = roleKeys.includes("admin") || roleKeys.includes("system_admin");

    const { data: profile } = await supabaseAdmin
      .from("student_profiles")
      .select("user_id")
      .eq("id", (doc as { student_profile_id: string }).student_profile_id)
      .maybeSingle();
    const isOwner = profile?.user_id === context.userId;

    let isStaffAuthorized = false;
    if (!isOwner && !isAdmin && doc.student_request_id) {
      const { data: step } = await supabaseAdmin
        .from("student_request_workflow_steps")
        .select("id")
        .eq("student_request_id", doc.student_request_id)
        .eq("step_key", "document_issuance")
        .maybeSingle();
      if (step?.id) {
        const { data: canAct } = await context.supabase.rpc("can_current_user_act_on_step", {
          p_step_id: step.id,
          p_action: "issue_document",
        });
        isStaffAuthorized = Boolean(canAct);
      }
      if (!isStaffAuthorized) {
        const { data: archiveStep } = await supabaseAdmin
          .from("student_request_workflow_steps")
          .select("id")
          .eq("student_request_id", doc.student_request_id)
          .eq("step_key", "archive")
          .maybeSingle();
        if (archiveStep?.id) {
          const { data: canArchive } = await context.supabase.rpc("can_current_user_act_on_step", {
            p_step_id: archiveStep.id,
            p_action: "archive",
          });
          isStaffAuthorized = Boolean(canArchive);
        }
      }
    }

    if (
      !evaluateDownloadAuthorization({
        isOwner,
        isStaffAuthorized,
        isAdmin,
      })
    ) {
      throw new Error("غير مصرح بتنزيل هذه الوثيقة");
    }

    const signed = await supabaseAdmin.storage
      .from(OFFICIAL_DOCUMENTS_BUCKET)
      .createSignedUrl(String(doc.pdf_url), 180);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(signed.error?.message ?? "تعذر إنشاء رابط التنزيل");
    }
    return { signedUrl: signed.data.signedUrl, expiresInSeconds: 180 };
  });
