/**
 * Shared mobile student identity/eligibility context.
 *
 * One canonical read used by the home dashboard, «المزيد», the profile screen
 * and every conditional route (graduation projects / graduates affairs) so
 * eligibility can never be evaluated differently per screen.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMobileStudentIdentity } from "@/lib/mobile/student-identity";
import {
  resolveCanonicalCurrentFourthLevelEligibility,
  shouldShowStudentGpNav,
  type AcademicStatusTimestampRow,
} from "@/lib/graduation-projects/eligibility";
import { MOBILE_QUERY_GC_TIME_MS } from "@/lib/mobile/query-cache";

export type MobileStudentProfile = {
  id: string;
  full_name_ar: string | null;
  academic_number: string | null;
  status: string | null;
  study_system: string | null;
  email: string | null;
  phone: string | null;
  program: { name_ar: string } | null;
  department: { name_ar: string } | null;
};

export type MobileStudentContext = {
  profile: MobileStudentProfile | null;
  academicStatus: AcademicStatusTimestampRow[];
  gpEligible: boolean;
  isGraduate: boolean;
  levelNumber: number | null;
  /** Canonical current enrolment snapshot (display only). */
  currentEnrolment: {
    levelName: string | null;
    semesterName: string | null;
    academicYearName: string | null;
  } | null;
};

export const STUDENT_STATUS_LABELS_AR: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف قيد",
  graduated: "خريج",
  withdrawn: "منسحب",
};

export const STUDY_SYSTEM_LABELS_AR: Record<string, string> = {
  general: "عام",
  regular: "عام",
  private: "موازي",
  private_expense: "نفقة خاصة",
};

export async function fetchMobileStudentContext(): Promise<MobileStudentContext> {
  const empty: MobileStudentContext = {
    profile: null,
    academicStatus: [],
    gpEligible: false,
    isGraduate: false,
    levelNumber: null,
    currentEnrolment: null,
  };
  const identity = await getMobileStudentIdentity();
  if (!identity) return empty;

  // The profile id is already known, so both reads go out together.
  const [{ data }, { data: acad }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select(
        "id, full_name_ar, academic_number, status, study_system, email, phone, program:programs(name_ar), department:departments(name_ar)",
      )
      .eq("user_id", identity.userId)
      .maybeSingle(),
    supabase
      .from("student_academic_status")
      .select(
        "id, level_id, created_at, updated_at, level:academic_levels(level_number, name), semester:semesters(name), academic_year:academic_years(name)",
      )
      .eq("student_profile_id", identity.studentProfileId),
  ]);

  const profile = (data as unknown as MobileStudentProfile) ?? null;
  if (!profile) return empty;

  const rows = (acad ?? []) as unknown as AcademicStatusTimestampRow[];
  const canonical = resolveCanonicalCurrentFourthLevelEligibility(rows);
  const current = canonical.current as unknown as
    | {
        level?: { name?: string | null } | null;
        semester?: { name?: string | null } | null;
        academic_year?: { name?: string | null } | null;
      }
    | null;

  return {
    profile,
    academicStatus: rows,
    gpEligible: shouldShowStudentGpNav(canonical.eligible),
    isGraduate: profile.status === "graduated",
    levelNumber: canonical.levelNumber,
    currentEnrolment: current
      ? {
          levelName: current.level?.name ?? null,
          semesterName: current.semester?.name ?? null,
          academicYearName: current.academic_year?.name ?? null,
        }
      : null,
  };
}

export function useMobileStudentContext() {
  return useQuery({
    queryKey: ["mobile-student", "context"],
    queryFn: fetchMobileStudentContext,
    staleTime: 5 * 60 * 1000,
    gcTime: MOBILE_QUERY_GC_TIME_MS,
    refetchOnWindowFocus: false,
  });
}
