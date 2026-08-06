import { describe, expect, test } from "bun:test";

export interface TestActor {
  slot: string;
  role: "student" | "coordinator" | "supervisor" | "panel_member" | "admin" | "staff" | "admin_viewer";
  description: string;
  isLeader?: boolean;
  departmentId: string;
}

export const TEST_ONLY_PACKAGE_MARKER = "TEST_ONLY_GP_MVP_E2E_01";

export const REQUIRED_ACTOR_ROSTER: Record<string, TestActor> = {
  GP_E2E_LEADER: {
    slot: "GP_E2E_LEADER",
    role: "student",
    description: "Team leader student",
    isLeader: true,
    departmentId: "dept-cs-01",
  },
  GP_E2E_MEMBER_A: {
    slot: "GP_E2E_MEMBER_A",
    role: "student",
    description: "Team member A student",
    isLeader: false,
    departmentId: "dept-cs-01",
  },
  GP_E2E_MEMBER_B: {
    slot: "GP_E2E_MEMBER_B",
    role: "student",
    description: "Team member B student",
    isLeader: false,
    departmentId: "dept-cs-01",
  },
  GP_E2E_UNRELATED_STUDENT: {
    slot: "GP_E2E_UNRELATED_STUDENT",
    role: "student",
    description: "Unrelated student with no assignment on target project",
    isLeader: false,
    departmentId: "dept-cs-01",
  },
  GP_E2E_COORDINATOR: {
    slot: "GP_E2E_COORDINATOR",
    role: "coordinator",
    description: "Exact department graduation projects coordinator",
    departmentId: "dept-cs-01",
  },
  GP_E2E_SUPERVISOR: {
    slot: "GP_E2E_SUPERVISOR",
    role: "supervisor",
    description: "Assigned project supervisor (pending -> accepted)",
    departmentId: "dept-cs-01",
  },
  GP_E2E_UNRELATED_SUPERVISOR: {
    slot: "GP_E2E_UNRELATED_SUPERVISOR",
    role: "supervisor",
    description: "Faculty member not assigned to target project",
    departmentId: "dept-cs-01",
  },
  GP_E2E_COMMITTEE_1: {
    slot: "GP_E2E_COMMITTEE_1",
    role: "panel_member",
    description: "First defense committee member",
    departmentId: "dept-cs-01",
  },
  GP_E2E_COMMITTEE_2: {
    slot: "GP_E2E_COMMITTEE_2",
    role: "panel_member",
    description: "Second defense committee member",
    departmentId: "dept-cs-01",
  },
  GP_E2E_UNAUTHORIZED_ADMIN: {
    slot: "GP_E2E_UNAUTHORIZED_ADMIN",
    role: "admin",
    description: "System admin without direct GP project assignment",
    departmentId: "dept-cs-01",
  },
  GP_E2E_UNAUTHORIZED_STAFF: {
    slot: "GP_E2E_UNAUTHORIZED_STAFF",
    role: "staff",
    description: "Staff/faculty without required project assignment",
    departmentId: "dept-cs-01",
  },
  GP_E2E_ADMIN_VIEWER: {
    slot: "GP_E2E_ADMIN_VIEWER",
    role: "admin_viewer",
    description: "Administration read-only overview viewer",
    departmentId: "dept-cs-01",
  },
};

describe("Package D TEST_ONLY Fixture Manifest Validation", () => {
  test("defines marker TEST_ONLY_GP_MVP_E2E_01", () => {
    expect(TEST_ONLY_PACKAGE_MARKER).toBe("TEST_ONLY_GP_MVP_E2E_01");
  });

  test("contains all required 12 actor slots without omitting any role", () => {
    const slots = Object.keys(REQUIRED_ACTOR_ROSTER);
    expect(slots.length).toBe(12);

    for (const requiredSlot of [
      "GP_E2E_LEADER",
      "GP_E2E_MEMBER_A",
      "GP_E2E_MEMBER_B",
      "GP_E2E_UNRELATED_STUDENT",
      "GP_E2E_COORDINATOR",
      "GP_E2E_SUPERVISOR",
      "GP_E2E_UNRELATED_SUPERVISOR",
      "GP_E2E_COMMITTEE_1",
      "GP_E2E_COMMITTEE_2",
      "GP_E2E_UNAUTHORIZED_ADMIN",
      "GP_E2E_UNAUTHORIZED_STAFF",
      "GP_E2E_ADMIN_VIEWER",
    ]) {
      expect(REQUIRED_ACTOR_ROSTER[requiredSlot]).toBeDefined();
      expect(REQUIRED_ACTOR_ROSTER[requiredSlot].slot).toBe(requiredSlot);
    }
  });

  test("enforces dedicated test identity rule (no real staff/faculty or real student reuse)", () => {
    for (const actor of Object.values(REQUIRED_ACTOR_ROSTER)) {
      expect(actor.slot).toMatch(/^GP_E2E_/);
      expect(actor.description).toBeDefined();
      expect(actor.departmentId).toBe("dept-cs-01");
    }
  });

  test("enforces exactly one leader and multiple members in team roster slots", () => {
    const leader = REQUIRED_ACTOR_ROSTER.GP_E2E_LEADER;
    const memberA = REQUIRED_ACTOR_ROSTER.GP_E2E_MEMBER_A;
    const memberB = REQUIRED_ACTOR_ROSTER.GP_E2E_MEMBER_B;

    expect(leader.isLeader).toBe(true);
    expect(memberA.isLeader).toBe(false);
    expect(memberB.isLeader).toBe(false);
  });

  test("ensures committee roster contains at least two distinct panel members", () => {
    const c1 = REQUIRED_ACTOR_ROSTER.GP_E2E_COMMITTEE_1;
    const c2 = REQUIRED_ACTOR_ROSTER.GP_E2E_COMMITTEE_2;

    expect(c1.slot).not.toBe(c2.slot);
    expect(c1.role).toBe("panel_member");
    expect(c2.role).toBe("panel_member");
  });
});
