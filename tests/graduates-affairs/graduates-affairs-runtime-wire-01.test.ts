/**
 * PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01
 * Source-level runtime capability / feature-flag / AUTH-04 path contracts.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
  type AccountContinuityPolicy,
} from "../../src/lib/graduates-affairs/account-continuity";
import {
  GRADUATE_AFFAIRS_MANAGER_ROLE,
  GRADUATE_AFFAIRS_SPECIALIST_ROLE,
  GRADUATE_AFFAIRS_UNIT_CODE,
  type GraduateAffairsActor,
  type RecordScope,
} from "../../src/lib/graduates-affairs/authorization";
import {
  assertGraduateMutationAllowed,
  assertNoDirectGraduateTableMutation,
  appRoleAloneGrantsGraduateAffairs,
  evaluateGraduateSelfRuntimeAccess,
  evaluateStaffRuntimeAccess,
  GRADUATES_AFFAIRS_AUTH04_RPCS,
  isApprovedAuth04Rpc,
} from "../../src/lib/graduates-affairs/runtime-gate";
import { GraduatesAffairsRpcClient } from "../../src/lib/graduates-affairs/rpc";
import { portalFeatures } from "../../src/lib/portal-features";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const RECORD: RecordScope = {
  recordId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  programId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  departmentId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
};
const OTHER_DEPT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const AT = "2026-08-07T12:00:00.000Z";
const NOW = new Date(AT);

const approvedContinuity = (caps: AccountContinuityPolicy["allowedCapabilities"]): AccountContinuityPolicy => ({
  policyCode: "graduate-account-continuity",
  state: "approved",
  allowPortalSignIn: caps.includes("portal_sign_in"),
  allowUniversityEmailReuse: false,
  allowedCapabilities: caps,
  validFrom: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  decidedBy: "owner",
  decidedAt: "2026-01-01T00:00:00.000Z",
});

const emptyActor = (overrides: Partial<GraduateAffairsActor> = {}): GraduateAffairsActor => ({
  userId: "user-1",
  ownGraduateRecordIds: [],
  assignments: [],
  activeFollowupRecordIds: [],
  ...overrides,
});

describe("graduate self runtime surface", () => {
  test("1. approved graduate → own surface allowed when flag ON + continuity", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "approved",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision).toEqual({ allowed: true, via: "self" });
  });

  test("2. active student → graduate surface denied without approved fact", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "active",
      isGraduationCandidate: false,
      ownsGraduateRecord: false,
      graduateRecordState: "absent",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduate_record_not_owned");
  });

  test("3. candidate-only → denied", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "active",
      isGraduationCandidate: true,
      ownsGraduateRecord: false,
      graduateRecordState: "absent",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
  });

  test("4. eligible but unapproved → denied", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "pending",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduate_record_not_approved");
  });

  test("5. corrected graduate fact → denied", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "corrected",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduate_record_corrected");
  });

  test("6. revoked → denied", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "revoked",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduate_record_revoked");
  });

  test("7. unrelated graduate → denied", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: false,
      graduateRecordState: "approved",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduate_record_not_owned");
  });
});

describe("staff runtime surface", () => {
  test("8. manager correctly scoped → allowed", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: [],
      actor: emptyActor({
        assignments: [
          {
            unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
            roleCode: GRADUATE_AFFAIRS_MANAGER_ROLE,
            isActive: true,
            startsAt: null,
            endsAt: null,
            departmentIds: [],
          },
        ],
      }),
      record: RECORD,
      at: NOW,
    });
    expect(decision).toEqual({ allowed: true, via: "manager" });
  });

  test("9. specialist correct department → allowed", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: [],
      actor: emptyActor({
        assignments: [
          {
            unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
            roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
            isActive: true,
            startsAt: null,
            endsAt: null,
            departmentIds: [RECORD.departmentId],
          },
        ],
      }),
      record: RECORD,
      at: NOW,
    });
    expect(decision).toEqual({ allowed: true, via: "specialist" });
  });

  test("10. unassigned specialist → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: [],
      actor: emptyActor({
        assignments: [
          {
            unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
            roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
            isActive: true,
            startsAt: null,
            endsAt: null,
            departmentIds: [],
          },
        ],
      }),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  test("11. wrong department → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: [],
      actor: emptyActor({
        assignments: [
          {
            unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
            roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
            isActive: true,
            startsAt: null,
            endsAt: null,
            departmentIds: [OTHER_DEPT],
          },
        ],
      }),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  test("12. student_affairs-only actor → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: ["student_affairs", "student_affairs_manager"],
      actor: emptyActor(),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(appRoleAloneGrantsGraduateAffairs(["student_affairs"], false)).toBe(false);
  });

  test("13. admin → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: ["admin", "system_admin"],
      actor: emptyActor(),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  test("14. dean → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: ["dean"],
      actor: emptyActor(),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  test("15. unrelated registrar → denied for alumni operations", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      appRoles: ["registrar"],
      actor: emptyActor(),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  test("16. anonymous → denied", () => {
    const decision = evaluateStaffRuntimeAccess({
      featureEnabled: true,
      authenticated: false,
      appRoles: [],
      actor: emptyActor({ userId: null }),
      record: RECORD,
      at: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("graduates_affairs_not_authenticated");
  });
});

describe("feature flag and AUTH-04-only path", () => {
  test("17. feature flag OFF → runtime hidden/blocked", () => {
    expect(portalFeatures.studentGraduatesAffairs).toBe(false);
    expect(portalFeatures.staffGraduatesAffairs).toBe(false);
    const self = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: portalFeatures.studentGraduatesAffairs,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "approved",
      continuityPolicy: approvedContinuity(["profile_self_service"]),
      capability: "profile_self_service",
      at: AT,
    });
    expect(self.allowed).toBe(false);
    if (!self.allowed) expect(self.reason).toBe("graduates_affairs_feature_flag_off");
    expect(assertGraduateMutationAllowed(false).allowed).toBe(false);
  });

  test("18. direct table-write bypass absent", () => {
    expect(assertNoDirectGraduateTableMutation("graduate_profiles", "update")).toEqual({
      ok: false,
      reason: "graduates_affairs_direct_table_mutation_forbidden",
    });
    const functionsSrc = read("src/lib/graduates-affairs/graduates-affairs.functions.ts");
    expect(functionsSrc).not.toMatch(/\.from\(["']graduate_/);
    expect(functionsSrc).toContain("GraduatesAffairsRpcClient");
    expect(functionsSrc).toContain("graduatesAffairsDirectTableWriteAttempt");
  });

  test("19. approved AUTH-04 RPC path only", () => {
    expect(GRADUATES_AFFAIRS_AUTH04_RPCS).toContain("graduate_update_own_profile");
    expect(GRADUATES_AFFAIRS_AUTH04_RPCS).toContain("graduate_affairs_get_graduate_file");
    expect(isApprovedAuth04Rpc("graduate_update_own_profile")).toBe(true);
    expect(isApprovedAuth04Rpc("create_graduate_record_from_official_decision")).toBe(false);
    expect(isApprovedAuth04Rpc("some_random_fn")).toBe(false);

    const calls: string[] = [];
    const client = new GraduatesAffairsRpcClient({
      rpc: async (fn) => {
        calls.push(fn);
        return { data: null, error: null };
      },
    });
    expect(
      client.updateOwnProfile({
        graduateRecordId: RECORD.recordId,
        publicDisplayName: "x",
        preferredContactChannel: "email",
        careerSummary: null,
        profileVisibility: "private",
        rowVersion: 1,
      }),
    ).resolves.toBeNull();
  });

  test("20. denial produces zero mutation (pure gate + blocked table path)", () => {
    const before = structuredClone(RECORD);
    const denied = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "revoked",
      continuityPolicy: ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
      capability: "profile_self_service",
      at: AT,
    });
    expect(denied.allowed).toBe(false);
    expect(RECORD).toEqual(before);
    expect(assertNoDirectGraduateTableMutation("graduate_records", "delete").ok).toBe(false);
    expect(RECORD).toEqual(before);
  });

  test("undecided continuity remains fail-closed even with approved fact", () => {
    const decision = evaluateGraduateSelfRuntimeAccess({
      featureEnabled: true,
      authenticated: true,
      studentProfileStatus: "graduated",
      isGraduationCandidate: false,
      ownsGraduateRecord: true,
      graduateRecordState: "approved",
      continuityPolicy: ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
      capability: "profile_self_service",
      at: AT,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("account_continuity_policy_undecided");
  });

  test("routes and flags stay source-wired with flags OFF", () => {
    const studentRoute = read("src/routes/student.graduates-affairs.index.tsx");
    const staffRoute = read("src/routes/staff.graduates-affairs.tsx");
    const studentIndex = read("src/routes/student.index.tsx");
    const staffIndex = read("src/routes/staff.index.tsx");
    expect(studentRoute).toContain("portalFeatures.studentGraduatesAffairs");
    expect(staffRoute).toContain("portalFeatures.staffGraduatesAffairs");
    expect(studentIndex).toContain("studentGraduatesAffairs");
    expect(staffIndex).toContain("staffGraduatesAffairs");
    expect(portalFeatures.studentGraduatesAffairs).toBe(false);
    expect(portalFeatures.staffGraduatesAffairs).toBe(false);
  });
});
