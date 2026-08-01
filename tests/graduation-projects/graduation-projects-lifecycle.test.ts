import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PROJECT_STATES } from "../../src/lib/graduation-projects/domain";
import {
  availableProjectActions,
  buildPrivateObjectKey,
  computeEvaluationTotal,
  correctionStatus,
  EVENT_LABELS,
  filterProjects,
  groupProjectsByState,
  isCorrectionOverdue,
  isFileObjectAccessible,
  pendingCorrectionsCount,
  PROJECT_STATE_LABELS,
  ROLE_LABELS,
  validateEvaluationScores,
  resolveViewerEvaluation,
  resolveViewerPanelMemberIds,
  visibleEvaluations,
  type AssignmentRow,
  type CorrectionRow,
  type EvaluationRow,
  type MyProjectRow,
  type PanelMemberRow,
} from "../../src/lib/graduation-projects/lifecycle";
import type { ProjectRole, ProjectState } from "../../src/lib/graduation-projects/domain";

const allRoles: ProjectRole[] = ["student", "supervisor", "coordinator", "department_head", "dean", "panel_member"];

describe("lifecycle action matrix mirrors SQL preconditions", () => {
  test("student actions follow the state machine", () => {
    expect(availableProjectActions(["student"], "draft")).toEqual(["submit_proposal"]);
    expect(availableProjectActions(["student"], "revision_required")).toEqual(["resubmit_proposal"]);
    expect(availableProjectActions(["student"], "active").sort()).toEqual(["register_file", "request_discussion", "submit_deliverable"].sort());
    expect(availableProjectActions(["student"], "corrections_required").sort()).toEqual(["complete_correction", "register_file"].sort());
    expect(availableProjectActions(["student"], "archived")).toEqual([]);
  });

  test("supervisor cannot review proposals or evaluate; coordinator cannot evaluate", () => {
    expect(availableProjectActions(["supervisor"], "under_review")).toEqual([]);
    expect(availableProjectActions(["supervisor"], "evaluating")).toEqual(["add_note"]);
    expect(availableProjectActions(["coordinator"], "evaluating").sort()).toEqual(["create_project", "end_assignment", "view_reports"].sort());
    expect(availableProjectActions(["panel_member"], "evaluating").sort()).toEqual(["finalize_evaluation", "save_evaluation"].sort());
    expect(availableProjectActions(["panel_member"], "active")).toEqual([]);
  });

  test("coordinator/department_head review and scheduling gates", () => {
    expect(availableProjectActions(["coordinator"], "submitted").sort()).toEqual(
      ["create_project", "end_assignment", "reject_proposal", "require_revision", "start_review", "view_reports"].sort());
    expect(availableProjectActions(["department_head"], "under_review").sort()).toEqual(
      ["approve_proposal", "create_project", "end_assignment", "reject_proposal", "require_revision", "view_reports"].sort());
    expect(availableProjectActions(["coordinator"], "discussion_requested")).toContain("schedule_discussion");
    expect(availableProjectActions(["coordinator"], "discussion_scheduled")).toContain("record_discussion_outcome");
  });

  test("result and archive powers stay with department_head/dean", () => {
    expect(availableProjectActions(["dean"], "evaluating").sort()).toEqual(["conclude_result", "view_reports"].sort());
    expect(availableProjectActions(["department_head"], "completed")).toContain("archive");
    expect(availableProjectActions(["coordinator"], "completed")).not.toContain("archive");
    expect(availableProjectActions(["supervisor"], "completed")).toEqual([]);
  });

  test("multi-role viewers get the union of their powers", () => {
    const actions = availableProjectActions(["student", "supervisor"], "active");
    expect(actions).toContain("submit_deliverable");
    expect(actions).toContain("review_submission");
    expect(actions).toContain("request_discussion");
  });

  test("every state has an Arabic label and terminal states freeze mutations", () => {
    for (const state of PROJECT_STATES) expect(PROJECT_STATE_LABELS[state]).toBeTruthy();
    for (const role of allRoles) expect(ROLE_LABELS[role]).toBeTruthy();
    for (const terminal of ["completed", "archived", "rejected", "cancelled"] as ProjectState[]) {
      expect(availableProjectActions(["student"], terminal)).toEqual([]);
      expect(availableProjectActions(["coordinator"], terminal)).not.toContain("end_assignment");
    }
  });
});

