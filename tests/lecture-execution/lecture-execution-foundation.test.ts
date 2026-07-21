import { describe, expect, test } from "bun:test";
import {
  authorizeExecutionAction,
  CONFIRMATION_STATUS_AR,
  DEFAULT_EXECUTION_POLICY,
  EXECUTION_STATE_AR,
  EXECUTION_STATES,
  initialConfirmationStatus,
  isValidExecutionTransition,
  isValidWeek,
  sessionKindFromScheduleType,
  summarizeExecution,
  summarizeExecutionBy,
  TERMINAL_EXECUTION_STATES,
  type ExecutionAuthority,
  type ExecutionRecordRow,
  type ExecutionScope,
} from "../../src/lib/lecture-execution/domain";

const scope: ExecutionScope = {
  departmentId: "dept-1",
  courseSectionId: "section-1",
  levelId: "level-1",
  state: "scheduled",
  confirmationStatus: "awaiting_delegate",
};

const recorder: ExecutionAuthority = {
  actorId: "u-faculty",
  role: "faculty_recorder",
  departmentId: "dept-1",
  courseSectionId: "section-1",
  active: true,
  directlyAssigned: true,
};

const delegate: ExecutionAuthority = {
  actorId: "u-delegate",
  role: "section_delegate",
  departmentId: "dept-1",
  levelId: "level-1",
  active: true,
  directlyAssigned: true,
};

const monitor: ExecutionAuthority = {
  actorId: "u-head",
  role: "department_monitor",
  departmentId: "dept-1",
  active: true,
  directlyAssigned: true,
};

describe("lecture execution domain model", () => {
  test("defines exactly the eight contracted states with Arabic labels", () => {
    expect(EXECUTION_STATES).toEqual([
      "executed", "hindered", "compensated", "cancelled",
      "scheduled", "in_progress", "postponed", "not_started",
    ]);
    for (const state of EXECUTION_STATES) {
      expect(EXECUTION_STATE_AR[state].length).toBeGreaterThan(0);
    }
    expect(Object.keys(CONFIRMATION_STATUS_AR)).toEqual([
      "faculty_final", "awaiting_delegate", "confirmed", "rejected",
    ]);
  });

  test("maps merged schedule slot types to theory/practical kinds, failing closed otherwise", () => {
    expect(sessionKindFromScheduleType("lecture")).toBe("theory");
    expect(sessionKindFromScheduleType("lab")).toBe("practical");
    expect(sessionKindFromScheduleType("tutorial")).toBeNull();
    expect(sessionKindFromScheduleType("exam")).toBeNull();
  });

  test("validates numbered weeks against the configured term length", () => {
    const policy = { termWeeks: 15, delegateConfirmationEnabled: false };
    expect(isValidWeek(1, policy)).toBe(true);
    expect(isValidWeek(15, policy)).toBe(true);
    expect(isValidWeek(16, policy)).toBe(false);
    expect(isValidWeek(0, policy)).toBe(false);
    expect(isValidWeek(2.5, policy)).toBe(false);
    expect(isValidWeek(25, { termWeeks: 40, delegateConfirmationEnabled: false })).toBe(false); // hard cap 30
    expect(isValidWeek(30, { termWeeks: 40, delegateConfirmationEnabled: false })).toBe(true);
  });

  test("enforces the execution lifecycle transitions", () => {
    expect(isValidExecutionTransition("not_started", "scheduled")).toBe(true);
    expect(isValidExecutionTransition("not_started", "cancelled")).toBe(true);
    expect(isValidExecutionTransition("not_started", "executed")).toBe(false);
    expect(isValidExecutionTransition("scheduled", "executed")).toBe(true);
    expect(isValidExecutionTransition("scheduled", "postponed")).toBe(true);
    expect(isValidExecutionTransition("in_progress", "executed")).toBe(true);
    expect(isValidExecutionTransition("in_progress", "scheduled")).toBe(false);
    expect(isValidExecutionTransition("postponed", "scheduled")).toBe(true);
    expect(isValidExecutionTransition("hindered", "compensated")).toBe(true);
    for (const terminal of TERMINAL_EXECUTION_STATES) {
      for (const next of EXECUTION_STATES) {
        expect(isValidExecutionTransition(terminal, next)).toBe(false);
      }
    }
  });

  test("keeps delegate confirmation configurable while D-15 is pending", () => {
    expect(DEFAULT_EXECUTION_POLICY.delegateConfirmationEnabled).toBe(false);
    expect(initialConfirmationStatus(DEFAULT_EXECUTION_POLICY)).toBe("faculty_final");
    expect(initialConfirmationStatus({ termWeeks: 15, delegateConfirmationEnabled: true })).toBe("awaiting_delegate");
  });
});

