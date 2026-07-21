/**
 * Machine-readable report catalog: the seven beneficiaries from
 * PORTAL-REPORTING-COVERAGE-AUDIT-01 mapped to their reports, with delivery
 * status. "delivered" entries are built by this completion slice; "existing"
 * entries are already covered elsewhere in the portal; "gap" entries are the
 * documented follow-up inventory.
 */

import { type ReportBeneficiary } from "./aggregate";

export type ReportDeliveryStatus = "delivered" | "existing" | "gap";
export type ReportPriority = "critical" | "high" | "medium" | "low";

export interface ReportCatalogEntry {
  readonly reportId: string;
  readonly title: string;
  readonly beneficiary: ReportBeneficiary;
  readonly priority: ReportPriority;
  readonly status: ReportDeliveryStatus;
  /** Builder key for delivered entries (see REPORT_BUILDER_KEYS). */
  readonly builderKey?: string;
  readonly notes?: string;
}

export const REPORT_BUILDER_KEYS = [
  "student_requests_overview",
  "staff_activity_by_role",
  "finance_summary",
] as const;
export type ReportBuilderKey = (typeof REPORT_BUILDER_KEYS)[number];

export const REPORT_CATALOG: readonly ReportCatalogEntry[] = [
  // ── Delivered by this slice ──────────────────────────────────────────────
  {
    reportId: "student_requests_overview",
    title: "نظرة مجمعة على طلبات الطلاب",
    beneficiary: "dean",
    priority: "critical",
    status: "delivered",
    builderKey: "student_requests_overview",
    notes: "يسد فجوة التدقيق الحرجة: قسم تقارير الطلبات بلا واجهة.",
  },
  {
    reportId: "student_requests_overview",
    title: "نظرة مجمعة على طلبات الطلاب",
    beneficiary: "student_affairs",
    priority: "critical",
    status: "delivered",
    builderKey: "student_requests_overview",
    notes: "نفس التقرير المجمع يخدم شؤون الطلاب (حسب البرنامج/المستوى/العمر).",
  },
  {
    reportId: "student_requests_overview",
    title: "نظرة مجمعة على طلبات الطلاب",
    beneficiary: "university_leadership",
    priority: "high",
    status: "delivered",
    builderKey: "student_requests_overview",
    notes: "مؤشرات تنفيذية للطلبات ضمن لوحة القيادة.",
  },
  {
    reportId: "staff_activity_by_role",
    title: "نشاط المعالجة حسب الدور الوظيفي",
    beneficiary: "university_leadership",
    priority: "high",
    status: "delivered",
    builderKey: "staff_activity_by_role",
    notes: "تجميع على مستوى الدور لا الفرد — قرار حوكمة fail-closed.",
  },
  {
    reportId: "staff_activity_by_role",
    title: "نشاط المعالجة حسب الدور الوظيفي",
    beneficiary: "dean",
    priority: "medium",
    status: "delivered",
    builderKey: "staff_activity_by_role",
    notes: "متابعة أحمال المعالجة داخل الكلية على مستوى الأدوار.",
  },
  {
    reportId: "finance_summary",
    title: "الملخص المالي المجمع",
    beneficiary: "finance",
    priority: "high",
    status: "delivered",
    builderKey: "finance_summary",
    notes: "يستبدل getReportsFinancial القديمة غير الموصولة بعقد مجمع فقط.",
  },
  {
    reportId: "finance_summary",
    title: "الملخص المالي المجمع",
    beneficiary: "university_leadership",
    priority: "medium",
    status: "delivered",
    builderKey: "finance_summary",
    notes: "مؤشرات مالية تنفيذية (رسوم/مدفوعات/متبقٍ).",
  },
  // ── Already covered elsewhere in the portal ─────────────────────────────
  {
    reportId: "student_self_service_views",
    title: "عروض الطالب الذاتية (طلباتي/درجاتي/ماليتي/جدولي)",
    beneficiary: "student",
    priority: "high",
    status: "existing",
    notes: "بيانات شخصية self-service عبر مسارات بوابة الطالب — ليست تقارير مجمعة.",
  },
  {
    reportId: "faculty_schedule_views",
    title: "عروض عضو هيئة التدريس (جدولي/موادي)",
    beneficiary: "faculty_member",
    priority: "medium",
    status: "existing",
    notes: "بوابة عضو هيئة التدريس القائمة تغطي العرض الشخصي.",
  },
  {
    reportId: "admin_reports_sections",
    title: "أقسام تقارير الإدارة النشطة (طلاب/استيراد/حسابات/أكاديمي/جداول)",
    beneficiary: "dean",
    priority: "medium",
    status: "existing",
    notes: "صفحة /admin/reports القائمة — خارج شريحة هذا الإكمال.",
  },
  // ── Gap inventory (follow-ups) ───────────────────────────────────────────
  {
    reportId: "audit_security_report",
    title: "تقرير التدقيق والأمان المجمع",
    beneficiary: "university_leadership",
    priority: "high",
    status: "gap",
    notes: "قسم «التدقيق والأمان» = قريباً في الصفحة القائمة؛ يحتاج عقداً مجمعاً.",
  },
  {
    reportId: "department_academic_load",
    title: "لوحة رئيس القسم (العبء الأكاديمي والجداول)",
    beneficiary: "department_head",
    priority: "high",
    status: "gap",
    notes: "لا يوجد عرض مجمع بصلاحية رئيس قسم — البيانات حبيسة صلاحية الإدارة.",
  },
  {
    reportId: "faculty_teaching_load",
    title: "تقرير العبء التدريسي المجمع لأعضاء هيئة التدريس",
    beneficiary: "dean",
    priority: "medium",
    status: "gap",
    notes: "قسم «أعضاء هيئة التدريس» في صفحة التقارير = قريباً.",
  },
  {
    reportId: "role_changes_report",
    title: "تقرير تغييرات الأدوار",
    beneficiary: "university_leadership",
    priority: "medium",
    status: "gap",
    notes: "من فجوات التدقيق المتوسطة.",
  },
  {
    reportId: "documents_services_report",
    title: "تقرير الوثائق والخدمات",
    beneficiary: "student_affairs",
    priority: "low",
    status: "gap",
    notes: "قسم «الوثائق» في صفحة التقارير = قريباً.",
  },
  {
    reportId: "per_person_staff_performance",
    title: "أداء الموظفين على مستوى الفرد",
    beneficiary: "university_leadership",
    priority: "high",
    status: "gap",
    notes: "مُستبعد تصميمياً (تعريف شخصي) — يحتاج قرار حوكمة صريحاً قبل أي تنفيذ.",
  },
  {
    reportId: "reports_pagination",
    title: "ترقيم صفحات الجداول في التقارير",
    beneficiary: "dean",
    priority: "low",
    status: "gap",
    notes: "تحسين عرض فقط؛ الجداول المجمع أصغر من أن تحتاجه حالياً.",
  },
];

/** All catalog entries for one beneficiary, highest priority first. */
export function listReportsForBeneficiary(beneficiary: ReportBeneficiary): ReportCatalogEntry[] {
  const order: Record<ReportPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return REPORT_CATALOG.filter((entry) => entry.beneficiary === beneficiary).toSorted(
    (a, b) => order[a.priority] - order[b.priority],
  );
}

/** Documented gap entries (the follow-up inventory). */
export function listCatalogGaps(): ReportCatalogEntry[] {
  return REPORT_CATALOG.filter((entry) => entry.status === "gap");
}

/** Delivered entries wired to a specific builder. */
export function listDeliveredForBuilder(builderKey: ReportBuilderKey): ReportCatalogEntry[] {
  return REPORT_CATALOG.filter(
    (entry) => entry.status === "delivered" && entry.builderKey === builderKey,
  );
}
