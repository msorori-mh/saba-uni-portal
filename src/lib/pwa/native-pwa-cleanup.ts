/**
 * Native (Capacitor) PWA neutralisation.
 *
 * Inside the Android/iOS WebView the portal must behave as a native app:
 * no portal-wide PWA service worker (`/sw.js`, scope `/`), no portal-owned
 * Cache Storage entries, no install UI. That worker belongs to the browser
 * "install the portal" experience and covers every portal surface; the native
 * student shell must never be controlled by it, and an old vulnerable
 * `static-portal-pwa-v1` cache must not survive in a WebView.
 * Normal browser PWA behaviour on quboolye.com is intentionally untouched —
 * every function here is a no-op unless `isNativePlatform()` is true.
 *
 * ONE deliberate exception (OFFLINE-FIRST-01): the mobile offline worker
 * (`/mobile-sw.js`, scope `/mobile/`) is kept. It is a different worker with
 * its own closed policy (immutable hashed assets + the data-free app shell
 * only, documents network-first, self-recovering after deploys — see
 * public/mobile-offline-policy.js), it is what lets the installed app open
 * without a network, and its `mobile-offline-*` caches are not portal-owned
 * caches, so they are not deleted here either. With the kill switch off
 * (`MOBILE_OFFLINE_ENABLED = false`) it is unregistered like any other worker.
 */
import { isNativePlatform } from "@/lib/native/platform";
import { MOBILE_OFFLINE_ENABLED, isMobileOfflineScope } from "@/lib/mobile/offline/config";

/** Cache names owned by the portal service worker (see public/sw-cache-policy.js). */
export const PORTAL_OWNED_CACHE_PREFIX = "portal-pwa-";
export const PORTAL_LEGACY_OWNED_CACHE_NAMES = ["static-portal-pwa-v1"] as const;

/** True only for portal-owned caches — never third-party/messaging caches. */
export function isPortalOwnedCacheName(name: string): boolean {
  return (
    name.startsWith(PORTAL_OWNED_CACHE_PREFIX) ||
    (PORTAL_LEGACY_OWNED_CACHE_NAMES as readonly string[]).includes(name)
  );
}

/** PWA (service worker + install prompt) is allowed only outside the native shell. */
export function isPwaAllowedHere(): boolean {
  return !isNativePlatform();
}

/** True for the one registration the native shell keeps (mobile offline worker). */
export function isRegistrationKeptInNativeShell(scopeUrl: string | null | undefined): boolean {
  return MOBILE_OFFLINE_ENABLED && isMobileOfflineScope(scopeUrl);
}

/**
 * Unregisters every service worker installed in the native WebView except the
 * mobile offline worker, and removes only portal-owned caches. Safe to call
 * repeatedly; never throws.
 */
export async function disablePwaInNativeShell(): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!isNativePlatform()) return;

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.allSettled(
      regs.filter((r) => !isRegistrationKeptInNativeShell(r.scope)).map((r) => r.unregister()),
    );
  } catch {
    /* best-effort */
  }

  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.allSettled(
        names.filter(isPortalOwnedCacheName).map((name) => caches.delete(name)),
      );
    }
  } catch {
    /* best-effort */
  }
}
