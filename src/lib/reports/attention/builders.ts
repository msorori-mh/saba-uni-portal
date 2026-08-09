/**
 * Pure attention builders — proven metrics/state only, never fabricated.
 *
 * Task: PORTAL-REPORTS-THREE-LEVEL-OPERATIONAL-UX-CLOSURE-01
 */

import type { ScopedMetric } from "@/lib/reports/scope";
import {
  STUDY_GROUPS_TERM_AR,
  type ReportAttentionItem,
} from "./types";

function positiveValue(m: ScopedMetric<number> | null | undefined): number | null {
  if (!m || m.presence !== "value" || m.value == null) return null;
  if (m.value <= 0) return null;
  return m.value;
}

/**
 * Drop action links that are not in the allow-list for this viewer.
 * Authorization before convenience — never attach a route the viewer cannot open.
 */
export function filterAttentionActions(
  items: readonly ReportAttentionItem[],
  allowedActionTos: ReadonlySet<string> | readonly string[] | null | undefined,
): ReportAttentionItem[] {
  if (!allowedActionTos) {
    return items.map((item) => {
      if (!item.actionTo) return item;
      const { actionTo: _drop, actionLabelAr: _label, ...rest } = item;
      return rest;
    });
  }
  const allowed =
    allowedActionTos instanceof Set
      ? allowedActionTos
      : new Set(allowedActionTos);
  return items.map((item) => {
    if (!item.actionTo) return item;
    if (allowed.has(item.actionTo)) return item;
    const { actionTo: _drop, actionLabelAr: _label, ...rest } = item;
    return rest;
  });
}

/** Strip any accidental PII-looking fields from strategic attention payloads. */
export function assertNoPiiInStrategicAttention(
  items: readonly ReportAttentionItem[],
): void {
  for (const item of items) {
    const blob = `${item.titleAr} ${item.descriptionAr ?? ""} ${item.id}`;
    // Defensive: national IDs / emails / phones must never appear.
    if (
      /\b\d{9,}\b/.test(blob) ||
      /@/.test(blob) ||
      /\+?\d[\d\s-]{8,}\d/.test(blob)
    ) {
      throw new Error(
        `Strategic attention must not include PII (source=${item.sourceCode})`,
      );
    }
  }
}

// ─── Student (SELF ONLY) ────────────────────────────────────────────────────

