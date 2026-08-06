import { describe, expect, test } from "bun:test";

export interface E2ESpecStep {
  stepIndex: number;
  name: string;
  actor: string;
  rpc: string;
  expectedStateBefore: string;
  expectedStateAfter: string;
  requiredPayloadKeys: string[];
}

export const E2E_HAPPY_PATH_SPEC: E2ESpecStep[] = [
  {
    stepIndex: 1,
    name: "Team Creation",
    actor: "GP_E2E_COORDINATOR",
    rpc: "create_graduation_project_team",
    expectedStateBefore: "none",
    expectedStateAfter: "draft",
    requiredPayloadKeys: ["department_id", "title", "leader_user_id"],
  },
  {
    stepIndex: 2,
    name: "Add Team Members",
    actor: "GP_E2E_LEADER",
    rpc: "add_graduation_project_team_member",
    expectedStateBefore: "draft",
    expectedStateAfter: "draft",
    requiredPayloadKeys: ["project_id", "user_id"],
  },
  {
    stepIndex: 3,
    name: "Upsert Proposal & Attach File",
    actor: "GP_E2E_LEADER",
    rpc: "submit_graduation_project_proposal",
    expectedStateBefore: "draft",
    expectedStateAfter: "submitted",
    requiredPayloadKeys: ["project_id", "title", "problem_statement", "objectives", "summary"],
  },
  {
    stepIndex: 4,
    name: "Coordinator Return Proposal",
    actor: "GP_E2E_COORDINATOR",
    rpc: "review_graduation_project_proposal",
    expectedStateBefore: "submitted",
    expectedStateAfter: "revision_required",
    requiredPayloadKeys: ["project_id", "decision", "comments"],
  },
  {
    stepIndex: 5,
    name: "Leader Correct & Resubmit Proposal",
    actor: "GP_E2E_LEADER",
    rpc: "resubmit_graduation_project_proposal",
    expectedStateBefore: "revision_required",
    expectedStateAfter: "submitted",
    requiredPayloadKeys: ["project_id"],
  },
  {
    stepIndex: 6,
    name: "Coordinator Accept Proposal",
    actor: "GP_E2E_COORDINATOR",
    rpc: "review_graduation_project_proposal",
    expectedStateBefore: "submitted",
    expectedStateAfter: "approved",
    requiredPayloadKeys: ["project_id", "decision"],
  },
  {
    stepIndex: 7,
    name: "Coordinator Assign Supervisor",
    actor: "GP_E2E_COORDINATOR",
    rpc: "assign_graduation_project_supervisor",
    expectedStateBefore: "approved",
    expectedStateAfter: "approved",
    requiredPayloadKeys: ["project_id", "supervisor_user_id"],
  },
  {
    stepIndex: 8,
    name: "Supervisor Accept Supervision",
    actor: "GP_E2E_SUPERVISOR",
    rpc: "respond_graduation_project_supervision",
    expectedStateBefore: "approved",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "response"],
  },
  {
    stepIndex: 9,
    name: "Submit Progress Update",
    actor: "GP_E2E_LEADER",
    rpc: "submit_graduation_project_progress",
    expectedStateBefore: "active",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "progress_text"],
  },
  {
    stepIndex: 10,
    name: "Supervisor Return Progress",
    actor: "GP_E2E_SUPERVISOR",
    rpc: "review_graduation_project_progress",
    expectedStateBefore: "active",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "outcome", "comments"],
  },
  {
    stepIndex: 11,
    name: "Leader Correct Progress",
    actor: "GP_E2E_LEADER",
    rpc: "submit_graduation_project_progress",
    expectedStateBefore: "active",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "progress_text"],
  },
  {
    stepIndex: 12,
    name: "Supervisor Approve Progress",
    actor: "GP_E2E_SUPERVISOR",
    rpc: "review_graduation_project_progress",
    expectedStateBefore: "active",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "outcome"],
  },
  {
    stepIndex: 13,
    name: "Final Upload & Supervisor Ready",
    actor: "GP_E2E_SUPERVISOR",
    rpc: "review_graduation_project_final",
    expectedStateBefore: "active",
    expectedStateAfter: "active",
    requiredPayloadKeys: ["project_id", "outcome"],
  },
  {
    stepIndex: 14,
    name: "Schedule Defense",
    actor: "GP_E2E_COORDINATOR",
    rpc: "schedule_graduation_project_defense",
    expectedStateBefore: "active",
    expectedStateAfter: "defense_scheduled",
    requiredPayloadKeys: ["project_id", "scheduled_at", "venue"],
  },
  {
    stepIndex: 15,
    name: "Assign Committee Members",
    actor: "GP_E2E_COORDINATOR",
    rpc: "assign_graduation_project_committee_member",
    expectedStateBefore: "defense_scheduled",
    expectedStateAfter: "defense_scheduled",
    requiredPayloadKeys: ["project_id", "committee_user_id"],
  },
  {
    stepIndex: 16,
    name: "Mark Defense Held",
    actor: "GP_E2E_COORDINATOR",
    rpc: "mark_graduation_project_defense_held",
    expectedStateBefore: "defense_scheduled",
    expectedStateAfter: "evaluating",
    requiredPayloadKeys: ["project_id"],
  },
  {
    stepIndex: 17,
    name: "Committee Evaluations",
    actor: "GP_E2E_COMMITTEE_1",
    rpc: "submit_graduation_project_evaluation",
    expectedStateBefore: "evaluating",
    expectedStateAfter: "evaluating",
    requiredPayloadKeys: ["project_id", "score", "notes"],
  },
  {
    stepIndex: 18,
    name: "Coordinator Conclude Final Decision (Passed)",
    actor: "GP_E2E_COORDINATOR",
    rpc: "conclude_graduation_project_result",
    expectedStateBefore: "evaluating",
    expectedStateAfter: "evaluating",
    requiredPayloadKeys: ["project_id", "final_decision"],
  },
  {
    stepIndex: 19,
    name: "Coordinator Archive Project",
    actor: "GP_E2E_COORDINATOR",
    rpc: "archive_graduation_project",
    expectedStateBefore: "evaluating",
    expectedStateAfter: "archived",
    requiredPayloadKeys: ["project_id"],
  },
  {
    stepIndex: 20,
    name: "Fingerprint Export & Artifact Cleanup",
    actor: "GP_E2E_COORDINATOR",
    rpc: "cleanup_graduation_project_test_artifacts",
    expectedStateBefore: "archived",
    expectedStateAfter: "archived",
    requiredPayloadKeys: ["package_marker"],
  },
];

