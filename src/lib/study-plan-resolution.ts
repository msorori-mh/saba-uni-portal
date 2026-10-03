/**
 * Single source of truth for "which study plan applies to this student".
 *
 * Rule: student_profiles.study_plan_id when assigned (cohort-specific plan),
 * otherwise the latest active plan (highest version) of the student's program.
 * Isomorphic: takes any Supabase client (browser self-scope or server admin).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

export type PlanResolutionStudent = {
  study_plan_id?: string | null;
  program_id?: string | null;
};

export async function resolveStudentPlanId(
  db: Db,
  student: PlanResolutionStudent,
): Promise<string | null> {
  if (student.study_plan_id) return student.study_plan_id;
  if (!student.program_id) return null;
  const { data, error } = await db
    .from("study_plans")
    .select("id")
    .eq("program_id", student.program_id)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** Batched variant for list reports: key = index-free student identity. */
export async function resolveStudentPlanIds<T extends PlanResolutionStudent & { id: string }>(
  db: Db,
  students: T[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const programIds = Array.from(
    new Set(students.filter((s) => !s.study_plan_id && s.program_id).map((s) => s.program_id as string)),
  );
  const fallback = new Map<string, string>();
  if (programIds.length) {
    const { data, error } = await db
      .from("study_plans")
      .select("id, program_id, version")
      .in("program_id", programIds)
      .eq("is_active", true)
      .order("version", { ascending: false });
    if (error) throw error;
    for (const p of (data ?? []) as Array<{ id: string; program_id: string }>) {
      if (!fallback.has(p.program_id)) fallback.set(p.program_id, p.id);
    }
  }
  for (const s of students) {
    out.set(s.id, s.study_plan_id ?? (s.program_id ? fallback.get(s.program_id) ?? null : null));
  }
  return out;
}
