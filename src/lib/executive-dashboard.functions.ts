// Phase 11H.1A: Executive Dashboard — read-only audit logging + scope helper.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertExecRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function tableCount(
  table: string,
  filters?: (q: ReturnType<typeof supabaseAdmin.from>) => ReturnType<typeof supabaseAdmin.from>,
): Promise<number> {
  let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

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

export const getExecutiveCoreKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertExecRole(context.userId);

    const [
      students, activeStudents, faculty, sections,
      currentYear, currentSem,
      feesTotalRows, feesPaidRows,
      studentsNoProgram, sectionsNoFaculty,
      gradCandidatesPending, newDocsToday, newRequestsPending,
      lastAudit,
    ] = await Promise.all([
      tableCount("student_profiles"),
      tableCount("student_profiles", (q) => q.eq("status", "active")),
      tableCount("faculty_profiles", (q) => q.eq("status", "active")),
      tableCount("course_sections", (q) => q.eq("status", "active")),
      supabaseAdmin.from("academic_years").select("name").eq("is_current", true).maybeSingle(),
      supabaseAdmin.from("semesters").select("name").eq("is_current", true).maybeSingle(),
      supabaseAdmin.from("student_fees").select("amount"),
      supabaseAdmin.from("student_fees").select("amount").eq("status", "paid"),
      tableCount("student_profiles", (q) => q.is("program_id", null)),
      supabaseAdmin.from("course_sections").select("id, course_offering_id").eq("status", "active"),
      tableCount("student_requests", (q) => q.eq("status", "submitted")),
      tableCount("official_documents", (q) => {
        const t = new Date(); t.setHours(0, 0, 0, 0);
        return q.gte("issued_at", t.toISOString());
      }),
      tableCount("student_requests", (q) => q.eq("status", "submitted")),
      supabaseAdmin.from("audit_logs").select("created_at, action_type, entity_type")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const totalFees = ((feesTotalRows.data ?? []) as Array<{ amount: number }>)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const paidFees = ((feesPaidRows.data ?? []) as Array<{ amount: number }>)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const collectionRate = totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0;
    const outstanding = Math.max(0, totalFees - paidFees);

    const sectionsList = (sectionsNoFaculty.data ?? []) as Array<{ id: string }>;
    let unassignedSections = 0;
    if (sectionsList.length > 0) {
      const ids = sectionsList.map((s) => s.id);
      const { data: scheds } = await supabaseAdmin
        .from("class_schedule")
        .select("course_section_id, faculty_profile_id")
        .in("course_section_id", ids);
      const assigned = new Set(
        ((scheds ?? []) as Array<{ course_section_id: string; faculty_profile_id: string | null }>)
          .filter((r) => r.faculty_profile_id)
          .map((r) => r.course_section_id),
      );
      unassignedSections = ids.filter((id) => !assigned.has(id)).length;
    }

    return {
      students, activeStudents, faculty, sections,
      currentYearName: (currentYear.data as { name?: string } | null)?.name ?? "غير محددة",
      currentSemName: (currentSem.data as { name?: string } | null)?.name ?? "غير محدد",
      currentYearOk: !!currentYear.data,
      currentSemOk: !!currentSem.data,
      collectionRate, totalFees, paidFees, outstanding,
      studentsNoProgram, unassignedSections,
      gradCandidatesPending, newDocsToday, newRequestsPending,
      lastAudit: lastAudit.data as { created_at: string; action_type: string; entity_type: string } | null,
    };
  });
