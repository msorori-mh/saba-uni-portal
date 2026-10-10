/**
 * Server-only: who owns a student request.
 *
 * student_requests has NO foreign key to student_profiles, so a PostgREST
 * embed (`student_profiles!inner(...)`) fails with PGRST200 and every caller
 * that relied on it threw. Resolve the owner with two plain reads instead.
 * Fail closed: any read error throws; a missing request / profile yields null.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StudentRequestOwner = {
  requestId: string;
  requestNumber: string | null;
  ownerUserId: string | null;
};

export async function resolveStudentRequestOwner(
  requestId: string,
): Promise<StudentRequestOwner | null> {
  const { data: request, error: requestError } = await supabaseAdmin
    .from("student_requests")
    .select("id, request_number, student_profile_id")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) return null;

  const profileId = (request as { student_profile_id?: string | null }).student_profile_id ?? null;
  let ownerUserId: string | null = null;
  if (profileId) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("student_profiles")
      .select("user_id")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    ownerUserId = (profile as { user_id?: string | null } | null)?.user_id ?? null;
  }

  return {
    requestId: (request as { id: string }).id,
    requestNumber: (request as { request_number?: string | null }).request_number ?? null,
    ownerUserId,
  };
}
