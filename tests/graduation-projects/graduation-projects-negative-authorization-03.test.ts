import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  authorizeProjectAction,
  isValidTransition,
  PROJECT_STATES,
  type ProjectAction,
  type ProjectAuthority,
  type ProjectRole,
  type ProjectScope,
  type ProjectState,
} from "../../src/lib/graduation-projects/domain";
import {
  availableProjectActions,
  isFileObjectAccessible,
  type GraduationProjectDetail,
} from "../../src/lib/graduation-projects/lifecycle";
import { applyPortalPrivacy } from "../../src/lib/graduation-projects/portal-privacy";

/**
 * Negative authorization contract for the graduation-projects slice.
 * The security-definer RPCs remain the authorization authority; these tests
 * pin the fail-closed behaviour of the exported client-side mirrors and the
 * direct-RPC-misuse guards, so a future refactor cannot silently open a hole.
 */

const PROJECT: ProjectScope = { id: "p-1", departmentId: "dept-a", state: "active" };

function authority(overrides: Partial<ProjectAuthority>): ProjectAuthority {
  return {
    actorId: "u-1",
    role: "student",
    departmentId: "dept-a",
    projectId: "p-1",
    active: true,
    directlyAssigned: true,
    ...overrides,
  };
}

const ALL_WRITE_ACTIONS: ProjectAction[] = [
  "edit_proposal", "manage_team", "approve_proposal", "manage_milestones",
  "submit_deliverable", "comment", "request_discussion", "schedule_discussion",
  "evaluate", "approve_result", "archive",
];

const TERMINAL_STATES: ProjectState[] = ["completed", "archived", "rejected", "cancelled"];

describe("authorizeProjectAction — ownership and team walls", () => {
  test("positive control: the assigned student owner can write on their own project", () => {
    const owner = authority({ role: "student" });
    expect(authorizeProjectAction(owner, PROJECT, "edit_proposal")).toBe(true);
    expect(authorizeProjectAction(owner, PROJECT, "submit_deliverable")).toBe(true);
    expect(authorizeProjectAction(owner, PROJECT, "manage_team")).toBe(true);
  });

  test("non-owner student (authority bound to a different projectId) is denied every write", () => {
    const intruder = authority({ role: "student", projectId: "p-2", actorId: "u-2" });
    for (const action of ALL_WRITE_ACTIONS) {
      expect(authorizeProjectAction(intruder, PROJECT, action), action).toBe(false);
    }
  });

  test("student without a direct assignment (fail-closed flag) is denied", () => {
    const unassigned = authority({ role: "student", directlyAssigned: false });
    for (const action of ALL_WRITE_ACTIONS) {
      expect(authorizeProjectAction(unassigned, PROJECT, action), action).toBe(false);
    }
    expect(authorizeProjectAction(unassigned, PROJECT, "read")).toBe(false);
  });

  test("unrelated faculty member (no assignment on this project) is denied", () => {
    const unrelated = authority({ role: "supervisor", actorId: "u-9", projectId: undefined });
    expect(authorizeProjectAction(unrelated, PROJECT, "comment")).toBe(false);
    expect(authorizeProjectAction(unrelated, PROJECT, "manage_milestones")).toBe(false);
    expect(authorizeProjectAction(unrelated, PROJECT, "read")).toBe(false);
  });

  test("supervisor assigned to a DIFFERENT project is denied on this project", () => {
    const otherProjectSupervisor = authority({ role: "supervisor", actorId: "u-3", projectId: "p-2" });
    expect(authorizeProjectAction(otherProjectSupervisor, PROJECT, "comment")).toBe(false);
    expect(authorizeProjectAction(otherProjectSupervisor, PROJECT, "manage_milestones")).toBe(false);
    expect(authorizeProjectAction(otherProjectSupervisor, PROJECT, "request_discussion")).toBe(false);
  });
});

