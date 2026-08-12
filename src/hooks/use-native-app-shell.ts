import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { isNativePlatform, isAndroidNative } from "@/lib/native/platform";
import { resolveBackAction } from "@/lib/native/back-button";

/**
 * Native app-shell behaviour for the student mobile surface:
 * status bar styling, splash hide, and safe Android back-button handling.
 *
 * No-op on the web. All Capacitor modules are imported dynamically.
 */
export function useNativeAppShell(pathname: string) {
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const lastRootBackAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isNativePlatform()) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
          import("@capacitor/status-bar"),
          import("@capacitor/splash-screen"),
        ]);
        if (disposed) return;
        if (isAndroidNative()) {
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#061F33" });
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
        await SplashScreen.hide();
      } catch {
        /* status bar / splash are best-effort */
      }

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          const action = resolveBackAction({
            pathname: pathRef.current,
            canGoBack: Boolean(canGoBack),
            lastRootBackAtMs: lastRootBackAt.current,
            nowMs: Date.now(),
          });
          if (action === "navigate_back") {
            window.history.back();
            return;
          }
          if (action === "confirm_exit") {
            lastRootBackAt.current = Date.now();
            toast("اضغط رجوع مرة أخرى للخروج من التطبيق");
            return;
          }
          void App.exitApp();
        });
        if (disposed) {
          void handle.remove();
          return;
        }
        cleanups.push(() => void handle.remove());
      } catch {
        /* back handling unavailable */
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
