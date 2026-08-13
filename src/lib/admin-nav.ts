/** Roles allowed to sign in to the admin panel (distinct from full super-admin). */
export const ADMIN_PANEL_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
  "finance_officer",
  "hr_officer",
  "department_head",
] as const;

export type AdminPanelRole = (typeof ADMIN_PANEL_ROLES)[number];

const SUPER_ROLES = new Set<string>(["admin", "system_admin"]);

/** Matches authz.server STUDENT_READ_ROLES — client-safe for UI gating. */
export const STUDENT_READ_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

/** Matches authz.server STUDENT_ADMIN_ROLES — write access to student CRUD & accounts. */
export const STUDENT_WRITE_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
] as const;

export function canWriteStudents(userRoles: string[]): boolean {
  if (userRoles.some((r) => SUPER_ROLES.has(r))) return true;
  return userRoles.some((r) => (STUDENT_WRITE_ROLES as readonly string[]).includes(r));
}

/** Matches imports.functions SCHEDULE_IMPORT_WRITE_ROLES — UI gating for schedule import confirm. */
export const SCHEDULE_IMPORT_WRITE_ROLES = [
  "system_admin",
  "admin",
  "registrar",
] as const;

export function canWriteScheduleImport(userRoles: string[]): boolean {
  if (userRoles.some((r) => SUPER_ROLES.has(r))) return true;
  return userRoles.some((r) => (SCHEDULE_IMPORT_WRITE_ROLES as readonly string[]).includes(r));
}

export function studentsNavLabel(userRoles: string[]): string {
  return canWriteStudents(userRoles) ? "إدارة الطلاب" : "عرض الطلاب";
}

export function isAdminPanelRole(role: string): role is AdminPanelRole {
  return (ADMIN_PANEL_ROLES as readonly string[]).includes(role);
}

export function canAccessAdminPanel(roles: string[]): boolean {
  return roles.some((r) => isAdminPanelRole(r));
}

/** Nav item visible when user has any listed role, or is a super-admin. */
export function canSeeNavItem(allowedRoles: readonly string[], userRoles: string[]): boolean {
  if (userRoles.some((r) => SUPER_ROLES.has(r))) return true;
  return userRoles.some((r) => allowedRoles.includes(r));
}

const ALL_STAFF = ADMIN_PANEL_ROLES;

export const NAV_ITEM_ROLES: Record<string, readonly string[]> = {
  "/admin": ALL_STAFF,
  "/admin/executive-dashboard": ["system_admin", "admin", "dean", "registrar"],
  "/admin/academic-operations": ["system_admin", "admin", "dean", "registrar", "department_head"],
  "/admin/academic-core": ["system_admin", "admin", "dean", "registrar"],
  "/admin/study-plans": ["system_admin", "admin", "dean", "registrar"],
  "/admin/course-offerings": ["system_admin", "admin", "dean", "registrar", "department_head"],
  "/admin/enrollments": ["system_admin", "admin", "dean", "registrar", "student_affairs", "department_head"],
  "/admin/grades": ["system_admin", "admin", "dean", "registrar", "department_head"],
  "/admin/transcripts": ["system_admin", "admin", "dean", "registrar"],
  "/admin/imports": ["system_admin", "admin", "registrar", "student_affairs", "finance_officer"],
  "/admin/student-progress": ["system_admin", "admin", "dean", "registrar"],
  "/admin/at-risk-students": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/admin/graduation-candidates": ["system_admin", "admin", "dean", "registrar"],
  "/admin/graduation-projects": ["system_admin", "admin", "dean", "registrar"],
  "/admin/graduation-project-policies": ["system_admin", "admin", "dean"],

  "/admin/graduates-affairs": ["system_admin", "admin"],
  "/admin/graduates-affairs-workflows": ["system_admin", "admin"],
  "/admin/lecture-execution": ["system_admin", "admin", "dean", "registrar", "department_head"],
  "/admin/academic-councils": ["system_admin", "admin", "dean"],
  "/admin/students": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/admin/student-requests": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/admin/request-types": ["system_admin", "admin", "registrar", "student_affairs"],
  "/admin/faculty-management": ["system_admin", "admin", "dean", "hr_officer"],
  "/admin/staff-management": ["system_admin", "admin", "dean", "hr_officer"],
  "/admin/faculty": ["system_admin", "admin", "dean", "hr_officer"],
  "/admin/finance": ["system_admin", "admin", "dean", "finance_officer"],
  "/admin/documents": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/admin/communications": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/messages": ["system_admin", "admin", "dean", "registrar", "student_affairs"],
  "/admin/automation": ["system_admin", "admin", "dean", "registrar"],
  "/admin/reports": ["system_admin", "admin", "dean", "registrar", "finance_officer", "student_affairs", "department_head"],
  "/admin/department-reports": ["system_admin", "admin", "dean", "department_head"],
  "/admin/executive-reports": ["system_admin", "admin", "dean", "registrar"],
  "/admin/news": ["system_admin", "admin"],
  "/admin/events": ["system_admin", "admin"],
  "/admin/research": ["system_admin", "admin"],
  "/admin/departments": ["system_admin", "admin"],
  "/admin/contacts": ["system_admin", "admin"],
  "/admin/settings": ["system_admin", "admin"],
  "/admin/audit-log": ["system_admin", "admin"],
  "/admin/users": ["system_admin", "admin"],
  "/admin/roles": ["system_admin", "admin"],
  "/admin/user-roles": ["system_admin", "admin"],
  "/admin/organizational-structure": ["system_admin", "admin", "dean"],
  "/admin/processing-assignments": ["system_admin", "admin"],
  "/admin/security-status": ["system_admin", "admin"],
  "/admin/operations": ["system_admin", "admin"],
  "/admin/pilot-center": ["system_admin", "admin"],
  "/admin/backup-status": ["system_admin", "admin"],
  "/admin/system-readiness": ["system_admin", "admin"],
  "/admin/faculty-accounts": ["system_admin", "admin", "dean", "hr_officer"],
  "/admin/schedules": ["system_admin", "admin", "dean", "registrar", "department_head"],
  "/admin/programs": ["system_admin", "admin"],
  "/admin/messages": ["system_admin", "admin"],
};

