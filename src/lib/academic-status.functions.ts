import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasAnyRole, STUDENT_READ_ROLES } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COURSE_PASS_PERCENT } from "@/lib/academic/pass-threshold";

/* ----------------------------------------------------------------------- *
 * Phase 11F — Academic Status & Graduation Engine
 *
 * Reuses existing tables (study_plans, study_plan_courses, courses,
 * student_enrollments, student_grades, grade_components,
 * student_academic_status, course_sections, course_offerings, programs,
 * academic_levels, student_profiles). No schema changes.
 * ----------------------------------------------------------------------- */

// Approved university policy: course pass mark = 48/100 (canonical constant).
// NO GPA / 4.0 SCALE EXISTS. Aggregates use the credit-weighted OFFICIAL
// percentage defined in @/lib/academic/grading-scale.
const PASS_PERCENT = COURSE_PASS_PERCENT;
const NEAR_COMPLETION_PCT = 80;

type Standing =
  | "good_standing" | "warning" | "probation" | "suspended" | "graduated";

/* ----------------------- shared types (DTOs) ----------------------- */

export type StudentProgressDTO = {
  student: {
    id: string;
    academic_number: string;
    full_name_ar: string;
    program: string | null;
    program_id: string | null;
    department: string | null;
    level: string | null;
    status_label: string;
    profile_status: string;
    enrollment_status: string | null;
  };
  progress: {
    total_plan_hours: number;
    completed_hours: number;
    remaining_hours: number;
    completion_percentage: number;
    passed_courses: number;
    failed_courses: number;
    repeated_courses: number;
    in_progress_courses: number;
    current_gpa: number;
    cumulative_gpa: number;
  };
  eligibility: {
    eligible: boolean;
    missing_hours: number;
    missing_required_courses: Array<{ code: string; name_ar: string; credit_hours: number }>;
    missing_core_courses: Array<{ code: string; name_ar: string; credit_hours: number }>;
    missing_elective_hours: number;
    missing_graduation_requirements: string[];
    warnings: string[];
  };
  standing: {
    standing: Standing;
    reason: string;
  };
  audit: {
    courses: Array<{
      course_id: string;
      code: string;
      name_ar: string;
      credit_hours: number;
      is_required: boolean;
      level: string | null;
      status: "completed" | "in_progress" | "failed" | "missing";
      best_percentage: number | null;
      attempts: number;
    }>;
  };
};

/* ----------------------- auth helpers ----------------------- */

async function isOwnerStudent(userId: string, studentProfileId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("student_profiles").select("id")
    .eq("user_id", userId).eq("id", studentProfileId).maybeSingle();
  return !!data;
}

