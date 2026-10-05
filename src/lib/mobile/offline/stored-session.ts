/**
 * Reads WHO is signed in from the session supabase-js already keeps in
 * localStorage — without touching the network.
 *
 * Why it exists: when the access token has expired, `supabase.auth.getSession()`
 * tries to refresh it and, without a network, retries for ~25 s and then
 * answers `session: null` with a retryable error (the stored session is kept).
 * Treating that answer as "signed out" would bounce an offline student to the
 * login screen, so the mobile guard falls back to this local read.
 *
 * Only the user id and the expiry are returned; tokens never leave this
 * function and nothing is written. This is a UX-level identity read, not
 * authorization: RLS and the RPCs still verify the JWT on every data call.
 */

type ReadableStorage = Pick<Storage, "getItem" | "key" | "length">;

export type StoredSupabaseSession = {
  userId: string;
  /** Access-token expiry in ms since epoch, or null when unknown. */
  expiresAtMs: number | null;
};

const SUPABASE_SESSION_KEY = /^sb-[a-z0-9-]+-auth-token$/i;
/** Same margin supabase-js uses before it decides a token needs a refresh. */
const EXPIRY_MARGIN_MS = 90_000;

export function readStoredSupabaseSession(
  storage: ReadableStorage | null | undefined = defaultStorage(),
): StoredSupabaseSession | null {
  if (!storage) return null;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !SUPABASE_SESSION_KEY.test(key)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        refresh_token?: unknown;
        expires_at?: unknown;
        user?: { id?: unknown } | null;
      } | null;
      const userId = parsed?.user?.id;
      if (typeof userId !== "string" || !userId) continue;
      if (typeof parsed?.refresh_token !== "string" || !parsed.refresh_token) continue;
      const expiresAt = Number(parsed.expires_at);
      return {
        userId,
        expiresAtMs: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt * 1000 : null,
      };
    }
  } catch {
    /* blocked storage or malformed JSON = no local session */
  }
  return null;
}

/** True when supabase-js would have to refresh the token (network) before answering. */
export function storedSessionNeedsRefresh(
  session: StoredSupabaseSession,
  now: number = Date.now(),
): boolean {
  if (session.expiresAtMs === null) return true;
  return session.expiresAtMs - now < EXPIRY_MARGIN_MS;
}

function defaultStorage(): ReadableStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
