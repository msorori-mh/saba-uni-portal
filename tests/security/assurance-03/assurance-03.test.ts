/**
 * TEST_ONLY_ASSURANCE_03 — offline guard / identity / preflight / evidence tests.
 * No network, no Supabase, no fixture writes.
 */

import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAssuranceFetch } from "../assurance-02/assurance-fetch";
import { RequestBudget, evaluateDenial, evaluatePositiveControl } from "../assurance-02/strict-evidence";
import { resolveRunMode } from "../assurance-02/target-guard";
import {
  ENROLLMENT_IDS,
  GRADE_IDS,
  PINNED_EMAILS,
  PINNED_METADATA,
  PINNED_USERS,
  REFERENCE,
  allPreallocatedIds,
  requestTitle,
} from "./fixtures-03";
import {
  Assurance03BlockedError,
  assertComponentsBelongToSection,
  assertNoCollisions,
  assertPinnedUser,
  manifestProfileId,
  readRows,
  type ManifestFile,
} from "./run-assurance-03";

const SUPABASE_ORIGIN = "https://ldjhuutywqhjxabdotmn.supabase.co";

function goodUser(key: "studentA") {
  return {
    id: PINNED_USERS[key],
    email: PINNED_EMAILS[key],
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: { ...PINNED_METADATA[key] },
  };
}

describe("run mode", () => {
  it("defaults to dry run and only applies with the explicit flag", () => {
    expect(resolveRunMode([])).toBe("dryrun");
    expect(resolveRunMode(["--verbose"])).toBe("dryrun");
    expect(resolveRunMode(["--apply"])).toBe("apply");
  });
});

describe("pinned identity preflight", () => {
  it("accepts the exact pinned fixture identity", () => {
    expect(() => assertPinnedUser("studentA", goodUser("studentA"), ["student"])).not.toThrow();
  });

  it("refuses an absent user before any generateLink", () => {
    expect(() => assertPinnedUser("studentA", null, ["student"])).toThrow(Assurance03BlockedError);
  });

  it("refuses a different auth id", () => {
    const user = { ...goodUser("studentA"), id: PINNED_USERS.studentB };
    expect(() => assertPinnedUser("studentA", user, ["student"])).toThrow(/pinned id/);
  });

  it("refuses a mismatched email", () => {
    const user = { ...goodUser("studentA"), email: "someone-else@example.test" };
    expect(() => assertPinnedUser("studentA", user, ["student"])).toThrow(/fixture email/);
  });

  it("refuses an unconfirmed email", () => {
    const user = { ...goodUser("studentA"), email_confirmed_at: null };
    expect(() => assertPinnedUser("studentA", user, ["student"])).toThrow(/not confirmed/);
  });

  it("refuses an untagged user (each metadata field is required)", () => {
    for (const field of Object.keys(PINNED_METADATA.studentA)) {
      const metadata: Record<string, unknown> = { ...PINNED_METADATA.studentA };
      delete metadata[field];
      const user = { ...goodUser("studentA"), user_metadata: metadata };
      expect(() => assertPinnedUser("studentA", user, ["student"])).toThrow(/metadata field/);
    }
  });

  it("refuses a role set that is not exactly the canonical role", () => {
    expect(() => assertPinnedUser("studentA", goodUser("studentA"), [])).toThrow(/user_roles/);
    expect(() => assertPinnedUser("studentA", goodUser("studentA"), ["student", "admin"])).toThrow(
      /user_roles/,
    );
    expect(() => assertPinnedUser("studentA", goodUser("studentA"), ["registrar"])).toThrow(/user_roles/);
  });

  it("requires the registrar to hold exactly the registrar role", () => {
    const registrar = {
      id: PINNED_USERS.registrar,
      email: PINNED_EMAILS.registrar,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      user_metadata: { ...PINNED_METADATA.registrar },
    };
    expect(() => assertPinnedUser("registrar", registrar, ["registrar"])).not.toThrow();
    expect(() => assertPinnedUser("registrar", registrar, ["admin"])).toThrow(/user_roles/);
  });
});

describe("historical manifest resolution", () => {
  const manifest: ManifestFile = {
    accounts: [
      { key: "studentA", userId: PINNED_USERS.studentA, profileId: "5d203d89-7533-4c5c-a1ce-69538396fb07" },
      { key: "studentB", userId: PINNED_USERS.studentB, profileId: "not-a-uuid" },
    ],
  };

  it("resolves a valid profile id", () => {
    expect(manifestProfileId(manifest, "studentA")).toBe("5d203d89-7533-4c5c-a1ce-69538396fb07");
  });

  it("rejects a malformed profile id and an absent key", () => {
    expect(() => manifestProfileId(manifest, "studentB")).toThrow(/not a UUID/);
    expect(() => manifestProfileId(manifest, "registrar")).toThrow(/absent/);
  });

  it("rejects a manifest whose user id is not the pinned id", () => {
    const tampered: ManifestFile = {
      accounts: [{ key: "studentA", userId: PINNED_USERS.studentB, profileId: PINNED_USERS.studentA }],
    };
    expect(() => manifestProfileId(tampered, "studentA")).toThrow(/pinned id/);
  });
});

