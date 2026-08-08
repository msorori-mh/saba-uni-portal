import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  getIntakeValidationError,
  getReviewAuthorityError,
  isAllowedTopicTransition,
  isFinalReviewStatus,
  isPrepareReviewStatus,
} from "@/lib/council-topic-lifecycle";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260808122000_councils_c2_topic_intake_review_01.sql",
);
const c0Path = join(
  root,
  "supabase",
  "migrations",
  "20260808120000_councils_c0_write_surface_hardening_01.sql",
);
const c1Path = join(
  root,
  "supabase",
  "migrations",
  "20260808121000_councils_c1_meeting_state_machine_01.sql",
);
const createPath = join(
  root,
  "supabase",
  "migrations",
  "20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
);
const hardenPath = join(
  root,
  "supabase",
  "migrations",
  "20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
);
const historyPath = join(
  root,
  "supabase",
  "migrations",
  "20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
);
const schedulePath = join(
  root,
  "supabase",
  "migrations",
  "20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "academic-councils",
  "postgres-minimal-schema.sql",
);
const verifierPath = join(
  root,
  "tests",
  "academic-councils",
  "postgres-c2-topic-intake-review-verifier.sql",
);

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const facultyFn = readFileSync(
  join(root, "src", "lib", "faculty-councils.functions.ts"),
  "utf8",
);
const adminFn = readFileSync(
  join(root, "src", "lib", "admin-councils.functions.ts"),
  "utf8",
);

const container = `councils-c2-ir-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { ok: res.status === 0, out };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      const probe = psql("select 1;");
      if (probe.ok) return true;
    }
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  teardownContainer();
});

describe("C2 topic intake & review lifecycle migration", () => {
  it("ships intake helpers and chair/secretary authority split without DROP POLICY", () => {
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("can_submit_to_council_meeting_intake");
    expect(migration).toContain("can_review_council_topic_prepare");
    expect(migration).toContain("can_review_council_topic_final");
    expect(migration).toContain("council_submit_topic");
    expect(migration).toContain("council_resubmit_topic");
    expect(migration).toContain("p_meeting_id");
    expect(migration).toContain("COUNCIL_TOPIC_FINAL_DENIED");
    expect(migration).not.toMatch(/^\s*DROP\s+POLICY/im);
    expect(migration).not.toMatch(/is_council_admin/i);
  });

  it("rewires app writers to intake-aware RPCs", () => {
    expect(facultyFn).toContain("council_submit_topic");
    expect(facultyFn).toContain("p_meeting_id");
    expect(facultyFn).toContain("council_resubmit_topic");
    expect(facultyFn).toContain("council_update_own_topic_draft");
    expect(adminFn).toContain("p_expected_status");
    expect(adminFn).toContain("council_review_topic");
    expect(facultyFn).not.toMatch(
      /\.from\("academic_council_topics"\)\s*\n\s*\.insert/,
    );
  });
});

describe("Canonical topic status transitions", () => {
  it("allows the mission-tightened positive lifecycle", () => {
    expect(isAllowedTopicTransition("draft", "submitted")).toBe(true);
    expect(isAllowedTopicTransition("submitted", "under_review")).toBe(true);
    expect(isAllowedTopicTransition("under_review", "needs_completion")).toBe(true);
    expect(isAllowedTopicTransition("under_review", "accepted_for_agenda")).toBe(true);
    expect(isAllowedTopicTransition("under_review", "rejected")).toBe(true);
    expect(isAllowedTopicTransition("needs_completion", "submitted")).toBe(true);
    expect(isAllowedTopicTransition("submitted", "needs_completion")).toBe(false);
    expect(isAllowedTopicTransition("submitted", "rejected")).toBe(false);
  });

  it("denies arbitrary status skips", () => {
    expect(isAllowedTopicTransition("draft", "under_review")).toBe(false);
    expect(isAllowedTopicTransition("submitted", "accepted_for_agenda")).toBe(false);
    expect(isAllowedTopicTransition("needs_completion", "accepted_for_agenda")).toBe(false);
  });

  it("classifies prepare vs final review statuses", () => {
    expect(isPrepareReviewStatus("under_review")).toBe(true);
    expect(isFinalReviewStatus("accepted_for_agenda")).toBe(true);
    expect(getReviewAuthorityError({
      role: "secretary",
      isActiveMember: true,
      targetStatus: "accepted_for_agenda",
    })).toBeTruthy();
    expect(getReviewAuthorityError({
      role: "chair",
      isActiveMember: true,
      targetStatus: "accepted_for_agenda",
    })).toBeNull();
  });

  it("validates intake window rules", () => {
    expect(
      getIntakeValidationError({
        meetingStatus: "intake_open",
        intakeOpensAt: null,
        intakeClosesAt: null,
        nowIso: new Date().toISOString(),
        memberRole: "member",
        isActiveMember: true,
      }),
    ).toBeNull();
    expect(
      getIntakeValidationError({
        meetingStatus: "scheduled",
        intakeOpensAt: null,
        intakeClosesAt: null,
        nowIso: new Date().toISOString(),
        memberRole: "member",
        isActiveMember: true,
      }),
    ).toBeTruthy();
  });
});

describe("C2 PG17 verifier contract", () => {
  it("ships transactional zero-mutation matrix markers", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).toContain("ACADEMIC_COUNCILS_C2_TOPIC_INTAKE_REVIEW_VERIFIER_PASS");
    expect(verifier).toContain("SECRETARY_FINAL_DENIED");
    expect(verifier).toContain("VIEWER_INTAKE_DENIED");
    expect(verifier).toContain("assert_zero_mutation");
  });

  it("launches disposable PG17 and proves C0→C1→C2 intake/review chain", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    const ready = await waitReady();
    expect(ready).toBe(true);
    await Bun.sleep(1000);

    const applied: string[] = [];
    for (const [label, path] of [
      ["minimal-schema", minimalSchemaPath],
      ["councils-create", createPath],
      ["councils-harden-anon", hardenPath],
      ["councils-history", historyPath],
      ["councils-schedule-helper", schedulePath],
      ["councils-c0", c0Path],
      ["councils-c1", c1Path],
      ["councils-c2", migrationPath],
    ] as const) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1000);
        result = psqlFile(path);
      }
      if (!result.ok) throw new Error(`${label} failed:\n${result.out}`);
      applied.push(label);
    }

    expect(applied).toEqual([
      "minimal-schema",
      "councils-create",
      "councils-harden-anon",
      "councils-history",
      "councils-schedule-helper",
      "councils-c0",
      "councils-c1",
      "councils-c2",
    ]);

    const noticeCheck = psqlFile(verifierPath);
    if (!noticeCheck.ok) {
      throw new Error(`C2 verifier failed:\n${noticeCheck.out}`);
    }
    expect(noticeCheck.out).toContain(
      "ACADEMIC_COUNCILS_C2_TOPIC_INTAKE_REVIEW_VERIFIER_PASS",
    );
  }, 180_000);
});
