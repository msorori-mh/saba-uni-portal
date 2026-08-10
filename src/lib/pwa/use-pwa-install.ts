import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDismissedAt,
  invokeDeferredInstallPrompt,
  isIosBrowser,
  isStandaloneDisplay,
  readDismissedAt,
  shouldShowAndroidInstallPrompt,
  shouldShowIosInstallFallback,
  writeDismissedAt,
  type BeforeInstallPromptEventLike,
} from "./install-prompt-state";

export type UsePwaInstallResult = {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  showAndroidPrompt: boolean;
  showIosFallback: boolean;
  installing: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismiss: () => void;
};

/**
 * Captures `beforeinstallprompt` in memory only (never persisted).
 * Browser eligibility remains authoritative — this hook never fakes installability.
 */
export function usePwaInstall(options?: { revealDelayMs?: number }): UsePwaInstallResult {
  const revealDelayMs = options?.revealDelayMs ?? 1600;
  const deferredRef = useRef<BeforeInstallPromptEventLike | null>(null);

  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [revealReady, setRevealReady] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = isStandaloneDisplay(window);
    setIsStandalone(standalone);
    setIsIOS(isIosBrowser(window.navigator.userAgent, standalone, window.navigator.maxTouchPoints ?? 0));
    setDismissedAt(readDismissedAt());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const bip = event as BeforeInstallPromptEventLike;
      // Keep the deferred event in memory only — never localStorage/sessionStorage.
      deferredRef.current = bip;
      setIsInstallable(true);
      setIsInstalled(false);
    };

    const onInstalled = () => {
      deferredRef.current = null;
      setIsInstallable(false);
      setIsInstalled(true);
      clearDismissedAt();
      setDismissedAt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const revealTimer = window.setTimeout(() => setRevealReady(true), revealDelayMs);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(revealTimer);
    };
  }, [revealDelayMs]);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const deferred = deferredRef.current;
    if (!deferred) return "unavailable";

    setInstalling(true);
    try {
      const outcome = await invokeDeferredInstallPrompt(deferred);
      deferredRef.current = null;
      setIsInstallable(false);

      if (outcome === "accepted") {
        setIsInstalled(true);
        clearDismissedAt();
        setDismissedAt(null);
        return "accepted";
      }

      if (outcome === "dismissed") {
        const at = Date.now();
        writeDismissedAt(at);
        setDismissedAt(at);
        return "dismissed";
      }

      return "unavailable";
    } finally {
      setInstalling(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    const at = Date.now();
    writeDismissedAt(at);
    setDismissedAt(at);
  }, []);

  const visibilityBase = {
    isInstallable,
    isInstalled,
    isStandalone,
    isIOS,
    dismissedAt,
  };

  const showAndroidPrompt =
    revealReady && shouldShowAndroidInstallPrompt(visibilityBase);
  const showIosFallback =
    revealReady && !showAndroidPrompt && shouldShowIosInstallFallback(visibilityBase);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isStandalone,
    showAndroidPrompt,
    showIosFallback,
    installing,
    promptInstall,
    dismiss,
  };
}