describe("visibility rules", () => {
  const evaluation = (state: EvaluationRow["state"], panelMemberId = "pm1"): EvaluationRow => ({
    id: `e-${state}-${panelMemberId}`,
    discussion_id: "d1",
    panel_member_id: panelMemberId,
    rubric_version: "v1",
    state,
    total_score: 90,
    comments: null,
    submitted_at: null,
    finalized_at: null,
    scores: [],
  });

  test("file objects are accessible only after a clean scan", () => {
    expect(isFileObjectAccessible("clean")).toBe(true);
    expect(isFileObjectAccessible("pending")).toBe(false);
    expect(isFileObjectAccessible("quarantined")).toBe(false);
    expect(isFileObjectAccessible("rejected")).toBe(false);
  });

  test("students see evaluations only after finalization", () => {
    const evaluations = [evaluation("draft"), evaluation("submitted"), evaluation("finalized")];
    const visible = visibleEvaluations(evaluations, { viewerRoles: ["student"], ownPanelMemberIds: [] });
    expect(visible.map((e) => e.state)).toEqual(["finalized"]);
  });

  test("panel members see own drafts plus all finalized; staff see everything", () => {
    const evaluations = [evaluation("draft", "pm1"), evaluation("draft", "pm2"), evaluation("finalized", "pm2")];
    expect(visibleEvaluations(evaluations, { viewerRoles: ["panel_member"], ownPanelMemberIds: ["pm1"] }).map((e) => e.id))
      .toEqual(["e-draft-pm1", "e-finalized-pm2"]);
    expect(visibleEvaluations(evaluations, { viewerRoles: ["coordinator"], ownPanelMemberIds: [] })).toHaveLength(3);
  });
});

describe("evaluation scoring mirrors SQL validation", () => {
  test("rejects empty, invalid, exceeding and duplicate scores", () => {
    expect(validateEvaluationScores([])).toEqual(["scores_empty"]);
    expect(validateEvaluationScores([
      { criterion_code: "c1", criterion_label: "C1", maximum_score: 100, awarded_score: 120 },
    ])).toEqual(["awarded_exceeds_maximum"]);
    expect(validateEvaluationScores([
      { criterion_code: "c1", criterion_label: "C1", maximum_score: 0, awarded_score: 0 },
    ])).toEqual(["maximum_score_invalid"]);
    expect(validateEvaluationScores([
      { criterion_code: "c1", criterion_label: "C1", maximum_score: 10, awarded_score: 5 },
      { criterion_code: "c1", criterion_label: "C1b", maximum_score: 10, awarded_score: 5 },
    ])).toEqual(["criterion_code_duplicate"]);
    expect(validateEvaluationScores([
      { criterion_code: "", criterion_label: "", maximum_score: 10, awarded_score: -1 },
    ]).sort()).toEqual(["awarded_score_invalid", "criterion_code_missing", "criterion_label_missing"].sort());
  });

  test("computes totals deterministically", () => {
    expect(computeEvaluationTotal([
      { criterion_code: "a", criterion_label: "A", maximum_score: 100, awarded_score: 80 },
      { criterion_code: "b", criterion_label: "B", maximum_score: 50, awarded_score: 45 },
    ])).toBe(125);
  });
});

describe("private object key builder", () => {
  test("builds only project-scoped keys", () => {
    expect(buildPrivateObjectKey("p1", "final.pdf", "abc")).toBe("graduation-projects/p1/abc-final.pdf");
    expect(buildPrivateObjectKey("p1", "dir/final.pdf", "abc")).toBe("graduation-projects/p1/abc-final.pdf");
    expect(buildPrivateObjectKey("p1", "..", "abc")).toBeNull();
    expect(buildPrivateObjectKey("p1", "final.pdf", "a/b")).toBeNull();
    expect(buildPrivateObjectKey("", "final.pdf", "abc")).toBeNull();
  });
});

describe("corrections workflow helpers", () => {
  const base: CorrectionRow = {
    id: "c1",
    description: "fix",
    due_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    accepted_at: null,
    requested_by_assignment_id: "a1",
  };

  test("derives status and overdue", () => {
    expect(correctionStatus(base)).toBe("pending");
    expect(isCorrectionOverdue(base, new Date("2026-02-01"))).toBe(true);
    expect(correctionStatus({ ...base, completed_at: "2026-01-15T00:00:00Z" })).toBe("completed");
    expect(isCorrectionOverdue({ ...base, completed_at: "2026-02-15T00:00:00Z" }, new Date("2026-02-01"))).toBe(false);
    expect(correctionStatus({ ...base, completed_at: "2026-01-15T00:00:00Z", accepted_at: "2026-01-16T00:00:00Z" })).toBe("accepted");
    expect(pendingCorrectionsCount([base, { ...base, id: "c2", accepted_at: "2026-01-16T00:00:00Z" }])).toBe(1);
  });
});

describe("project list filtering", () => {
  const rows: MyProjectRow[] = [
    { project_id: "p1", department_id: "d1", title: "A", state: "active", progress_percent: 50, at_risk: true, version: 3, roles: ["student"], updated_at: "2026-01-01" },
    { project_id: "p2", department_id: "d1", title: "B", state: "completed", progress_percent: 100, at_risk: false, version: 9, roles: ["coordinator"], updated_at: "2026-01-02" },
  ];

  test("filters by state and risk, groups by state", () => {
    expect(filterProjects(rows, { state: "active" }).map((r) => r.project_id)).toEqual(["p1"]);
    expect(filterProjects(rows, { atRiskOnly: true }).map((r) => r.project_id)).toEqual(["p1"]);
    expect(filterProjects(rows, { state: "all" })).toHaveLength(2);
    expect(groupProjectsByState(rows)).toEqual({ active: 1, completed: 1 });
  });
});

