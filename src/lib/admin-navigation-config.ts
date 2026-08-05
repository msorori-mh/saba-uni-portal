/**
 * Task-oriented admin navigation definitions (Arabic RTL).
 * Authorization predicates stay in admin-nav.ts (NAV_ITEM_ROLES / filterNavGroups).
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  GraduationCap,
  Users,
  ScrollText,
  ShieldCheck,
  FileWarning,
} from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  exact?: boolean;
  badgeKey?: "new-messages";
};

export type AdminNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
};

/** Primary group order — must match product IA. */
export const ADMIN_NAV_PRIMARY_GROUP_ORDER = [
  "dashboard",
  "daily",
  "academic",
  "students",
  "faculty",
  "graduates",
  "governance",
  "system",
] as const;

export type AdminNavPrimaryGroupId = (typeof ADMIN_NAV_PRIMARY_GROUP_ORDER)[number];

/**
 * Deterministic “الأكثر استخدامًا” candidates (authorized + visible only).
 * No behavioral tracking.
 */
export const ADMIN_NAV_FREQUENT_PATHS = [
  "/admin",
  "/admin/academic-operations",
  "/admin/student-requests",
  "/admin/grades",
  "/admin/reports",
  "/admin/students",
] as const;

export const ADMIN_NAV_SEARCH_PLACEHOLDER = "ابحث عن صفحة أو إجراء";
export const ADMIN_NAV_FREQUENT_LABEL = "الأكثر استخدامًا";

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    items: [
      { to: "/admin", label: "لوحة التحكم", exact: true },
      { to: "/admin/executive-dashboard", label: "لوحة الإدارة العليا" },
    ],
  },
  {
    id: "daily",
    label: "العمل اليومي",
    icon: ClipboardList,
    items: [
      { to: "/admin/student-requests", label: "الطلبات التي تحتاج إجراء" },
      { to: "/admin/operations", label: "المهام والتنبيهات" },
      { to: "/admin/contacts", label: "الرسائل", badgeKey: "new-messages" },
      { to: "/admin/communications", label: "مركز الاتصالات" },
    ],
  },
  {
    id: "academic",
    label: "الشؤون الأكاديمية",
    icon: GraduationCap,
    items: [
      { to: "/admin/academic-operations", label: "مركز العمليات الأكاديمية" },
      { to: "/admin/academic-core", label: "البنية الأكاديمية" },
      { to: "/admin/study-plans", label: "الخطط والمقررات" },
      { to: "/admin/course-offerings", label: "إسناد المقررات والمجموعات الدراسية" },
      { to: "/admin/enrollments", label: "تقسيم المجموعات" },
      { to: "/admin/schedules", label: "الجداول" },
      { to: "/admin/grades", label: "الدرجات" },
      { to: "/admin/transcripts", label: "السجلات الأكاديمية" },
      { to: "/admin/imports", label: "الاستيراد الجماعي" },
      { to: "/admin/student-progress", label: "تقدم الطلاب الأكاديمي" },
      { to: "/admin/at-risk-students", label: "الطلاب المتعثرون أكاديمياً" },
      { to: "/admin/automation", label: "مركز الأتمتة الأكاديمية" },
    ],
  },
  {
    id: "students",
    label: "شؤون الطلاب والخدمات",
    icon: FileWarning,
    items: [
      { to: "/admin/students", label: "ملفات الطلاب" },
      { to: "/admin/documents", label: "الوثائق" },
      { to: "/admin/request-types", label: "إدارة الخدمات الطلابية" },
      { to: "/admin/finance", label: "الرسوم والمدفوعات" },
      { to: "/messages", label: "صندوق الرسائل" },
    ],
  },
  {
    id: "faculty",
    label: "الكادر الأكاديمي",
    icon: Users,
    items: [
      { to: "/admin/faculty-management", label: "أعضاء هيئة التدريس" },
      { to: "/admin/staff-management", label: "إدارة الموظفين" },
      { to: "/admin/faculty", label: "صفحة هيئة التدريس بالموقع" },
    ],
  },
  {
    id: "graduates",
    label: "مشاريع التخرج والخريجون",
    icon: GraduationCap,
    items: [
      // Only existing authorized route. Graduates Affairs remains default-deny (no UI links).
      { to: "/admin/graduation-candidates", label: "مرشحو التخرج" },
    ],
  },
  {
    id: "governance",
    label: "القيادة والحوكمة",
    icon: ScrollText,
    items: [
      { to: "/admin/reports", label: "التقارير" },
      { to: "/admin/academic-councils", label: "المجالس واللجان" },
      { to: "/admin/organizational-structure", label: "الهيكل التنظيمي" },
      { to: "/admin/processing-assignments", label: "ممثلو أدوار الطلبات" },
    ],
  },
  {
    id: "system",
    label: "إدارة النظام",
    icon: ShieldCheck,
    items: [
      { to: "/admin/users", label: "المستخدمون" },
      { to: "/admin/roles", label: "الأدوار والصلاحيات" },
      { to: "/admin/user-roles", label: "ربط الأدوار بالمستخدمين" },
      { to: "/admin/settings", label: "إعدادات النظام" },
      { to: "/admin/audit-log", label: "سجل التدقيق" },
      { to: "/admin/news", label: "الأخبار" },
      { to: "/admin/events", label: "الفعاليات" },
      { to: "/admin/research", label: "الأبحاث" },
      { to: "/admin/departments", label: "الأقسام والبرامج" },
      { to: "/admin/security-status", label: "حالة التأمين" },
      { to: "/admin/pilot-center", label: "إدارة التشغيل التجريبي" },
      { to: "/admin/backup-status", label: "النسخ الاحتياطي" },
      { to: "/admin/system-readiness", label: "جاهزية النظام" },
    ],
  },
];

