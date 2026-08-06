import { describe, expect, test } from "bun:test";
import { LIFECYCLE_STATES, PROJECT_STATES } from "../../src/lib/graduation-projects/domain";
import {
  availableProjectActions,
  buildPrivateObjectKey,
  computeEvaluationTotal,
  filterCoordinatorQueue,
  filterDefenseAssignments,
  filterFacultyAssignments,
  filterProjects,
  FINAL_DECISION_LABELS,
  groupProjectsByState,
  isFileObjectAccessible,
  PROJECT_STATE_LABELS,
  resolveViewerEvaluation,
  resolveViewerPanelMemberIds,
  ROLE_LABELS,
  validateEvaluationScores,
  validateMvpEvaluationScore,
  visibleEvaluations,
  type AssignmentRow,
  type EvaluationRow,
  type MyProjectRow,
  type PanelMemberRow,
} from "../../src/lib/graduation-projects/lifecycle";
import type { ProjectRole, ProjectState } from "../../src/lib/graduation-projects/domain";

const mvpRoles: ProjectRole[] = [
  "student",
  "supervisor",
  "coordinator",
  "committee_member",
  "panel_member",
  "administration_viewer",
];

describe("lifecycle action matrix mirrors freeze authorization", () => {
  test("leader actions follow the state machine; members have none", () => {
    expect(availableProjectActions(["student"], "draft", { isLeader: true })).toContain("submit_proposal");
    expect(availableProjectActions(["student"], "revision_required", { isLeader: true })).toContain("resubmit_proposal");
    expect(availableProjectActions(["student"], "active", { isLeader: true })).toContain("submit_progress");
    expect(availableProjectActions(["student"], "active", { isLeader: true })).toContain("submit_final");
    expect(availableProjectActions(["student"], "active", { isLeader: false })).toEqual([]);
    expect(availableProjectActions(["student"], "archived", { isLeader: true })).toEqual([]);
  });

  test("pending supervisor may only respond; accepted may review", () => {
    expect(availableProjectActions(["supervisor"], "approved", { supervisionStatus: "pending" }).sort()).toEqual([
      "respond_supervision_accept",
      "respond_supervision_decline",
    ].sort());
    expect(availableProjectActions(["supervisor"], "active", { supervisionStatus: "accepted" })).toContain("review_progress");
    expect(availableProjectActions(["supervisor"], "active", { supervisionStatus: "accepted" })).toContain("review_final");
    expect(availableProjectActions(["supervisor"], "active", { supervisionStatus: "pending" })).not.toContain("review_progress");
  });

  test("coordinator is sole operational actor for review/schedule/result/archive", () => {
    expect(availableProjectActions(["coordinator"], "submitted")).toContain("approve_proposal");
    expect(availableProjectActions(["coordinator"], "submitted")).toContain("require_revision");
    expect(availableProjectActions(["coordinator"], "submitted")).toContain("reject_proposal");
    expect(availableProjectActions(["coordinator"], "approved")).toContain("assign_supervisor");
    expect(availableProjectActions(["coordinator"], "active")).toContain("schedule_defense");
    expect(availableProjectActions(["coordinator"], "defense_scheduled")).toContain("assign_committee_member");
    expect(availableProjectActions(["coordinator"], "defense_scheduled")).toContain("mark_defense_held");
    expect(availableProjectActions(["coordinator"], "evaluating")).toContain("conclude_result");
    expect(availableProjectActions(["coordinator"], "evaluating", { finalDecision: "passed" })).toContain("archive");
  });

  test("dean and department_head have zero operational actions", () => {
    for (const state of LIFECYCLE_STATES) {
      expect(availableProjectActions(["dean"], state)).toEqual([]);
      expect(availableProjectActions(["department_head"], state)).toEqual([]);
    }
  });

  test("committee evaluates only while evaluating", () => {
    expect(availableProjectActions(["committee_member"], "evaluating")).toContain("submit_evaluation");
    expect(availableProjectActions(["panel_member"], "active")).toEqual([]);
  });

  test("every canonical state has Arabic labels including final_decision", () => {
    for (const state of PROJECT_STATES) expect(PROJECT_STATE_LABELS[state]).toBeTruthy();
    for (const role of mvpRoles) expect(ROLE_LABELS[role]).toBeTruthy();
    expect(FINAL_DECISION_LABELS.passed).toBeTruthy();
    expect(FINAL_DECISION_LABELS.revisions_required).toBeTruthy();
    expect(FINAL_DECISION_LABELS.failed).toBeTruthy();
  });
});

