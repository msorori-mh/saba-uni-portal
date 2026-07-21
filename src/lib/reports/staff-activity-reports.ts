/**
 * Staff-activity aggregate reporting (university leadership / dean) — the
 * High-priority "staff performance" gap from PORTAL-REPORTING-COVERAGE-AUDIT-01.
 *
 * Governance decision (fail-closed by design): activity is aggregated by
 * ROLE, never by individual actor. Per-person performance metrics are out of
 * scope for this library because they are person-identifying; such a report
 * needs an explicit governance decision first (documented as a follow-up).
 *
 * Total↔breakdown relations protected by complementary suppression:
 * - total_events ↔ by_role (a pass over the roles dimension);
 * - each event-group KPI ↔ its matrix column (a pass per matrix column).
 *
 * Row margins (HIGH-R2-1, review round 2): a visible by_role cell is the
 * EXACT SUM of its matrix row, so publishing it beside a partially
 * suppressed row reveals the exact sum of that row's suppressed cells —
 * and combined with a visible column KPI this can pin unique values (review
 * PoC: two suppressed rejected-cells recovered exactly from two row margins
 * plus the rejected KPI: A_rej+B_rej=3 with A_rej<=1, B_rej<=2 ⇒ (1,2)).
 * Row-wise complementary suppression alone cannot prevent this, because the
 * margin equation exists no matter how many cells the row hides; therefore
 * a row margin is published ONLY when EVERY matrix cell of the row is
 * visible, and is force-suppressed otherwise (the reviewer's documented
 * fallback, applied systematically). The matrix publishes every event group
 * — including "other" — so a fully visible row reconciles exactly with its
 * margin and no residual bucket leaks as (margin − Σ visible cells).
 *
 * Application order (documented sufficiency argument): (1) the matrix column
 * pass runs first; (2) row full-visibility is evaluated on the ADJUSTED
 * matrix (conservative: a cell hidden by the column pass also hides the
 * margin); (3) by_role is built with the forced margins and then passes its
 * own complementary pass against total_events. After this, every suppressed
 * matrix cell appears in exactly one published sum equation — its column's,
 * and only when that column's KPI is visible — and every such equation has
 * either zero or at least two unknowns, so no suppressed cell is uniquely
 * recoverable from the published payload.
 */

import {
  type AggregateMetric,
  type AggregateReport,
  type ReportBeneficiary,
  applyComplementarySuppressionToTable,
  forceSuppressed,
  privacySafeCount,
  resolveMinimumCellSize,
} from "./aggregate";

export const STAFF_ACTIVITY_REPORT_ID = "staff_activity_by_role";

/** Anonymized staff action fact; actor id is excluded by type. */
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

function roleOf(row: StaffActivityFactRow): string {
  const role = row.actorRole.trim();
  return role.length > 0 ? role : "(غير محدد)";
}

/** Builds the aggregate-only staff activity report grouped by role. */
export function buildStaffActivityReport(input: StaffActivityReportInput): AggregateReport {
  const threshold = resolveMinimumCellSize(input.minimumCellSize);
  const rows = input.rows;

  const groupCounts = new Map<StaffEventGroup, number>(
    STAFF_EVENT_GROUPS.map((group) => [group, 0]),
  );
  const roleCounts = new Map<string, number>();
  for (const row of rows) {
    const group = normalizeStaffEventType(row.eventType);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    const role = roleOf(row);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  const countOf = (group: StaffEventGroup): number => groupCounts.get(group) ?? 0;

  const distinctRoles = new Set(
    rows.map((row) => row.actorRole.trim()).filter((role) => role.length > 0),
  );

  const roles = [...new Set(rows.map(roleOf))].toSorted((a, b) => a.localeCompare(b, "ar"));
  // Every event group is a matrix column — including "other" — so each row
  // reconciles exactly with its margin (no silent residual bucket).
  const matrixGroups = STAFF_EVENT_GROUPS;

  // ── Step 1: column-wise complementary suppression on the matrix. A column
  //    with exactly one suppressed cell beside a visible group KPI would be
  //    recoverable (KPI − Σ visible cells), so a second cell is hidden. ──
  const matrixAdjusted = applyComplementarySuppressionToTable({
    id: "role_event_matrix",
    title: "مصفوفة الدور × نوع الإجراء",
    columns: matrixGroups.map((group) => ({ id: group, label: STAFF_EVENT_GROUP_LABELS[group] })),
    rows: roles.map((role) => ({
      key: role,
      cells: matrixGroups.map((group) =>
        privacySafeCount(
          rows.filter((row) => roleOf(row) === role && normalizeStaffEventType(row.eventType) === group)
            .length,
          threshold,
        ),
      ),
    })),
  });

  // ── Step 2 (HIGH-R2-1): a row margin is the exact sum of its matrix row,
  //    so it is published only for a FULLY visible row. Evaluated after the
  //    column pass: a cell hidden there also hides the margin (conservative). ──
  const rowFullyVisible = matrixAdjusted.table.rows.map((row) =>
    row.cells.every((cell) => !cell.suppressed && cell.total !== null),
  );

  // ── Step 3: the roles dimension with the forced margins, then its own
  //    complementary pass against the visible total_events KPI. ──
  const roleAdjusted = applyComplementarySuppressionToTable({
    id: "by_role",
    title: "الإجراءات حسب الدور الوظيفي",
    columns: [{ id: "count", label: "العدد" }],
    rows: roles.map((role, index) => ({
      key: role,
      cells: [
        rowFullyVisible[index] === true
          ? privacySafeCount(roleCounts.get(role) ?? 0, threshold)
          : forceSuppressed(),
      ],
    })),
  });

  const flagFor = (group: StaffEventGroup): boolean => {
    const index = matrixGroups.indexOf(group);
    return matrixAdjusted.requiresTotalSuppression[index] ?? false;
  };

  const kpiFor = (group: StaffEventGroup): AggregateMetric =>
    flagFor(group) ? forceSuppressed() : privacySafeCount(countOf(group), threshold);

  const totalEventsKpi = (roleAdjusted.requiresTotalSuppression[0] ?? false)
    ? forceSuppressed()
    : privacySafeCount(rows.length, threshold);

  return {
    reportId: STAFF_ACTIVITY_REPORT_ID,
    title: input.title ?? "نشاط المعالجة حسب الدور الوظيفي",
    beneficiary: input.beneficiary,
    minimumCellSize: threshold,
    kpis: [
      { id: "total_events", label: "إجمالي الإجراءات", metric: totalEventsKpi },
      {
        id: "distinct_roles",
        label: "الأدوار النشطة",
        metric: privacySafeCount(distinctRoles.size, threshold),
        hint: "عدد الأدوار الوظيفية الظاهرة في الفترة",
      },
      { id: "approved", label: "إجراءات الاعتماد", metric: kpiFor("approved") },
      { id: "rejected", label: "إجراءات الرفض", metric: kpiFor("rejected") },
      { id: "returned", label: "إجراءات الإعادة", metric: kpiFor("returned") },
    ],
    tables: [roleAdjusted.table, matrixAdjusted.table],
  };
}
