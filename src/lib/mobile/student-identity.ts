/**
 * Mobile student identity — one cheap, cached lookup shared by the route guard
 * and every mobile page query.
 *
 * Why: each screen used to ask the auth server for the user (a network
 * round-trip) and then re-read `student_profiles.id` (a second one) before its
 * real queries, and the layout guard repeated the same pair on every
 * navigation. On a slow mobile link that is several serial round-trips of pure
 * overhead per tap.
 *
 * `getSession()` reads the locally stored session (refreshing the token only
 * when it has expired). This is a UX-level identity read, NOT authorization:
 * row-level security and the RPCs still verify the JWT server-side on every
 * data call, so a stale or tampered local session only yields empty/denied
 * results.
 */

import { supabase } from "@/integrations/supabase/client";

export type MobileStudentIdentity = { userId: string; studentProfileId: string };

const IDENTITY_TTL_MS = 10 * 60_000;

let cached: (MobileStudentIdentity & { at: number }) | null = null;
let inflight: { userId: string; promise: Promise<MobileStudentIdentity | null> } | null = null;

/** Locally stored session user id (no network unless the token must refresh). */
export async function getMobileSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Signed-in user + their student profile id. Returns null when there is no
 * session or the account has no student profile. Throws on a transient read
 * error so callers never mistake "could not check" for "not a student".
 */
export async function getMobileStudentIdentity(): Promise<MobileStudentIdentity | null> {
  const userId = await getMobileSessionUserId();
  if (!userId) {
    cached = null;
    return null;
  }
  if (cached && cached.userId === userId && Date.now() - cached.at < IDENTITY_TTL_MS) {
    return { userId, studentProfileId: cached.studentProfileId };
  }
  if (inflight && inflight.userId === userId) return inflight.promise;

  const promise = (async (): Promise<MobileStudentIdentity | null> => {
    const { data, error } = await supabase
      .from("student_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const studentProfileId = (data as { id?: string } | null)?.id;
    if (!studentProfileId) return null;
    cached = { userId, studentProfileId, at: Date.now() };
    return { userId, studentProfileId };
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { userId, promise };
  return promise;
}

/** Drop the cached identity (sign-out, account switch). */
export function clearMobileStudentIdentity(): void {
  cached = null;
  inflight = null;
}
