// Server-side audit logging for schedule views/exports.
// The `log_audit` RPC is not executable by `authenticated`, so the browser
// cannot call it directly (403). This thin server function performs the write
// with the service-role client AFTER verifying the caller is authorized for the
// exact surface being audited (auth alone is not sufficient).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertScheduleAuditScope } from "@/lib/audit-scope.server";

const filterValue = z.union([z.string().max(120), z.number(), z.boolean(), z.null()]);

const schema = z.object({
  action: z.enum(["timetable_printed", "timetable_exported", "timetable_viewed"]),
  // Constrained surface identifier — arbitrary client strings are rejected.
  viewType: z.enum(["student", "faculty"]),
  filters: z.record(z.string().max(40), filterValue).default({}),
});

export const logScheduleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    if (Object.keys(parsed.filters).length > 12) throw new Error("filters too large");
    return parsed;
  })
  .handler(async ({ data, context }) => {
    try {
      await assertScheduleAuditScope(context.userId, data.viewType);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).rpc("log_audit", {
        _entity_type: "schedule",
        _entity_id: "00000000-0000-0000-0000-000000000000",
        _action_type: data.action,
        _old: null,
        _new: { view_type: data.viewType, filters: data.filters },
        _notes: data.viewType,
        _actor_user_id: context.userId,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