/** Preferred redirect order when a user lacks access to the requested admin route. */
const ADMIN_ROUTE_FALLBACK_ORDER: string[] = [
  "/admin",
  ...Object.keys(NAV_ITEM_ROLES)
    .filter((p) => p.startsWith("/admin/"))
    .sort((a, b) => a.localeCompare(b, "ar")),
];

function normalizeAdminPath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, "");
  if (!trimmed || trimmed === "/admin") return "/admin";
  return trimmed;
}

/** Ensures admin sidebar links stay absolute (prevents /admin/admin/... from relative paths). */
export function resolveAdminNavHref(to: string): string {
  if (to.startsWith("/")) return to;
  const stripped = to.replace(/^\.\//, "");
  if (stripped.startsWith("admin/")) return `/${stripped}`;
  return `/admin/${stripped}`;
}

/** Resolve RBAC roles for an admin (or /messages) path via exact or longest-prefix match. */
export function resolveAdminRouteRoles(pathname: string): readonly string[] | null {
  if (pathname === "/admin/login") return null;

  const path = normalizeAdminPath(pathname);
  if (NAV_ITEM_ROLES[path]) return NAV_ITEM_ROLES[path];

  const prefixes = Object.keys(NAV_ITEM_ROLES)
    .filter((k) => k !== "/admin" && k !== "/messages")
    .sort((a, b) => b.length - a.length);
  for (const key of prefixes) {
    if (path.startsWith(key + "/")) return NAV_ITEM_ROLES[key];
  }

  if (path.startsWith("/admin/")) {
    return ["system_admin", "admin"];
  }
  return null;
}

export function canAccessAdminRoute(pathname: string, userRoles: string[]): boolean {
  const allowed = resolveAdminRouteRoles(pathname);
  if (!allowed) return true;
  return canSeeNavItem(allowed, userRoles);
}

/** First admin route the user may open (used after access-denied redirect). */
export function firstAccessibleAdminRoute(userRoles: string[]): string {
  for (const path of ADMIN_ROUTE_FALLBACK_ORDER) {
    const allowed = NAV_ITEM_ROLES[path];
    if (allowed && canSeeNavItem(allowed, userRoles)) return path;
  }
  return "/admin";
}

export function filterNavGroups<T extends { items: { to: string; label: string }[] }>(
  groups: T[],
  userRoles: string[],
): T[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((item) => {
          const allowed = NAV_ITEM_ROLES[item.to];
          return allowed ? canSeeNavItem(allowed, userRoles) : false;
        })
        .map((item) =>
          item.to === "/admin/students"
            ? { ...item, label: studentsNavLabel(userRoles) }
            : item,
        ),
    }))
    .filter((g) => g.items.length > 0);
}