describe("authorizeProjectAction — department isolation", () => {
  test("department head of another department is denied on this project", () => {
    const wrongHead = authority({ role: "department_head", actorId: "u-4", departmentId: "dept-b" });
    expect(authorizeProjectAction(wrongHead, PROJECT, "approve_proposal")).toBe(false);
    expect(authorizeProjectAction(wrongHead, PROJECT, "approve_result")).toBe(false);
    expect(authorizeProjectAction(wrongHead, PROJECT, "schedule_discussion")).toBe(false);
    expect(authorizeProjectAction(wrongHead, PROJECT, "read_report")).toBe(false);
  });

  test("coordinator scoped to another department is denied", () => {
    const wrongCoordinator = authority({ role: "coordinator", actorId: "u-5", departmentId: "dept-b" });
    expect(authorizeProjectAction(wrongCoordinator, PROJECT, "approve_proposal")).toBe(false);
    expect(authorizeProjectAction(wrongCoordinator, PROJECT, "manage_milestones")).toBe(false);
    expect(authorizeProjectAction(wrongCoordinator, PROJECT, "read_report")).toBe(false);
  });

  test("dean scoped to another department is denied", () => {
    const wrongDean = authority({ role: "dean", actorId: "u-6", departmentId: "dept-b" });
    expect(authorizeProjectAction(wrongDean, PROJECT, "archive")).toBe(false);
    expect(authorizeProjectAction(wrongDean, PROJECT, "approve_result")).toBe(false);
    expect(authorizeProjectAction(wrongDean, PROJECT, "read_report")).toBe(false);
  });

  test("positive control: same-department management roles keep their scope", () => {
    const head = authority({ role: "department_head" });
    expect(authorizeProjectAction(head, PROJECT, "approve_proposal")).toBe(true);
    expect(authorizeProjectAction(head, PROJECT, "read_report")).toBe(true);
  });
});

describe("authorizeProjectAction — fail-closed authority flags", () => {
  test("inactive authority is denied even with matching project and department", () => {
    const inactive = authority({ role: "supervisor", active: false });
    for (const action of [...ALL_WRITE_ACTIONS, "read"] as ProjectAction[]) {
      expect(authorizeProjectAction(inactive, PROJECT, action), action).toBe(false);
    }
  });

  test("null authority is denied everything", () => {
    for (const action of [...ALL_WRITE_ACTIONS, "read", "read_report"] as ProjectAction[]) {
      expect(authorizeProjectAction(null, PROJECT, action), action).toBe(false);
    }
  });

  test("authority with no department binding is denied on a departmental project", () => {
    const noDepartment = authority({ role: "coordinator", departmentId: undefined });
    expect(authorizeProjectAction(noDepartment, PROJECT, "approve_proposal")).toBe(false);
    expect(authorizeProjectAction(noDepartment, PROJECT, "read")).toBe(false);
  });
});

describe("authorizeProjectAction — role/action mismatch", () => {
  test("student can never approve proposals, evaluate, schedule, or archive", () => {
    const student = authority({ role: "student" });
    const denied: ProjectAction[] = [
      "approve_proposal", "evaluate", "schedule_discussion", "approve_result", "archive", "read_report",
    ];
    for (const state of PROJECT_STATES) {
      const project = { ...PROJECT, state };
      for (const action of denied) {
        expect(authorizeProjectAction(student, project, action), `${state}/${action}`).toBe(false);
      }
    }
  });

  test("supervisor cannot approve proposals or evaluate", () => {
    const supervisor = authority({ role: "supervisor" });
    expect(authorizeProjectAction(supervisor, PROJECT, "approve_proposal")).toBe(false);
    expect(authorizeProjectAction(supervisor, PROJECT, "evaluate")).toBe(false);
    expect(authorizeProjectAction(supervisor, PROJECT, "submit_deliverable")).toBe(false);
  });

  test("co_supervisor is read-only", () => {
    const coSupervisor = authority({ role: "co_supervisor" });
    expect(authorizeProjectAction(coSupervisor, PROJECT, "read")).toBe(true);
    for (const action of ALL_WRITE_ACTIONS) {
      expect(authorizeProjectAction(coSupervisor, PROJECT, action), action).toBe(false);
    }
  });

  test("panel_member cannot approve proposals or results", () => {
    const panel = authority({ role: "panel_member" });
    expect(authorizeProjectAction(panel, PROJECT, "approve_proposal")).toBe(false);
    expect(authorizeProjectAction(panel, PROJECT, "approve_result")).toBe(false);
    expect(authorizeProjectAction(panel, PROJECT, "archive")).toBe(false);
  });
});

