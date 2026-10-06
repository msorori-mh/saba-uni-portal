/**
 * Admin sidebar information architecture (Arabic RTL).
 * Authorization remains in admin-nav.ts (NAV_ITEM_ROLES / filterNavGroups).
 * Search and regrouping must run only on already-filtered visible groups.
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Newspaper,
  Users,
  BookOpen,
  FlaskConical,
  Calendar,
  MessageSquare,
  Settings,
  GraduationCap,
  CalendarRange,
  ListTree,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  ClipboardCheck,
  FileText,
  FileWarning,
  ListChecks,
  UserCog,
  Globe,
  Wallet,
  ShieldCheck,
  ScrollText,
  Lock,
  Database,
  FileBadge,
  Upload,
  BarChart3,
  Activity,
  TrendingUp,
  AlertCircle,
  Megaphone,
  Rocket,
  Briefcase,
} from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badgeKey?: "new-messages";
};

export type AdminNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SEARCH_PLACEHOLDER = "ابحث عن خدمة أو نظام...";

/** Short, user-facing descriptions for the search results. Keep routes and labels in the nav above. */
export const ADMIN_NAV_DESCRIPTIONS: Record<string, string> = {
  "/admin": "ملخص أعمال الإدارة والمؤشرات والمهام التي تحتاج متابعة.",
  "/admin/executive-dashboard": "مؤشرات وبيانات إدارية لدعم متابعة أداء الكلية.",
  "/admin/academic-operations": "مدخل موحد لأعمال الشؤون الأكاديمية اليومية.",
  "/admin/academic-core": "تنظيم البنية الأكاديمية الأساسية للكلية.",
  "/admin/study-plans": "إدارة الخطط الدراسية ومقررات البرامج.",
  "/admin/course-offerings": "إسناد المقررات وتنظيم مجموعاتها الدراسية.",
  "/admin/enrollments": "توزيع الطلاب على المجموعات الدراسية.",
  "/admin/lecture-execution": "متابعة المحاضرات المخططة والمنفذة ومؤشرات التأخر.",
  "/admin/grades": "متابعة درجات المقررات ومسارات اعتمادها.",
  "/admin/transcripts": "عرض السجلات الأكاديمية للطلاب.",
  "/admin/imports": "استيراد البيانات الأكاديمية من الملفات المعتمدة.",
  "/admin/student-progress": "متابعة إنجاز الطلاب لمقررات خططهم الدراسية.",
  "/admin/students": "عرض بيانات الطلاب وإدارتها حسب الصلاحية.",
  "/admin/student-requests": "متابعة الطلبات الطلابية وحالات معالجتها.",
  "/admin/request-types": "إعداد أنواع الطلبات الطلابية ومساراتها.",
  "/admin/faculty-management": "إدارة بيانات أعضاء هيئة التدريس وتكليفاتهم.",
  "/admin/staff-management": "إدارة ملفات الموظفين والخدمات المرتبطة بهم.",
  "/admin/faculty": "إدارة صفحة هيئة التدريس المعروضة بالموقع.",
  "/admin/academic-councils": "إدارة المجالس الأكاديمية وعضوياتها واجتماعاتها.",
  "/admin/graduation-projects": "متابعة فرق مشاريع التخرج ومراحلها.",
  "/admin/graduation-project-policies": "ضبط سياسات وضوابط مشاريع التخرج.",
  "/admin/graduates-affairs": "متابعة ملفات الخريجين وشؤونهم.",
  "/admin/graduates-affairs-workflows": "متابعة الإجراءات المرتبطة بملفات الخريجين.",
  "/admin/finance": "عرض أعمال الرسوم والمدفوعات حسب الصلاحية.",
  "/admin/documents": "متابعة إصدار الوثائق الرسمية وحالاتها.",
  "/admin/communications": "إدارة قنوات التواصل والإعلانات داخل البوابة.",
  "/messages": "قراءة المراسلات الواردة وإرسال الرسائل.",
  "/admin/reports": "الوصول إلى التقارير التشغيلية المتاحة لدورك.",
  "/admin/executive-reports": "عرض التقارير الاستراتيجية ومؤشرات الكلية.",
  "/admin/automation": "متابعة أدوات الأتمتة الأكاديمية وإعداداتها.",
  "/admin/news": "إدارة الأخبار المنشورة على موقع الكلية.",
  "/admin/events": "إدارة الفعاليات والأنشطة المنشورة.",
  "/admin/research": "إدارة محتوى الأبحاث المعروض بالموقع.",
  "/admin/departments": "إدارة أقسام الكلية وبرامجها.",
  "/admin/contacts": "قراءة رسائل التواصل الواردة من الموقع.",
  "/admin/settings": "ضبط إعدادات البوابة العامة.",
  "/admin/users": "إدارة حسابات المستخدمين وصلاحياتهم.",
  "/admin/roles": "مراجعة الأدوار والصلاحيات المتاحة في النظام.",
  "/admin/user-roles": "ربط الأدوار بحسابات المستخدمين.",
  "/admin/audit-log": "مراجعة سجل العمليات والتغييرات في البوابة.",
  "/admin/organizational-structure": "عرض وإدارة الهيكل التنظيمي للكلية.",
  "/admin/processing-assignments": "تحديد ممثلي الأدوار في معالجة الطلبات.",
  "/admin/security-status": "متابعة مؤشرات أمن النظام.",
  "/admin/operations": "متابعة عمليات النظام وحالتها التشغيلية.",
  "/admin/backup-status": "الاطلاع على حالة النسخ الاحتياطي.",
  "/admin/system-readiness": "مراجعة جاهزية الخدمات قبل التشغيل.",
  "/admin/pilot-center": "متابعة إعدادات وحالة التشغيل التجريبي.",
};

