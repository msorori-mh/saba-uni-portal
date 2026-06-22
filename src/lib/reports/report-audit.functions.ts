// Phase 10B: best-effort audit logging for report views and exports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, REPORTS_ROLES } from "@/lib/authz.server";

const schema = z.object({
  reportName: z.string().min(1).max(120),
  action: z.enum(["report_viewed", "report_exported"]).default("report_exported"),
  format: z.enum(["csv", "xlsx"]).optional(),
  rowCount: z.number().int().min(0).max(1_000_000).optional(),
  filters: z.record(z.string(), z.any()).optional(),
});

export const logReportEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof schema>) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await assertAnyRole(
        context.userId,
        REPORTS_ROLES,
        "ليس لديك صلاحية تسجيل أحداث التقارير",
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      await sb.rpc("log_audit", {
        _entity_type: "report",
        _entity_id: null,
        _action_type: data.action,
        _old: null,
        _new: {
          report_name: data.reportName,
          format: data.format ?? null,
          row_count: data.rowCount ?? null,
          filters: data.filters ?? null,
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

// Back-compat alias.
export const logReportExport = logReportEvent;