describe("event audit labels cover every event type emitted by the SQL drafts", () => {
  const SQL_EVENT_TYPES = [
    // merged foundation
    "proposal_submitted", "team_member_added", "milestone_set", "discussion_requested",
    "evaluation_finalized", "project_archived",
    // lifecycle completion
    "project_created", "faculty_assigned", "assignment_ended", "proposal_resubmitted",
    "proposal_review_started", "proposal_approved", "proposal_rejected", "proposal_revision_required",
    "project_activated", "deliverable_submitted", "submission_accepted", "submission_revision_required",
    "supervisor_note_added", "supervisor_note_resolved", "file_registered", "discussion_scheduled",
    "discussion_request_rejected", "panel_member_assigned", "discussion_held", "discussion_postponed",
    "discussion_cancelled", "evaluation_saved", "evaluation_submitted", "result_completed",
    "corrections_requested", "correction_completed", "correction_accepted",
  ];

  test("all SQL event types have Arabic labels and no orphan labels", () => {
    const foundation = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql", "utf8");
    const lifecycle = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql", "utf8");
    const sql = foundation + lifecycle;
    expect(SQL_EVENT_TYPES.length).toBe(33);
    for (const eventType of SQL_EVENT_TYPES) {
      expect(EVENT_LABELS[eventType], `missing label for ${eventType}`).toBeTruthy();
      expect(sql, `event ${eventType} not emitted by drafts`).toContain(`'${eventType}'`);
    }
    for (const key of Object.keys(EVENT_LABELS)) {
      expect(SQL_EVENT_TYPES, `orphan event label ${key}`).toContain(key);
    }
  });
});

describe("resolveViewerEvaluation — MEDIUM-1 viewer scoping (review 4982)", () => {
  const asg = (id: string, userId: string, active = true): AssignmentRow =>
    ({ id, role: "panel_member", active, user_id: userId }) as unknown as AssignmentRow;
  const pm = (id: string, assignmentId: string): PanelMemberRow =>
    ({ id, assignment_id: assignmentId }) as unknown as PanelMemberRow;
  const ev = (id: string, panelMemberId: string, state: string): EvaluationRow =>
    ({ id, panel_member_id: panelMemberId, state }) as unknown as EvaluationRow;

  test("viewer draft + another member finalized => the viewer's draft is selected (form stays visible)", () => {
    // Regression: the pre-fix derivation pooled every active panel_member
    // assignment, so the first matching evaluation below (another member's
    // finalized one) was mistaken for the viewer's and hid the score form.
    const detail = {
      assignments: [asg("a-viewer", "u-viewer"), asg("a-other", "u-other")],
      panel_members: [pm("pm-viewer", "a-viewer"), pm("pm-other", "a-other")],
      evaluations: [ev("e-other", "pm-other", "finalized"), ev("e-viewer", "pm-viewer", "draft")],
    };
    const own = resolveViewerEvaluation(detail, "u-viewer");
    expect(own?.id).toBe("e-viewer");
    expect(own?.state).toBe("draft"); // null/draft keeps the EvaluationPanel form visible
  });

  test("viewer without evaluation => null even when another member finalized", () => {
    const detail = {
      assignments: [asg("a-viewer", "u-viewer"), asg("a-other", "u-other")],
      panel_members: [pm("pm-viewer", "a-viewer"), pm("pm-other", "a-other")],
      evaluations: [ev("e-other", "pm-other", "finalized")],
    };
    expect(resolveViewerEvaluation(detail, "u-viewer")).toBeNull();
  });

  test("the viewer's own finalized evaluation is still surfaced (read-only)", () => {
    const detail = {
      assignments: [asg("a-viewer", "u-viewer"), asg("a-other", "u-other")],
      panel_members: [pm("pm-viewer", "a-viewer"), pm("pm-other", "a-other")],
      evaluations: [ev("e-other", "pm-other", "draft"), ev("e-viewer", "pm-viewer", "finalized")],
    };
    const own = resolveViewerEvaluation(detail, "u-viewer");
    expect(own?.id).toBe("e-viewer");
    expect(own?.state).toBe("finalized");
  });

  test("member-id resolution ignores other users and inactive assignments", () => {
    const detail = {
      assignments: [asg("a-viewer", "u-viewer"), asg("a-viewer-ended", "u-viewer", false), asg("a-other", "u-other")],
      panel_members: [pm("pm-viewer", "a-viewer"), pm("pm-ended", "a-viewer-ended"), pm("pm-other", "a-other")],
    };
    expect(resolveViewerPanelMemberIds(detail, "u-viewer")).toEqual(["pm-viewer"]);
  });
});
