/**
 * Removes every browser-side identity artifact left behind after sign-out.
 *
 * Supabase's `signOut()` only clears its own storage key. On shared browsers
 * we must also drop:
 *  - any leftover `sb-*` / `supabase.*` auth keys in localStorage
 *  - the whole sessionStorage (per-tab portal state, last-viewed request, …)
 *  - non-HttpOnly cookies used by the auth/session layer (`sb-*`, `supabase*`)
 *
 * HttpOnly cookies cannot be removed from JS; they are already invalidated
 * server-side by the sign-out call.
 */

const AUTH_KEY_PATTERN = /^(sb-|supabase\.|supabase-)/i;

function isAuthKey(key: string): boolean {
  return AUTH_KEY_PATTERN.test(key);
}

function clearAuthKeys(storage: Storage | null | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && isAuthKey(key)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // private mode / blocked storage — ignore
  }
}

/** Expires a cookie across the common path/domain combinations. */
export function expireCookie(name: string, doc: Document): void {
  const host = doc.location?.hostname ?? "";
  const domains = new Set<string>([""]);
  if (host && !/^\d+(\.\d+){3}$/.test(host) && host !== "localhost") {
    domains.add(host);
    const parts = host.split(".");
    if (parts.length > 2) domains.add(`.${parts.slice(-2).join(".")}`);
  }
  const expiry = "Thu, 01 Jan 1970 00:00:00 GMT";
  for (const domain of domains) {
    for (const path of ["/", doc.location?.pathname ?? "/"]) {
      doc.cookie =
        `${name}=; expires=${expiry}; path=${path}` +
        (domain ? `; domain=${domain}` : "") +
        "; SameSite=Lax";
    }
  }
}

function clearAuthCookies(doc: Document | null | undefined): void {
  if (!doc) return;
  try {
    const names = (doc.cookie || "")
      .split(";")
      .map((part) => part.split("=")[0]?.trim() ?? "")
      .filter((name) => name.length > 0 && isAuthKey(name));
    for (const name of names) expireCookie(name, doc);
  } catch {
    // cookie access blocked — ignore
  }
}

export interface SessionArtifactTargets {
  local?: Storage | null;
  session?: Storage | null;
  doc?: Document | null;
}

/**
 * Clears leftover auth storage keys, sessionStorage and auth cookies.
 * Safe to call on the server (all targets resolve to null) and never throws.
 */
export function clearSessionArtifacts(targets: SessionArtifactTargets = {}): void {
  const local =
    targets.local !== undefined
      ? targets.local
      : typeof localStorage !== "undefined"
        ? localStorage
        : null;
  const session =
    targets.session !== undefined
      ? targets.session
      : typeof sessionStorage !== "undefined"
        ? sessionStorage
        : null;
  const doc =
    targets.doc !== undefined ? targets.doc : typeof document !== "undefined" ? document : null;

  clearAuthKeys(local);
  try {
    session?.clear();
  } catch {
    // ignore
  }
  clearAuthCookies(doc);
}
