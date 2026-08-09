/**
 * Harmless UI preference for the portal PWA install prompt.
 * Stores ONLY a dismissal timestamp — never auth/session data.
 */
export const PWA_INSTALL_DISMISS_KEY = "portal_pwa_install_dismissed_at";

/** 7-day cooldown after the user dismisses the in-app install prompt. */
export const PWA_INSTALL_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type BeforeInstallPromptOutcome = "accepted" | "dismissed";

export interface BeforeInstallPromptEventLike extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>;
  prompt(): Promise<void>;
}

export type PwaInstallVisibilityInput = {
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  dismissedAt: number | null;
  now?: number;
};

export function isStandaloneDisplay(
  win: Pick<Window, "matchMedia" | "navigator"> & { navigator: Navigator & { standalone?: boolean } },
): boolean {
  try {
    if (win.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // ignore
  }
  if (win.navigator.standalone === true) return true;
  return false;
}

export function isIosBrowser(
  ua: string,
  standalone: boolean,
  maxTouchPoints: number = 0,
): boolean {
  if (standalone) return false;
  const isAppleMobile =
    /iPad|iPhone|iPod/i.test(ua) ||
    // iPadOS 13+ may report as Mac with touch
    (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  return isAppleMobile;
}

export function readDismissedAt(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof localStorage !== "undefined" ? localStorage : null,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PWA_INSTALL_DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeDismissedAt(
  at: number,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof localStorage !== "undefined" ? localStorage : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(PWA_INSTALL_DISMISS_KEY, String(at));
  } catch {
    // ignore quota / private mode
  }
}

export function clearDismissedAt(
  storage: Pick<Storage, "removeItem"> | null | undefined = typeof localStorage !== "undefined" ? localStorage : null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(PWA_INSTALL_DISMISS_KEY);
  } catch {
    // ignore
  }
}

export function isDismissCooldownActive(
  dismissedAt: number | null,
  now: number = Date.now(),
  cooldownMs: number = PWA_INSTALL_DISMISS_COOLDOWN_MS,
): boolean {
  if (dismissedAt == null) return false;
  return now - dismissedAt < cooldownMs;
}

/**
 * Android/Chrome custom install UI: only when the browser has fired
 * beforeinstallprompt, the app is not installed/standalone, and dismiss
 * cooldown has elapsed.
 */
export function shouldShowAndroidInstallPrompt(input: PwaInstallVisibilityInput): boolean {
  if (input.isStandalone || input.isInstalled) return false;
  if (!input.isInstallable) return false;
  if (isDismissCooldownActive(input.dismissedAt, input.now)) return false;
  return true;
}

/**
 * iOS Safari has no beforeinstallprompt — optional Share-sheet instructions.
 */
export function shouldShowIosInstallFallback(input: PwaInstallVisibilityInput): boolean {
  if (input.isStandalone || input.isInstalled) return false;
  if (!input.isIOS) return false;
  if (isDismissCooldownActive(input.dismissedAt, input.now)) return false;
  return true;
}

/**
 * Invokes the browser-authoritative install flow for a deferred
 * beforeinstallprompt event. Never fakes success.
 */
export async function invokeDeferredInstallPrompt(
  deferred: BeforeInstallPromptEventLike | null,
): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}

/** Keys that must never appear in PWA install preference storage. */
export const FORBIDDEN_PWA_STORAGE_KEYS = [
  "access_token",
  "refresh_token",
  "supabase",
  "session",
  "auth",
  "jwt",
] as const;
