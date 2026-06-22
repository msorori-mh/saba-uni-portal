// Phase 12A: best-effort audit logging for Operations Center views.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, OPERATIONS_ROLES } from "@/lib/authz.server";

const schema = z.object({
  action: z.enum(["operations_viewed", "backup_status_viewed", "recovery_runbook_viewed"]),
  page: z.string().min(1).max(120),
  section: z.string().min(1).max(120).optional(),
});

export const logOperationsEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await assertAnyRole(
        context.userId,
        OPERATIONS_ROLES,
        "ليس لديك صلاحية تسجيل أحداث مركز العمليات",
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      await sb.rpc("log_audit", {
        _entity_type: "operations",
        _entity_id: null,
        _action_type: data.action,
        _old: null,
        _new: {
          page: data.page,
          section: data.section ?? null,
          timestamp: new Date().toISOString(),
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