async function isFacultyOfStudent(userId: string, studentProfileId: string): Promise<boolean> {
  // Faculty profile id from user_id
  const { data: fp } = await supabaseAdmin
    .from("faculty_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!fp?.id) return false;
  // Any section the faculty teaches where student is enrolled
  const { data: sections } = await supabaseAdmin
    .from("course_sections").select("id").eq("faculty_profile_id", (fp as any).id);
  const sectionIds = (sections ?? []).map((s: any) => s.id);
  if (sectionIds.length === 0) return false;
  const { count } = await supabaseAdmin
    .from("student_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_profile_id", studentProfileId)
    .in("course_section_id", sectionIds);
  return (count ?? 0) > 0;
}

async function audit(action: string, notes: string, entityId?: string) {
  try {
    await supabaseAdmin.rpc("log_audit" as any, {
      _entity_type: "academic_status",
      _entity_id: entityId ?? "00000000-0000-0000-0000-000000000000",
      _action_type: action,
      _old: null,
      _new: { notes },
      _notes: notes,
    });
  } catch { /* ignore */ }
}

/* ----------------------- computation helpers ----------------------- */

function pctToGpa(pct: number): number {
  if (pct < PASS_PERCENT) return 0;
  // GPA band mapping is UNCHANGED academic policy (only the fail floor moved
  // to the approved 48% pass mark); the lowest passing band stays 1.5.
  if (pct >= 95) return 4.0;
  if (pct >= 90) return 3.75;
  if (pct >= 85) return 3.5;
  if (pct >= 80) return 3.25;
  if (pct >= 75) return 3.0;
  if (pct >= 70) return 2.5;
  if (pct >= 65) return 2.0;
  return 1.5;
}

type EnrollmentRow = {
  id: string;
  student_profile_id: string;
  enrollment_status: string;
  section: {
    id: string;
    course_offering_id: string;
    offering: {
      id: string;
      course_id: string;
      academic_year_id: string;
      semester_id: string;
      level_id: string;
    } | null;
  } | null;
};

type GradeRow = {
  student_enrollment_id: string;
  score: number;
};

type CoursesById = Map<string, { id: string; code: string; name_ar: string; credit_hours: number }>;

/**
 * Build per-enrollment percentage from approved grades.
 * percentage = sum(score) / sum(max_score) * 100 — using ALL components of the section
 * with awarded score (missing components contribute 0 against max).
 */
function enrollmentPercentages(
  enrollments: EnrollmentRow[],
  grades: GradeRow[],
  componentsBySection: Map<string, number>, // section_id -> total max_score (sum)
): Map<string, { pct: number | null; sectionId: string | null }> {
  const sumByEnroll = new Map<string, number>();
  for (const g of grades) {
    sumByEnroll.set(g.student_enrollment_id, (sumByEnroll.get(g.student_enrollment_id) ?? 0) + Number(g.score ?? 0));
  }
  const out = new Map<string, { pct: number | null; sectionId: string | null }>();
  for (const e of enrollments) {
    const secId = e.section?.id ?? null;
    const sumMax = secId ? (componentsBySection.get(secId) ?? 0) : 0;
    const sumScore = sumByEnroll.get(e.id);
    if (!secId || sumMax === 0 || sumScore === undefined) {
      out.set(e.id, { pct: null, sectionId: secId });
    } else {
      out.set(e.id, { pct: (sumScore / sumMax) * 100, sectionId: secId });
    }
  }
  return out;
}

/* ----------------------- core: compute one student ----------------------- */

async function computeStudentProgress(studentProfileId: string): Promise<StudentProgressDTO> {
  const { data: spRaw } = await supabaseAdmin
    .from("student_profiles")
    .select("id, academic_number, full_name_ar, status, program_id, department_id, program:programs(id, name_ar), department:departments(name_ar)")
    .eq("id", studentProfileId).maybeSingle();
  const sp: any = spRaw;
  if (!sp) throw new Error("Student not found");

  // Current academic status (level, year, semester, enrollment_status)
  const { data: sasRaw } = await supabaseAdmin
    .from("student_academic_status")
    .select("level_id, academic_year_id, semester_id, enrollment_status, level:academic_levels(name)")
    .eq("student_profile_id", studentProfileId)
    .order("updated_at", { ascending: false })
    .limit(1).maybeSingle();
  const sas: any = sasRaw;

  // All enrollments (with their offering + section)
  const { data: enrRaw } = await supabaseAdmin
    .from("student_enrollments")
    .select("id, student_profile_id, enrollment_status, section:course_sections(id, course_offering_id, offering:course_offerings(id, course_id, academic_year_id, semester_id, level_id))")
    .eq("student_profile_id", studentProfileId);
  const enrollments = ((enrRaw ?? []) as unknown as EnrollmentRow[])
    .filter((e) => e.enrollment_status !== "dropped" && e.section?.offering);

  const enrollmentIds = enrollments.map((e) => e.id);
  const sectionIds = Array.from(new Set(enrollments.map((e) => e.section!.id)));

  // All approved grades for these enrollments
  const grades: GradeRow[] = [];
  if (enrollmentIds.length) {
    const { data: gRaw } = await supabaseAdmin
      .from("student_grades")
      // No embed: `student_grades` has no PostgREST relationship to
      // `grade_components`, so embedding silently fails the whole query and the
      // student appears to have zero completed courses. Section totals come
      // from `componentsBySection` below.
      .select("student_enrollment_id, score")
      .in("student_enrollment_id", enrollmentIds)
      .eq("status", "approved");
    for (const g of (gRaw ?? []) as unknown as GradeRow[]) grades.push(g);
  }

  // All grade components for involved sections (to know section totals)
  const componentsBySection = new Map<string, number>();
  if (sectionIds.length) {
    const { data: cRaw } = await supabaseAdmin
      .from("grade_components").select("course_section_id, max_score").in("course_section_id", sectionIds);
    for (const c of (cRaw ?? []) as any[]) {
      componentsBySection.set(c.course_section_id, (componentsBySection.get(c.course_section_id) ?? 0) + Number(c.max_score));
    }
  }

  const pctMap = enrollmentPercentages(enrollments, grades, componentsBySection);

  // Pull courses needed (for code/name/hours)
  const courseIds = Array.from(new Set(enrollments.map((e) => e.section!.offering!.course_id)));
  const coursesById: CoursesById = new Map();
  if (courseIds.length) {
    const { data: cRaw } = await supabaseAdmin
      .from("courses").select("id, code, name_ar, credit_hours").in("id", courseIds);
    for (const c of (cRaw ?? []) as any[]) coursesById.set(c.id, c);
  }

  // Study plan: latest active plan for program
  let planCourses: Array<{ course_id: string; level_id: string; is_required: boolean; level_name: string | null }> = [];
  let totalPlanHours = 0;
  let planCourseIds: string[] = [];
  if (sp.program_id) {
    const { data: planRaw } = await supabaseAdmin
      .from("study_plans")
      .select("id, total_credit_hours, courses:study_plan_courses(course_id, level_id, is_required, level:academic_levels(name))")
      .eq("program_id", sp.program_id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1).maybeSingle();
    const plan: any = planRaw;
    if (plan) {
      totalPlanHours = Number(plan.total_credit_hours ?? 0);
      planCourses = (plan.courses ?? []).map((pc: any) => ({
        course_id: pc.course_id,
        level_id: pc.level_id,
        is_required: !!pc.is_required,
        level_name: pc.level?.name ?? null,
      }));
      planCourseIds = planCourses.map((p) => p.course_id);
      // Make sure these courses are loaded
      const missingIds = planCourseIds.filter((id) => !coursesById.has(id));
      if (missingIds.length) {
        const { data: extras } = await supabaseAdmin
          .from("courses").select("id, code, name_ar, credit_hours").in("id", missingIds);
        for (const c of (extras ?? []) as any[]) coursesById.set(c.id, c);
      }
      // Compute total plan hours from sum if value missing
      if (!totalPlanHours) {
        for (const pc of planCourses) {
          totalPlanHours += coursesById.get(pc.course_id)?.credit_hours ?? 0;
        }
      }
    }
  }

  // Best attempt per course → status
  type Attempt = { pct: number | null; isCurrent: boolean; status: "completed" | "in_progress" | "failed" };
  const attemptsByCourse = new Map<string, Attempt[]>();
  for (const e of enrollments) {
    const off = e.section!.offering!;
    const p = pctMap.get(e.id);
    const isCurrent = sas && off.academic_year_id === sas.academic_year_id && off.semester_id === sas.semester_id;
    let st: Attempt["status"];
    if (p?.pct == null) st = "in_progress";
    else if (p.pct >= PASS_PERCENT) st = "completed";
    else st = e.enrollment_status === "completed" ? "failed" : "in_progress";
    const list = attemptsByCourse.get(off.course_id) ?? [];
    list.push({ pct: p?.pct ?? null, isCurrent: !!isCurrent, status: st });
    attemptsByCourse.set(off.course_id, list);
  }

  let passedCourses = 0, failedCourses = 0, inProgressCourses = 0, repeatedCourses = 0;
  let completedHours = 0;
  const passedCourseIds = new Set<string>();
  for (const [cid, attempts] of attemptsByCourse) {
    if (attempts.length > 1) repeatedCourses++;
    const best = attempts.reduce<Attempt | null>((acc, a) => {
      if (!acc) return a;
      const ap = a.pct ?? -1, bp = acc.pct ?? -1;
      return ap > bp ? a : acc;
    }, null);
    if (best?.status === "completed") {
      passedCourses++;
      passedCourseIds.add(cid);
      completedHours += coursesById.get(cid)?.credit_hours ?? 0;
    } else if (attempts.some((a) => a.status === "in_progress")) {
      inProgressCourses++;
    } else {
      failedCourses++;
    }
  }

  const { data: eqCreditsRaw } = await supabaseAdmin
    .from("student_equivalency_credits")
    .select("course_id, credit_hours")
    .eq("student_profile_id", studentProfileId);
  for (const eq of (eqCreditsRaw ?? []) as Array<{ course_id: string; credit_hours: number | null }>) {
    if (passedCourseIds.has(eq.course_id)) continue;
    if (!coursesById.has(eq.course_id)) {
      const { data: cRow } = await supabaseAdmin
        .from("courses")
        .select("id, code, name_ar, credit_hours")
        .eq("id", eq.course_id)
        .maybeSingle();
      if (cRow) coursesById.set(cRow.id, cRow);
    }
    passedCourseIds.add(eq.course_id);
    passedCourses++;
    completedHours += eq.credit_hours ?? coursesById.get(eq.course_id)?.credit_hours ?? 0;
  }

  // GPAs
  const gpaPoints = (filter: (a: Attempt) => boolean) => {
    let pts = 0, hrs = 0;
    for (const [cid, list] of attemptsByCourse) {
      const ch = coursesById.get(cid)?.credit_hours ?? 0;
      if (!ch) continue;
      const chosen = list.filter(filter).reduce<Attempt | null>((acc, a) => {
        if (a.pct == null) return acc;
        if (!acc) return a;
        return (a.pct > (acc.pct ?? -1)) ? a : acc;
      }, null);
      if (chosen?.pct != null) {
        pts += pctToGpa(chosen.pct) * ch;
        hrs += ch;
      }
    }
    return hrs > 0 ? Math.round((pts / hrs) * 100) / 100 : 0;
  };
  const cumulativeGpa = gpaPoints(() => true);
  const currentGpa = gpaPoints((a) => a.isCurrent);

  // Eligibility — missing required/electives
  const missingRequired: StudentProgressDTO["eligibility"]["missing_required_courses"] = [];
  const missingElectives: StudentProgressDTO["eligibility"]["missing_required_courses"] = [];
  for (const pc of planCourses) {
    if (passedCourseIds.has(pc.course_id)) continue;
    const c = coursesById.get(pc.course_id);
    if (!c) continue;
    const entry = { code: c.code, name_ar: c.name_ar, credit_hours: c.credit_hours };
    if (pc.is_required) missingRequired.push(entry); else missingElectives.push(entry);
  }
  const missingHours = Math.max(0, totalPlanHours - completedHours);
  const missingElectiveHours = missingElectives.reduce((s, c) => s + c.credit_hours, 0);

  const warnings: string[] = [];
  const missingGradReqs: string[] = [];
  if (cumulativeGpa < WARNING_GPA && completedHours > 0) {
    missingGradReqs.push(`المعدل التراكمي أقل من الحد الأدنى (${WARNING_GPA.toFixed(2)})`);
  }
  if (missingHours > 0) missingGradReqs.push(`متبقي ${missingHours} ساعة دراسية`);
  if (missingRequired.length > 0) missingGradReqs.push(`${missingRequired.length} مقررات إجبارية لم تُجتَز`);
  if (sas?.enrollment_status === "suspended") missingGradReqs.push("القيد موقوف حالياً");
  if (sp.status === "graduated") warnings.push("الطالب متخرج بالفعل");
  if (!sp.program_id) warnings.push("لا يوجد برنامج مرتبط بالطالب");
  if (planCourses.length === 0 && sp.program_id) warnings.push("لا توجد خطة دراسية فعّالة للبرنامج");

  const eligible =
    sp.status !== "suspended" &&
    sas?.enrollment_status !== "suspended" &&
    completedHours >= totalPlanHours && totalPlanHours > 0 &&
    missingRequired.length === 0 &&
    cumulativeGpa >= WARNING_GPA;

  // Standing
  let standing: Standing = "good_standing";
  let reason = "المعدل ضمن النطاق الجيد";
  if (sp.status === "graduated") { standing = "graduated"; reason = "الطالب متخرج"; }
  else if (sas?.enrollment_status === "suspended" || sp.status === "suspended") {
    standing = "suspended"; reason = "القيد موقوف";
  } else if (cumulativeGpa > 0 && cumulativeGpa < PROBATION_GPA) {
    standing = "probation"; reason = `المعدل التراكمي ${cumulativeGpa.toFixed(2)} أقل من ${PROBATION_GPA.toFixed(2)}`;
  } else if (cumulativeGpa > 0 && cumulativeGpa < WARNING_GPA) {
    standing = "probation"; reason = `المعدل التراكمي ${cumulativeGpa.toFixed(2)} يضع الطالب في تحت المراقبة الأكاديمية`;
  } else if (cumulativeGpa > 0 && cumulativeGpa < GOOD_GPA) {
    standing = "warning"; reason = `المعدل التراكمي ${cumulativeGpa.toFixed(2)} يتطلب تحسيناً`;
  }

  // Audit course view (per-course list = plan ∪ taken ∪ equivalency)
  const allCourseIds = new Set<string>([
    ...planCourseIds,
    ...Array.from(attemptsByCourse.keys()),
    ...Array.from(passedCourseIds),
  ]);
  const planMap = new Map(planCourses.map((p) => [p.course_id, p]));
  const auditCourses: StudentProgressDTO["audit"]["courses"] = [];
  for (const cid of allCourseIds) {
    const c = coursesById.get(cid);
    if (!c) continue;
    const attempts = attemptsByCourse.get(cid) ?? [];
    const best = attempts.reduce<number | null>((acc, a) => {
      if (a.pct == null) return acc;
      return acc == null ? a.pct : Math.max(acc, a.pct);
    }, null);
    let status: StudentProgressDTO["audit"]["courses"][number]["status"];
    if (passedCourseIds.has(cid)) status = "completed";
    else if (attempts.some((a) => a.status === "in_progress")) status = "in_progress";
    else if (attempts.some((a) => a.status === "failed")) status = "failed";
    else status = "missing";
    const pc = planMap.get(cid);
    auditCourses.push({
      course_id: cid,
      code: c.code,
      name_ar: c.name_ar,
      credit_hours: c.credit_hours,
      is_required: pc?.is_required ?? false,
      level: pc?.level_name ?? null,
      status,
      best_percentage: best != null ? Math.round(best * 10) / 10 : null,
      attempts: attempts.length,
    });
  }
  auditCourses.sort((a, b) => (a.level ?? "").localeCompare(b.level ?? "") || a.code.localeCompare(b.code));

  const STATUS_LABELS: Record<string, string> = {
    active: "نشط", suspended: "موقوف", graduated: "متخرج", dropped_out: "منسحب",
  };

  return {
    student: {
      id: sp.id,
      academic_number: sp.academic_number,
      full_name_ar: sp.full_name_ar,
      program: sp.program?.name_ar ?? null,
      program_id: sp.program_id ?? null,
      department: sp.department?.name_ar ?? null,
      level: sas?.level?.name ?? null,
      status_label: STATUS_LABELS[sp.status] ?? sp.status,
      profile_status: sp.status,
      enrollment_status: sas?.enrollment_status ?? null,
    },
    progress: {
      total_plan_hours: totalPlanHours,
      completed_hours: completedHours,
      remaining_hours: Math.max(0, totalPlanHours - completedHours),
      completion_percentage: totalPlanHours > 0 ? Math.round((completedHours / totalPlanHours) * 1000) / 10 : 0,
      passed_courses: passedCourses,
      failed_courses: failedCourses,
      repeated_courses: repeatedCourses,
      in_progress_courses: inProgressCourses,
      current_gpa: currentGpa,
      cumulative_gpa: cumulativeGpa,
    },
    eligibility: {
      eligible,
      missing_hours: missingHours,
      missing_required_courses: missingRequired,
      missing_core_courses: missingRequired,
      missing_elective_hours: missingElectiveHours,
      missing_graduation_requirements: missingGradReqs,
      warnings,
    },
    standing: { standing, reason },
    audit: { courses: auditCourses },
  };
}

/* ----------------------- exported server functions ----------------------- */

export const getStudentProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ studentProfileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const allowed =
      (await hasAnyRole(userId, STUDENT_READ_ROLES)) ||
      (await isOwnerStudent(userId, data.studentProfileId)) ||
      (await isFacultyOfStudent(userId, data.studentProfileId));
    if (!allowed) throw new Error("Forbidden");
    const dto = await computeStudentProgress(data.studentProfileId);
    await audit("student_progress_viewed", dto.student.academic_number, dto.student.id);
    return dto;
  });

