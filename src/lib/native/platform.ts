/**
 * Canonical native-runtime helper (Capacitor / Android WebView).
 *
 * This is the ONLY place allowed to detect the native platform.
 * Do not scatter `Capacitor.*` checks across components — import from here.
 *
 * All Capacitor modules are loaded dynamically so SSR/prerender and the plain
 * web build never evaluate native code.
 */

export const ANDROID_APPLICATION_ID = "ye.edu.usr.fitcs.portal";
export const ANDROID_APP_DISPLAY_NAME = "بوابة الكلية";

/** Canonical student-first entry route for the native Android app. */
export const NATIVE_HOME_ROUTE = "/mobile/student";
/** Canonical unauthenticated entry route for the native Android app. */
export const NATIVE_LOGIN_ROUTE = "/mobile/student-login";

/** Routes treated as "root" for Android back-button handling (no further back). */
export const NATIVE_ROOT_ROUTES = [NATIVE_HOME_ROUTE, NATIVE_LOGIN_ROUTE] as const;

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorGlobal(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

/** True only inside the Capacitor native shell (Android/iOS), never in a browser. */
export function isNativePlatform(): boolean {
  const cap = capacitorGlobal();
  return typeof cap?.isNativePlatform === "function" ? cap.isNativePlatform() === true : false;
}

/** "android" | "ios" | "web" */
export function nativePlatform(): string {
  const cap = capacitorGlobal();
  const platform = typeof cap?.getPlatform === "function" ? cap.getPlatform() : "web";
  return platform || "web";
}

export function isAndroidNative(): boolean {
  return isNativePlatform() && nativePlatform() === "android";
}

/** Normalises a pathname for root comparison ("/x/" -> "/x"). */
export function normalizeRoutePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** True when the given path is a native app root (back should exit, not navigate). */
export function isNativeRootRoute(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return (NATIVE_ROOT_ROUTES as readonly string[]).includes(path);
}
