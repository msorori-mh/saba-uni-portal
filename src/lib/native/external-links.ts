/**
 * Safe external-link handling for web + Capacitor Android.
 *
 * Inside the native shell an unguarded `window.open` / `<a href>` can either
 * navigate the app WebView away from the portal (dead end, no chrome) or hand
 * an arbitrary URL scheme to the OS. Every outbound link must go through here.
 */

/** Only these URL schemes may ever leave the app. */
export const ALLOWED_EXTERNAL_SCHEMES = ["https:", "mailto:", "tel:"] as const;

/** Hosts that belong to the portal itself — they stay inside the WebView. */
export const INTERNAL_HOSTS = [
  "saba-uni-portal.lovable.app",
  "quboolye.com",
  "www.quboolye.com",
] as const;

export type ExternalUrlDecision =
  | { kind: "blocked"; reason: string }
  | { kind: "internal"; url: string }
  | { kind: "external"; url: string };

function parse(rawUrl: string): URL | null {
  try {
    const base = typeof window !== "undefined" ? window.location.href : "https://quboolye.com/";
    return new URL(rawUrl, base);
  } catch {
    return null;
  }
}

/** Classifies a URL: blocked (untrusted scheme), internal (in-app), or external. */
export function classifyExternalUrl(rawUrl: string): ExternalUrlDecision {
  const url = parse(String(rawUrl ?? "").trim());
  if (!url) return { kind: "blocked", reason: "رابط غير صالح" };
  if (!(ALLOWED_EXTERNAL_SCHEMES as readonly string[]).includes(url.protocol)) {
    return { kind: "blocked", reason: `مخطط رابط غير مسموح: ${url.protocol}` };
  }
  if (url.protocol === "https:" && (INTERNAL_HOSTS as readonly string[]).includes(url.hostname)) {
    return { kind: "internal", url: url.toString() };
  }
  return { kind: "external", url: url.toString() };
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  return classifyExternalUrl(rawUrl).kind !== "blocked";
}

/**
 * Opens a link with the right behaviour for the current runtime.
 * Returns the decision so callers can surface a message when blocked.
 */
export async function openExternalUrl(rawUrl: string): Promise<ExternalUrlDecision> {
  const decision = classifyExternalUrl(rawUrl);
  if (decision.kind === "blocked" || typeof window === "undefined") return decision;

  const { isNativePlatform } = await import("./platform");
  if (decision.kind === "internal" && !isNativePlatform()) {
    window.open(decision.url, "_blank", "noopener,noreferrer");
    return decision;
  }

  if (isNativePlatform()) {
    // Native: hand off to the system browser / OS handler so the app WebView
    // never leaves the portal shell.
    window.open(decision.url, "_system");
    return decision;
  }

  window.open(decision.url, "_blank", "noopener,noreferrer");
  return decision;
}
