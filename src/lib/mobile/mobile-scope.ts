/**
 * Canonical mobile-app scope helpers.
 *
 * `/mobile/*` is a standalone student product delivered inside the Android
 * shell. It must never render public-site chrome and must never navigate to
 * `/student`, `/faculty-portal`, `/staff`, `/admin` or public marketing routes.
 */

export const MOBILE_APP_PATH_PREFIX = "/mobile";
export const MOBILE_STUDENT_ROOT = "/mobile/student";
export const MOBILE_STUDENT_LOGIN = "/mobile/student-login";

/** True for any route that belongs to the mobile app surface. */
export function isMobileAppPath(pathname: string): boolean {
  return pathname === MOBILE_APP_PATH_PREFIX || pathname.startsWith(`${MOBILE_APP_PATH_PREFIX}/`);
}

/** Routes a mobile screen is allowed to link to (containment contract). */
export function isAllowedMobileTarget(target: string): boolean {
  if (!target) return false;
  if (target.startsWith("#")) return true;
  return isMobileAppPath(target);
}

/** Portal surfaces the mobile app must never link into. */
export const MOBILE_FORBIDDEN_TARGET_PREFIXES = [
  "/student",
  "/faculty-portal",
  "/staff",
  "/admin",
  "/portal-login",
  "/news",
  "/events",
  "/departments",
  "/contact",
  "/about",
] as const;

export function isForbiddenMobileTarget(target: string): boolean {
  if (isMobileAppPath(target)) return false;
  return MOBILE_FORBIDDEN_TARGET_PREFIXES.some(
    (p) => target === p || target.startsWith(`${p}/`),
  );
}