export const getMyProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: sp } = await supabaseAdmin
      .from("student_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!sp?.id) throw new Error("Student profile not found");
    const dto = await computeStudentProgress((sp as any).id);
    await audit("student_progress_viewed", dto.student.academic_number, dto.student.id);
    return dto;
  });

export const searchStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("Forbidden");
    const q = data.query.trim();
    let qb = supabaseAdmin.from("student_profiles")
      .select("id, academic_number, full_name_ar, program:programs(name_ar)")
      .limit(20);
    if (q) qb = qb.or(`academic_number.ilike.%${q}%,full_name_ar.ilike.%${q}%`);
    const { data: rows, error } = await qb;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      academic_number: r.academic_number,
      full_name_ar: r.full_name_ar,
      program: r.program?.name_ar ?? null,
    }));
  });

/* --- bulk list functions (at-risk / graduation candidates) --- */

const ListFilters = z.object({
  programId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

async function listStudentsForBulk(filters: z.infer<typeof ListFilters>) {
  let q = supabaseAdmin.from("student_profiles")
    .select("id, academic_number, full_name_ar, program_id, department_id, status, program:programs(name_ar), department:departments(name_ar)")
    .neq("status", "graduated");
  if (filters.programId) q = q.eq("program_id", filters.programId);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  const { data, error } = await q.limit(filters.limit);
  if (error) throw new Error(error.message);
  let students = (data ?? []) as any[];
  if (filters.levelId) {
    const { data: sas } = await supabaseAdmin
      .from("student_academic_status").select("student_profile_id").eq("level_id", filters.levelId);
    const ids = new Set((sas ?? []).map((s: any) => s.student_profile_id));
    students = students.filter((s) => ids.has(s.id));
  }
  return students;
}

async function bulkCompute(filters: z.infer<typeof ListFilters>) {
  const students = await listStudentsForBulk(filters);
  const out: Array<{ summary: StudentProgressDTO }> = [];
  for (const s of students) {
    try {
      const summary = await computeStudentProgress(s.id);
      out.push({ summary });
    } catch { /* skip */ }
  }
  return out;
}

export const getAtRiskStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListFilters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("Forbidden");
    const rows = await bulkCompute(data);
    const filtered = rows
      .filter(({ summary: x }) =>
        x.progress.cumulative_gpa > 0 && x.progress.cumulative_gpa < WARNING_GPA
        || x.progress.failed_courses >= 2
        || x.progress.repeated_courses >= 2
        || x.standing.standing === "probation"
        || x.standing.standing === "warning"
        || (x.progress.total_plan_hours > 0 && x.progress.completion_percentage < 25 && x.progress.passed_courses + x.progress.in_progress_courses > 0)
      );
    await audit("at_risk_report_viewed", `count=${filtered.length}`);
    return filtered.map((r) => r.summary);
  });

