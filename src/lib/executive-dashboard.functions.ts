// Phase 11H.1A: Executive Dashboard — read-only audit logging + scope helper.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertExecRole } from "@/lib/authz.server";

export const logExecutiveDashboardViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertExecRole(context.userId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      await sb.rpc("log_audit", {
        _entity_type: "executive_dashboard",
        _entity_id: null,
        _action_type: "executive_dashboard_viewed",
        _old: null,
        _new: {
          user_id: context.userId,
          timestamp: new Date().toISOString(),
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const getExecutiveScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertExecRole(context.userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: roles } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList: string[] = (roles ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roleList.includes("admin") || roleList.includes("system_admin");
    const isDean = roleList.includes("dean");
    const isDeptHead = roleList.includes("department_head");
    let departmentId: string | null = null;
    if (isDeptHead && !isAdmin && !isDean) {
      // Best-effort: department heads may be linked via faculty_profiles.department_id
      const { data: fp } = await sb
        .from("faculty_profiles")
        .select("department_id")
        .eq("user_id", context.userId)
        .maybeSingle();
      departmentId = fp?.department_id ?? null;
    }
    return {
      roles: roleList,
      isAdmin,
      isDean,
      isDeptHead,
      departmentId,
      scopeLabel: isAdmin || isDean ? "كامل الكلية" : departmentId ? "قسم محدد" : "محدود",
    };
  });
