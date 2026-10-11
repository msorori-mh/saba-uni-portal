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
 *
 * Offline (OFFLINE-FIRST-01): without a network the access token cannot be
 * refreshed and the profile check cannot reach the server. Neither may be
 * read as "signed out" / "not a student":
 *  - the user id falls back to the session supabase-js already keeps on the
 *    device (see offline/stored-session.ts);
 *  - the profile check falls back to the `{ userId, studentProfileId }` pair
 *    persisted the last time the server confirmed it (per user, 7 days max).
 * Online, the server stays authoritative: an account without a student
 * profile is still reported as `null` and signed out by the callers.
 *
 * Both fallbacks exist ONLY while the feature is active on the device
 * (`isMobileOfflineActive()`); otherwise this module behaves exactly as it
 * did before: `getSession()` for the user id, the server for the profile.
 */

import { supabase } from "@/integrations/supabase/client";
import { isMobileOfflineActive } from "@/lib/mobile/offline/config";
import { isMobileOnline, resolveMobileLaunchConnectivity } from "@/lib/mobile/offline/connectivity";
import {
  readPersistedMobileIdentity,
  wipeMobileOfflineData,
  writePersistedMobileIdentity,
} from "@/lib/mobile/offline/offline-store";
import {
  readStoredSupabaseSession,
  storedSessionNeedsRefresh,
} from "@/lib/mobile/offline/stored-session";

export type MobileStudentIdentity = { userId: string; studentProfileId: string; mustChangePassword?: boolean };

const IDENTITY_TTL_MS = 10 * 60_000;
/** How long the guard waits for a token refresh before trusting the local session. */
const SESSION_REFRESH_WAIT_MS = 3_000;

let cached: (MobileStudentIdentity & { at: number }) | null = null;
let inflight: { userId: string; promise: Promise<MobileStudentIdentity | null> } | null = null;

function wait<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** A failed token refresh that says nothing about the session itself (no network / 5xx). */
function isRetryableAuthError(error: unknown): boolean {
  const candidate = error as { name?: string; status?: number } | null;
  if (!candidate) return false;
  if (candidate.name === "AuthRetryableFetchError") return true;
  return (
    typeof candidate.status === "number" && (candidate.status === 0 || candidate.status >= 500)
  );
}

/**
 * Signed-in user id from the locally stored session.
 *
 * No network when the token is still valid. When it has expired:
 *  - offline, the stored session is trusted immediately (supabase-js would
 *    otherwise retry the refresh for ~25 s and then answer "no session");
 *  - online, the refresh is awaited briefly; a network failure or a slow
 *    refresh keeps the student signed in, while a real rejection (revoked
 *    refresh token → supabase-js deletes the stored session) returns null.
 */
export async function getMobileSessionUserId(): Promise<string | null> {
  // Feature not active on this device (pilot without opt-in, or "off"): the
  // original behaviour, untouched — one local getSession() read.
  const stored = isMobileOfflineActive() ? readStoredSupabaseSession() : null;
  if (stored) {
    await resolveMobileLaunchConnectivity();
    if (!isMobileOnline()) return stored.userId;
    if (storedSessionNeedsRefresh(stored)) {
      const outcome = await Promise.race([
        supabase.auth.getSession().then(
          (result) => ({ kind: "settled" as const, result }),
          () => ({ kind: "failed" as const }),
        ),
        wait(SESSION_REFRESH_WAIT_MS, { kind: "pending" as const }),
      ]);
      if (outcome.kind === "settled") {
        const sessionUserId = outcome.result.data.session?.user?.id;
        if (sessionUserId) return sessionUserId;
        if (!isRetryableAuthError(outcome.result.error)) return null;
      }
      // Could not confirm: the session is whatever is still stored on the device.
      return readStoredSupabaseSession()?.userId ?? null;
    }
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** The server said this account has no student profile: forget everything and sign out. */
async function revokeNonStudent(userId: string): Promise<void> {
  if (cached?.userId === userId) cached = null;
  wipeMobileOfflineData();
  try {
    await supabase.auth.signOut();
  } catch {
    /* the auth listener of the layout still handles the missing session */
  }
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
    return { userId, studentProfileId: cached.studentProfileId, ...(typeof cached.mustChangePassword === "boolean" ? { mustChangePassword: cached.mustChangePassword } : {}) };
  }

  // `offlineActive` false ⇒ `persisted` is null and nothing is written, which
  // reduces everything below to the original server-checked flow.
  const offlineActive = isMobileOfflineActive();
  const persisted = offlineActive ? readPersistedMobileIdentity(userId) : null;
  if (offlineActive && !isMobileOnline()) {
    if (persisted) return persisted;
    throw new Error("MOBILE_IDENTITY_UNAVAILABLE_OFFLINE");
  }
  if (inflight && inflight.userId === userId) {
    return persisted ? persisted : inflight.promise;
  }

  const promise = (async (): Promise<MobileStudentIdentity | null> => {
    const { data, error } = await supabase
      .from("student_profiles")
      .select("id, must_change_password")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const studentProfileId = (data as { id?: string } | null)?.id;
    if (!studentProfileId) return null;
    const flag = (data as { must_change_password?: boolean } | null)?.must_change_password;
    const identity = { userId, studentProfileId, ...(typeof flag === "boolean" ? { mustChangePassword: flag } : {}) };
    cached = { ...identity, at: Date.now() };
    if (offlineActive) writePersistedMobileIdentity(identity);
    return identity;
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { userId, promise };

  if (!persisted) return promise;

  // Confirmed as a student on this device before: answer from the device now
  // and let the server check finish in the background (first paint does not
  // wait for the network). A definite "no student profile" still signs out.
  void promise.then(
    (identity) => {
      if (identity === null) void revokeNonStudent(userId);
    },
    () => undefined,
  );
  return persisted;
}

/** Drop the cached identity (sign-out, account switch). */
export function clearMobileStudentIdentity(): void {
  cached = null;
  inflight = null;
}
