/** Legacy web links enter the same student app used by Android and the PWA. */
export function resolveStudentAppPath(pathname: string, hash = ""): string | null {
  const path = pathname.replace(/\/$/, "");
  if (path === "/student/change-password") return null;
  if (path === "/student") {
    if (["requests", "student-requests"].includes(hash.replace(/^#/, ""))) return "/mobile/student/requests";
    return "/mobile/student";
  }
  if (path === "/student/progress") return "/mobile/student/academic-record";
  const suffix = path.slice("/student".length);
  if (!path.startsWith("/student/")) return null;
  const exact = ["/schedule", "/study-plan", "/reports", "/notifications", "/graduates-affairs"];
  const nested = ["/requests", "/materials", "/graduation-projects"];
  if (exact.includes(suffix) || nested.some((prefix) => suffix === prefix || suffix.startsWith(`${prefix}/`))) {
    return `/mobile/student${suffix}`;
  }
  return null;
}
