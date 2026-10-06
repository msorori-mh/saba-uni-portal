/**
 * Page-side controller of the mobile offline service worker
 * (public/mobile-sw.js, scope /mobile/).
 *
 * Runs in the browser AND inside the Capacitor WebView: the Android shell
 * loads https://quboolye.com in remote-URL mode, so installed APKs get this
 * behaviour from the web deploy — no new APK is involved.
 */

import { isChunkLoadError, recoverFromStaleAssets } from "@/lib/route-error-recovery";
import { isMobileAppPath } from "@/lib/mobile/mobile-scope";
import {
  MOBILE_OFFLINE_ROLLOUT,
  MOBILE_OFFLINE_SW_SCOPE,
  MOBILE_OFFLINE_SW_URL,
  getMobileOfflineController,
  isMobileOfflineActive,
  isMobileOfflineCacheName,
  isMobileOfflineScope,
  writeMobileOfflineOptIn,
} from "./config";
import { probeMobileConnectivity, resetMobileConnectivity } from "./connectivity";
import { wipeMobileOfflineData } from "./offline-store";

const ASSET_SYNC_DELAY_MS = 8_000;
const PURGE_REPLY_TIMEOUT_MS = 1_500;

let started = false;
let recoveryInstalled = false;

function canUseServiceWorker(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    if (window.self !== window.top) return false; // editor preview iframe
  } catch {
    return false;
  }
  const host = window.location.hostname;
  return !(
    host.includes("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev")
  );
}

async function findMobileRegistrations(): Promise<ServiceWorkerRegistration[]> {
  try {
    const registrations = (await navigator.serviceWorker.getRegistrations?.()) ?? [];
    return registrations.filter((registration) => isMobileOfflineScope(registration.scope));
  } catch {
    return [];
  }
}

/** Deletes the worker's Cache Storage entries from the page (worker-independent). */
export async function deleteMobileOfflineCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.allSettled(
      names.filter(isMobileOfflineCacheName).map((name) => caches.delete(name)),
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Recovery purge: asks the worker to forget every stored shell/asset (so its
 * in-memory state resets too) and also deletes the caches directly.
 */
export async function purgeMobileOfflineCaches(): Promise<void> {
  try {
    const controller = getMobileOfflineController();
    if (controller && typeof MessageChannel !== "undefined") {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(resolve, PURGE_REPLY_TIMEOUT_MS);
        channel.port1.onmessage = () => {
          clearTimeout(timer);
          resolve();
        };
        controller.postMessage({ type: "MOBILE_OFFLINE_PURGE" }, [channel.port2]);
      });
    }
  } catch {
    /* fall through to the direct delete */
  }
  await deleteMobileOfflineCaches();
}

/**
 * Applies the Settings toggle on this device, immediately:
 *  - on:  remember the opt-in and register the worker;
 *  - off: forget the opt-in, unregister the worker, delete its caches and wipe
 *         every persisted payload. Nothing of the feature stays active.
 */
export async function setMobileOfflineMode(enabled: boolean): Promise<void> {
  if (enabled) {
    writeMobileOfflineOptIn(true);
    started = false;
    startMobileOfflineRuntime();
    return;
  }
  writeMobileOfflineOptIn(false);
  started = false;
  resetMobileConnectivity();
  await disableMobileOffline();
}

/** Purge for a manual "retry" after a chunk error — kept when the server is unreachable. */
export async function purgeMobileOfflineCachesIfOnline(): Promise<void> {
  if (!isMobileOfflineActive()) return;
  if ((await probeMobileConnectivity({ force: true })) !== "online") return;
  await purgeMobileOfflineCaches();
}

/** Kill-switch path: remove the worker, its caches and every persisted payload. */
export async function disableMobileOffline(): Promise<void> {
  wipeMobileOfflineData();
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await findMobileRegistrations();
  await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  await deleteMobileOfflineCaches();
}

/**
 * Tells the worker which build assets this page already loaded. On the very
 * first launch they were fetched before the worker controlled the page, so
 * without this they would be missing from the offline cache.
 */
