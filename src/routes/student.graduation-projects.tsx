import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  GP_STUDENT_LEVEL4_REQUIRED_MSG,
  isCurrentFourthAcademicLevel,
} from "@/lib/graduation-projects/eligibility";

/**
 * Student GP route guard: reads authoritative current academic level from
 * student_academic_status → academic_levels (never client-supplied level).
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

  const { data: status, error: statusError } = await supabase
    .from("student_academic_status")
    .select("level_id, level:academic_levels(level_number)")
    .eq("student_profile_id", profile.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (statusError) {
    throw redirect({ to: "/student" });
  }

  const levelNumber = (
    status?.level as { level_number?: number } | null | undefined
  )?.level_number;

  if (!isCurrentFourthAcademicLevel(levelNumber)) {
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