describe("terminal states — write-frozen in both matrices", () => {
  test("authorizeProjectAction denies every write in terminal states but keeps reads", () => {
    const roles: ProjectRole[] = ["student", "supervisor", "coordinator", "department_head", "dean", "panel_member"];
    for (const state of TERMINAL_STATES) {
      const project = { ...PROJECT, state };
      for (const role of roles) {
        const actor = authority({ role });
        for (const action of ALL_WRITE_ACTIONS) {
          // Sole exception: the dean's archive handoff out of completed.
          if (state === "completed" && role === "dean" && action === "archive") continue;
          expect(authorizeProjectAction(actor, project, action), `${state}/${role}/${action}`).toBe(false);
        }
        expect(authorizeProjectAction(actor, project, "read"), `${state}/${role}/read`).toBe(true);
      }
    }
  });

  test("availableProjectActions offers no lifecycle write in archived/rejected/cancelled", () => {
    for (const state of ["archived", "rejected", "cancelled"] as ProjectState[]) {
      expect(availableProjectActions(["student"], state)).toEqual([]);
      expect(availableProjectActions(["supervisor"], state)).toEqual([]);
      expect(availableProjectActions(["panel_member"], state)).toEqual([]);
      // Managers keep only the state-independent base actions (create/view reports).
      for (const role of ["coordinator", "department_head"] as ProjectRole[]) {
        const actions = availableProjectActions([role], state);
        expect(actions, `${role}/${state}`).toEqual(["create_project", "view_reports"]);
      }
      expect(availableProjectActions(["dean"], state)).toEqual(["view_reports"]);
    }
  });
});

describe("illegal lifecycle ordering", () => {
  test("evaluate before discussion_scheduled is not offered by the UX matrix", () => {
    for (const state of ["draft", "submitted", "under_review", "approved", "active", "discussion_requested", "discussion_scheduled"] as ProjectState[]) {
      const actions = availableProjectActions(["panel_member"], state);
      expect(actions, state).not.toContain("save_evaluation");
      expect(actions, state).not.toContain("finalize_evaluation");
    }
    // Positive control: evaluation opens only in the evaluating state.
    expect(availableProjectActions(["panel_member"], "evaluating").sort())
      .toEqual(["finalize_evaluation", "save_evaluation"].sort());
  });

  test("state machine rejects jumping to evaluating before the discussion is scheduled", () => {
    expect(isValidTransition("active", "evaluating")).toBe(false);
    expect(isValidTransition("discussion_requested", "evaluating")).toBe(false);
    expect(isValidTransition("discussion_scheduled", "evaluating")).toBe(true);
  });

  test("archive before completed is not offered; the completed->archived handoff is", () => {
    for (const state of PROJECT_STATES) {
      if (state === "completed") continue;
      expect(availableProjectActions(["dean"], state), state).not.toContain("archive");
      expect(availableProjectActions(["department_head"], state), state).not.toContain("archive");
      if (state !== "archived") {
        expect(isValidTransition(state, "archived"), state).toBe(false);
      }
    }
    expect(availableProjectActions(["dean"], "completed")).toContain("archive");
    expect(availableProjectActions(["department_head"], "completed")).toContain("archive");
    expect(isValidTransition("completed", "archived")).toBe(true);
  });

  test("authorizeProjectAction allows the dean's archive handoff from completed (capability wall)", () => {
    // Regression: domain froze every write in "completed", which contradicted
    // the module's own transition map (completed -> archived), the lifecycle
    // matrix, and the archive RPC precondition. Only archive may leave a
    // frozen state; every other write stays denied (see terminal-state suite).
    const dean = authority({ role: "dean" });
    expect(authorizeProjectAction(dean, { ...PROJECT, state: "completed" }, "archive")).toBe(true);
    expect(authorizeProjectAction(dean, { ...PROJECT, state: "archived" }, "archive")).toBe(false);
  });

  test("authorizeProjectAction is capability-only: state ordering stays with the RPC authority", () => {
    // The domain function deliberately gates role x assignment x scope x
    // terminal freeze, NOT per-state action legality (mirrored by
    // availableProjectActions above and enforced by the security-definer RPCs).
    const panel = authority({ role: "panel_member" });
    expect(authorizeProjectAction(panel, PROJECT, "evaluate")).toBe(true);
    expect(availableProjectActions(["panel_member"], PROJECT.state)).not.toContain("save_evaluation");
  });

  test("approve_proposal by a student is denied in both matrices for every state", () => {
    const student = authority({ role: "student" });
    for (const state of PROJECT_STATES) {
      const project = { ...PROJECT, state };
      expect(authorizeProjectAction(student, project, "approve_proposal"), state).toBe(false);
      expect(availableProjectActions(["student"], state), state).not.toContain("approve_proposal");
    }
  });
});

