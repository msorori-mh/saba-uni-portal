/**
 * Native (Capacitor) PWA neutralisation.
 *
 * Inside the Android/iOS WebView the portal must behave as a native app:
 * no service worker, no portal-owned Cache Storage entries, no install UI.
 * Normal browser PWA behaviour on quboolye.com is intentionally untouched —
 * every function here is a no-op unless `isNativePlatform()` is true.
 */
import { isNativePlatform } from "@/lib/native/platform";

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

/**
 * Unregisters any service worker previously installed in the native WebView and
 * removes only portal-owned caches. Safe to call repeatedly; never throws.
 */
export async function disablePwaInNativeShell(): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!isNativePlatform()) return;

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.allSettled(regs.map((r) => r.unregister()));
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
