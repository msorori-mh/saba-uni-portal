import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  GP_STUDENT_LEVEL4_REQUIRED_MSG,
  resolveCanonicalCurrentFourthLevelEligibility,
  type AcademicStatusTimestampRow,
} from "@/lib/graduation-projects/eligibility";

/**
 * Student GP route guard: reads authoritative current academic level using the
 * same ordering/uniqueness semantics as student_is_current_fourth_academic_level
 * (updated_at DESC NULLS LAST, created_at DESC; exactly one top row).
 * UI denial is presentation; RPCs remain the security boundary.
 */
async function assertStudentGpLevel4Eligible(): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw redirect({ to: "/portal-login" });
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile?.id) {
    throw redirect({ to: "/portal-login" });
  }

  const { data: statuses, error: statusError } = await supabase
    .from("student_academic_status")
    .select(
      "id, level_id, created_at, updated_at, level:academic_levels(level_number)",
    )
    .eq("student_profile_id", profile.id)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (statusError) {
    throw redirect({ to: "/student" });
  }

  const resolved = resolveCanonicalCurrentFourthLevelEligibility(
    (statuses ?? []) as AcademicStatusTimestampRow[],
  );

  if (!resolved.eligible) {
    throw redirect({ to: "/student" });
  }
}

export const Route = createFileRoute("/student/graduation-projects")({
  beforeLoad: async () => {
    await assertStudentGpLevel4Eligible();
  },
  component: Outlet,
});

export { GP_STUDENT_LEVEL4_REQUIRED_MSG };
