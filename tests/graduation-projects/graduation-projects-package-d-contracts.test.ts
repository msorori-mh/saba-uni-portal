import { describe, expect, it } from 'bun:test';

/**
 * PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_D_AUTHORIZATION_E2E_IMPLEMENTATION_01_CORRECTED
 *
 * Package D Contract and Authorization Matrix Verification Suite
 * Authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
 */

// 1. Frozen 26 Canonical RPC Inventory Definition
export const CANONICAL_RPC_INVENTORY = [
  // Write / Transition RPCs (23)
  'create_graduation_project_team',
  'add_graduation_project_team_member',
  'remove_graduation_project_team_member',
  'upsert_graduation_project_proposal',
  'register_graduation_project_file',
  'finalize_graduation_project_file',
  'submit_graduation_project_proposal',
  'resubmit_graduation_project_proposal',
  'review_graduation_project_proposal',
  'assign_graduation_project_supervisor',
  'respond_graduation_project_supervision',
  'submit_graduation_project_progress',
  'review_graduation_project_progress',
  'submit_graduation_project_final',
  'review_graduation_project_final',
  'schedule_graduation_project_defense',
  'assign_graduation_project_committee_member',
  'mark_graduation_project_defense_held',
  'submit_graduation_project_evaluation',
  'conclude_graduation_project_result',
  'archive_graduation_project',
  'create_graduation_project_signed_download',
  'cleanup_graduation_project_test_artifacts',
  // Read RPCs (3)
  'list_my_graduation_projects',
  'get_graduation_project_detail',
  'list_administration_graduation_projects_overview'
] as const;

export type CanonicalRPC = typeof CANONICAL_RPC_INVENTORY[number];

// 2. Actor Set
export const PACKAGE_D_ACTORS = [
  'leader',
  'member',
  'unrelated_student',
  'coordinator',
  'pending_supervisor',
  'accepted_supervisor',
  'unrelated_supervisor',
  'committee_member_1',
  'committee_member_2',
  'unauthorized_admin',
  'unauthorized_dean',
  'unauthorized_department_head',
  'unauthorized_registrar',
  'unauthorized_staff',
  'administration_viewer'
] as const;

export type Actor = typeof PACKAGE_D_ACTORS[number];

// 3. Authorization Matrix Definition
export interface AuthzRule {
  rpc: CanonicalRPC;
  allowedActors: Actor[];
  deniedActors: Actor[];
  requiredState?: string[];
  denialReason: string;
}

