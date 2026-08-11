import { describe, expect, test } from "bun:test";
import {
  evaluateRecordAccess,
  GRADUATE_AFFAIRS_MANAGER_ROLE,
  GRADUATE_AFFAIRS_SPECIALIST_ROLE,
  GRADUATE_AFFAIRS_UNIT_CODE,
  resolveStaffCapabilities,
  type GraduateAffairsActor,
  type GraduateAffairsAssignment,
  type RecordScope,
} from "../../src/lib/graduates-affairs/authorization";
import { dedupeDepartmentIds } from "../../src/lib/admin-people.functions";
import { allowsMultipleActiveAssignees } from "../../src/lib/admin-processing-assignments.functions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOW = new Date("2026-08-01T00:00:00Z");

const DEPT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const DEPT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const DEPT_C = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const DEPT_D = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

const RECORD_A: RecordScope = {
  recordId: "r1111111-1111-4111-8111-111111111111",
  programId: "p1111111-1111-4111-8111-111111111111",
  departmentId: DEPT_A,
};
const RECORD_B: RecordScope = { ...RECORD_A, recordId: "r2222222-2222-4222-8222-222222222222", departmentId: DEPT_B };
const RECORD_C: RecordScope = { ...RECORD_A, recordId: "r3333333-3333-4333-8333-333333333333", departmentId: DEPT_C };
const RECORD_D: RecordScope = { ...RECORD_A, recordId: "r4444444-4444-4444-8444-444444444444", departmentId: DEPT_D };

function specialist(
  departmentIds: readonly string[],
  overrides: Partial<GraduateAffairsAssignment> = {},
): GraduateAffairsAssignment {
  return {
    unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
    roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
    isActive: true,
    startsAt: null,
    endsAt: null,
    departmentIds,
    ...overrides,
  };
}

function actorFor(assignments: GraduateAffairsAssignment[]): GraduateAffairsActor {
  return {
    userId: "99999999-9999-4999-8999-999999999999",
    ownGraduateRecordIds: [],
    assignments,
    activeFollowupRecordIds: [],
  };
}

