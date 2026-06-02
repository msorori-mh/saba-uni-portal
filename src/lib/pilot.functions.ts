// Phase 12B — Pilot Launch Package server functions.
// Lightweight read/write for pilot config, participants, scenarios, issues,
// feedback, daily checklist. No business logic changes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MANAGE = ["admin", "system_admin"];
const READ = ["admin", "system_admin", "dean"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRoles(sb: any, userId: string): Promise<string[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAudit(sb: any, action: string, payload: unknown, entityId: string | null = null) {
  try {
    await sb.rpc("log_audit", {
      _entity_type: "pilot",
      _entity_id: entityId,
      _action_type: action,
      _old: null,
      _new: payload,
      _notes: null,
    });
  } catch {
    /* ignore */
  }
}

function requireRoles(roles: string[], allowed: string[], msg: string) {
  if (!roles.some((r) => allowed.includes(r))) throw new Error(msg);
}

/* =========================================================================
   PILOT OVERVIEW (config + counts + readiness score)
   ========================================================================= */

export const getPilotOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "ليست لديك صلاحية الاطلاع على مركز التشغيل التجريبي.");

    const today = new Date().toISOString().slice(0, 10);
    const [
      config, partsActive, partsAll,
      issuesOpen, issuesClosed, issuesCritical, issuesHigh,
      feedback, scenariosTotal, scenariosPass, scenariosFail,
      checklistTotal, checklistToday,
    ] = await Promise.all([
      sb.from("pilot_config").select("*").eq("id", 1).maybeSingle(),
      sb.from("pilot_participants").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("pilot_participants").select("id", { count: "exact", head: true }),
      sb.from("pilot_issues").select("id", { count: "exact", head: true }).in("status", ["open","in_progress"]),
      sb.from("pilot_issues").select("id", { count: "exact", head: true }).in("status", ["resolved","closed"]),
      sb.from("pilot_issues").select("id", { count: "exact", head: true }).eq("severity","critical").in("status",["open","in_progress"]),
      sb.from("pilot_issues").select("id", { count: "exact", head: true }).eq("severity","high").in("status",["open","in_progress"]),
      sb.from("pilot_feedback").select("id", { count: "exact", head: true }),
      sb.from("pilot_test_results").select("scenario_id", { count: "exact", head: true }),
      sb.from("pilot_test_results").select("scenario_id", { count: "exact", head: true }).eq("result","pass"),
      sb.from("pilot_test_results").select("scenario_id", { count: "exact", head: true }).eq("result","fail"),
      sb.from("pilot_checklist_items").select("id", { count: "exact", head: true }),
      sb.from("pilot_checklist_runs").select("id", { count: "exact", head: true }).eq("run_date", today).eq("completed", true),
    ]);

    const testsTotal = scenariosTotal.count ?? 0;
    const testsPass = scenariosPass.count ?? 0;
    const testsFail = scenariosFail.count ?? 0;
    const completionRate = testsTotal ? Math.round(((testsPass + testsFail) / testsTotal) * 100) : 0;

    const checklistAll = checklistTotal.count ?? 0;
    const checklistDone = checklistToday.count ?? 0;
    const checklistPct = checklistAll ? Math.round((checklistDone / checklistAll) * 100) : 0;

    // Readiness score (0..100)
    // weights: tests 40, critical-free 25, high-free 15, checklist 20
    const testsScore = testsTotal ? (testsPass / testsTotal) * 40 : 0;
    const criticalScore = (issuesCritical.count ?? 0) === 0 ? 25 : Math.max(0, 25 - (issuesCritical.count ?? 0) * 10);
    const highScore = (issuesHigh.count ?? 0) === 0 ? 15 : Math.max(0, 15 - (issuesHigh.count ?? 0) * 5);
    const checklistScore = (checklistPct / 100) * 20;
    const score = Math.round(testsScore + criticalScore + highScore + checklistScore);

    const cfg = (config.data ?? { status: "planning", launch_date: null, notes: null });
    let readinessStatus: "not_ready" | "ready" | "pilot_active" | "pilot_successful";
    if (cfg.status === "completed" && score >= 80) readinessStatus = "pilot_successful";
    else if (cfg.status === "active") readinessStatus = "pilot_active";
    else if (score >= 75 && (issuesCritical.count ?? 0) === 0) readinessStatus = "ready";
    else readinessStatus = "not_ready";

    return {
      config: cfg,
      participants: { active: partsActive.count ?? 0, total: partsAll.count ?? 0 },
      issues: {
        open: issuesOpen.count ?? 0,
        closed: issuesClosed.count ?? 0,
        critical: issuesCritical.count ?? 0,
        high: issuesHigh.count ?? 0,
      },
      feedback: feedback.count ?? 0,
      tests: { total: testsTotal, pass: testsPass, fail: testsFail, completion_rate: completionRate },
      checklist: { total: checklistAll, done_today: checklistDone, pct: checklistPct },
      readiness: { score, status: readinessStatus },
      canManage: roles.some((r) => MANAGE.includes(r)),
    };
  });