describe("visibility rules prevent cross-member evaluation leakage", () => {
  const evaluation = (state: EvaluationRow["state"], panelMemberId = "pm1"): EvaluationRow => ({
    id: `e-${state}-${panelMemberId}`,
    discussion_id: "d1",
    panel_member_id: panelMemberId,
    rubric_version: "v1",
    state,
    total_score: 90,
    comments: "secret",
    submitted_at: null,
    finalized_at: null,
    scores: [],
    score: 90,
    notes: "secret",
  });

  test("file objects are accessible only after a clean scan", () => {
    expect(isFileObjectAccessible("clean")).toBe(true);
    expect(isFileObjectAccessible("pending")).toBe(false);
    expect(isFileObjectAccessible("quarantined")).toBe(false);
    expect(isFileObjectAccessible("rejected")).toBe(false);
  });

  test("committee peer cannot see another member evaluation", () => {
    const rows = [evaluation("submitted", "pm1"), evaluation("submitted", "pm2")];
    const visible = visibleEvaluations(rows, {
      viewerRoles: ["panel_member"],
      ownPanelMemberIds: ["pm1"],
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.panel_member_id).toBe("pm1");
  });

  test("coordinator detail path does not receive peer evaluation rows", () => {
    const rows = [evaluation("submitted", "pm1"), evaluation("submitted", "pm2")];
    expect(visibleEvaluations(rows, {
      viewerRoles: ["coordinator"],
      ownPanelMemberIds: [],
    })).toEqual([]);
  });

  test("students and title-only dean see no evaluation rows", () => {
    const rows = [evaluation("finalized", "pm1")];
    expect(visibleEvaluations(rows, { viewerRoles: ["student"], ownPanelMemberIds: [] })).toEqual([]);
    expect(visibleEvaluations(rows, { viewerRoles: ["dean"], ownPanelMemberIds: [] })).toEqual([]);
  });

  test("resolveViewerEvaluation never returns peer row as mine", () => {
    const assignments: AssignmentRow[] = [
      {
        id: "a1",
        role: "panel_member",
        user_id: "u1",
        student_profile_id: null,
        faculty_profile_id: "f1",
        active: true,
        assigned_at: "2026-01-01",
        ended_at: null,
      },
      {
        id: "a2",
        role: "panel_member",
        user_id: "u2",
        student_profile_id: null,
        faculty_profile_id: "f2",
        active: true,
        assigned_at: "2026-01-01",
        ended_at: null,
      },
    ];
    const panel_members: PanelMemberRow[] = [
      { id: "pm1", discussion_id: "d1", assignment_id: "a1", chair: false, conflict_declared: false },
      { id: "pm2", discussion_id: "d1", assignment_id: "a2", chair: false, conflict_declared: false },
    ];
    const evaluations = [evaluation("submitted", "pm2")];
    expect(resolveViewerPanelMemberIds({ assignments, panel_members }, "u1")).toEqual(["pm1"]);
    expect(resolveViewerEvaluation({ assignments, panel_members, evaluations }, "u1")).toBeNull();
  });

  test("MVP score validation is 0..100 inclusive", () => {
    expect(validateMvpEvaluationScore(0)).toEqual([]);
    expect(validateMvpEvaluationScore(100)).toEqual([]);
    expect(validateMvpEvaluationScore(-1)).toEqual(["mvp_score_invalid"]);
    expect(validateEvaluationScores([])).toEqual(["scores_empty"]);
    expect(computeEvaluationTotal([{
      criterion_code: "c1",
      criterion_label: "C",
      maximum_score: 100,
      awarded_score: 40,
    }])).toBe(40);
  });
});

describe("list filtering for Package C queues", () => {
  const rows: MyProjectRow[] = [
    {
      project_id: "p1",
      department_id: "d1",
      title: "A",
      state: "submitted",
      progress_percent: 0,
      at_risk: false,
      version: 1,
      roles: ["coordinator"],
      updated_at: "2026-01-01",
    },
    {
      project_id: "p2",
      department_id: "d1",
      title: "B",
      state: "evaluating",
      lifecycle_state: "evaluating",
      progress_percent: 100,
      at_risk: true,
      version: 2,
      roles: ["panel_member"],
      updated_at: "2026-01-02",
    },
    {
      project_id: "p3",
      department_id: "d1",
      title: "C",
      state: "active",
      progress_percent: 50,
      at_risk: false,
      version: 1,
      roles: ["student"],
      is_leader: true,
      updated_at: "2026-01-03",
    },
  ];

  test("filters my projects, faculty, coordinator, and defense queues", () => {
    expect(filterProjects(rows, { atRiskOnly: true })).toHaveLength(1);
    expect(filterFacultyAssignments(rows, ["coordinator", "panel_member"]).map((r) => r.project_id).sort())
      .toEqual(["p1", "p2"]);
    expect(filterCoordinatorQueue(rows).map((r) => r.project_id)).toEqual(["p1"]);
    expect(filterDefenseAssignments(rows).map((r) => r.project_id)).toEqual(["p2"]);
    expect(groupProjectsByState(rows).evaluating).toBe(1);
  });

  test("buildPrivateObjectKey stays project-scoped", () => {
    const key = buildPrivateObjectKey("p1", "final.pdf", "tok1");
    expect(key).toBe("graduation-projects/p1/tok1-final.pdf");
    expect(buildPrivateObjectKey("p1", "../x.pdf", "tok1")).toBeNull();
  });
});

describe("terminal states freeze mutations for students", () => {
  test("rejected and archived freeze leader writes", () => {
    for (const terminal of ["rejected", "archived"] as ProjectState[]) {
      expect(availableProjectActions(["student"], terminal, { isLeader: true })).toEqual([]);
    }
  });
});
