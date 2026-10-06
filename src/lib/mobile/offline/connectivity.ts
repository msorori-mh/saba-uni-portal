/**
 * Connectivity for the mobile student app.
 *
 * `navigator.onLine` cannot be trusted inside the Android WebView (it stays
 * `true` unless the native side calls `setNetworkAvailable`, which the shell
 * does not), and React Query assumes "online" until a browser event says
 * otherwise. So reachability is measured:
 *  - on launch, the service worker reports whether the document itself came
 *    from the network or from the stored shell;
 *  - afterwards a tiny same-origin probe (`/version.json`, never cached, never
 *    intercepted by the worker) confirms the state when a request fails.
 *
 * The result drives React Query's `onlineManager`: while offline, queries are
 * paused (cached data stays on screen) instead of failing, and they resume on
 * their own when the probe succeeds again.
 *
 * Only a DEFINITE failure (request rejected / browser says offline) marks the
 * app offline. A slow answer is "unknown" and changes nothing, so students on
 * a slow link are never locked out of online-only screens.
 */

import { onlineManager } from "@tanstack/react-query";
import { getMobileOfflineController, isMobileOfflineActive } from "./config";

export type MobileConnectivity = "online" | "offline" | "unknown";

const PROBE_URL = "/version.json";
const PROBE_TIMEOUT_MS = 8_000;
const PROBE_MEMO_MS = 10_000;
const OFFLINE_RECHECK_MS = 15_000;
const LAUNCH_HINT_TIMEOUT_MS = 300;

type LaunchHint = { source?: string; reason?: string | null; at?: number } | null;

let lastProbe: { result: MobileConnectivity; at: number } | null = null;
let probeInFlight: Promise<MobileConnectivity> | null = null;
let launchPromise: Promise<void> | null = null;
let watchStarted = false;
let recheckTimer: ReturnType<typeof setInterval> | null = null;

export function isMobileOnline(): boolean {
  return onlineManager.isOnline();
}

/** Subscribe to online/offline changes (useSyncExternalStore-compatible). */
export function subscribeMobileOnline(listener: () => void): () => void {
  return onlineManager.subscribe(listener);
}

function applyConnectivity(result: MobileConnectivity): void {
  // Not opted in / switched off: React Query's own online state is never touched.
  if (result === "unknown" || !isMobileOfflineActive()) return;
  const online = result === "online";
  if (onlineManager.isOnline() !== online) onlineManager.setOnline(online);
  syncRecheckTimer();
}

function syncRecheckTimer(): void {
  if (typeof window === "undefined") return;
  const offline = isMobileOfflineActive() && !onlineManager.isOnline();
  if (offline && !recheckTimer) {
    recheckTimer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        void probeMobileConnectivity({ force: true });
      }
    }, OFFLINE_RECHECK_MS);
  } else if (!offline && recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
}

async function runProbe(): Promise<MobileConnectivity> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return "unknown";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, PROBE_TIMEOUT_MS);
  try {
    // Any HTTP answer proves reachability; the status code is irrelevant.
    await fetch(`${PROBE_URL}?probe=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller?.signal,
    });
    return "online";
  } catch {
    return timedOut ? "unknown" : "offline";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Measures reachability (deduplicated; answers are reused for a few seconds)
 * and updates the online state.
 */
export function probeMobileConnectivity(options?: {
  force?: boolean;
}): Promise<MobileConnectivity> {
  // Inert unless the feature is active on this device: no request is sent.
  if (!isMobileOfflineActive()) return Promise.resolve("unknown");
  if (probeInFlight) return probeInFlight;
  if (!options?.force && lastProbe && Date.now() - lastProbe.at < PROBE_MEMO_MS) {
    return Promise.resolve(lastProbe.result);
  }
  probeInFlight = runProbe()
    .then((result) => {
      lastProbe = { result, at: Date.now() };
      applyConnectivity(result);
      return result;
    })
    .finally(() => {
      probeInFlight = null;
    });
  return probeInFlight;
}

function askServiceWorkerForLaunchHint(): Promise<LaunchHint> {
  return new Promise((resolve) => {
    try {
      const controller = getMobileOfflineController();
      if (!controller || typeof MessageChannel === "undefined") {
        resolve(null);
        return;
      }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), LAUNCH_HINT_TIMEOUT_MS);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        const data = event.data as { lastNavigation?: LaunchHint } | null;
        resolve(data?.lastNavigation ?? null);
      };
      controller.postMessage({ type: "MOBILE_OFFLINE_STATUS" }, [channel.port2]);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resolved once per page load, before the guard reads the session: if the
 * document was served from the stored shell because the network was
 * unreachable, the app starts in offline mode (no query is attempted, the
 * session is read locally). Bounded to ~300 ms; a no-op without a worker.
 */
export function resolveMobileLaunchConnectivity(): Promise<void> {
  if (launchPromise) return launchPromise;
  launchPromise = (async () => {
    if (!isMobileOfflineActive() || typeof window === "undefined") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      applyConnectivity("offline");
      return;
    }
    const hint = await askServiceWorkerForLaunchHint();
    if (hint?.source === "cache" && hint.reason === "network-error") {
      applyConnectivity("offline");
      // Confirm in the background; flips back as soon as the network answers.
      void probeMobileConnectivity({ force: true });
    }
  })().catch(() => undefined);
  return launchPromise;
}

/** Keeps the online state honest for the lifetime of the page. Idempotent. */
export function startMobileConnectivityWatch(): void {
  if (watchStarted || typeof window === "undefined" || !isMobileOfflineActive()) return;
  watchStarted = true;
  window.addEventListener("offline", () => applyConnectivity("offline"));
  window.addEventListener("online", () => void probeMobileConnectivity({ force: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !onlineManager.isOnline()) {
      void probeMobileConnectivity({ force: true });
    }
  });
  onlineManager.subscribe(() => syncRecheckTimer());
  syncRecheckTimer();
}

/**
 * Opt-out on this device: stop measuring and hand the online state back to
 * what the browser itself reports (React Query's default behaviour).
 */
export function resetMobileConnectivity(): void {
  lastProbe = null;
  launchPromise = null;
  if (recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
  const browserOnline = typeof navigator === "undefined" || navigator.onLine !== false;
  if (onlineManager.isOnline() !== browserOnline) onlineManager.setOnline(browserOnline);
}
