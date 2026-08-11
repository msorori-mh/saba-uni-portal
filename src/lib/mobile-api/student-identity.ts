import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MobileApiError } from "./errors";

export type StudentProfileIdentity = {
  id: string;
  user_id: string;
  program_id: string | null;
  study_system: string | null;
};

/** Resolve the caller's own student profile. Never accepts a client-supplied foreign id. */
export async function resolveOwnStudentProfile(
  userId: string,
): Promise<StudentProfileIdentity> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id, user_id, program_id, study_system")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "STUDENT_LOOKUP_FAILED",
      "Unable to resolve student context",
      "تعذر تحديد ملف الطالب",
    );
  }
  if (!data?.id) {
    throw new MobileApiError(
      "STUDENT_CONTEXT_REQUIRED",
      "STUDENT_CONTEXT_REQUIRED",
      "Student profile required",
      "لا يوجد ملف طالب مرتبط بالحساب",
    );
  }

  return data as StudentProfileIdentity;
}

export async function assertOwnsStudentProfile(
  userId: string,
  studentProfileId: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("id", studentProfileId)
    .maybeSingle();
  if (!data) {
    throw new MobileApiError(
      "NOT_ALLOWED",
      "CROSS_STUDENT_DENIED",
      "Not allowed",
      "غير مصرح",
    );
  }
}
