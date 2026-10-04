// Keeps internal deployment/config error details out of the user-facing UI.
// Council components surface error messages directly; internal prefixes like
// STAGING_ISOLATION_REQUIRED / PORTAL_DEPLOYMENT_PROFILE_REQUIRED must never
// be shown to users — log to console only and present a generic Arabic message.

const INTERNAL_ERROR_PREFIXES = [
  "STAGING_ISOLATION_REQUIRED",
  "PORTAL_DEPLOYMENT_PROFILE_REQUIRED",
];

export function safeCouncilErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw && INTERNAL_ERROR_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    console.error("[councils] internal deployment error:", raw);
    return "تعذّر تحميل البيانات، حاول مرة أخرى";
  }
  return raw || fallback;
}
