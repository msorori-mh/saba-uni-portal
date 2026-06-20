import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DOCUMENT_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

const DOCUMENT_TYPES = [
  "enrollment_certificate",
  "student_status_certificate",
  "official_transcript",
  "financial_receipt",
] as const;

const listInput = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(["issued", "cancelled", "draft"]).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export type OfficialDocumentRow = {
  id: string;
  document_type: string;
  document_number: string;
  verification_code: string;
  status: string;
  issued_at: string;
  student: { id: string; academic_number: string; full_name_ar: string } | null;
};

export const listOfficialDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      DOCUMENT_ADMIN_ROLES,
      "ليس لديك صلاحية عرض الوثائق الرسمية",
    );

    let q = supabaseAdmin
      .from("official_documents")
      .select("id, document_type, document_number, verification_code, status, issued_at, student:student_profiles(id, academic_number, full_name_ar)")
      .order("issued_at", { ascending: false })
      .limit(data.limit);
    if (data.type) q = q.eq("document_type", data.type);
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let result = (rows ?? []) as OfficialDocumentRow[];
    const search = data.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((r) =>
        r.document_number.toLowerCase().includes(search) ||
        (r.student?.academic_number ?? "").toLowerCase().includes(search) ||
        (r.student?.full_name_ar ?? "").toLowerCase().includes(search));
    }
    return result;
  });

export const searchStudentsForDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, DOCUMENT_ADMIN_ROLES);
    const t = `%${data.query}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("student_profiles")
      .select("id, academic_number, full_name_ar")
      .or(`academic_number.ilike.${t},full_name_ar.ilike.${t}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const issueInput = z.object({
  studentProfileId: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const issueOfficialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => issueInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      DOCUMENT_ADMIN_ROLES,
      "ليس لديك صلاحية إصدار الوثائق",
    );

    // RPC checks auth.uid() — must use the authenticated user's client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: result, error } = await sb.rpc("issue_official_document", {
      _student_profile_id: data.studentProfileId,
      _document_type: data.documentType,
      _metadata: data.metadata,
    });
    if (error) throw new Error(error.message);

    const { data: student } = await supabaseAdmin
      .from("student_profiles")
      .select("email, full_name_ar")
      .eq("id", data.studentProfileId)
      .maybeSingle();

    return {
      id: result?.id as string | undefined,
      document_number: result?.document_number as string | undefined,
      verification_code: result?.verification_code as string | undefined,
      student_email: student?.email ?? null,
      student_name: student?.full_name_ar ?? null,
    };
  });

export const cancelOfficialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      documentId: z.string().uuid(),
      reason: z.string().trim().max(500).default("إلغاء يدوي"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      DOCUMENT_ADMIN_ROLES,
      "ليس لديك صلاحية إلغاء الوثائق",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb.rpc("cancel_official_document", {
      _document_id: data.documentId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
