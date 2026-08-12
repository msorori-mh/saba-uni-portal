// Server-side audit logging for academic status views/exports.
// `log_audit` is not executable by `authenticated`, so browser calls return 403.
// These actions all originate from privileged academic-report surfaces, so the
// caller must hold the same capability as those reports (STUDENT_READ_ROLES).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAcademicAuditScope } from "@/lib/audit-scope.server";

const schema = z.object({
  action: z.enum([
    "student_progress_viewed",
    "graduation_audit_viewed",
    "graduation_eligibility_viewed",
    "at_risk_report_viewed",
    "graduation_candidates_viewed",
  ]),
  notes: z.string().min(1).max(400),
  entityId: z.string().uuid().optional(),
});

export const logAcademicEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await assertAcademicAuditScope(context.userId, data.entityId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).rpc("log_audit", {
        _entity_type: "academic_status",
        _entity_id: data.entityId ?? "00000000-0000-0000-0000-000000000000",
        _action_type: data.action,
        _old: null,
        _new: { notes: data.notes },
        _notes: data.notes,
        _actor_user_id: context.userId,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