export const getGraduationCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListFilters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("Forbidden");
    const rows = await bulkCompute(data);
    const candidates = rows
      .map((r) => r.summary)
      .filter((x) =>
        x.progress.total_plan_hours > 0 &&
        (x.eligibility.eligible
         || (x.progress.completion_percentage >= NEAR_COMPLETION_PCT && x.eligibility.missing_required_courses.length <= 2 && x.progress.cumulative_gpa >= WARNING_GPA))
      )
      .sort((a, b) => b.progress.completion_percentage - a.progress.completion_percentage);
    await audit("graduation_candidates_viewed", `count=${candidates.length}`);
    return candidates;
  });

export const getProgressDashboardKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("Forbidden");
    const rows = await bulkCompute({ limit: 500 });
    const summaries = rows.map((r) => r.summary);
    const withGpa = summaries.filter((s) => s.progress.cumulative_gpa > 0);
    const avgGpa = withGpa.length
      ? Math.round((withGpa.reduce((a, s) => a + s.progress.cumulative_gpa, 0) / withGpa.length) * 100) / 100
      : 0;
    const atRisk = summaries.filter((s) =>
      s.progress.cumulative_gpa > 0 && s.progress.cumulative_gpa < WARNING_GPA
      || s.standing.standing === "probation" || s.standing.standing === "warning").length;
    const grads = summaries.filter((s) => s.eligibility.eligible).length;
    const near = summaries.filter((s) => s.progress.completion_percentage >= NEAR_COMPLETION_PCT).length;
    return { avgGpa, atRisk, gradCandidates: grads, nearCompletion: near, sampled: summaries.length };
  });

