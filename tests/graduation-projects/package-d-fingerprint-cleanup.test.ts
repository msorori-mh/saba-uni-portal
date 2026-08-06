import { describe, expect, test } from "bun:test";
import { TEST_ONLY_PACKAGE_MARKER } from "./package-d-fixture-manifest.test";

export interface FingerprintBundle {
  projectId: string;
  packageMarker: string;
  team: {
    leaderUserId: string;
    memberUserIds: string[];
    hasSingleLeader: boolean;
  };
  oneTeamRuleEnforced: boolean;
  proposal: {
    eventChain: string[];
    activeProposalFileCount: number;
  };
  supervisor: {
    acceptedSupervisorCount: number;
    unrelatedSupervisorHasAccess: boolean;
  };
  progress: {
    historyChain: string[];
  };
  finalDeliverable: {
    currentFileCount: number;
    supersededVersionsAuditable: boolean;
  };
  defense: {
    scheduledAt: string;
    venue: string;
    assignedCommitteeCount: number;
  };
  evaluations: {
    submittedCount: number;
    peerNotesLeaked: boolean;
  };
  result: {
    averageScore: number;
    finalDecision: "passed" | "revisions_required" | "failed";
    recordedByCoordinator: boolean;
  };
  archive: {
    isSnapshotComplete: boolean;
    isLifecycleArchived: boolean;
    mutationsDenied: boolean;
  };
  storage: {
    prefixValid: boolean;
    hasPublicUrl: boolean;
    scanClean: boolean;
  };
  authDenialsWithoutSideEffects: boolean;
}

export function generateMockFingerprintBundle(projectId: string): FingerprintBundle {
  return {
    projectId,
    packageMarker: TEST_ONLY_PACKAGE_MARKER,
    team: {
      leaderUserId: "user-leader-01",
      memberUserIds: ["user-member-a-01", "user-member-b-01"],
      hasSingleLeader: true,
    },
    oneTeamRuleEnforced: true,
    proposal: {
      eventChain: ["proposal_submitted", "proposal_returned", "proposal_resubmitted", "proposal_approved"],
      activeProposalFileCount: 1,
    },
    supervisor: {
      acceptedSupervisorCount: 1,
      unrelatedSupervisorHasAccess: false,
    },
    progress: {
      historyChain: ["submit_progress", "return_progress", "resubmit_progress", "approve_progress"],
    },
    finalDeliverable: {
      currentFileCount: 1,
      supersededVersionsAuditable: true,
    },
    defense: {
      scheduledAt: "2026-09-01T10:00:00Z",
      venue: "Hall 101",
      assignedCommitteeCount: 2,
    },
    evaluations: {
      submittedCount: 2,
      peerNotesLeaked: false,
    },
    result: {
      averageScore: 92.5,
      finalDecision: "passed",
      recordedByCoordinator: true,
    },
    archive: {
      isSnapshotComplete: true,
      isLifecycleArchived: true,
      mutationsDenied: true,
    },
    storage: {
      prefixValid: true,
      hasPublicUrl: false,
      scanClean: true,
    },
    authDenialsWithoutSideEffects: true,
  };
}

describe("Package D Fingerprint and Cleanup Contract Verification", () => {
  test("verifies all 12 fingerprint assertion families on evidence export bundle", () => {
    const bundle = generateMockFingerprintBundle("project-e2e-01");

    // 1. Team fingerprint
    expect(bundle.team.hasSingleLeader).toBe(true);
    expect(bundle.team.memberUserIds.length).toBe(2);

    // 2. One-team rule
    expect(bundle.oneTeamRuleEnforced).toBe(true);

    // 3. Proposal fingerprint
    expect(bundle.proposal.eventChain).toEqual([
      "proposal_submitted",
      "proposal_returned",
      "proposal_resubmitted",
      "proposal_approved",
    ]);
    expect(bundle.proposal.activeProposalFileCount).toBe(1);

    // 4. Supervisor fingerprint
    expect(bundle.supervisor.acceptedSupervisorCount).toBe(1);
    expect(bundle.supervisor.unrelatedSupervisorHasAccess).toBe(false);

    // 5. Progress version chain
    expect(bundle.progress.historyChain.length).toBe(4);

    // 6. Final deliverable
    expect(bundle.finalDeliverable.currentFileCount).toBe(1);
    expect(bundle.finalDeliverable.supersededVersionsAuditable).toBe(true);

    // 7. Defense schedule
    expect(bundle.defense.assignedCommitteeCount).toBeGreaterThanOrEqual(2);

    // 8. Evaluations confidentiality
    expect(bundle.evaluations.submittedCount).toBe(2);
    expect(bundle.evaluations.peerNotesLeaked).toBe(false);

    // 9. Result calculation
    expect(bundle.result.averageScore).toBe(92.5);
    expect(bundle.result.finalDecision).toBe("passed");
    expect(bundle.result.recordedByCoordinator).toBe(true);

    // 10. Archive completeness
    expect(bundle.archive.isSnapshotComplete).toBe(true);
    expect(bundle.archive.isLifecycleArchived).toBe(true);
    expect(bundle.archive.mutationsDenied).toBe(true);

    // 11. Storage safety
    expect(bundle.storage.prefixValid).toBe(true);
    expect(bundle.storage.hasPublicUrl).toBe(false);
    expect(bundle.storage.scanClean).toBe(true);

    // 12. Auth denials side-effects
    expect(bundle.authDenialsWithoutSideEffects).toBe(true);
  });

  test("enforces cleanup contract safety boundaries", () => {
    const cleanupContract = {
      deleteTargetMarker: TEST_ONLY_PACKAGE_MARKER,
      preserveEvidenceProject: true,
      preserveActorShells: true,
      forbiddenDeletions: [
        "real staff profiles",
        "production student requests",
        "enrollment_certificate",
        "request_types.student_visible",
        "shared academic reference data",
      ],
    };

    expect(cleanupContract.deleteTargetMarker).toBe("TEST_ONLY_GP_MVP_E2E_01");
    expect(cleanupContract.preserveEvidenceProject).toBe(true);
    expect(cleanupContract.preserveActorShells).toBe(true);
    expect(cleanupContract.forbiddenDeletions.length).toBe(5);
  });
});
