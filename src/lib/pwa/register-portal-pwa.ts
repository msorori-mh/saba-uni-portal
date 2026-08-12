/**
 * Registers the portal-wide PWA service worker (scope `/`).
 * - Skipped inside iframes (Lovable editor preview embeds the app in an iframe).
 * - Skipped on Lovable preview hosts (id-preview-*, *.lovableproject.com).
 * - Only attempted when the browser supports service workers.
 *
 * Safe to call multiple times — `register()` is idempotent per scope.
 * Registration failure is non-fatal.
 */
export function registerPortalPWA(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Native Capacitor shell: the app is already installed — never register a SW.
  if (isNativePlatform()) {
    void disablePwaInNativeShell();
    return;
  }

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev");

  if (inIframe || isPreviewHost) {
    // Make sure no stale SW remains in preview contexts.
    navigator.serviceWorker
      .getRegistrations?.()
      .then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      })
      .catch(() => {});
    return;
  }

  // Defer to idle to avoid competing with hydration.
  const run = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      // Non-fatal — PWA is opt-in.
      console.warn("[portal-pwa] SW registration failed:", err);
    });
  };

  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}
