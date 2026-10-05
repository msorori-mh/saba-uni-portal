/** Home target for error fallbacks: stay in admin when the failure was under /admin. */
export function getErrorRecoveryHomePath(pathname: string): "/admin" | "/" {
  return pathname.startsWith("/admin") ? "/admin" : "/";
}

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

/**
 * Preferred recovery: reset the error boundary, then invalidate the router.
 * Full page reload is a last resort for chunk-load failures only.
 */
export async function retryRouteError(options: {
  reset: () => void;
  invalidate: () => unknown | Promise<unknown>;
  error?: unknown;
  reload?: () => void;
  /**
   * Runs right before the chunk-error reload (e.g. purge service-worker caches
   * that still hold the stale build). Failures never block the reload.
   */
  beforeReload?: () => unknown | Promise<unknown>;
}): Promise<void> {
  options.reset();
  const reload = options.reload && isChunkLoadError(options.error) ? options.reload : undefined;
  try {
    await options.invalidate();
  } catch (error) {
    // Retrying the same missing chunk can reject again. Keep the one-shot
    // document reload available; unrelated failures must still propagate.
    if (!reload) throw error;
  }
  if (reload && options.beforeReload) {
    try {
      await options.beforeReload();
    } catch {
      // best-effort
    }
  }
  reload?.();
}

/** sessionStorage key of the one-shot stale-asset reload guard. */
export const STALE_ASSET_RELOAD_KEY = "portal:stale-asset-reload-at";
/** A second automatic reload is refused inside this window (no reload loops). */
export const STALE_ASSET_RELOAD_COOLDOWN_MS = 60_000;

/**
 * Guaranteed recovery when the running document references build assets the
 * server no longer has (a deploy replaced them): purge the caches that hold
 * the stale build and reload from the network — at most once per cooldown.
 *
 *  - "cooldown": a recovery reload just happened; do nothing (no loop).
 *  - "offline":  the server is unreachable; caches are KEPT (they are the only
 *                copy of the app on the device) and no reload happens.
 *  - "reloaded": caches purged and a network reload was requested.
 */
export async function recoverFromStaleAssets(options: {
  isOnline: () => boolean | Promise<boolean>;
  purge: () => unknown | Promise<unknown>;
  reload: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
}): Promise<"reloaded" | "offline" | "cooldown"> {
  const now = options.now ?? Date.now;
  const storage =
    options.storage !== undefined
      ? options.storage
      : typeof sessionStorage !== "undefined"
        ? sessionStorage
        : null;

  // Without a place to remember the reload there is no loop protection: do nothing.
  if (!storage) return "cooldown";

  try {
    const last = Number(storage.getItem(STALE_ASSET_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && last > 0 && now() - last < STALE_ASSET_RELOAD_COOLDOWN_MS) {
      return "cooldown";
    }
  } catch {
    // unreadable guard: fail closed, never risk a reload loop
    return "cooldown";
  }

  let online = false;
  try {
    online = (await options.isOnline()) === true;
  } catch {
    online = false;
  }
  if (!online) return "offline";

  try {
    storage.setItem(STALE_ASSET_RELOAD_KEY, String(now()));
  } catch {
    return "cooldown";
  }
  try {
    await options.purge();
  } catch {
    // best-effort: the reload below is network-first anyway
  }
  options.reload();
  return "reloaded";
}
