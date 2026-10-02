/**
 * Canonical student study-plan read (self scope only).
 * Shared by the web portal (`/student/study-plan`) and the mobile app
 * (`/mobile/student/study-plan`) so the projection logic exists once.
 */

import { supabase } from "@/integrations/supabase/client";

export type PlanCourseRow = {
  id: string;
  semester_code: string;
  is_required: boolean;
  sort_order: number;
  level: { name: string; level_number: number } | null;
  course: { code: string; name_ar: string; credit_hours: number } | null;
  prerequisite: { code: string } | null;
};

export const SEMESTER_LABELS: Record<string, string> = {
  first: "الفصل الأول",
  second: "الفصل الثاني",
};

export async function fetchMyProgramId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("student_profiles")
    .select("program_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.program_id as string | null) ?? null;
}

export async function fetchMyStudyPlan(programId: string): Promise<PlanCourseRow[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("يجب تسجيل الدخول لعرض الخطة الدراسية.");
  const { data: profile, error: profileError } = await supabase
    .from("student_profiles")
    .select("program_id, study_plan_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.program_id !== programId) throw new Error("تعذر تحديد برنامج الطالب.");

  let planQuery = supabase
    .from("study_plans")
    .select("id")
    .eq("program_id", programId);
  planQuery = profile.study_plan_id
    ? planQuery.eq("id", profile.study_plan_id)
    : planQuery.eq("is_active", true).eq("status", "active");
  const { data: plans, error: pErr } = await planQuery.limit(2);
  if (pErr) throw pErr;
  if (!plans?.length) {
    if (profile.study_plan_id) throw new Error("الخطة المرتبطة بالطالب غير موجودة في برنامجه.");
    return [];
  }
  if (!profile.study_plan_id && plans.length > 1) {
    throw new Error("لم تُحدد الخطة القديمة أو الجديدة لهذا الطالب بعد. راجع شؤون الطلاب.");
  }
  const planId = plans[0].id;
  const { data, error } = await supabase
    .from("study_plan_courses")
    .select(
      "id, semester_code, is_required, sort_order, level:academic_levels(name, level_number), course:courses!study_plan_courses_course_id_fkey(code, name_ar, credit_hours), prerequisite:courses!study_plan_courses_prerequisite_course_id_fkey(code)",
    )
    .eq("study_plan_id", planId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as PlanCourseRow[];
}

export type StudyPlanLevelGroup = {
  levelName: string;
  levelNumber: number;
  semesters: Record<string, PlanCourseRow[]>;
};

/** Groups plan rows by level then semester, ordered by level number. */
export function groupStudyPlanByLevel(rows: PlanCourseRow[]): StudyPlanLevelGroup[] {
  const map = new Map<number, StudyPlanLevelGroup>();
  for (const r of rows) {
    const ln = r.level?.level_number ?? 0;
    if (!map.has(ln)) {
      map.set(ln, {
        levelName: r.level?.name ?? `المستوى ${ln}`,
        levelNumber: ln,
        semesters: {},
      });
    }
    const g = map.get(ln)!;
    (g.semesters[r.semester_code] ||= []).push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.levelNumber - b.levelNumber);
}