describe("lecture execution fail-closed authorization", () => {
  test("denies missing, inactive, indirect, or cross-department authority", () => {
    expect(authorizeExecutionAction(null, scope, "record")).toBe(false);
    expect(authorizeExecutionAction({ ...recorder, active: false }, scope, "record")).toBe(false);
    expect(authorizeExecutionAction({ ...recorder, directlyAssigned: false }, scope, "record")).toBe(false);
    expect(authorizeExecutionAction({ ...recorder, departmentId: "dept-2" }, scope, "record")).toBe(false);
  });

  test("allows only the exact-section faculty recorder to record non-terminal states", () => {
    expect(authorizeExecutionAction(recorder, scope, "record")).toBe(true);
    expect(authorizeExecutionAction({ ...recorder, courseSectionId: "section-2" }, scope, "record")).toBe(false);
    expect(authorizeExecutionAction(recorder, { ...scope, state: "executed" }, "record")).toBe(false);
    expect(authorizeExecutionAction(delegate, scope, "record")).toBe(false);
    expect(authorizeExecutionAction(recorder, scope, "confirm")).toBe(false);
  });

  test("gates delegate confirmation on the D-15 policy flag", () => {
    // Pending D-15 → fail closed even for a perfectly assigned delegate.
    expect(authorizeExecutionAction(delegate, scope, "confirm", DEFAULT_EXECUTION_POLICY)).toBe(false);
    const enabled = { termWeeks: 15, delegateConfirmationEnabled: true };
    expect(authorizeExecutionAction(delegate, scope, "confirm", enabled)).toBe(true);
    expect(authorizeExecutionAction({ ...delegate, levelId: "level-2" }, scope, "confirm", enabled)).toBe(false);
    expect(authorizeExecutionAction(delegate, { ...scope, confirmationStatus: "confirmed" }, "confirm", enabled)).toBe(false);
    expect(authorizeExecutionAction(delegate, { ...scope, confirmationStatus: "faculty_final" }, "confirm", enabled)).toBe(false);
  });

  test("monitors read their own department reports only", () => {
    expect(authorizeExecutionAction(monitor, scope, "read_report")).toBe(true);
    expect(authorizeExecutionAction({ ...monitor, role: "college_monitor" }, scope, "read_report")).toBe(true);
    expect(authorizeExecutionAction(monitor, { ...scope, departmentId: "dept-2" }, "read_report")).toBe(false);
    expect(authorizeExecutionAction(monitor, scope, "record")).toBe(false);
    expect(authorizeExecutionAction(monitor, scope, "confirm")).toBe(false);
  });
});

describe("lecture execution reporting", () => {
  const rows: ExecutionRecordRow[] = [
    { departmentId: "dept-1", levelId: "level-1", courseId: "c-1", weekNo: 1, kind: "theory", state: "executed", confirmationStatus: "confirmed" },
    { departmentId: "dept-1", levelId: "level-1", courseId: "c-1", weekNo: 2, kind: "theory", state: "compensated", confirmationStatus: "awaiting_delegate" },
    { departmentId: "dept-1", levelId: "level-1", courseId: "c-2", weekNo: 1, kind: "practical", state: "hindered", confirmationStatus: "faculty_final" },
    { departmentId: "dept-1", levelId: "level-2", courseId: "c-1", weekNo: 3, kind: "theory", state: "scheduled", confirmationStatus: "awaiting_delegate" },
    { departmentId: "dept-2", levelId: "level-1", courseId: "c-9", weekNo: 1, kind: "theory", state: "cancelled", confirmationStatus: "faculty_final" },
  ];

  test("computes execution and settlement rates deterministically", () => {
    const s = summarizeExecution(rows);
    expect(s.planned).toBe(5);
    expect(s.delivered).toBe(2);
    expect(s.missed).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.awaitingDelegate).toBe(2);
    expect(s.executionRate).toBe(0.4);
    expect(s.settlementRate).toBe(0.8);
    expect(summarizeExecution([]).executionRate).toBe(0);
  });

  test("breaks rates down by department, level, and course", () => {
    const byDept = summarizeExecutionBy(rows, "department");
    expect(byDept.map((r) => r.key)).toEqual(["dept-1", "dept-2"]);
    expect(byDept[0]).toMatchObject({ planned: 4, delivered: 2, executionRate: 0.5 });
    expect(byDept[1]).toMatchObject({ planned: 1, delivered: 0, missed: 1 });

    const byLevel = summarizeExecutionBy(rows, "level");
    expect(byLevel.find((r) => r.key === "level-1")).toMatchObject({ planned: 3, delivered: 2 });
    expect(byLevel.find((r) => r.key === "level-2")).toMatchObject({ planned: 1, pending: 1 });

    const byCourse = summarizeExecutionBy(rows, "course");
    expect(byCourse.find((r) => r.key === "c-1")).toMatchObject({ planned: 3, delivered: 2 });
    expect(byCourse.find((r) => r.key === "c-2")).toMatchObject({ planned: 1, missed: 1 });
  });
});