describe("reference and collision preflight", () => {
  it("requires each component to belong to the selected section", () => {
    const good = REFERENCE.components.map((c) => ({ id: c.id, course_section_id: REFERENCE.sectionId }));
    expect(() => assertComponentsBelongToSection(good)).not.toThrow();

    const foreign = [
      { id: REFERENCE.components[0].id, course_section_id: "00000000-0000-4000-8000-03c000000014" },
      { id: REFERENCE.components[1].id, course_section_id: REFERENCE.sectionId },
    ];
    expect(() => assertComponentsBelongToSection(foreign)).toThrow(/does not belong/);
    expect(() => assertComponentsBelongToSection([])).toThrow(/not found/);
  });

  it("refuses to write when a preallocated id or the pair already exists", () => {
    expect(() => assertNoCollisions([], 0)).not.toThrow();
    expect(() => assertNoCollisions([ENROLLMENT_IDS.studentA], 0)).toThrow(/already exists/);
    expect(() => assertNoCollisions([], 1)).toThrow(/already exists/);
  });

  it("preallocates exactly two enrolment ids and four grade ids, all distinct", () => {
    const ids = allPreallocatedIds();
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain(ENROLLMENT_IDS.studentB);
    expect(ids).toContain(GRADE_IDS.studentB[1]);
  });

  it("keeps every seeded score inside its component bound", () => {
    for (const component of REFERENCE.components) {
      expect(component.score).toBeGreaterThan(0);
      expect(component.score).toBeLessThanOrEqual(component.maxScore);
    }
  });

  it("tags request titles with the namespace", () => {
    expect(requestTitle("studentA")).toContain("TEST_ONLY_ASSURANCE_03");
    expect(requestTitle("studentB")).not.toBe(requestTitle("studentA"));
  });
});

/** Minimal PostgREST-shaped stub that actually issues one adapter request. */
function stubClient(
  net: { fetch: typeof fetch },
  url: string,
  handler: () => { data: unknown; error: { code?: string } | null; status: number },
): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            async eq() {
              await net.fetch(url);
              return handler();
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("read evidence through the configured adapter", () => {
  it("reports a positive control and keeps HTTP time separate from pacing", async () => {
    const base: typeof fetch = async () =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    const net = createAssuranceFetch(SUPABASE_ORIGIN, new RequestBudget(5, 60), base);
    const id = ENROLLMENT_IDS.studentA;
    const client = stubClient(net, `${SUPABASE_ORIGIN}/rest/v1/student_enrollments`, () => ({
      data: [{ id }],
      error: null,
      status: 200,
    }));

    const evidence = await readRows(client, "student_enrollments", "id", id, net);
    expect(evidence.status).toBe(200);
    expect(evidence.validJsonArray).toBe(true);
    expect(evidence.rowCount).toBe(1);
    expect(evidence.validatedIdMatch).toBe(true);
    expect(evaluatePositiveControl(evidence).verdict).toBe("PASS");
    // pacedElapsedMs includes the imposed pause; durationMs must not.
    expect(evidence.durationMs).toBeLessThanOrEqual(evidence.pacedElapsedMs ?? 0);
  });

  it("treats a row belonging to another id as a non-passing control", async () => {
    const base: typeof fetch = async () =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    const net = createAssuranceFetch(SUPABASE_ORIGIN, new RequestBudget(5, 1), base);
    const client = stubClient(net, `${SUPABASE_ORIGIN}/rest/v1/student_grades`, () => ({
      data: [{ id: GRADE_IDS.studentB[0] }],
      error: null,
      status: 200,
    }));
    const evidence = await readRows(client, "student_grades", "id", GRADE_IDS.studentA[0], net);
    expect(evidence.validatedIdMatch).toBe(false);
    expect(evaluatePositiveControl(evidence).verdict).toBe("ERROR");
  });

  it("never passes a denial without a paired positive control, and never on 404/JWT/HTML", () => {
    const failedControl = { verdict: "ERROR" as const, reason: "x", evidence: { status: 500 } };
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 0 }, failedControl).verdict).toBe(
      "BLOCKED",
    );
    const control = {
      verdict: "PASS" as const,
      reason: "ok",
      evidence: { status: 200, rowCount: 1, validJsonArray: true, validatedIdMatch: true },
    };
    expect(evaluateDenial({ status: 404 }, control).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 405 }, control).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 500 }, control).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 401, errorCode: "PGRST301" }, control).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 403, html: true }, control).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 0 }, control).verdict).toBe("PASS");
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 1 }, control).verdict).toBe("FAIL");
  });

  it("latches the abort permanently on a 429 and blocks later network", async () => {
    const base: typeof fetch = async () =>
      new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
    const net = createAssuranceFetch(SUPABASE_ORIGIN, new RequestBudget(5, 1), base);
    await net.fetch(`${SUPABASE_ORIGIN}/rest/v1/student_grades`).catch(() => undefined);
    expect(net.budget.aborted).toBeTruthy();
    await expect(net.fetch(`${SUPABASE_ORIGIN}/rest/v1/student_grades`)).rejects.toThrow(/ABORT/);
  });

  it("refuses any request that leaves the pinned staging origin", async () => {
    const net = createAssuranceFetch(SUPABASE_ORIGIN, new RequestBudget(5, 1));
    await expect(net.fetch("https://wpmicqriltrowwonknox.supabase.co/rest/v1/x")).rejects.toThrow(
      /TARGET_REJECTED/,
    );
    await expect(net.fetch("https://uniportaltest.com/rest/v1/x")).rejects.toThrow(/TARGET_REJECTED/);
  });
});