describe("Package D Full E2E Journey Specification", () => {
  test("specifies complete 20-step happy path in exact binding order", () => {
    expect(E2E_HAPPY_PATH_SPEC.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(E2E_HAPPY_PATH_SPEC[i].stepIndex).toBe(i + 1);
    }
  });

  test("verifies key lifecycle transitions across 20 steps", () => {
    expect(E2E_HAPPY_PATH_SPEC[0].expectedStateAfter).toBe("draft");
    expect(E2E_HAPPY_PATH_SPEC[2].expectedStateAfter).toBe("submitted");
    expect(E2E_HAPPY_PATH_SPEC[3].expectedStateAfter).toBe("revision_required");
    expect(E2E_HAPPY_PATH_SPEC[4].expectedStateAfter).toBe("submitted");
    expect(E2E_HAPPY_PATH_SPEC[5].expectedStateAfter).toBe("approved");
    expect(E2E_HAPPY_PATH_SPEC[7].expectedStateAfter).toBe("active");
    expect(E2E_HAPPY_PATH_SPEC[13].expectedStateAfter).toBe("defense_scheduled");
    expect(E2E_HAPPY_PATH_SPEC[15].expectedStateAfter).toBe("evaluating");
    expect(E2E_HAPPY_PATH_SPEC[18].expectedStateAfter).toBe("archived");
  });

  test("specifies revisions_required correction branch contract", () => {
    const revisionsBranch = {
      initialDecision: "revisions_required",
      nextActions: [
        "leader uploads corrected current final file",
        "supervisor marks final ready",
        "coordinator re-decides passed",
        "coordinator archives project",
      ],
    };
    expect(revisionsBranch.initialDecision).toBe("revisions_required");
    expect(revisionsBranch.nextActions.length).toBe(4);
  });

  test("specifies failed terminal branch contract", () => {
    const failedProposalBranch = {
      phase: "proposal",
      action: "coordinator reject proposal",
      terminalState: "rejected",
    };

    const failedDefenseBranch = {
      phase: "defense",
      action: "coordinator conclude final_decision = failed",
      terminalState: "archived",
    };

    expect(failedProposalBranch.terminalState).toBe("rejected");
    expect(failedDefenseBranch.terminalState).toBe("archived");
  });
});