/**
 * PERFORMANCE-FIX-02B
 * Set-based replacement for `getProgressDashboardKpis` used by /admin dashboard.
 * Calls the SQL function `public.get_admin_progress_kpis` once instead of running
 * `computeStudentProgress` per-student (~7 round-trips × N students).
 * The detailed `computeStudentProgress` is left untouched for single-student views.
 */
export const getAdminProgressKpisFast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("Forbidden");
    const { data, error } = await context.supabase.rpc("get_admin_progress_kpis" as never, { _limit: 500 } as never);
    if (error) throw new Error(error.message);
    const k = (data ?? {}) as {
      avgGpa?: number; atRisk?: number; gradCandidates?: number;
      nearCompletion?: number; sampled?: number;
    };
    return {
      avgGpa: Number(k.avgGpa ?? 0),
      atRisk: Number(k.atRisk ?? 0),
      gradCandidates: Number(k.gradCandidates ?? 0),
      nearCompletion: Number(k.nearCompletion ?? 0),
      sampled: Number(k.sampled ?? 0),
    };
  });

export const getAcademicProgressFilterLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasAnyRole(context.userId, STUDENT_READ_ROLES))) throw new Error("ليس لديك صلاحية");
    const [p, d, l] = await Promise.all([
      supabaseAdmin.from("programs").select("id, name_ar").eq("is_active", true),
      supabaseAdmin.from("departments").select("id, name_ar").eq("is_active", true),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
    ]);
    if (p.error) throw new Error(p.error.message);
    if (d.error) throw new Error(d.error.message);
    if (l.error) throw new Error(l.error.message);
    return {
      programs: p.data ?? [],
      departments: d.data ?? [],
      levels: l.data ?? [],
    };
  });