export const updatePilotConfig = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    status: z.enum(["planning","ready","active","suspended","completed"]).optional(),
    launch_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح بتعديل إعدادات التشغيل التجريبي.");
    const patch: Record<string, unknown> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.launch_date !== undefined) patch.launch_date = data.launch_date;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await sb.from("pilot_config").update(patch).eq("id", 1).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    const action = data.status ? "pilot_status_changed" : "pilot_started";
    await logAudit(sb, action, { ...patch });
    return row;
  });

/* =========================================================================
   PARTICIPANTS
   ========================================================================= */

export const listPilotParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "غير مصرح.");
    const { data, error } = await sb
      .from("pilot_participants")
      .select("id, full_name, role, department_id, status, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertPilotParticipant = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid().optional(),
    full_name: z.string().min(1).max(255),
    role: z.enum(["student","faculty","staff","admin"]),
    department_id: z.string().uuid().nullable().optional(),
    status: z.enum(["invited","active","inactive","suspended"]).optional(),
    notes: z.string().max(1000).nullable().optional(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const payload: Record<string, unknown> = {
      full_name: data.full_name,
      role: data.role,
      department_id: data.department_id ?? null,
      status: data.status ?? "invited",
      notes: data.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await sb.from("pilot_participants").update(payload).eq("id", data.id).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    payload.created_by = context.userId;
    const { data: row, error } = await sb.from("pilot_participants").insert(payload).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePilotParticipant = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const { error } = await sb.from("pilot_participants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================================
   TEST SCENARIOS
   ========================================================================= */

export const listPilotScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "غير مصرح.");
    const [scens, results] = await Promise.all([
      sb.from("pilot_test_scenarios").select("id, category, code, name, description, order_index").order("order_index"),
      sb.from("pilot_test_results").select("scenario_id, result, notes, tested_at, tested_by"),
    ]);
    if (scens.error) throw new Error(scens.error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rmap = new Map<string, any>((results.data ?? []).map((r: any) => [r.scenario_id, r]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (scens.data ?? []).map((s: any) => {
      const r = rmap.get(s.id);
      return {
        ...s,
        result: r?.result ?? "not_tested",
        notes: r?.notes ?? null,
        tested_at: r?.tested_at ?? null,
      };
    });
  });

export const setPilotScenarioResult = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    scenario_id: z.string().uuid(),
    result: z.enum(["pass","fail","not_tested"]),
    notes: z.string().max(1000).nullable().optional(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const { error } = await sb.from("pilot_test_results").upsert({
      scenario_id: data.scenario_id,
      result: data.result,
      notes: data.notes ?? null,
      tested_by: context.userId,
      tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================================
   DAILY CHECKLIST
   ========================================================================= */

export const getPilotChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "غير مصرح.");
    const today = new Date().toISOString().slice(0, 10);
    const [items, runs] = await Promise.all([
      sb.from("pilot_checklist_items").select("id, period, code, label, order_index").order("order_index"),
      sb.from("pilot_checklist_runs").select("item_id, completed, completed_at").eq("run_date", today),
    ]);
    if (items.error) throw new Error(items.error.message);
    const rmap = new Map((runs.data ?? []).map((r: any) => [r.item_id, r]));
    return (items.data ?? []).map((i: any) => ({
      ...i,
      completed_today: !!rmap.get(i.id)?.completed,
      completed_at: rmap.get(i.id)?.completed_at ?? null,
    }));
  });

export const togglePilotChecklist = createServerFn({ method: "POST" })
  .inputValidator(z.object({ item_id: z.string().uuid(), completed: z.boolean() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const today = new Date().toISOString().slice(0, 10);
    if (data.completed) {
      const { error } = await sb.from("pilot_checklist_runs").upsert({
        item_id: data.item_id, run_date: today, completed: true,
        completed_by: context.userId, completed_at: new Date().toISOString(),
      }, { onConflict: "item_id,run_date" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("pilot_checklist_runs").delete().eq("item_id", data.item_id).eq("run_date", today);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* =========================================================================
   ISSUES
   ========================================================================= */

export const listPilotIssues = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    status: z.enum(["open","in_progress","resolved","closed","all"]).optional(),
    page: z.number().int().min(1).default(1).optional(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "غير مصرح.");
    const page = data?.page ?? 1;
    const pageSize = 100;
    const from = (page - 1) * pageSize, to = from + pageSize - 1;
    let q = sb.from("pilot_issues")
      .select("id, title, category, severity, status, assigned_to, created_at, closed_at, description", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page, pageSize };
  });

export const upsertPilotIssue = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(255),
    category: z.string().min(1).max(100),
    severity: z.enum(["low","medium","high","critical"]),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(["open","in_progress","resolved","closed"]).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: data.title,
      category: data.category,
      severity: data.severity,
      description: data.description ?? null,
      status: data.status ?? "open",
      assigned_to: data.assigned_to ?? null,
      updated_at: now,
    };
    if (["resolved","closed"].includes(payload.status as string)) payload.closed_at = now;
    if (data.id) {
      const { data: row, error } = await sb.from("pilot_issues").update(payload).eq("id", data.id).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (["resolved","closed"].includes(payload.status as string)) {
        await logAudit(sb, "issue_resolved", { id: data.id, status: payload.status }, data.id);
      }
      return row;
    }
    payload.created_by = context.userId;
    const { data: row, error } = await sb.from("pilot_issues").insert(payload).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    await logAudit(sb, "issue_created", { id: row?.id, title: data.title, severity: data.severity }, row?.id);
    return row;
  });

/* =========================================================================
   FEEDBACK
   ========================================================================= */

export const listPilotFeedback = createServerFn({ method: "POST" })
  .inputValidator(z.object({ page: z.number().int().min(1).default(1).optional() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, READ, "غير مصرح.");
    const page = data?.page ?? 1;
    const pageSize = 100;
    const from = (page - 1) * pageSize, to = from + pageSize - 1;
    const { data: rows, error, count } = await sb.from("pilot_feedback")
      .select("id, category, type, subject, message, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page, pageSize };
  });

export const recordPilotFeedback = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    category: z.enum(["student","faculty","staff","admin"]),
    type: z.enum(["bug","suggestion","training_need","process_issue"]),
    subject: z.string().max(255).nullable().optional(),
    message: z.string().min(1).max(2000),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    requireRoles(roles, MANAGE, "غير مصرح.");
    const { data: row, error } = await sb.from("pilot_feedback").insert({
      category: data.category,
      type: data.type,
      subject: data.subject ?? null,
      message: data.message,
      recorded_by: context.userId,
    }).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    await logAudit(sb, "feedback_recorded", { id: row?.id, category: data.category, type: data.type }, row?.id);
    return row;
  });

/* =========================================================================
   AUDIT (export logging only)
   ========================================================================= */

export const logPilotReportExported = createServerFn({ method: "POST" })
  .inputValidator(z.object({ report: z.string(), format: z.enum(["csv","xlsx"]), rows: z.number().int() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await logAudit(sb, "pilot_report_exported", data);
    return { ok: true };
  });