export function syncLoadedAssetsToServiceWorker(): void {
  try {
    const controller = getMobileOfflineController();
    if (!controller || typeof performance === "undefined") return;
    const urls = new Set<string>();
    for (const entry of performance.getEntriesByType("resource")) {
      if (entry.name.includes("/assets/")) urls.add(entry.name);
    }
    document
      .querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]")
      .forEach((node) => {
        const url = node instanceof HTMLScriptElement ? node.src : node.href;
        if (url && url.includes("/assets/")) urls.add(url);
      });
    if (urls.size === 0) return;
    controller.postMessage({ type: "MOBILE_OFFLINE_PRECACHE", urls: Array.from(urls) });
  } catch {
    /* best-effort */
  }
}

/** One guarded reload when the running document references assets that are gone. */
export function recoverMobileStaleAssets(): Promise<"reloaded" | "offline" | "cooldown"> {
  // Not active on this device: the pre-feature behaviour (manual retry) applies.
  if (!isMobileOfflineActive()) return Promise.resolve("cooldown");
  return recoverFromStaleAssets({
    // Never purge without a reachable server: offline, the stored assets are
    // the only copy of the app the device has.
    isOnline: async () => (await probeMobileConnectivity({ force: true })) === "online",
    purge: purgeMobileOfflineCaches,
    reload: () => window.location.reload(),
  });
}

/**
 * Stale-deploy recovery for the mobile app: a missing hashed asset (reported
 * by the worker) or a failed dynamic import triggers ONE purge + network
 * reload, guarded against loops by `recoverFromStaleAssets`.
 */
export function installMobileStaleAssetRecovery(): void {
  if (recoveryInstalled || typeof window === "undefined") return;
  recoveryInstalled = true;

  // Re-checked on every event: after an opt-out the listeners are inert.
  const onMobileRoute = () => isMobileOfflineActive() && isMobileAppPath(window.location.pathname);

  window.addEventListener("vite:preloadError", () => {
    if (onMobileRoute()) void recoverMobileStaleAssets();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (onMobileRoute() && isChunkLoadError(event.reason)) void recoverMobileStaleAssets();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "MOBILE_OFFLINE_ASSET_MISSING" && onMobileRoute()) {
        void recoverMobileStaleAssets();
      }
    });
  }
}

/**
 * Registers the mobile offline worker (or removes it when the kill switch is
 * off). Idempotent; never throws; a registration failure only means the app
 * keeps loading from the network as before.
 */
export function startMobileOfflineRuntime(): void {
  if (started) return;
  if (!canUseServiceWorker()) return;

  if (MOBILE_OFFLINE_ROLLOUT === "off") {
    // Kill switch: actively remove whatever an earlier release installed.
    started = true;
    void disableMobileOffline();
    return;
  }
  // Pilot and this device did not opt in: do NOTHING — no registration, no
  // listener, no cache or storage access. Identical to the pre-feature app.
  if (!isMobileOfflineActive()) return;
  started = true;

  installMobileStaleAssetRecovery();

  const register = () => {
    navigator.serviceWorker
      // updateViaCache "none": the worker AND its imported policy file are always
      // revalidated, so a fix or the kill switch is never delayed by an HTTP cache.
      .register(MOBILE_OFFLINE_SW_URL, { scope: MOBILE_OFFLINE_SW_SCOPE, updateViaCache: "none" })
      .then((registration) => {
        // Pick up a new worker (incl. a kill switch) without waiting 24 h.
        void registration.update().catch(() => undefined);
      })
      .catch((error) => {
        console.warn("[mobile-offline] SW registration failed:", error);
      });

    // Now, and again once the lazily loaded route chunks have arrived.
    const syncAssets = () => {
      syncLoadedAssetsToServiceWorker();
      setTimeout(syncLoadedAssetsToServiceWorker, ASSET_SYNC_DELAY_MS);
    };
    void navigator.serviceWorker.ready.then(syncAssets).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", syncAssets);
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
