import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OFFICIAL_DOCUMENTS_BUCKET,
  evaluateDownloadAuthorization,
  isDownloadableOfficialDocumentStatus,
  CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR,
  NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR,
} from "@/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";
import { MobileApiError } from "./errors";

export const OFFICIAL_DOCUMENT_SIGNED_URL_TTL_SECONDS = 180 as const;

export type OfficialDocumentDownloadResult = {
  signedUrl: string;
  expiresInSeconds: number;
  documentId: string;
  status: string;
};

type SessionRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Canonical authenticated download for an existing official document.
 * Status barrier (issued|archived) runs before any Storage call.
 * Mobile student callers must be the owning student (staff/admin paths retained for shared reuse).
 */
export async function mintOfficialDocumentSignedUrl(input: {
  officialDocumentId: string;
  userId: string;
  sessionClient: SessionRpcClient;
  /** When true, only the owning student may download (mobile public contract). */
  studentSelfOnly?: boolean;
}): Promise<OfficialDocumentDownloadResult> {
  const { data: doc, error } = await supabaseAdmin
    .from("official_documents")
    .select("id, pdf_url, student_profile_id, student_request_id, status")
    .eq("id", input.officialDocumentId)
    .maybeSingle();

  if (error) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "DOCUMENT_LOOKUP_FAILED",
      "Unable to load document",
      "تعذر تحميل الوثيقة",
    );
  }
  if (!doc) {
    throw new MobileApiError(
      "NOT_FOUND",
      "DOCUMENT_NOT_FOUND",
      "Document not found",
      "الوثيقة غير موجودة",
    );
  }
  if (!(doc as { pdf_url?: string | null }).pdf_url) {
    throw new MobileApiError(
      "NOT_FOUND",
      "DOCUMENT_FILE_MISSING",
      "Document file not found",
      "ملف الوثيقة غير موجود",
    );
  }

  const status = String((doc as { status: string | null }).status ?? "");
  if (!isDownloadableOfficialDocumentStatus(status)) {
    if (status === "cancelled") {
      throw new MobileApiError(
        "INVALID_STATE",
        "DOCUMENT_CANCELLED",
        "Document cancelled",
        CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR,
      );
    }
    if (status === "draft") {
      throw new MobileApiError(
        "INVALID_STATE",
        "DOCUMENT_DRAFT",
        "Document not downloadable",
        NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR,
      );
    }
    throw new MobileApiError(
      "INVALID_STATE",
      "DOCUMENT_NOT_DOWNLOADABLE",
      "Document not downloadable",
      NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR,
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("student_profiles")
    .select("user_id")
    .eq("id", (doc as { student_profile_id: string }).student_profile_id)
    .maybeSingle();
  const isOwner = profile?.user_id === input.userId;

  if (input.studentSelfOnly) {
    if (!isOwner) {
      throw new MobileApiError(
        "NOT_ALLOWED",
        "CROSS_STUDENT_DENIED",
        "Not allowed to download this document",
        "غير مصرح بتنزيل هذه الوثيقة",
      );
    }
  } else {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", input.userId);
    const roleKeys = (roles ?? []).map((r) => String((r as { role: string }).role));
    const isAdmin = roleKeys.includes("admin") || roleKeys.includes("system_admin");

    let isStaffAuthorized = false;
    if (!isOwner && !isAdmin && (doc as { student_request_id?: string | null }).student_request_id) {
      const requestId = (doc as { student_request_id: string }).student_request_id;
      const { data: step } = await supabaseAdmin
        .from("student_request_workflow_steps")
        .select("id")
        .eq("student_request_id", requestId)
        .eq("step_key", "document_issuance")
        .maybeSingle();
      if (step?.id) {
        const { data: canAct } = await input.sessionClient.rpc("can_current_user_act_on_step", {
          p_step_id: step.id,
          p_action: "issue_document",
        });
        isStaffAuthorized = Boolean(canAct);
      }
      if (!isStaffAuthorized) {
        const { data: archiveStep } = await supabaseAdmin
          .from("student_request_workflow_steps")
          .select("id")
          .eq("student_request_id", requestId)
          .eq("step_key", "archive")
          .maybeSingle();
        if (archiveStep?.id) {
          const { data: canArchive } = await input.sessionClient.rpc(
            "can_current_user_act_on_step",
            {
              p_step_id: archiveStep.id,
              p_action: "archive",
            },
          );
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
      throw new MobileApiError(
        "NOT_ALLOWED",
        "DOCUMENT_DOWNLOAD_DENIED",
        "Not allowed to download this document",
        "غير مصرح بتنزيل هذه الوثيقة",
      );
    }
  }

  const pdfPath = String((doc as { pdf_url: string }).pdf_url);
  // Reject absolute URLs / traversal — object key only
  if (
    pdfPath.includes("..") ||
    pdfPath.startsWith("http://") ||
    pdfPath.startsWith("https://") ||
    pdfPath.startsWith("/")
  ) {
    throw new MobileApiError(
      "INVALID_STATE",
      "DOCUMENT_PATH_INVALID",
      "Document storage path invalid",
      "مسار تخزين الوثيقة غير صالح",
    );
  }

  const signed = await supabaseAdmin.storage
    .from(OFFICIAL_DOCUMENTS_BUCKET)
    .createSignedUrl(pdfPath, OFFICIAL_DOCUMENT_SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "SIGNED_URL_FAILED",
      "Unable to create download link",
      "تعذر إنشاء رابط التنزيل",
    );
  }

  return {
    signedUrl: signed.data.signedUrl,
    expiresInSeconds: OFFICIAL_DOCUMENT_SIGNED_URL_TTL_SECONDS,
    documentId: String((doc as { id: string }).id),
    status,
  };
}
