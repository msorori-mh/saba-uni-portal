/**
 * TEST_ONLY_ASSURANCE_02 — offline tests for the existing-student runner.
 * Pure: no network, no database, no writes.
 */

import { describe, expect, it } from "bun:test";

import { ASSURANCE_02_FIXTURES, fixtureMetadata } from "./fixtures";
import {
  ExistingStudentPreflightError,
  PINNED_STUDENTS,
  assertExistingFixtureUser,
  assertFixtureProfile,
  evaluateSessionIdentity,
  gatedSessions,
  pacedEvidence,
  resolveTargetsFromManifest,
  type AuthUserSnapshot,
  type PreflightPorts,
  type StudentTarget,
} from "./run-existing-student-assurance";

const specA = ASSURANCE_02_FIXTURES.find((f) => f.key === "studentA")!;
const specB = ASSURANCE_02_FIXTURES.find((f) => f.key === "studentB")!;

function goodUser(userId: string, email: string, key: "studentA" | "studentB"): AuthUserSnapshot {
  const spec = ASSURANCE_02_FIXTURES.find((f) => f.key === key)!;
  return {
    id: userId,
    email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: { ...fixtureMetadata(spec) },
  };
}

const targets: StudentTarget[] = [
  {
    key: "studentA",
    userId: PINNED_STUDENTS.studentA,
    profileId: "5d203d89-7533-4c5c-a1ce-69538396fb07",
    email: specA.email,
  },
  {
    key: "studentB",
    userId: PINNED_STUDENTS.studentB,
    profileId: "0dbbd2f6-1eb8-488e-bca6-4f3bba94a7ec",
    email: specB.email,
  },
];

function ports(overrides: Partial<PreflightPorts> = {}): PreflightPorts {
  return {
    async getUserById(userId) {
      const target = targets.find((t) => t.userId === userId)!;
      return goodUser(target.userId, target.email, target.key);
    },
    async getProfileRow(profileId) {
      const target = targets.find((t) => t.profileId === profileId)!;
      return { id: target.profileId, user_id: target.userId };
    },
    ...overrides,
  };
}

describe("existing-student preflight fails closed", () => {
  it("rejects an absent auth user", () => {
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, null)).toThrow(
      ExistingStudentPreflightError,
    );
  });

  it("rejects a different user id", () => {
    const snapshot = goodUser(PINNED_STUDENTS.studentB, specA.email, "studentA");
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, snapshot)).toThrow(
      /pinned id/,
    );
  });

  it("rejects a wrong email", () => {
    const snapshot = goodUser(PINNED_STUDENTS.studentA, "someone-else@example.com", "studentA");
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, snapshot)).toThrow(
      /fixture email/,
    );
  });

  it("rejects an unconfirmed email", () => {
    const snapshot = { ...goodUser(PINNED_STUDENTS.studentA, specA.email, "studentA"), email_confirmed_at: null };
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, snapshot)).toThrow(
      /not confirmed/,
    );
  });

  it("rejects an untagged user (missing or wrong fixture metadata)", () => {
    const missing = { ...goodUser(PINNED_STUDENTS.studentA, specA.email, "studentA"), user_metadata: {} };
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, missing)).toThrow(/metadata/);

    const wrong = goodUser(PINNED_STUDENTS.studentA, specA.email, "studentA");
    wrong.user_metadata = { ...wrong.user_metadata, fixture_key: "studentB" };
    expect(() => assertExistingFixtureUser("studentA", PINNED_STUDENTS.studentA, wrong)).toThrow(/metadata/);
  });

  it("rejects a profile row belonging to another user", () => {
    expect(() =>
      assertFixtureProfile("studentA", targets[0]!.profileId, PINNED_STUDENTS.studentA, {
        id: targets[0]!.profileId,
        user_id: PINNED_STUDENTS.studentB,
      }),
    ).toThrow(/user_id/);
  });

  it("rejects a missing profile row", () => {
    expect(() =>
      assertFixtureProfile("studentA", targets[0]!.profileId, PINNED_STUDENTS.studentA, null),
    ).toThrow(/profile row not found/);
  });
});

