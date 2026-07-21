/**
 * Staff-activity aggregate reporting (university leadership / dean) — the
 * High-priority "staff performance" gap from PORTAL-REPORTING-COVERAGE-AUDIT-01.
 *
 * Governance decision (fail-closed by design): activity is aggregated by
 * ROLE, never by individual actor. Per-person performance metrics are out of
 * scope for this library because they are person-identifying; such a report
 * needs an explicit governance decision first (documented as a follow-up).
 */

import {
  type AggregateReport,
  type ReportBeneficiary,
  countByGroup,
  groupRowsToCountTable,
  privacySafeCount,
  resolveMinimumCellSize,
} from "./aggregate";

export const STAFF_ACTIVITY_REPORT_ID = "staff_activity_by_role";

/** Anonymized staff action fact: actor id is excluded by type. */
export interface StaffActivityFactRow {
  readonly actorRole: string;
  readonly eventType: string;
}

export const STAFF_EVENT_GROUPS = ["approved", "rejected", "returned", "created", "other"] as const;
export type StaffEventGroup = (typeof STAFF_EVENT_GROUPS)[number];

export const STAFF_EVENT_GROUP_LABELS: Record<StaffEventGroup, string> = {
  approved: "اعتماد",
  rejected: "رفض",
  returned: "إعادة للاستكمال",
  created: "إنشاء/تسجيل",
  other: "أخرى",
};

/** Raw event type → group mapping (lowercased keys); unknowns land in "other". */
export const STAFF_EVENT_GROUP_MAP: Readonly<Record<string, StaffEventGroup>> = {
  approved: "approved",
  approve: "approved",
  accepted: "approved",
  completed: "approved",
  rejected: "rejected",
  reject: "rejected",
  declined: "rejected",
  returned: "returned",
  returned_for_completion: "returned",
  needs_correction: "returned",
  created: "created",
  registered: "created",
  submitted: "created",
  imported: "created",
};

/** Fail-safe normalization: unknown event types are counted under "other". */
export function normalizeStaffEventType(eventType: string): StaffEventGroup {
  const key = eventType.trim().toLowerCase();
  return STAFF_EVENT_GROUP_MAP[key] ?? "other";
}

export interface StaffActivityReportInput {
  readonly beneficiary: ReportBeneficiary;
  readonly rows: readonly StaffActivityFactRow[];
  readonly minimumCellSize?: number | null;
  readonly title?: string;
}

/** Builds the aggregate-only staff activity report grouped by role. */
export function buildStaffActivityReport(input: StaffActivityReportInput): AggregateReport {
  const threshold = resolveMinimumCellSize(input.minimumCellSize);
  const rows = input.rows;

  const groupCounts = new Map<StaffEventGroup, number>(
    STAFF_EVENT_GROUPS.map((group) => [group, 0]),
  );
  for (const row of rows) {
    const group = normalizeStaffEventType(row.eventType);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  const countOf = (group: StaffEventGroup): number => groupCounts.get(group) ?? 0;

  const distinctRoles = new Set(
    rows.map((row) => row.actorRole.trim()).filter((role) => role.length > 0),
  );

  const roleCounts = new Map<string, number>();
  for (const row of rows) {
    const role = row.actorRole.trim().length > 0 ? row.actorRole.trim() : "(غير محدد)";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  const matrixGroups = STAFF_EVENT_GROUPS.filter((group) => group !== "other");
  const roleEventMatrix = [...roleCounts.keys()]
    .toSorted((a, b) => a.localeCompare(b, "ar"))
    .map((role) => ({
      key: role,
      cells: matrixGroups.map((group) =>
        privacySafeCount(
          rows.filter(
            (row) =>
              (row.actorRole.trim().length > 0 ? row.actorRole.trim() : "(غير محدد)") === role &&
              normalizeStaffEventType(row.eventType) === group,
          ).length,
          threshold,
        ),
      ),
    }));

  return {
    reportId: STAFF_ACTIVITY_REPORT_ID,
    title: input.title ?? "نشاط المعالجة حسب الدور الوظيفي",
    beneficiary: input.beneficiary,
    minimumCellSize: threshold,
    kpis: [
      { id: "total_events", label: "إجمالي الإجراءات", metric: privacySafeCount(rows.length, threshold) },
      {
        id: "distinct_roles",
        label: "الأدوار النشطة",
        metric: privacySafeCount(distinctRoles.size, threshold),
        hint: "عدد الأدوار الوظيفية الظاهرة في الفترة",
      },
      { id: "approved", label: "إجراءات الاعتماد", metric: privacySafeCount(countOf("approved"), threshold) },
      { id: "rejected", label: "إجراءات الرفض", metric: privacySafeCount(countOf("rejected"), threshold) },
      { id: "returned", label: "إجراءات الإعادة", metric: privacySafeCount(countOf("returned"), threshold) },
    ],
    tables: [
      groupRowsToCountTable(
        "by_role",
        "الإجراءات حسب الدور الوظيفي",
        countByGroup(rows, (row) => row.actorRole, threshold),
      ),
      {
        id: "role_event_matrix",
        title: "مصفوفة الدور × نوع الإجراء",
        columns: matrixGroups.map((group) => ({ id: group, label: STAFF_EVENT_GROUP_LABELS[group] })),
        rows: roleEventMatrix,
      },
    ],
  };
}
