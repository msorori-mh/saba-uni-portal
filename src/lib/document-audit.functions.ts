// Phase 10A: best-effort audit logging for document print/download actions.
// Never throws to caller; missing auth or RPC errors are swallowed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DOCUMENT_ADMIN_ROLES } from "@/lib/admin-documents.functions";

const schema = z.object({
  documentId: z.string().uuid(),
  action: z.enum(["document_printed", "document_downloaded"]),
});

async function assertDocumentViewAccess(userId: string, studentProfileId: string): Promise<boolean> {
  const roles = await userRoles(userId);
  if (roles.some((r) => (DOCUMENT_ADMIN_ROLES as readonly string[]).includes(r))) {
    return true;
  }
  const { data } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("id", studentProfileId)
    .maybeSingle();
  return !!data;
}

export const logDocumentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { data: doc, error: docError } = await supabaseAdmin
        .from("official_documents")
        .select("document_number, document_type, student_profile_id, status")
        .eq("id", data.documentId)
        .maybeSingle();
      if (docError) return { ok: false, error: docError.message };
      if (!doc) return { ok: false, error: "الوثيقة غير موجودة" };
      if (doc.status !== "issued") {
        return { ok: false, error: "لا يمكن تسجيل إجراء على وثيقة غير صادرة" };
      }

      const allowed = await assertDocumentViewAccess(context.userId, doc.student_profile_id);
      if (!allowed) {
        return { ok: false, error: "ليس لديك صلاحية الوصول إلى هذه الوثيقة" };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      await sb.rpc("log_audit", {
        _entity_type: "document",
        _entity_id: data.documentId,
        _action_type: data.action,
        _old: null,
        _new: {
          document_number: doc.document_number ?? null,
          document_type: doc.document_type ?? null,
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
