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
  "/admin/reports": ["system_admin", "admin", "dean", "registrar", "finance_officer", "student_affairs"],
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
  "/admin/security-status": ["system_admin", "admin"],
  "/admin/operations": ["system_admin", "admin"],
  "/admin/pilot-center": ["system_admin", "admin"],
  "/admin/backup-status": ["system_admin", "admin"],
  "/admin/system-readiness": ["system_admin", "admin"],
};

export function filterNavGroups<T extends { items: { to: string }[] }>(
  groups: T[],
  userRoles: string[],
): T[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const allowed = NAV_ITEM_ROLES[item.to];
        return allowed ? canSeeNavItem(allowed, userRoles) : false;
      }),
    }))
    .filter((g) => g.items.length > 0);
}