/** Paths that were linked from the previous AdminShell sidebar (must remain reachable). */
export const ADMIN_NAV_LEGACY_SIDEBAR_PATHS = [
  "/admin",
  "/admin/executive-dashboard",
  "/admin/academic-operations",
  "/admin/academic-core",
  "/admin/study-plans",
  "/admin/course-offerings",
  "/admin/enrollments",
  "/admin/grades",
  "/admin/transcripts",
  "/admin/imports",
  "/admin/student-progress",
  "/admin/at-risk-students",
  "/admin/academic-councils",
  "/admin/students",
  "/admin/student-requests",
  "/admin/request-types",
  "/admin/faculty-management",
  "/admin/staff-management",
  "/admin/faculty",
  "/admin/finance",
  "/admin/documents",
  "/admin/communications",
  "/messages",
  "/admin/automation",
  "/admin/reports",
  "/admin/news",
  "/admin/events",
  "/admin/research",
  "/admin/departments",
  "/admin/contacts",
  "/admin/settings",
  "/admin/audit-log",
  "/admin/users",
  "/admin/roles",
  "/admin/user-roles",
  "/admin/organizational-structure",
  "/admin/processing-assignments",
  "/admin/security-status",
  "/admin/operations",
  "/admin/pilot-center",
  "/admin/backup-status",
  "/admin/system-readiness",
] as const;

export function isAdminNavItemActive(pathname: string, item: AdminNavItem): boolean {
  return item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function findActiveAdminNavGroupId(
  groups: AdminNavGroup[],
  pathname: string,
): string | null {
  const hit = groups.find((g) => g.items.some((it) => isAdminNavItemActive(pathname, it)));
  return hit?.id ?? null;
}

/** Accordion: only one primary group expanded at a time. */
export function toggleExclusiveGroup(
  expandedGroupId: string | null,
  groupId: string,
): string | null {
  return expandedGroupId === groupId ? null : groupId;
}

export function collectAdminNavPaths(groups: AdminNavGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((it) => it.to));
}

export function assertMaxNavDepthTwo(groups: AdminNavGroup[]): boolean {
  return groups.every(
    (g) =>
      Array.isArray(g.items) &&
      g.items.every((it) => typeof it.to === "string" && !("items" in (it as object))),
  );
}

export function hasDuplicateNavPaths(groups: AdminNavGroup[]): boolean {
  const paths = collectAdminNavPaths(groups);
  return new Set(paths).size !== paths.length;
}

export type AdminNavSearchHit = {
  groupId: string;
  groupLabel: string;
  item: AdminNavItem;
};

/** Client-only search over already-visible (authorized) nav links. */
export function searchAdminNav(
  groups: AdminNavGroup[],
  query: string,
): AdminNavSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: AdminNavSearchHit[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const hay = `${item.label} ${item.to} ${group.label}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({ groupId: group.id, groupLabel: group.label, item });
      }
    }
  }
  return hits;
}

export function frequentAdminNavItems(groups: AdminNavGroup[]): AdminNavItem[] {
  const byPath = new Set(collectAdminNavPaths(groups));
  const labelByPath = new Map<string, AdminNavItem>();
  for (const g of groups) {
    for (const it of g.items) labelByPath.set(it.to, it);
  }
  return ADMIN_NAV_FREQUENT_PATHS.filter((p) => byPath.has(p))
    .map((p) => labelByPath.get(p))
    .filter((it): it is AdminNavItem => !!it)
    .slice(0, 6);
}

/** Drop finance link when the admin finance feature is frozen. */
export function applyAdminFinanceNavGate(
  groups: AdminNavGroup[],
  adminFinanceEnabled: boolean,
): AdminNavGroup[] {
  if (adminFinanceEnabled) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => it.to !== "/admin/finance"),
    }))
    .filter((g) => g.items.length > 0);
}

/** Guard: Graduates Affairs routes must never appear in admin nav. */
export const GRADUATES_AFFAIRS_FORBIDDEN_PATH_PREFIXES = [
  "/admin/graduates",
  "/admin/graduates-affairs",
  "/graduates-affairs",
] as const;

export function navContainsGraduatesAffairsLinks(groups: AdminNavGroup[]): boolean {
  const paths = collectAdminNavPaths(groups);
  return paths.some((p) =>
    GRADUATES_AFFAIRS_FORBIDDEN_PATH_PREFIXES.some(
      (prefix) => p === prefix || p.startsWith(`${prefix}/`),
    ),
  );
}
