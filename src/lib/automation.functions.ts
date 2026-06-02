// Phase 12A.1 — Academic Automation Foundation
// Configuration + preview only. No automation is executed by these endpoints.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MANAGE_ROLES = ["admin", "system_admin"];
const READ_ROLES = ["admin", "system_admin", "registrar", "dean"];

export type AutomationKey = "registration" | "progression" | "graduation" | "finance";

export type AutomationSetting = {
  key: AutomationKey;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  updated_at: string;
  updated_by: string | null;
};

async function getRoles(sb: any, userId: string): Promise<string[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

async function logAudit(sb: any, action: string, payload: unknown) {
  try {
    await sb.rpc("log_audit", {
      _entity_type: "automation",
      _entity_id: null,
      _action_type: action,
      _old: null,
      _new: payload,
      _notes: null,
    });
  } catch {
    /* ignore */
  }
}

export const getAutomationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    if (!roles.some((r) => READ_ROLES.includes(r))) {
      throw new Error("ليست لديك صلاحية الوصول إلى مركز الأتمتة.");
    }
    const { data, error } = await sb
      .from("automation_settings")
      .select("key, enabled, config, updated_at, updated_by")
      .order("key");
    if (error) throw new Error(error.message);
    return {
      settings: (data ?? []) as AutomationSetting[],
      canManage: roles.some((r) => MANAGE_ROLES.includes(r)),
      roles,
    };
  });

export const updateAutomationSetting = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      key: z.enum(["registration", "progression", "graduation", "finance"]),
      enabled: z.boolean().optional(),
      config: z.record(z.string(), z.any()).optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    if (!roles.some((r) => MANAGE_ROLES.includes(r))) {
      throw new Error("ليست لديك صلاحية تعديل إعدادات الأتمتة.");
    }
    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (data.config) patch.config = data.config;

    const { data: updated, error } = await sb
      .from("automation_settings")
      .update(patch)
      .eq("key", data.key)
      .select("key, enabled, config, updated_at, updated_by")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await logAudit(sb, "automation_config_updated", {
      key: data.key,
      enabled: data.enabled ?? null,
      config_keys: data.config ? Object.keys(data.config) : [],
    });
    return updated as AutomationSetting;
  });

export const logAutomationViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await logAudit(sb, "automation_viewed", { user_id: context.userId });
    return { ok: true };
  });

/* ----------------------------- PREVIEWS ----------------------------- */

export const getAutomationPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    if (!roles.some((r) => READ_ROLES.includes(r))) {
      throw new Error("غير مصرح.");
    }

    // ---- Registration window (current semester) ----
    const { data: currentSem } = await sb
      .from("semesters")
      .select("id, name, code, start_date, end_date, status, is_current, academic_year_id")
      .eq("is_current", true)
      .maybeSingle();

    const { data: nextSem } = await sb
      .from("semesters")
      .select("id, name, code, start_date, end_date, status")
      .gt("start_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    let registrationStatus: "not_started" | "open" | "closed" | "unknown" = "unknown";
    let upcomingAction: string | null = null;
    if (currentSem) {
      const today = new Date().toISOString().slice(0, 10);
      if (today < currentSem.start_date) {
        registrationStatus = "not_started";
        upcomingAction = `يفتح التسجيل بتاريخ ${currentSem.start_date}`;
      } else if (today > currentSem.end_date) {
        registrationStatus = "closed";
      } else {
        registrationStatus = "open";
        upcomingAction = `يغلق التسجيل بتاريخ ${currentSem.end_date}`;
      }
    }

    // ---- Progression preview (by student_profiles.status) ----
    const profileStatuses = ["active", "warning", "probation", "suspended", "graduated", "withdrawn"];
    const standingCounts: Record<string, number> = Object.fromEntries(profileStatuses.map((s) => [s, 0]));
    const statusResults = await Promise.all(
      profileStatuses.map((status) =>
        sb.from("student_profiles").select("id", { count: "exact", head: true }).eq("status", status),
      ),
    );
    profileStatuses.forEach((s, i) => {
      standingCounts[s] = statusResults[i].count ?? 0;
    });

    // ---- Graduation preview (already-graduated + active as near-graduation proxy) ----
    // True eligibility requires the academic-status engine (heavy); preview shows
    // recorded graduates and current active students as the upper bound. Detailed
    // candidate lists live in /admin/graduation-candidates.
    const gradEligibleCount = standingCounts.graduated;
    const nearGradCount = standingCounts.active;

    // ---- Finance preview ----
    const { count: feesPending } = await sb
      .from("student_fees")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    const { count: feesPartial } = await sb
      .from("student_fees")
      .select("id", { count: "exact", head: true })
      .eq("status", "partial");
    const { count: feesPaid } = await sb
      .from("student_fees")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid");

    const total = (feesPending ?? 0) + (feesPartial ?? 0) + (feesPaid ?? 0);
    const collectionRate = total > 0 ? Math.round(((feesPaid ?? 0) / total) * 100) : 0;

    return {
      registration: {
        current_semester: currentSem ?? null,
        next_semester: nextSem ?? null,
        status: registrationStatus,
        upcoming_action: upcomingAction,
      },
      progression: {
        standings: standingCounts,
        eligible_for_warning: standingCounts.warning,
        eligible_for_probation: standingCounts.probation,
        eligible_for_suspension: standingCounts.suspended,
        eligible_for_promotion: standingCounts.active,
      },
      graduation: {
        eligible: gradEligibleCount ?? 0,
        near_graduation: nearGradCount ?? 0,
      },
      finance: {
        fees_pending: feesPending ?? 0,
        fees_partial: feesPartial ?? 0,
        fees_paid: feesPaid ?? 0,
        collection_rate: collectionRate,
        current_semester: currentSem?.name ?? null,
      },
    };
  });