describe("GA generic many-to-many staff scope — CASE 1..10", () => {
  test("CASE 1: one specialist → one department", () => {
    const actor = actorFor([specialist([DEPT_A])]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW)).toEqual({ allowed: true, via: "specialist" });
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(false);
  });

  test("CASE 2: one specialist → multiple departments", () => {
    const actor = actorFor([specialist([DEPT_A, DEPT_B])]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_C, NOW).allowed).toBe(false);
  });

  test("CASE 3: multiple specialists → same department (disjoint actors)", () => {
    const s1 = actorFor([specialist([DEPT_A])]);
    const s2 = actorFor([specialist([DEPT_A])]);
    expect(evaluateRecordAccess(s1, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(s2, RECORD_A, NOW).allowed).toBe(true);
    expect(allowsMultipleActiveAssignees({ is_managerial: false })).toBe(true);
    expect(allowsMultipleActiveAssignees({ is_managerial: true })).toBe(false);
  });

  test("CASE 4: specialist A/B/C → department A/B/C", () => {
    const a = actorFor([specialist([DEPT_A])]);
    const b = actorFor([specialist([DEPT_B])]);
    const c = actorFor([specialist([DEPT_C])]);
    expect(evaluateRecordAccess(a, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(a, RECORD_B, NOW).allowed).toBe(false);
    expect(evaluateRecordAccess(b, RECORD_B, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(b, RECORD_A, NOW).allowed).toBe(false);
    expect(evaluateRecordAccess(c, RECORD_C, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(c, RECORD_A, NOW).allowed).toBe(false);
  });

  test("CASE 5: college-wide operational specialist via explicit rows for every current dept", () => {
    const actor = actorFor([specialist([DEPT_A, DEPT_B, DEPT_C])]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_C, NOW).allowed).toBe(true);
    // Future department D is NOT included until explicitly bound.
    expect(evaluateRecordAccess(actor, RECORD_D, NOW).allowed).toBe(false);
  });

  test("CASE 6: new department created tomorrow → no silent grant", () => {
    const actor = actorFor([specialist([DEPT_A, DEPT_B])]);
    expect(resolveStaffCapabilities(actor, NOW).specialistDepartmentIds).toEqual(
      [DEPT_A, DEPT_B].toSorted(),
    );
    expect(evaluateRecordAccess(actor, RECORD_D, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("CASE 7: remove department binding → access lost immediately", () => {
    const before = actorFor([specialist([DEPT_A, DEPT_B])]);
    const after = actorFor([specialist([DEPT_A])]);
    expect(evaluateRecordAccess(before, RECORD_B, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(after, RECORD_B, NOW).allowed).toBe(false);
  });

  test("CASE 8: deactivate specialist assignment → access lost even if SPD rows remain", () => {
    const actor = actorFor([
      specialist([DEPT_A, DEPT_B], { isActive: false }),
    ]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(false);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(false);
  });

  test("CASE 9: change employee holding specialist role → no source-code change required", () => {
    // Same generic resolver; only assignment+SPD data changes.
    const previousHolder = actorFor([specialist([DEPT_A, DEPT_B, DEPT_C])]);
    const nextHolder = {
      ...actorFor([specialist([DEPT_A, DEPT_B, DEPT_C])]),
      userId: "88888888-8888-4888-8888-888888888888",
    };
    expect(evaluateRecordAccess(previousHolder, RECORD_A, NOW).via).toBe("specialist");
    expect(evaluateRecordAccess(nextHolder, RECORD_A, NOW).via).toBe("specialist");
    const src = readFileSync(
      join(import.meta.dir, "../../src/lib/graduates-affairs/authorization.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/صالح/);
    expect(src).not.toMatch(/saleh@/i);
    expect(src).not.toMatch(/aa4f5c16-c993-4af6-a6d4-59d9542c1a7f/);
  });

  test("CASE 10: multiple department rows → dedupe / no duplicate grants", () => {
    const deduped = dedupeDepartmentIds([DEPT_A, DEPT_B, DEPT_A, DEPT_B]);
    expect(deduped).toEqual([DEPT_A, DEPT_B].toSorted());
    const caps = resolveStaffCapabilities(
      actorFor([specialist([DEPT_A, DEPT_A, DEPT_B])]),
      NOW,
    );
    expect(caps.specialistDepartmentIds).toEqual([DEPT_A, DEPT_B].toSorted());
  });
});

describe("GA authorization matrix — config vs operational authority", () => {
  test("specialist / no department → DENY", () => {
    expect(evaluateRecordAccess(actorFor([specialist([])]), RECORD_A, NOW).allowed).toBe(false);
  });

  test("specialist / own department → ALLOW; other → DENY", () => {
    const actor = actorFor([specialist([DEPT_A])]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(false);
  });

  test("specialist / two departments → both ALLOW", () => {
    const actor = actorFor([specialist([DEPT_A, DEPT_B])]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(true);
  });

  test("manager → college scope", () => {
    const actor = actorFor([
      {
        unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
        roleCode: GRADUATE_AFFAIRS_MANAGER_ROLE,
        isActive: true,
        startsAt: null,
        endsAt: null,
        departmentIds: [],
      },
    ]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW)).toEqual({ allowed: true, via: "manager" });
    expect(evaluateRecordAccess(actor, RECORD_D, NOW)).toEqual({ allowed: true, via: "manager" });
  });

  test("admin / dean / registrar / system_admin alone → NO GA operational authority", () => {
    for (const roleCode of ["admin", "dean", "registrar", "system_admin"]) {
      const actor = actorFor([
        {
          unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
          roleCode,
          isActive: true,
          startsAt: null,
          endsAt: null,
          departmentIds: [DEPT_A],
        },
      ]);
      expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(false);
    }
  });

  test("department_scope='all' is never inferred from empty SPD (fail-closed)", () => {
    // UI/org flag is outside this helper; empty SPD always denies.
    const actor = actorFor([specialist([])]);
    expect(resolveStaffCapabilities(actor, NOW).specialistDepartmentIds).toEqual([]);
  });
});

describe("future department simulation (CASE K)", () => {
  test("S1 starts A+B; D appears; remains A+B only; then admin adds D", () => {
    let scope = [DEPT_A, DEPT_B];
    let actor = actorFor([specialist(scope)]);
    expect(evaluateRecordAccess(actor, RECORD_D, NOW).allowed).toBe(false);

    // Simulate admin setStaffDepartmentScope({ staffProfileId, departmentIds: A+B+D })
    scope = [DEPT_A, DEPT_B, DEPT_D];
    actor = actorFor([specialist(scope)]);
    expect(evaluateRecordAccess(actor, RECORD_A, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_B, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_D, NOW).allowed).toBe(true);
    expect(evaluateRecordAccess(actor, RECORD_C, NOW).allowed).toBe(false);
  });
});
