// Phase 11H.1B: Executive Analytics aggregations + export audit.
// Read-only. Reuses existing engines. No business-logic changes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertExecRole } from "@/lib/authz.server";

type GroupRow = { key: string; label: string; value: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeSelect(sb: any, table: string, cols: string, filter?: (q: any) => any) {
  let q = sb.from(table).select(cols);
  if (filter) q = filter(q);
  const { data, error } = await q;
  if (error) return [] as Array<Record<string, unknown>>;
  return (data ?? []) as Array<Record<string, unknown>>;
}

function groupCount<T extends Record<string, unknown>>(
  rows: T[],
  keyFn: (r: T) => string | null | undefined,
  labelMap: Map<string, string>,
): GroupRow[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const k = keyFn(r) ?? "__none__";
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return Array.from(acc.entries())
    .map(([k, v]) => ({ key: k, label: labelMap.get(k) ?? (k === "__none__" ? "غير محدد" : k), value: v }))
    .sort((a, b) => b.value - a.value);
}

export const getExecutiveAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await assertExecRole(context.userId);

    const [programs, departments, levels, currentSem] = await Promise.all([
      safeSelect(sb, "programs", "id, name_ar, code"),
      safeSelect(sb, "departments", "id, name_ar"),
      safeSelect(sb, "academic_levels", "id, name, level_number"),
      sb.from("semesters").select("id").eq("is_current", true).maybeSingle(),
    ]);
    const programMap = new Map(programs.map((p) => [String(p.id), String(p.name_ar ?? p.code ?? "")]));
    const deptMap = new Map(departments.map((d) => [String(d.id), String(d.name_ar ?? "")]));
    const levelMap = new Map(levels.map((l) => [String(l.id), String(l.name ?? `المستوى ${l.level_number ?? ""}`)]));
    void currentSem;

    // Students aggregations — minimal projections only
    const [students, sas, faculty, sections, fees, payments, offerings, requests] = await Promise.all([
      safeSelect(sb, "student_profiles", "id, program_id, department_id, status"),
      safeSelect(sb, "student_academic_status", "student_profile_id, level_id, enrollment_status, semester_id"),
      safeSelect(sb, "faculty_profiles", "id, department_id, status"),
      safeSelect(sb, "course_sections", "id, faculty_profile_id, status"),
      safeSelect(sb, "student_fees", "id, amount, status, student_profile_id"),
      safeSelect(sb, "student_payments", "id, amount, payment_date"),
      safeSelect(sb, "course_offerings", "id, semester_id"),
      safeSelect(sb, "student_requests", "id, submitted_at, status"),
    ]);

    // Students by program/department/status
    const byProgram = groupCount(students, (r) => (r.program_id as string) ?? null, programMap);
    const byDepartment = groupCount(students, (r) => (r.department_id as string) ?? null, deptMap);
    const byStatus = groupCount(students, (r) => String(r.status ?? "غير محدد"), new Map([
      ["active", "نشط"], ["suspended", "موقوف"], ["graduated", "متخرّج"],
      ["withdrawn", "منسحب"], ["inactive", "غير نشط"],
    ]));

    // Latest academic status per student → by level
    const sasMap = new Map<string, Record<string, unknown>>();
    for (const r of sas) {
      const id = String(r.student_profile_id);
      if (!sasMap.has(id)) sasMap.set(id, r);
    }
    const latestSas = Array.from(sasMap.values());
    const byLevel = groupCount(latestSas, (r) => (r.level_id as string) ?? null, levelMap);

    // Enrollment-status distribution from student_academic_status
    const byAcademicStatus = groupCount(latestSas, (r) => String(r.enrollment_status ?? "غير محدد"), new Map([
      ["active", "منتظم"], ["suspended", "موقوف"], ["graduated", "متخرّج"], ["withdrawn", "منسحب"],
    ]));

    // Faculty analytics
    const facultyActive = faculty.filter((f) => String(f.status ?? "active") === "active");
    const facultyByDept = groupCount(facultyActive, (r) => (r.department_id as string) ?? null, deptMap);
    const sectionsActive = sections.filter((s) => String(s.status ?? "active") === "active");
    const sectionsPerFaculty = new Map<string, number>();
    let unassignedSections = 0;
    for (const s of sectionsActive) {
      const fid = s.faculty_profile_id as string | null;
      if (!fid) { unassignedSections++; continue; }
      sectionsPerFaculty.set(fid, (sectionsPerFaculty.get(fid) ?? 0) + 1);
    }
    const loadValues = Array.from(sectionsPerFaculty.values());
    const avgLoad = loadValues.length ? +(loadValues.reduce((a, b) => a + b, 0) / loadValues.length).toFixed(2) : 0;
    // Distribution bins
    const loadDistribution: GroupRow[] = [
      { key: "0", label: "0 مجموعة دراسية", value: facultyActive.length - sectionsPerFaculty.size },
      { key: "1-2", label: "1-2", value: loadValues.filter((v) => v >= 1 && v <= 2).length },
      { key: "3-4", label: "3-4", value: loadValues.filter((v) => v >= 3 && v <= 4).length },
      { key: "5+", label: "5+", value: loadValues.filter((v) => v >= 5).length },
    ];

    // Financial analytics
    let totalFees = 0, paidAmount = 0, outstanding = 0;
    const outstandingByStudent = new Map<string, number>();
    for (const f of fees) {
      const amt = Number(f.amount ?? 0);
      const st = String(f.status ?? "");
      if (st === "cancelled") continue;
      totalFees += amt;
      if (st === "paid") paidAmount += amt;
      else {
        outstanding += amt;
        const sid = String(f.student_profile_id ?? "");
        if (sid) outstandingByStudent.set(sid, (outstandingByStudent.get(sid) ?? 0) + amt);
      }
    }
    const collectionRate = totalFees > 0 ? Math.round((paidAmount / totalFees) * 100) : 0;
    // Outstanding by program
    const studentProgMap = new Map(students.map((s) => [String(s.id), String(s.program_id ?? "")]));
    const outstandingByProgramMap = new Map<string, number>();
    for (const [sid, amt] of outstandingByStudent.entries()) {
      const pid = studentProgMap.get(sid) ?? "__none__";
      outstandingByProgramMap.set(pid, (outstandingByProgramMap.get(pid) ?? 0) + amt);
    }
    const outstandingByProgram: GroupRow[] = Array.from(outstandingByProgramMap.entries())
      .map(([k, v]) => ({ key: k, label: programMap.get(k) ?? "غير محدد", value: Math.round(v) }))
      .sort((a, b) => b.value - a.value);

    // Trends — current vs previous semester
    let trends: {
      enrollments: { current: number; previous: number; hasHistory: boolean };
      revenue: { current: number; previous: number; hasHistory: boolean };
      requests: { current: number; previous: number; hasHistory: boolean };
    } = {
      enrollments: { current: 0, previous: 0, hasHistory: false },
      revenue: { current: 0, previous: 0, hasHistory: false },
      requests: { current: 0, previous: 0, hasHistory: false },
    };
    try {
      // semester dates
      const { data: semRows } = await sb.from("semesters")
        .select("id, start_date, end_date, is_current")
        .order("start_date", { ascending: false })
        .limit(3);
      const semList = (semRows ?? []) as Array<{ id: string; start_date: string | null; end_date: string | null; is_current: boolean }>;
      const curr = semList.find((s) => s.is_current) ?? semList[0];
      const prev = semList.find((s) => s.id !== curr?.id);
      if (curr && prev) {
        // enrollment counts via course_offerings semester filter
        const currOfferingIds = offerings.filter((o) => String(o.semester_id) === String(curr.id)).map((o) => String(o.id));
        const prevOfferingIds = offerings.filter((o) => String(o.semester_id) === String(prev.id)).map((o) => String(o.id));
        const [currEnr, prevEnr] = await Promise.all([
          currOfferingIds.length
            ? sb.from("student_enrollments").select("id", { count: "exact", head: true }).in("course_section_id",
                ((await sb.from("course_sections").select("id, course_offering_id").in("course_offering_id", currOfferingIds)).data ?? []).map((r: { id: string }) => r.id))
            : Promise.resolve({ count: 0 }),
          prevOfferingIds.length
            ? sb.from("student_enrollments").select("id", { count: "exact", head: true }).in("course_section_id",
                ((await sb.from("course_sections").select("id, course_offering_id").in("course_offering_id", prevOfferingIds)).data ?? []).map((r: { id: string }) => r.id))
            : Promise.resolve({ count: 0 }),
        ]);
        // revenue by payment_date within semester range
        let currRev = 0, prevRev = 0;
        for (const p of payments) {
          const d = p.payment_date as string | null;
          if (!d) continue;
          const dt = new Date(d).getTime();
          if (curr.start_date && curr.end_date && dt >= new Date(curr.start_date).getTime() && dt <= new Date(curr.end_date).getTime()) {
            currRev += Number(p.amount ?? 0);
          } else if (prev.start_date && prev.end_date && dt >= new Date(prev.start_date).getTime() && dt <= new Date(prev.end_date).getTime()) {
            prevRev += Number(p.amount ?? 0);
          }
        }
        // requests by submitted_at within semester range
        let currReq = 0, prevReq = 0;
        for (const r of requests) {
          const d = r.submitted_at as string | null;
          if (!d) continue;
          const dt = new Date(d).getTime();
          if (curr.start_date && curr.end_date && dt >= new Date(curr.start_date).getTime() && dt <= new Date(curr.end_date).getTime()) currReq++;
          else if (prev.start_date && prev.end_date && dt >= new Date(prev.start_date).getTime() && dt <= new Date(prev.end_date).getTime()) prevReq++;
        }
        trends = {
          enrollments: { current: currEnr.count ?? 0, previous: prevEnr.count ?? 0, hasHistory: true },
          revenue: { current: Math.round(currRev), previous: Math.round(prevRev), hasHistory: true },
          requests: { current: currReq, previous: prevReq, hasHistory: true },
        };
      }
    } catch {
      // best-effort — keep zero trends
    }

    return {
      students: {
        total: students.length,
        active: students.filter((s) => String(s.status) === "active").length,
        byProgram, byDepartment, byLevel, byStatus, byAcademicStatus,
      },
      faculty: {
        total: faculty.length,
        active: facultyActive.length,
        avgLoad,
        unassignedSections,
        byDepartment: facultyByDept,
        loadDistribution,
      },
      finance: {
        totalFees: Math.round(totalFees),
        paidAmount: Math.round(paidAmount),
        outstanding: Math.round(outstanding),
        collectionRate,
        studentsWithBalance: outstandingByStudent.size,
        outstandingByProgram,
      },
      trends,
    };
  });

const exportSchema = z.object({
  section: z.enum(["students", "academic", "faculty", "financial", "summary"]),
  rowCount: z.number().int().nonnegative(),
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
});

export const logExecutiveExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof exportSchema>) => exportSchema.parse(i))
  .handler(async ({ data, context }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      await assertExecRole(context.userId);
      await sb.rpc("log_audit", {
        _entity_type: "executive_dashboard",
        _entity_id: null,
        _action_type: "executive_analytics_exported",
        _old: null,
        _new: {
          section: data.section,
          format: data.format,
          row_count: data.rowCount,
          timestamp: new Date().toISOString(),
        },
        _notes: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