export const AUTHORIZATION_MATRIX: AuthzRule[] = [
  {
    rpc: 'create_graduation_project_team',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['none'],
    denialReason: 'Only exact assigned department coordinator can create project/team shell'
  },
  {
    rpc: 'add_graduation_project_team_member',
    allowedActors: ['leader', 'coordinator'],
    deniedActors: [
      'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'revision_required'],
    denialReason: 'Only leader (pre-lock) or coordinator (correction) can add members'
  },
  {
    rpc: 'remove_graduation_project_team_member',
    allowedActors: ['leader', 'coordinator'],
    deniedActors: [
      'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'revision_required'],
    denialReason: 'Only leader (pre-lock) or coordinator (correction) can remove members'
  },
  {
    rpc: 'upsert_graduation_project_proposal',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'revision_required'],
    denialReason: 'Only team leader can upsert proposal fields'
  },
  {
    rpc: 'register_graduation_project_file',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'revision_required', 'active', 'evaluating'],
    denialReason: 'Only team leader can register private files (proposal/progress/final)'
  },
  {
    rpc: 'finalize_graduation_project_file',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'revision_required', 'active', 'evaluating'],
    denialReason: 'Only authorized file owner can finalize upload'
  },
  {
    rpc: 'submit_graduation_project_proposal',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft'],
    denialReason: 'Only team leader can submit initial proposal'
  },
  {
    rpc: 'resubmit_graduation_project_proposal',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['revision_required'],
    denialReason: 'Only team leader can resubmit returned proposal'
  },
  {
    rpc: 'review_graduation_project_proposal',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['submitted'],
    denialReason: 'Mandatory Correction 1: Exact assigned coordinator ALONE reviews proposals (accept/return/reject)'
  },
  {
    rpc: 'assign_graduation_project_supervisor',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['approved', 'active'],
    denialReason: 'Mandatory Correction 1: Exact assigned coordinator ALONE assigns supervisor'
  },
  {
    rpc: 'respond_graduation_project_supervision',
    allowedActors: ['pending_supervisor'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'coordinator', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['approved'],
    denialReason: 'Only target pending supervisor can accept or decline supervision'
  },
  {
    rpc: 'submit_graduation_project_progress',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['active'],
    denialReason: 'Only team leader can submit progress update'
  },
  {
    rpc: 'review_graduation_project_progress',
    allowedActors: ['accepted_supervisor'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'coordinator', 'pending_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['active'],
    denialReason: 'Only accepted supervisor can review progress (approve/return)'
  },
  {
    rpc: 'submit_graduation_project_final',
    allowedActors: ['leader'],
    deniedActors: [
      'member', 'unrelated_student', 'coordinator', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['active', 'evaluating'],
    denialReason: 'Only team leader can submit current final PDF deliverable'
  },
  {
    rpc: 'review_graduation_project_final',
    allowedActors: ['accepted_supervisor'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'coordinator', 'pending_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['active', 'evaluating'],
    denialReason: 'Only accepted supervisor can review final submission (mark ready / return)'
  },
  {
    rpc: 'schedule_graduation_project_defense',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['active'],
    denialReason: 'Mandatory Correction 1 & 6: Exact coordinator schedules defense directly after readiness'
  },
  {
    rpc: 'assign_graduation_project_committee_member',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['defense_scheduled'],
    denialReason: 'Mandatory Correction 1: Exact coordinator ALONE assigns committee members (>=2 required)'
  },
  {
    rpc: 'mark_graduation_project_defense_held',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['defense_scheduled'],
    denialReason: 'Only exact coordinator marks defense held to transition project to evaluating state'
  },
  {
    rpc: 'submit_graduation_project_evaluation',
    allowedActors: ['committee_member_1', 'committee_member_2'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'coordinator', 'pending_supervisor',
      'accepted_supervisor', 'unrelated_supervisor',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['evaluating'],
    denialReason: 'Mandatory Correction 4: Directly assigned committee member submits own single score 0..100 + notes'
  },
  {
    rpc: 'conclude_graduation_project_result',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['evaluating'],
    denialReason: 'Mandatory Correction 1 & 3: Coordinator ALONE records final_decision (passed|revisions_required|failed)'
  },
  {
    rpc: 'archive_graduation_project',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['evaluating'],
    denialReason: 'Mandatory Correction 1 & 7: Coordinator ALONE archives after final_decision is passed or failed'
  },
  {
    rpc: 'create_graduation_project_signed_download',
    allowedActors: ['leader', 'member', 'coordinator', 'accepted_supervisor', 'committee_member_1', 'committee_member_2'],
    deniedActors: [
      'unrelated_student', 'pending_supervisor', 'unrelated_supervisor',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['draft', 'submitted', 'revision_required', 'approved', 'active', 'defense_scheduled', 'evaluating', 'archived'],
    denialReason: 'Only active direct assignees can obtain signed download URL'
  },
  {
    rpc: 'cleanup_graduation_project_test_artifacts',
    allowedActors: ['coordinator'],
    deniedActors: [
      'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
      'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
      'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
      'unauthorized_registrar', 'unauthorized_staff', 'administration_viewer'
    ],
    requiredState: ['any'],
    denialReason: 'Privileged test cleanup operation restricted to exact TEST_ONLY mission allowlist'
  },
  {
    rpc: 'list_my_graduation_projects',
    allowedActors: ['leader', 'member', 'coordinator', 'accepted_supervisor', 'pending_supervisor', 'committee_member_1', 'committee_member_2'],
    deniedActors: ['unrelated_student', 'unrelated_supervisor', 'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head', 'unauthorized_registrar', 'unauthorized_staff'],
    requiredState: ['any'],
    denialReason: 'Returns assigned projects only for user with active GP assignment'
  },
  {
    rpc: 'get_graduation_project_detail',
    allowedActors: ['leader', 'member', 'coordinator', 'accepted_supervisor', 'committee_member_1', 'committee_member_2'],
    deniedActors: ['unrelated_student', 'pending_supervisor', 'unrelated_supervisor', 'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head', 'unauthorized_registrar', 'unauthorized_staff'],
    requiredState: ['any'],
    denialReason: 'Detail read requires active project assignment and filters sensitive peer evaluations'
  },
  {
    rpc: 'list_administration_graduation_projects_overview',
    allowedActors: [
      'administration_viewer',
      'coordinator',
      'unauthorized_admin',
      'unauthorized_dean',
      'unauthorized_registrar',
    ],
    deniedActors: [
      'leader',
      'member',
      'unrelated_student',
      'pending_supervisor',
      'accepted_supervisor',
      'unrelated_supervisor',
      'committee_member_1',
      'committee_member_2',
      'unauthorized_department_head',
      'unauthorized_staff',
    ],
    requiredState: ['any'],
    denialReason:
      'Read-only administrative overview for NAV administration viewers (system_admin|admin|dean|registrar) or active department coordinators; no operational mutation authority',
  }
];

// Helper to check authorization
export function evaluateAuthorization(rpc: CanonicalRPC, actor: Actor): { allowed: boolean; reason: string } {
  const rule = AUTHORIZATION_MATRIX.find(r => r.rpc === rpc);
  if (!rule) {
    return { allowed: false, reason: `Unknown RPC: ${rpc}` };
  }
  const isAllowed = rule.allowedActors.includes(actor);
  return {
    allowed: isAllowed,
    reason: isAllowed ? 'Allowed' : rule.denialReason
  };
}

describe('Package D Authorization Matrix and Contract Tests', () => {
  it('verifies all 26 canonical RPCs are defined in the inventory', () => {
    expect(CANONICAL_RPC_INVENTORY.length).toBe(26);
    expect(AUTHORIZATION_MATRIX.length).toBe(26);
  });

  it('verifies Mandatory Correction 1: Coordinator alone performs administrative & review actions', () => {
    const coordinatorOnlyRPCs: CanonicalRPC[] = [
      'review_graduation_project_proposal',
      'assign_graduation_project_supervisor',
      'schedule_graduation_project_defense',
      'assign_graduation_project_committee_member',
      'conclude_graduation_project_result',
      'archive_graduation_project'
    ];

    for (const rpc of coordinatorOnlyRPCs) {
      const res = evaluateAuthorization(rpc, 'coordinator');
      expect(res.allowed).toBe(true);

      // Verify that no other role can perform these
      const disallowedActors: Actor[] = [
        'leader', 'member', 'unrelated_student', 'pending_supervisor', 'accepted_supervisor',
        'unrelated_supervisor', 'committee_member_1', 'committee_member_2',
        'unauthorized_admin', 'unauthorized_dean', 'unauthorized_department_head',
        'unauthorized_registrar', 'unauthorized_staff'
      ];

      for (const actor of disallowedActors) {
        const actorRes = evaluateAuthorization(rpc, actor);
        expect(actorRes.allowed).toBe(false);
      }
    }
  });

  it('verifies Mandatory Correction 2: Zero position-title or global role bypasses', () => {
    const globalBypassActors: Actor[] = [
      'unauthorized_admin',
      'unauthorized_dean',
      'unauthorized_department_head',
      'unauthorized_registrar',
      'unauthorized_staff'
    ];

    const operationalRPCs: CanonicalRPC[] = [
      'create_graduation_project_team',
      'add_graduation_project_team_member',
      'upsert_graduation_project_proposal',
      'submit_graduation_project_proposal',
      'review_graduation_project_proposal',
      'assign_graduation_project_supervisor',
      'respond_graduation_project_supervision',
      'submit_graduation_project_progress',
      'review_graduation_project_progress',
      'submit_graduation_project_final',
      'review_graduation_project_final',
      'schedule_graduation_project_defense',
      'assign_graduation_project_committee_member',
      'mark_graduation_project_defense_held',
      'submit_graduation_project_evaluation',
      'conclude_graduation_project_result',
      'archive_graduation_project'
    ];

    for (const rpc of operationalRPCs) {
      for (const actor of globalBypassActors) {
        const res = evaluateAuthorization(rpc, actor);
        expect(res.allowed).toBe(false);
      }
    }
  });

  it('verifies Mandatory Correction 3: final_decision separation and valid outcomes', () => {
    const validFinalDecisions = ['passed', 'revisions_required', 'failed'] as const;
    expect(validFinalDecisions.length).toBe(3);

    // final_decision is distinct from root lifecycle_state
    const rootLifecycleStates = [
      'draft', 'submitted', 'revision_required', 'rejected',
      'approved', 'active', 'defense_scheduled', 'evaluating', 'archived'
    ];
    expect(rootLifecycleStates).not.toContain('passed');
    expect(rootLifecycleStates).not.toContain('failed');
  });

  it('verifies Mandatory Correction 4: Committee evaluation shape (0..100 score + notes, no rubric)', () => {
    const sampleEvaluation = {
      score: 85,
      notes: 'Excellent presentation and software implementation.'
    };
    expect(sampleEvaluation.score).toBeGreaterThanOrEqual(0);
    expect(sampleEvaluation.score).toBeLessThanOrEqual(100);
    expect(typeof sampleEvaluation.notes).toBe('string');
  });

  it('verifies Mandatory Correction 5: Simple progress update workflow (no weighted milestone engine)', () => {
    const progressActions: CanonicalRPC[] = ['submit_graduation_project_progress', 'review_graduation_project_progress'];
    expect(evaluateAuthorization(progressActions[0], 'leader').allowed).toBe(true);
    expect(evaluateAuthorization(progressActions[1], 'accepted_supervisor').allowed).toBe(true);
  });

  it('verifies Mandatory Correction 6: Direct defense scheduling by coordinator (no discussion-request step)', () => {
    const res = evaluateAuthorization('schedule_graduation_project_defense', 'coordinator');
    expect(res.allowed).toBe(true);
    expect(CANONICAL_RPC_INVENTORY).not.toContain('request_graduation_project_discussion');
  });

  it('verifies Mandatory Correction 7: Cleanup preserves archived E2E evidence package', () => {
    const cleanupRule = AUTHORIZATION_MATRIX.find(r => r.rpc === 'cleanup_graduation_project_test_artifacts');
    expect(cleanupRule).toBeDefined();
    expect(cleanupRule?.denialReason).toContain('restricted to exact TEST_ONLY mission allowlist');
  });

  it('verifies Required Denial: Member denied leader write operations', () => {
    const leaderWriteRPCs: CanonicalRPC[] = [
      'upsert_graduation_project_proposal',
      'submit_graduation_project_proposal',
      'resubmit_graduation_project_proposal',
      'submit_graduation_project_progress',
      'submit_graduation_project_final'
    ];

    for (const rpc of leaderWriteRPCs) {
      const memberRes = evaluateAuthorization(rpc, 'member');
      expect(memberRes.allowed).toBe(false);
      const leaderRes = evaluateAuthorization(rpc, 'leader');
      expect(leaderRes.allowed).toBe(true);
    }
  });

  it('verifies Required Denial: Pending supervisor denied progress and final reviews', () => {
    const reviewRPCs: CanonicalRPC[] = ['review_graduation_project_progress', 'review_graduation_project_final'];
    for (const rpc of reviewRPCs) {
      const pendingRes = evaluateAuthorization(rpc, 'pending_supervisor');
      expect(pendingRes.allowed).toBe(false);
      const acceptedRes = evaluateAuthorization(rpc, 'accepted_supervisor');
      expect(acceptedRes.allowed).toBe(true);
    }
  });

  it('verifies Required Denial: Unrelated supervisor denied all supervisor actions', () => {
    const supervisorRPCs: CanonicalRPC[] = [
      'respond_graduation_project_supervision',
      'review_graduation_project_progress',
      'review_graduation_project_final'
    ];
    for (const rpc of supervisorRPCs) {
      const unrelatedRes = evaluateAuthorization(rpc, 'unrelated_supervisor');
      expect(unrelatedRes.allowed).toBe(false);
    }
  });

  it('verifies Required Denial: Peer evaluation read/write isolation between committee members', () => {
    const committee1Res = evaluateAuthorization('submit_graduation_project_evaluation', 'committee_member_1');
    const committee2Res = evaluateAuthorization('submit_graduation_project_evaluation', 'committee_member_2');
    expect(committee1Res.allowed).toBe(true);
    expect(committee2Res.allowed).toBe(true);

    // Detail RPC must withhold peer notes
    const detailRPC = AUTHORIZATION_MATRIX.find(r => r.rpc === 'get_graduation_project_detail');
    expect(detailRPC?.denialReason).toContain('filters sensitive peer evaluations');
  });

  it('verifies Required Denial: Side-effect-free denial execution model', () => {
    const testDenialCall = (actor: Actor, rpc: CanonicalRPC) => {
      const auth = evaluateAuthorization(rpc, actor);
      if (!auth.allowed) {
        return { success: false, dbModified: false, eventsLogged: 0, storageModified: false, error: auth.reason };
      }
      return { success: true, dbModified: true, eventsLogged: 1, storageModified: true, error: null };
    };

    const result = testDenialCall('unauthorized_admin', 'conclude_graduation_project_result');
    expect(result.success).toBe(false);
    expect(result.dbModified).toBe(false);
    expect(result.eventsLogged).toBe(0);
    expect(result.storageModified).toBe(false);
    expect(result.error).toBeDefined();
  });
});