/* ---------- portal privacy: student redaction vs staff visibility ---------- */

function makeDetail(overrides: Partial<GraduationProjectDetail>): GraduationProjectDetail {
  return {
    project: {
      id: "p-1",
      department_id: "dept-a",
      program_id: null,
      academic_year_id: null,
      semester_id: null,
      proposal_title: "مشروع اختبار",
      proposal_abstract: null,
      state: "evaluating",
      progress_percent: 80,
      at_risk: false,
      version: 3,
      approved_at: null,
      completed_at: null,
      archived_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    viewer_roles: ["student"],
    assignments: [],
    milestones: [],
    submissions: [],
    files: [
      {
        id: "f-1",
        submission_id: null,
        original_name: "final.pdf",
        media_type: "application/pdf",
        byte_size: 1024,
        scan_state: "clean",
        object_key: "graduation-projects/p-1/tok-final.pdf",
        uploaded_by_assignment_id: "a-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    notes: [],
    approvals: [],
    discussion_requests: [],
    discussions: [],
    panel_members: [],
    evaluations: [
      {
        id: "e-draft",
        discussion_id: "d-1",
        panel_member_id: "pm-1",
        rubric_version: "v1",
        state: "draft",
        total_score: 10,
        comments: null,
        submitted_at: null,
        finalized_at: null,
        scores: [],
      },
      {
        id: "e-submitted",
        discussion_id: "d-1",
        panel_member_id: "pm-2",
        rubric_version: "v1",
        state: "submitted",
        total_score: 20,
        comments: null,
        submitted_at: "2026-02-01T00:00:00.000Z",
        finalized_at: null,
        scores: [],
      },
      {
        id: "e-final",
        discussion_id: "d-1",
        panel_member_id: "pm-3",
        rubric_version: "v1",
        state: "finalized",
        total_score: 30,
        comments: "ممتاز",
        submitted_at: "2026-02-01T00:00:00.000Z",
        finalized_at: "2026-02-02T00:00:00.000Z",
        scores: [],
      },
    ],
    corrections: [],
    archive: {
      id: "ar-1",
      archived_at: "2026-03-01T00:00:00.000Z",
      approved_by_assignment_id: "a-9",
      final_file_id: "f-1",
      final_file_name: "final.pdf",
      final_file_object_key: "graduation-projects/p-1/tok-final.pdf",
    },
    events: [
      {
        id: 1,
        event_type: "evaluation_saved",
        entity_type: "evaluation",
        entity_id: "e-draft",
        actor_user_id: "u-secret",
        actor_assignment_id: "a-1",
        reason: null,
        payload: { note: "internal" },
        occurred_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("applyPortalPrivacy — student-only viewer", () => {
  test("no evaluations at all before a result state is reached", () => {
    const detail = makeDetail({ project: { ...makeDetail({}).project, state: "evaluating" } });
    const view = applyPortalPrivacy(detail, "u-student");
    expect(view.evaluations).toEqual([]);
  });

  test("only finalized evaluations survive in a result state", () => {
    const detail = makeDetail({ project: { ...makeDetail({}).project, state: "completed" } });
    const view = applyPortalPrivacy(detail, "u-student");
    expect(view.evaluations.map((evaluation) => evaluation.id)).toEqual(["e-final"]);
  });

  test("object keys, archive key, actor ids and event payloads are redacted", () => {
    const view = applyPortalPrivacy(makeDetail({}), "u-student");
    expect(view.files[0].object_key).toBeNull();
    expect(view.archive?.final_file_object_key).toBeNull();
    expect(view.events[0].actor_user_id).toBeNull();
    expect(view.events[0].payload).toBeNull();
  });

  test("positive control: a staff viewer sees drafts, keys and actor ids", () => {
    const detail = makeDetail({ viewer_roles: ["supervisor"] });
    const view = applyPortalPrivacy(detail, "u-supervisor");
    expect(view.evaluations.map((evaluation) => evaluation.id).sort())
      .toEqual(["e-draft", "e-final", "e-submitted"].sort());
    expect(view.files[0].object_key).toBe("graduation-projects/p-1/tok-final.pdf");
    expect(view.archive?.final_file_object_key).toBe("graduation-projects/p-1/tok-final.pdf");
    expect(view.events[0].actor_user_id).toBe("u-secret");
    expect(view.events[0].payload).toEqual({ note: "internal" });
  });
});

/* ---------- direct-RPC-misuse contract guards (source scans) ---------- */

const rpcSource = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");
const functionsSource = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");

describe("rpc client contract", () => {
  test("rpc.ts never touches tables directly (RPC-only surface)", () => {
    expect(rpcSource).not.toContain(".from(");
  });

  test("every write RPC call sends p_correlation_id (idempotent retries)", () => {
    const calls = [...rpcSource.matchAll(/this\.call<[^>]*>\(\s*"([a-z_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/g)];
    expect(calls.length).toBeGreaterThan(25);
    const writes = calls.filter((call) => !/^(get|list)_/.test(call[1]));
    expect(writes.length).toBeGreaterThanOrEqual(20);
    for (const write of writes) {
      expect(write[2], write[1]).toContain("p_correlation_id");
    }
  });
});

describe("server-function input contract", () => {
  test("no input validator accepts a client-supplied actor identity", () => {
    // Actor identity is derived from the authenticated session
    // (requireSupabaseAuth -> context.userId) and auth.uid() inside the RPCs.
    // Target profile ids (studentProfileId / facultyProfileId) are legitimate:
    // their user ids are re-derived server-side from the database before the
    // RPC call. Word boundaries keep the pattern from matching those longer
    // identifiers, so the assertion cannot false-positive on them.
    const segments = functionsSource
      .split(".inputValidator(")
      .slice(1)
      .map((segment) => segment.slice(0, segment.indexOf(".handler")));
    expect(segments.length).toBeGreaterThan(20);
    for (const segment of segments) {
      expect(segment).not.toMatch(/\b(actorId|actor_id|userId|user_id|uid)\b/);
    }
  });
});

describe("file access gate", () => {
  test("isFileObjectAccessible allows only the clean scan state", () => {
    expect(isFileObjectAccessible("clean")).toBe(true);
    for (const state of ["pending", "scanning", "infected", "quarantined", "failed", "rejected", "", "CLEAN", " clean"]) {
      expect(isFileObjectAccessible(state), JSON.stringify(state)).toBe(false);
    }
  });
});