export type StudentAttentionInput = {
  /** Requests explicitly returned for student completion. */
  readonly returnedForCompletion?: number | null;
  /** Allowed action routes for this viewer (e.g. /student/requests). */
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

/**
 * Open requests alone are NOT attention. Only proven action-required states.
 */
export function buildStudentAttention(
  input: StudentAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  const returned = input.returnedForCompletion ?? 0;
  if (returned > 0) {
    items.push({
      id: "student-returned-requests",
      severity: "warning",
      titleAr: "طلبات أُعيدت لاستكمالك",
      descriptionAr: "يوجد طلب يحتاج إجراءً منك قبل المتابعة.",
      count: returned,
      actionLabelAr: "فتح طلباتي",
      actionTo: "/student/requests",
      sourceCode: "student_requests.status:returned",
    });
  }
  return filterAttentionActions(items, input.allowedActionTos ?? ["/student/requests"]);
}

// ─── Faculty (ASSIGNED ONLY) ────────────────────────────────────────────────

export type FacultyAttentionInput = {
  readonly draftMaterials?: ScopedMetric<number> | null;
  readonly staleMaterials?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildFacultyAttention(
  input: FacultyAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  const draft = positiveValue(input.draftMaterials);
  if (draft != null) {
    items.push({
      id: "faculty-draft-materials",
      severity: "warning",
      titleAr: "مواد تعليمية تحتاج استكمالاً",
      descriptionAr: "مواد مسندة إليك ما زالت في حالة مسودة.",
      count: draft,
      actionLabelAr: "المواد التعليمية",
      actionTo: "/faculty-portal/materials",
      sourceCode: "course_materials.status:draft",
    });
  }
  const stale = positiveValue(input.staleMaterials);
  if (stale != null) {
    items.push({
      id: "faculty-stale-materials",
      severity: "info",
      titleAr: "مواد تعليمية لم تُحدَّث منذ فترة طويلة",
      descriptionAr: "حالة مثبتة من تاريخ التحديث — دون اختراع موعد نهائي.",
      count: stale,
      actionLabelAr: "مراجعة المواد",
      actionTo: "/faculty-portal/materials",
      sourceCode: "course_materials.staleMaterials",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? ["/faculty-portal/materials"],
  );
}

// ─── Department head (OWN DEPARTMENT) ───────────────────────────────────────

export type DepartmentWeeklyIssue = {
  readonly code: string;
  readonly label_ar: string;
  readonly count?: number | null;
};

export type DepartmentAttentionInput = {
  readonly weeklyIssues?: readonly DepartmentWeeklyIssue[] | null;
  readonly unassignedSections?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildDepartmentAttention(
  input: DepartmentAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  const issues = input.weeklyIssues ?? [];

  for (const issue of issues) {
    if (!issue?.code) continue;
    const count =
      typeof issue.count === "number" && issue.count > 0 ? issue.count : undefined;
    // Zero / missing count with no proof → skip (no fabricated warning).
    if (count == null && issue.code === "unassigned_sections") {
      const fromMetric = positiveValue(input.unassignedSections);
      if (fromMetric == null) continue;
      items.push({
        id: `dept-issue-${issue.code}`,
        severity: "warning",
        titleAr: `${STUDY_GROUPS_TERM_AR} غير مسندة تحتاج تدخلاً`,
        descriptionAr: issue.label_ar,
        count: fromMetric,
        actionLabelAr: "تقارير الجداول والإسناد",
        actionTo: "/admin/reports?tab=schedules",
        sourceCode: `weeklyIssues.${issue.code}`,
      });
      continue;
    }
    if (count == null) continue;

    const titleAr =
      issue.code === "unassigned_sections"
        ? `${STUDY_GROUPS_TERM_AR} غير مسندة تحتاج تدخلاً`
        : issue.label_ar;

    items.push({
      id: `dept-issue-${issue.code}`,
      severity: "warning",
      titleAr,
      descriptionAr:
        issue.code === "unassigned_sections" ? undefined : issue.label_ar,
      count,
      actionLabelAr: "تقارير الجداول والإسناد",
      actionTo: "/admin/reports?tab=schedules",
      sourceCode: `weeklyIssues.${issue.code}`,
    });
  }

  // If weeklyIssues omitted but metric proves unassigned > 0.
  if (
    !items.some((i) => i.sourceCode.includes("unassigned_sections")) &&
    positiveValue(input.unassignedSections) != null
  ) {
    const n = positiveValue(input.unassignedSections)!;
    items.push({
      id: "dept-unassigned-sections",
      severity: "warning",
      titleAr: `${STUDY_GROUPS_TERM_AR} غير مسندة تحتاج تدخلاً`,
      count: n,
      actionLabelAr: "تقارير الجداول والإسناد",
      actionTo: "/admin/reports?tab=schedules",
      sourceCode: "teachingLoad.unassignedSections",
    });
  }

  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/reports?tab=schedules",
      "/admin/course-offerings",
      "/admin/schedules",
    ],
  );
}

// ─── Operational units ──────────────────────────────────────────────────────

export type OperationalAttentionInput = {
  readonly overdue?: ScopedMetric<number> | null;
  readonly pendingNeedingIntervention?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildOperationalUnitAttention(
  input: OperationalAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  const overdue = positiveValue(input.overdue);
  if (overdue != null) {
    items.push({
      id: "ops-overdue-requests",
      severity: "critical",
      titleAr: "طلبات متأخرة ضمن وحدتك",
      descriptionAr: "طلبات قيد المعالجة تجاوزت نافذة المتابعة المثبتة.",
      count: overdue,
      actionLabelAr: "صندوق الطلبات",
      actionTo: "/admin/student-requests",
      sourceCode: "processing.overdue",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/student-requests",
      "/admin/reports?tab=requests",
    ],
  );
}

// ─── Academic affairs ───────────────────────────────────────────────────────

export type AcademicAffairsAttentionInput = {
  readonly unassignedSections?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildAcademicAffairsAttention(
  input: AcademicAffairsAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  const unassigned = positiveValue(input.unassignedSections);
  if (unassigned != null) {
    items.push({
      id: "aa-unassigned-sections",
      severity: "warning",
      titleAr: `نقص إسناد في ${STUDY_GROUPS_TERM_AR}`,
      descriptionAr: "مجموعات دراسية نشطة بلا عضو هيئة تدريس مسند.",
      count: unassigned,
      actionLabelAr: "الجداول والإسناد",
      actionTo: "/admin/reports?tab=schedules",
      sourceCode: "teachingLoad.unassignedSections",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/reports?tab=schedules",
      "/admin/reports?tab=academic",
    ],
  );
}

// ─── Alumni / quality ───────────────────────────────────────────────────────

export type AlumniAttentionInput = {
  readonly pendingGraduationCandidates?: ScopedMetric<number> | null;
  /** Blocked / no_access metrics must NEVER become alerts. */
  readonly blockedFamilies?: readonly string[] | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildAlumniQualityAttention(
  input: AlumniAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  // Never invent alerts from blocked GA reporting families.
  void input.blockedFamilies;
  const pending = positiveValue(input.pendingGraduationCandidates);
  if (pending != null) {
    items.push({
      id: "alumni-pending-candidates",
      severity: "info",
      titleAr: "مرشحو تخرج بانتظار المعالجة",
      count: pending,
      actionLabelAr: "مرشحو التخرج",
      actionTo: "/admin/graduation-candidates",
      sourceCode: "kpis.pendingGraduationCandidates",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? ["/admin/graduation-candidates"],
  );
}

// ─── Dean (COLLEGE — fail-closed) ───────────────────────────────────────────

export type DeanAttentionInput = {
  readonly collegeScopeConfigured: boolean;
  readonly kpis?: Record<string, ScopedMetric<number>> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

/**
 * Without college binding: zero college attention/KPIs presented as valid.
 * no_access / not_configured metrics never become warnings.
 */
export function buildDeanAttention(input: DeanAttentionInput): ReportAttentionItem[] {
  if (!input.collegeScopeConfigured) return [];
  // College path not live yet — still refuse to fabricate from no_access.
  const items: ReportAttentionItem[] = [];
  for (const [key, metric] of Object.entries(input.kpis ?? {})) {
    if (metric.presence !== "value") continue;
    const n = positiveValue(metric);
    if (n == null) continue;
    // Only surface when a concrete college-scoped risk metric exists.
    if (key === "pendingRequests") {
      items.push({
        id: `dean-${key}`,
        severity: "warning",
        titleAr: "طلبات معلّقة ضمن نطاق الكلية",
        count: n,
        actionLabelAr: "مركز التقارير",
        actionTo: "/admin/reports",
        sourceCode: `dean.kpis.${key}`,
      });
    }
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? ["/admin/reports", "/admin/department-reports"],
  );
}

// ─── VP Student Affairs ─────────────────────────────────────────────────────

export type VpStudentAttentionInput = {
  readonly vpStudentAffairsBound: boolean;
  readonly studentsNoProgram?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildVpStudentAttention(
  input: VpStudentAttentionInput,
): ReportAttentionItem[] {
  if (!input.vpStudentAffairsBound) return [];
  const items: ReportAttentionItem[] = [];
  const noProgram = positiveValue(input.studentsNoProgram);
  if (noProgram != null) {
    items.push({
      id: "vp-student-no-program",
      severity: "warning",
      titleAr: "طلاب بلا برنامج أكاديمي مرتبط",
      count: noProgram,
      actionLabelAr: "دليل الطلاب",
      actionTo: "/admin/reports?tab=students",
      sourceCode: "kpis.studentsNoProgram",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/reports?tab=students",
      "/admin/reports?tab=requests",
    ],
  );
}

// ─── VP Academic Affairs ────────────────────────────────────────────────────

export type VpAcademicAttentionInput = {
  readonly vpAcademicAffairsBound: boolean;
  readonly unassignedSections?: ScopedMetric<number> | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildVpAcademicAttention(
  input: VpAcademicAttentionInput,
): ReportAttentionItem[] {
  if (!input.vpAcademicAffairsBound) return [];
  return buildAcademicAffairsAttention({
    unassignedSections: input.unassignedSections,
    allowedActionTos: input.allowedActionTos ?? [
      "/admin/reports?tab=schedules",
      "/admin/reports?tab=academic",
    ],
  });
}

// ─── Presidency / strategic (no PII) ────────────────────────────────────────

export type StrategicAttentionInput = {
  readonly universityPresidencyBound: boolean;
  /** Aggregate-only risk counts — never student/faculty names or IDs. */
  readonly aggregateRisks?: readonly {
    readonly code: string;
    readonly titleAr: string;
    readonly count: number;
    readonly severity?: ReportAttentionItem["severity"];
  }[] | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

export function buildStrategicAttention(
  input: StrategicAttentionInput,
): ReportAttentionItem[] {
  if (!input.universityPresidencyBound) return [];
  const items: ReportAttentionItem[] = [];
  for (const risk of input.aggregateRisks ?? []) {
    if (!risk.code || risk.count <= 0) continue;
    items.push({
      id: `strategic-${risk.code}`,
      severity: risk.severity ?? "info",
      titleAr: risk.titleAr,
      count: risk.count,
      actionLabelAr: "لوحة القيادة التنفيذية",
      actionTo: "/admin/executive-dashboard",
      sourceCode: `strategic.aggregate.${risk.code}`,
    });
  }
  assertNoPiiInStrategicAttention(items);
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/executive-dashboard",
      "/admin/executive-reports",
    ],
  );
}

// ─── Admin / system ─────────────────────────────────────────────────────────

export type AdminAttentionInput = {
  readonly failedImports?: number | null;
  readonly scheduleConflicts?: number | null;
  readonly unassignedSections?: number | null;
  readonly allowedActionTos?: ReadonlySet<string> | readonly string[];
};

/**
 * Only surfaces when callers pass proven positive counts.
 * Zero / null / undefined ⇒ no item (never fabricate).
 */
export function buildAdminAttention(
  input: AdminAttentionInput,
): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = [];
  if (typeof input.failedImports === "number" && input.failedImports > 0) {
    items.push({
      id: "admin-import-failures",
      severity: "critical",
      titleAr: "عمليات استيراد فاشلة",
      count: input.failedImports,
      actionLabelAr: "تقارير الاستيراد",
      actionTo: "/admin/reports?tab=imports",
      sourceCode: "import_jobs.status:failed",
    });
  }
  if (
    typeof input.scheduleConflicts === "number" &&
    input.scheduleConflicts > 0
  ) {
    items.push({
      id: "admin-schedule-conflicts",
      severity: "warning",
      titleAr: "تعارضات جداول مثبتة",
      count: input.scheduleConflicts,
      actionLabelAr: "مؤشرات التعارضات",
      actionTo: "/admin/reports?tab=schedules",
      sourceCode: "schedule_conflict_indicators",
    });
  }
  if (
    typeof input.unassignedSections === "number" &&
    input.unassignedSections > 0
  ) {
    items.push({
      id: "admin-unassigned-sections",
      severity: "warning",
      titleAr: `${STUDY_GROUPS_TERM_AR} غير مسندة`,
      count: input.unassignedSections,
      actionLabelAr: "تقارير الجداول والإسناد",
      actionTo: "/admin/reports?tab=schedules",
      sourceCode: "unassigned_course_sections",
    });
  }
  return filterAttentionActions(
    items,
    input.allowedActionTos ?? [
      "/admin/reports?tab=imports",
      "/admin/reports?tab=schedules",
    ],
  );
}

/**
 * NO_DATA / zero / incomplete metrics must not become warnings.
 * Used by regression tests and defensive UI wiring.
 */
export function metricMustNotFabricateAttention(
  metric: ScopedMetric<number> | null | undefined,
): boolean {
  if (!metric) return true;
  if (metric.presence !== "value") return true;
  if (metric.value == null || metric.value <= 0) return true;
  return false;
}
