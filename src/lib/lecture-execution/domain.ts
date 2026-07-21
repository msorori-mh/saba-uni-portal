/**
 * LECTURE-EXECUTION-MONITORING-MVP-01 — source-only domain foundation.
 *
 * Anchors on the merged schedule contracts only:
 * - portal consumes published `class_schedule` slots (#152);
 * - `course_sections` remain the legacy source of record (#158);
 * - canonical current term / offering scoping (#150);
 * - exact enrollment/section binding, no cohort inference (#153).
 *
 * The unmerged draft #149 (cohorts/delivery groups) is NOT a dependency.
 * Delegate (مندوب) adoption D-15 is still pending, so delegate confirmation
 * is policy-gated and fails closed until enabled by a separately authorized
 * configuration change.
 */

export const EXECUTION_STATES = [
  "executed",
  "hindered",
  "compensated",
  "cancelled",
  "scheduled",
  "in_progress",
  "postponed",
  "not_started",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export const EXECUTION_STATE_AR: Record<ExecutionState, string> = {
  executed: "نُفِّذت",
  hindered: "تعذَّرت",
  compensated: "عُوِّضَت",
  cancelled: "ملغاة",
  scheduled: "مجدولة",
  in_progress: "قيد التنفيذ",
  postponed: "مؤجَّلة",
  not_started: "لم تبدأ",
};

export const SESSION_KINDS = ["theory", "practical"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_KIND_AR: Record<SessionKind, string> = {
  theory: "نظرية",
  practical: "عملية",
};

/** Map a merged `class_schedule.schedule_type` to a lecture-execution kind. */
export function sessionKindFromScheduleType(scheduleType: string): SessionKind | null {
  if (scheduleType === "lecture") return "theory";
  if (scheduleType === "lab") return "practical";
  return null; // tutorial/exam slots are out of MVP scope — fail closed.
}

export const MAX_TERM_WEEKS = 30;
export const DEFAULT_TERM_WEEKS = 15;

/**
 * D-15 (اعتماد المندوبين) is pending: `delegateConfirmationEnabled` defaults
 * to false and every confirmation path must fail closed while it is false.
 */
export interface ExecutionPolicy {
  termWeeks: number;
  delegateConfirmationEnabled: boolean;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  termWeeks: DEFAULT_TERM_WEEKS,
  delegateConfirmationEnabled: false,
};

export function isValidWeek(weekNo: number, policy: ExecutionPolicy): boolean {
  if (!Number.isInteger(weekNo)) return false;
  const cap = Math.min(Math.max(1, policy.termWeeks), MAX_TERM_WEEKS);
  return weekNo >= 1 && weekNo <= cap;
}

/** Ordered lifecycle. Terminal states have no outgoing transitions. */
const transitions: Partial<Record<ExecutionState, readonly ExecutionState[]>> = {
  not_started: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "executed", "hindered", "postponed", "cancelled"],
  in_progress: ["executed", "hindered"],
  postponed: ["scheduled", "cancelled"],
  hindered: ["compensated", "cancelled"],
};

export const TERMINAL_EXECUTION_STATES: ReadonlySet<ExecutionState> = new Set([
  "executed",
  "compensated",
  "cancelled",
]);

export function isValidExecutionTransition(from: ExecutionState, to: ExecutionState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export type ConfirmationStatus =
  | "faculty_final"
  | "awaiting_delegate"
  | "confirmed"
  | "rejected";

export const CONFIRMATION_STATUS_AR: Record<ConfirmationStatus, string> = {
  faculty_final: "مُعتمد من عضو هيئة التدريس",
  awaiting_delegate: "بانتظار تأكيد المندوب",
  confirmed: "مؤكَّد (مزدوج)",
  rejected: "مرفوض من المندوب",
};

/**
 * Confirmation status stamped on a freshly recorded execution entry.
 * While D-15 is pending (policy disabled) faculty records are final;
 * when enabled, every new record must wait for delegate confirmation.
 */
export function initialConfirmationStatus(policy: ExecutionPolicy): ConfirmationStatus {
  return policy.delegateConfirmationEnabled ? "awaiting_delegate" : "faculty_final";
}

export type ExecutionActorRole =
  | "faculty_recorder"
  | "section_delegate"
  | "department_monitor"
  | "college_monitor";

export type ExecutionAction = "record" | "confirm" | "read_report";

export interface ExecutionAuthority {
  actorId: string;
  role: ExecutionActorRole;
  departmentId?: string;
  /** Exact section scope — required for faculty_recorder. */
  courseSectionId?: string;
  /** Exact level scope — required for section_delegate. */
  levelId?: string;
  active: boolean;
  directlyAssigned: boolean;
}

export interface ExecutionScope {
  departmentId: string;
  courseSectionId: string;
  levelId: string;
  state: ExecutionState;
  confirmationStatus: ConfirmationStatus;
}

const actionsByRole: Record<ExecutionActorRole, ReadonlySet<ExecutionAction>> = {
  faculty_recorder: new Set(["record", "read_report"]),
  section_delegate: new Set(["confirm"]),
  department_monitor: new Set(["read_report"]),
  college_monitor: new Set(["read_report"]),
};

/**
 * Fail-closed authorization. No broad title (admin/dean/department_head app
 * role) is accepted here — only an exact, active, direct assignment to the
 * same department (and section/level where the action is scoped) authorizes.
 */
export function authorizeExecutionAction(
  authority: ExecutionAuthority | null,
  scope: ExecutionScope,
  action: ExecutionAction,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY,
): boolean {
  if (!authority?.active || !authority.directlyAssigned) return false;
  if (!actionsByRole[authority.role].has(action)) return false;
  if (authority.departmentId !== scope.departmentId) return false;

  if (action === "record") {
    if (authority.role !== "faculty_recorder") return false;
    if (authority.courseSectionId !== scope.courseSectionId) return false;
    if (TERMINAL_EXECUTION_STATES.has(scope.state)) return false;
    return true;
  }

  if (action === "confirm") {
    // D-15 pending → fail closed until the policy is explicitly enabled.
    if (!policy.delegateConfirmationEnabled) return false;
    if (authority.role !== "section_delegate") return false;
    if (authority.levelId !== scope.levelId) return false;
    if (scope.confirmationStatus !== "awaiting_delegate") return false;
    return true;
  }

  // read_report: monitors read their own department only; terminal states readable.
  return true;
}

export interface ExecutionRecordRow {
  departmentId: string;
  levelId: string;
  courseId: string;
  weekNo: number;
  kind: SessionKind;
  state: ExecutionState;
  confirmationStatus: ConfirmationStatus;
}

export interface ExecutionSummary {
  planned: number;
  delivered: number;
  missed: number;
  pending: number;
  awaitingDelegate: number;
  /** delivered / planned, 0 when nothing is planned. */
  executionRate: number;
  /** (delivered + missed) / planned — how much of the plan is settled. */
  settlementRate: number;
}

const DELIVERED: ReadonlySet<ExecutionState> = new Set(["executed", "compensated"]);
const MISSED: ReadonlySet<ExecutionState> = new Set(["hindered", "cancelled"]);

export function summarizeExecution(rows: readonly ExecutionRecordRow[]): ExecutionSummary {
  const planned = rows.length;
  const delivered = rows.filter((r) => DELIVERED.has(r.state)).length;
  const missed = rows.filter((r) => MISSED.has(r.state)).length;
  const pending = planned - delivered - missed;
  const awaitingDelegate = rows.filter((r) => r.confirmationStatus === "awaiting_delegate").length;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    planned,
    delivered,
    missed,
    pending,
    awaitingDelegate,
    executionRate: planned === 0 ? 0 : round(delivered / planned),
    settlementRate: planned === 0 ? 0 : round((delivered + missed) / planned),
  };
}

export type ExecutionBreakdownKey = "department" | "level" | "course";

export interface ExecutionBreakdownRow extends ExecutionSummary {
  key: string;
}

/** Execution-rate breakdown by department / level / course for monitoring. */
export function summarizeExecutionBy(
  rows: readonly ExecutionRecordRow[],
  breakdown: ExecutionBreakdownKey,
): ExecutionBreakdownRow[] {
  const keyOf = (r: ExecutionRecordRow) =>
    breakdown === "department" ? r.departmentId : breakdown === "level" ? r.levelId : r.courseId;
  const groups = new Map<string, ExecutionRecordRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => ({ key, ...summarizeExecution(group) }))
    .sort((a, b) => b.planned - a.planned || (a.key < b.key ? -1 : 1));
}
