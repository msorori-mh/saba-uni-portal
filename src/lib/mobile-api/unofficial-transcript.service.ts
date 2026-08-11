import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveOwnStudentProfile } from "./student-identity";
import { MobileApiError } from "./errors";

/**
 * Student-self unofficial transcript — same semantic result as getUnofficialTranscriptData
 * but never accepts a foreign studentProfileId from the client.
 */
export async function getMobileUnofficialTranscript(userId: string) {
  const profile = await resolveOwnStudentProfile(userId);

  const [rowsRes, summaryRes] = await Promise.all([
    supabaseAdmin
      .from("student_unofficial_transcript")
      .select("*")
      .eq("student_profile_id", profile.id),
    supabaseAdmin
      .from("student_transcript_summary")
      .select("*")
      .eq("student_profile_id", profile.id),
  ]);

  if (rowsRes.error || summaryRes.error) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "TRANSCRIPT_LOOKUP_FAILED",
      "Unable to load transcript",
      "تعذر تحميل السجل الأكاديمي",
    );
  }

  return {
    student_profile_id: profile.id,
    rows: rowsRes.data ?? [],
    summary: summaryRes.data ?? [],
  };
}
