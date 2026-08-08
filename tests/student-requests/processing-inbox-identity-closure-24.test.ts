/**
 * PORTAL-B1-PROCESSING-INBOX-IDENTITY-CLOSURE-SOURCE-REMEDIATION-24
 *
 * Guards the shared processing-assignment identity closure used by BOTH
 * `assertStaffInboxAccess` and `hasActiveProcessingAssignment`.
 *
 * Unit-level (pure predicates) + source-level. No DB, no production writes.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignmentMatchesIdentity,
  isAssignmentWindowActive,
  PROCESSING_ASSIGNMENT_IDENTITY_TYPES,
} from "@/lib/student-requests/processing-assignment-identity.server";

const ROOT = join(import.meta.dir, "../..");
const HELPER_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/processing-assignment-identity.server.ts"),
  "utf-8",
);
const INBOX_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);
const FACULTY_GATE_SRC = readFileSync(
  join(ROOT, "src/lib/faculty-portal/processing-access.functions.ts"),
  "utf-8",
);

const USER = "11111111-1111-1111-1111-111111111111";
const STAFF_PROFILE = "22222222-2222-2222-2222-222222222222";
const FACULTY_PROFILE = "33333333-3333-3333-3333-333333333333";
const POSITION_ASSIGNMENT = "44444444-4444-4444-4444-444444444444";
const OTHER = "99999999-9999-9999-9999-999999999999";

const identity = {
  userId: USER,
  staffProfileIds: [STAFF_PROFILE],
  facultyProfileIds: [FACULTY_PROFILE],
  positionAssignmentIds: [POSITION_ASSIGNMENT],
};

function row(over: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    assignment_type: "user",
    user_id: null,
    staff_profile_id: null,
    faculty_profile_id: null,
    position_assignment_id: null,
    is_active: true,
    starts_at: null,
    ends_at: null,
    ...over,
  } as never;
}

describe("identity closure — supported assignment types", () => {
  it("covers exactly the four production identity types", () => {
    expect(PROCESSING_ASSIGNMENT_IDENTITY_TYPES).toEqual([
      "user",
      "staff_profile",
      "faculty_profile",
      "position_assignment",
    ]);
  });

  it("direct user assignment → allowed", () => {
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "user", user_id: USER }),
        identity,
      ),
    ).toBe(true);
  });

  it("staff_profile assignment → allowed", () => {
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "staff_profile", staff_profile_id: STAFF_PROFILE }),
        identity,
      ),
    ).toBe(true);
  });

  it("faculty_profile assignment → allowed", () => {
    expect(
      assignmentMatchesIdentity(
        row({
          assignment_type: "faculty_profile",
          faculty_profile_id: FACULTY_PROFILE,
        }),
        identity,
      ),
    ).toBe(true);
  });

  it("position_assignment → allowed", () => {
    expect(
      assignmentMatchesIdentity(
        row({
          assignment_type: "position_assignment",
          position_assignment_id: POSITION_ASSIGNMENT,
        }),
        identity,
      ),
    ).toBe(true);
  });

  it("unrelated profile → denied", () => {
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "staff_profile", staff_profile_id: OTHER }),
        identity,
      ),
    ).toBe(false);
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "user", user_id: OTHER }),
        identity,
      ),
    ).toBe(false);
  });

  it("ambiguous / mismatched declared identity → fail closed", () => {
    // declares staff_profile but only carries a matching user_id
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "staff_profile", user_id: USER }),
        identity,
      ),
    ).toBe(false);
    // unknown type
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "group", user_id: USER }),
        identity,
      ),
    ).toBe(false);
    // NULL type
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: null, user_id: USER }),
        identity,
      ),
    ).toBe(false);
  });
});

describe("identity closure — activity window", () => {
  const now = new Date("2026-07-29T12:00:00Z");
  const past = "2026-07-01T00:00:00Z";
  const future = "2027-01-01T00:00:00Z";

  it("active with open window → allowed", () => {
    expect(
      isAssignmentWindowActive(
        { is_active: true, starts_at: past, ends_at: future },
        now,
      ),
    ).toBe(true);
    expect(
      isAssignmentWindowActive(
        { is_active: true, starts_at: null, ends_at: null },
        now,
      ),
    ).toBe(true);
  });

  it("inactive assignment → denied", () => {
    expect(
      isAssignmentWindowActive(
        { is_active: false, starts_at: null, ends_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      isAssignmentWindowActive(
        { is_active: null, starts_at: null, ends_at: null },
        now,
      ),
    ).toBe(false);
  });

  it("future starts_at → denied", () => {
    expect(
      isAssignmentWindowActive(
        { is_active: true, starts_at: future, ends_at: null },
        now,
      ),
    ).toBe(false);
  });

  it("expired ends_at → denied", () => {
    expect(
      isAssignmentWindowActive(
        { is_active: true, starts_at: null, ends_at: past },
        now,
      ),
    ).toBe(false);
  });
});

describe("Naji regression fixture — library officer via staff_profile", () => {
  // assignment_type = staff_profile, user_id = null,
  // staff_profiles.user_id = current auth user, unit = library,
  // role = library_officer.
  const najiRow = row({
    assignment_type: "staff_profile",
    user_id: null,
    staff_profile_id: STAFF_PROFILE,
    is_active: true,
    starts_at: null,
    ends_at: null,
  });

  it("resolves to the current auth user despite NULL user_id", () => {
    expect(isAssignmentWindowActive(najiRow, new Date())).toBe(true);
    expect(assignmentMatchesIdentity(najiRow, identity)).toBe(true);
  });

  it("does not resolve for a different user's closure", () => {
    expect(
      assignmentMatchesIdentity(najiRow, {
        userId: OTHER,
        staffProfileIds: [],
        facultyProfileIds: [],
        positionAssignmentIds: [],
      }),
    ).toBe(false);
  });

  it("inbox access is granted independently of whether a library step is active (empty inbox is a valid outcome)", () => {
    // The gate only decides entry; step visibility comes from the
    // per-actor RPC pinned to status=['active'].
    expect(INBOX_SRC).toMatch(/status\s*:\s*\[\s*["']active["']\s*\]/);
    expect(INBOX_SRC).toMatch(/rpcGetMyRequestActorInbox\(/);
  });
});

describe("both guards share one helper — no bypasses, no regressions", () => {
  it("assertStaffInboxAccess uses the shared helper", () => {
    const gateBlock =
      INBOX_SRC.match(/async function assertStaffInboxAccess[\s\S]*?\n\}/)?.[0] ?? "";
    expect(gateBlock).toMatch(/hasActiveProcessingAssignmentForUser\(\s*userId\s*\)/);
  });

  it("hasActiveProcessingAssignment uses the shared helper", () => {
    expect(FACULTY_GATE_SRC).toMatch(/hasActiveProcessingAssignmentForUser\(/);
  });

  it("helper contains no admin / system_admin / role-name bypass", () => {
    expect(HELPER_SRC).not.toMatch(/roles\.includes\(/);
    expect(HELPER_SRC).not.toMatch(/["']system_admin["']/);
    expect(HELPER_SRC).not.toMatch(/["']registrar["']/);
    expect(HELPER_SRC).not.toMatch(/["']dean["']/);
    expect(HELPER_SRC).not.toMatch(/["']student_affairs["']/);
    expect(HELPER_SRC).not.toMatch(/["']finance_officer["']/);
  });

  it("helper enforces is_active plus the starts_at/ends_at window", () => {
    expect(HELPER_SRC).toMatch(/\.eq\(\s*["']is_active["']\s*,\s*true\s*\)/);
    expect(HELPER_SRC).toMatch(/starts_at/);
    expect(HELPER_SRC).toMatch(/ends_at/);
  });

  it("existing registrar / student-affairs users keep access through their own assignment rows", () => {
    // Any assignment_type='user' row still resolves — no behavior change
    // for inbox users that were already allowed.
    expect(
      assignmentMatchesIdentity(
        row({ assignment_type: "user", user_id: USER }),
        identity,
      ),
    ).toBe(true);
  });

  it("admin short-circuit stays in the guards, never in the helper", () => {
    expect(INBOX_SRC).toMatch(/roles\.includes\(["']admin["']\)/);
    expect(FACULTY_GATE_SRC).toMatch(/roles\.includes\(["']admin["']\)/);
  });
});