/** Primary group order for the reorganized operational IA (~8–10 groups). */
export const ADMIN_NAV_PRIMARY_GROUP_ORDER = [
  "dashboard",
  "academic",
  "students",
  "hr",
  "governance",
  "projects",
  "graduates",
  "finance_documents",
  "comms_reports",
  "system",
] as const;

export type AdminNavPrimaryGroupId = (typeof ADMIN_NAV_PRIMARY_GROUP_ORDER)[number];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    items: [
      { to: "/admin", label: "الرئيسية", icon: LayoutDashboard, exact: true },
      { to: "/admin/executive-dashboard", label: "البيانات الإدارية", icon: BarChart3 },
    ],
  },
  {
    id: "academic",
    label: "الشؤون الأكاديمية",
    icon: GraduationCap,
    items: [
      { to: "/admin/academic-operations", label: "مركز الشؤون الأكاديمية", icon: Activity },
      { to: "/admin/academic-core", label: "البنية الأكاديمية", icon: CalendarRange },
      { to: "/admin/study-plans", label: "الخطط والمقررات", icon: ListTree },
      {
        to: "/admin/course-offerings",
        label: "إسناد المقررات والمجموعات الدراسية",
        icon: CalendarDays,
      },
      { to: "/admin/enrollments", label: "تقسيم المجموعات", icon: ClipboardList },
      { to: "/admin/lecture-execution", label: "متابعة تنفيذ المحاضرات", icon: CalendarCheck },
      { to: "/admin/grades", label: "الدرجات", icon: ClipboardCheck },
      { to: "/admin/transcripts", label: "السجلات الأكاديمية", icon: FileText },
      { to: "/admin/imports", label: "الاستيراد الجماعي", icon: Upload },
      { to: "/admin/student-progress", label: "تقدم الطلاب الأكاديمي", icon: TrendingUp },
      // مخفي بناءً على طلب الإدارة — الصفحة تبقى متاحة عبر الرابط المباشر
      // { to: "/admin/at-risk-students", label: "الطلاب المتعثرون أكاديمياً", icon: AlertCircle },
    ],
  },
  {
    id: "students",
    label: "شؤون الطلاب",
    icon: FileWarning,
    items: [
      { to: "/admin/students", label: "إدارة الطلاب", icon: GraduationCap },
      { to: "/admin/student-requests", label: "طلبات الطلاب", icon: FileWarning },
      { to: "/admin/request-types", label: "أنواع الطلبات", icon: ListChecks },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية وخدمات الموظفين",
    icon: UserCog,
    items: [
      { to: "/admin/faculty-management", label: "إدارة أعضاء هيئة التدريس", icon: Users },
      { to: "/admin/staff-management", label: "إدارة الموظفين وخدماتهم", icon: UserCog },
      { to: "/admin/faculty", label: "صفحة هيئة التدريس بالموقع", icon: Globe },
    ],
  },
  {
    id: "governance",
    label: "المجالس الأكاديمية",
    icon: ScrollText,
    items: [
      { to: "/admin/academic-councils", label: "بوابة إدارة المجالس الأكاديمية", icon: ScrollText },
    ],
  },
  {
    id: "projects",
    label: "مشاريع التخرج",
    icon: GraduationCap,
    items: [
      { to: "/admin/graduation-projects", label: "مشاريع التخرج", icon: GraduationCap },
      {
        to: "/admin/graduation-project-policies",
        label: "سياسات مشاريع التخرج",
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: "graduates",
    label: "شؤون الخريجين",
    icon: FileBadge,
    items: [
      { to: "/admin/graduates-affairs", label: "شؤون الخريجين", icon: Briefcase },
      { to: "/admin/graduates-affairs-workflows", label: "متابعات الخريجين", icon: ShieldCheck },
    ],
  },
  {
    id: "finance_documents",
    label: "المالية والوثائق",
    icon: FileBadge,
    items: [
      { to: "/admin/finance", label: "الرسوم والمدفوعات", icon: Wallet },
      { to: "/admin/documents", label: "الوثائق الرسمية", icon: FileText },
    ],
  },
  {
    id: "comms_reports",
    label: "التواصل والتقارير",
    icon: Megaphone,
    items: [
      { to: "/admin/communications", label: "مركز التواصل", icon: Megaphone },
      { to: "/messages", label: "صندوق الرسائل", icon: MessageSquare },
      { to: "/admin/reports", label: "مركز التقارير", icon: BarChart3 },
      { to: "/admin/executive-reports", label: "التقارير الاستراتيجية", icon: TrendingUp },
      { to: "/admin/automation", label: "مركز الأتمتة الأكاديمية", icon: Activity },
    ],
  },
  {
    id: "system",
    label: "النظام والإعدادات",
    icon: ShieldCheck,
    items: [
      { to: "/admin/news", label: "الأخبار", icon: Newspaper },
      { to: "/admin/events", label: "الفعاليات", icon: Calendar },
      { to: "/admin/research", label: "الأبحاث", icon: FlaskConical },
      { to: "/admin/departments", label: "الأقسام والبرامج", icon: BookOpen },
      { to: "/admin/contacts", label: "الرسائل", icon: MessageSquare, badgeKey: "new-messages" },
      { to: "/admin/settings", label: "الإعدادات", icon: Settings },
      { to: "/admin/users", label: "المستخدمون والصلاحيات", icon: UserCog },
      { to: "/admin/roles", label: "الأدوار", icon: ShieldCheck },
      { to: "/admin/user-roles", label: "ربط الأدوار بالمستخدمين", icon: UserCog },
      { to: "/admin/audit-log", label: "سجل التدقيق", icon: ScrollText },
      { to: "/admin/organizational-structure", label: "الهيكل التنظيمي", icon: ListTree },
      { to: "/admin/processing-assignments", label: "ممثلو أدوار الطلبات", icon: UserCog },
      { to: "/admin/security-status", label: "أمن النظام", icon: Lock },
      { to: "/admin/operations", label: "مركز العمليات", icon: Activity },
      { to: "/admin/backup-status", label: "النسخ الاحتياطي", icon: Database },
      { to: "/admin/system-readiness", label: "جاهزية النظام", icon: ShieldCheck },
      { to: "/admin/pilot-center", label: "التشغيل التجريبي", icon: Rocket },
    ],
  },
];

/** Paths that were linked from the pre-reorganization AdminShell sidebar. */
export const ADMIN_NAV_LEGACY_SIDEBAR_PATHS = [
  "/admin",
  "/admin/executive-dashboard",
  "/admin/academic-operations",
  "/admin/academic-core",
  "/admin/study-plans",
  "/admin/course-offerings",
  "/admin/enrollments",
  "/admin/lecture-execution",
  "/admin/grades",
  "/admin/transcripts",
  "/admin/imports",
  "/admin/student-progress",
  "/admin/at-risk-students",
  "/admin/academic-councils",
  "/admin/graduation-projects",
  "/admin/graduation-project-policies",

  "/admin/graduates-affairs",
  "/admin/graduates-affairs-workflows",
  "/admin/graduation-candidates",
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
  "/admin/department-reports",
  "/admin/executive-reports",
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

/**
 * Exclusive accordion: opening one group closes others.
 * Clicking the open group collapses it (unless it is the active route group —
 * callers may re-open active via route effect).
 */
export function toggleExclusiveGroup(
  expandedGroupId: string | null,
  groupId: string,
): string | null {
  return expandedGroupId === groupId ? null : groupId;
}

export function collectAdminNavPaths(groups: AdminNavGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((it) => it.to));
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

/** Preserve character positions so the same normalization can highlight matches safely. */
export function normalizeAdminNavSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ar")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** Match visible routes only; direct titles outrank descriptions, then section names. */
export function searchAdminNav(groups: AdminNavGroup[], query: string): AdminNavSearchHit[] {
  const q = normalizeAdminNavSearch(query);
  if (!q) return [];
  const hits: Array<AdminNavSearchHit & { rank: number }> = [];
  for (const group of groups) {
    const groupMatch = normalizeAdminNavSearch(group.label).includes(q);
    for (const item of group.items) {
      const titleMatch = normalizeAdminNavSearch(item.label).includes(q);
      const descriptionMatch = normalizeAdminNavSearch(
        ADMIN_NAV_DESCRIPTIONS[item.to] ?? "",
      ).includes(q);
      if (!titleMatch && !descriptionMatch && !groupMatch) continue;
      hits.push({
        groupId: group.id,
        groupLabel: group.label,
        item,
        rank: titleMatch ? 0 : descriptionMatch ? 1 : 2,
      });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...hit }) => hit);
}

/** During search, expand groups that have matching items. */
export function searchMatchingGroupIds(groups: AdminNavGroup[], query: string): Set<string> {
  return new Set(searchAdminNav(groups, query).map((h) => h.groupId));
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
      label: g.id === "finance_documents" ? "الوثائق الرسمية" : g.label,
      items: g.items.filter((it) => it.to !== "/admin/finance"),
    }))
    .filter((g) => g.items.length > 0);
}

/** Collect all user-facing Arabic labels from nav config for terminology guards. */
export function collectAdminNavArabicLabels(groups: AdminNavGroup[]): string[] {
  return groups.flatMap((g) => [g.label, ...g.items.map((it) => it.label)]);
}