describe("generateLink is unreachable unless every preflight passes", () => {
  const spy = () => {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      run: async () => {
        calls += 1;
      },
    };
  };

  it("makes zero session calls when a user is absent", async () => {
    const s = spy();
    await expect(
      gatedSessions(ports({ getUserById: async () => null }), targets, s.run),
    ).rejects.toThrow(ExistingStudentPreflightError);
    expect(s.calls).toBe(0);
  });

  it("makes zero session calls when the second user is untagged", async () => {
    const s = spy();
    await expect(
      gatedSessions(
        ports({
          getUserById: async (userId) => {
            const target = targets.find((t) => t.userId === userId)!;
            const snapshot = goodUser(target.userId, target.email, target.key);
            if (target.key === "studentB") snapshot.user_metadata = { test_only: "true" };
            return snapshot;
          },
        }),
        targets,
        s.run,
      ),
    ).rejects.toThrow(/metadata/);
    expect(s.calls).toBe(0);
  });

  it("makes zero session calls when a profile row is missing", async () => {
    const s = spy();
    await expect(gatedSessions(ports({ getProfileRow: async () => null }), targets, s.run)).rejects.toThrow(
      /profile row not found/,
    );
    expect(s.calls).toBe(0);
  });

  it("runs exactly one session call per target once every preflight passes", async () => {
    const seen: string[] = [];
    await gatedSessions(ports(), targets, async (t) => {
      seen.push(t.key);
    });
    expect(seen).toEqual(["studentA", "studentB"]);
  });
});

describe("session identity gate", () => {
  const evidence = { status: 200 };

  it("passes only when both link and session ids equal the pinned id", () => {
    const ok = evaluateSessionIdentity(
      PINNED_STUDENTS.studentA,
      PINNED_STUDENTS.studentA,
      PINNED_STUDENTS.studentA,
      evidence,
    );
    expect(ok.verdict).toBe("PASS");
  });

  it("fails when generateLink returned a different (possibly newly created) user", () => {
    const r = evaluateSessionIdentity(
      PINNED_STUDENTS.studentA,
      "11111111-1111-4111-8111-111111111111",
      PINNED_STUDENTS.studentA,
      evidence,
    );
    expect(r.verdict).toBe("FAIL");
  });

  it("fails when the verified session belongs to another id or is absent", () => {
    expect(
      evaluateSessionIdentity(
        PINNED_STUDENTS.studentA,
        PINNED_STUDENTS.studentA,
        PINNED_STUDENTS.studentB,
        evidence,
      ).verdict,
    ).toBe("FAIL");
    expect(
      evaluateSessionIdentity(PINNED_STUDENTS.studentA, PINNED_STUDENTS.studentA, null, evidence).verdict,
    ).toBe("FAIL");
  });
});

describe("timing evidence excludes pacing", () => {
  it("keeps the adapter HTTP duration while reporting paced elapsed separately", () => {
    const startedAt = 1_000;
    const ev = pacedEvidence({ status: 200, durationMs: 42 }, startedAt, startedAt + 1_450);
    expect(ev.durationMs).toBe(42);
    expect(ev.pacedElapsedMs).toBe(1_450);
    expect(ev.durationMs!).toBeLessThan(ev.pacedElapsedMs!);
  });
});

describe("manifest targeting", () => {
  it("resolves only the two pinned students", () => {
    const resolved = resolveTargetsFromManifest({
      namespace: "TEST_ONLY_ASSURANCE_02",
      mode: "apply",
      accounts: [
        { key: "studentA", userId: PINNED_STUDENTS.studentA, profileId: targets[0]!.profileId },
        { key: "studentB", userId: PINNED_STUDENTS.studentB, profileId: targets[1]!.profileId },
        { key: "admin", userId: "22222222-2222-4222-8222-222222222222", profileId: targets[0]!.profileId },
      ],
    });
    expect(resolved.map((t) => t.key)).toEqual(["studentA", "studentB"]);
    expect(resolved.map((t) => t.email)).toEqual([specA.email, specB.email]);
  });

  it("refuses a manifest whose student id is not the pinned id", () => {
    expect(() =>
      resolveTargetsFromManifest({
        namespace: "TEST_ONLY_ASSURANCE_02",
        mode: "apply",
        accounts: [
          { key: "studentA", userId: "33333333-3333-4333-8333-333333333333", profileId: targets[0]!.profileId },
        ],
      }),
    ).toThrow(/pinned id/);
  });

  for (const [namespace, mode] of [["OTHER_PHASE", "apply"], ["TEST_ONLY_ASSURANCE_02", "dry-run"]]) {
    it(`refuses ${namespace}/${mode} even with valid fixture IDs`, () => {
      expect(() => resolveTargetsFromManifest({
        namespace,
        mode,
        accounts: targets.map((t) => ({ key: t.key, userId: t.userId, profileId: t.profileId })),
      })).toThrow(/namespace or apply mode/);
    });
  }

  it("refuses duplicate student entries instead of choosing the first match", () => {
    const accounts = targets.map((t) => ({ key: t.key, userId: t.userId, profileId: t.profileId }));
    expect(() => resolveTargetsFromManifest({
      namespace: "TEST_ONLY_ASSURANCE_02",
      mode: "apply",
      accounts: [...accounts, accounts[0]!],
    })).toThrow(/exactly one manifest entry/);
  });
});
