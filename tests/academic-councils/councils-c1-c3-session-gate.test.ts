import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const paths = {
  minimal: join(root, "tests/academic-councils/postgres-minimal-schema.sql"),
  create: join(root, "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql"),
  harden: join(root, "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql"),
  history: join(root, "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql"),
  schedule: join(root, "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql"),
  c0: join(root, "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql"),
  c1: join(root, "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql"),
  c2: join(root, "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql"),
  c3: join(root, "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql"),
  verifier: join(root, "tests/academic-councils/postgres-c1-c3-session-gate-verifier.sql"),
};

const container = `councils-sg-${Date.now()}`;
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
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

function psqlFile(filePath: string) {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => teardownContainer());

describe("Academic Councils C1↔C3 session gate", () => {
  it("ships session-gate verifier markers", () => {
    const verifier = readFileSync(paths.verifier, "utf8");
    expect(verifier).toContain("SESSION_GATE_NO_POLICY_DENY");
    expect(verifier).toContain("SESSION_GATE_CHAIR_ALLOW");
    expect(verifier).toContain("ACADEMIC_COUNCILS_C1_C3_SESSION_GATE_VERIFIER_PASS");
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
  });

  it("proves full C0→C1→C2→C3 chain and session open gate", async () => {
    if (!dockerReady) throw new Error("docker is required");
    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);

    for (const [label, path] of Object.entries({
      minimal: paths.minimal,
      create: paths.create,
      harden: paths.harden,
      history: paths.history,
      schedule: paths.schedule,
      c0: paths.c0,
      c1: paths.c1,
      c2: paths.c2,
      c3: paths.c3,
    })) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1000);
        result = psqlFile(path);
      }
      if (!result.ok) throw new Error(`${label} failed:\n${result.out}`);
    }

    const noticeCheck = psqlFile(paths.verifier);
    if (!noticeCheck.ok) throw new Error(`session gate verifier failed:\n${noticeCheck.out}`);
    for (const fragment of [
      "SESSION_GATE_NO_POLICY_DENY",
      "SESSION_GATE_ATTENDANCE_UNFINISHED_DENY",
      "SESSION_GATE_NOT_FINALIZED_DENY",
      "SESSION_GATE_QUORUM_FALSE_DENY",
      "SESSION_GATE_WRONG_ACTORS_DENY",
      "SESSION_GATE_CHAIR_ALLOW",
      "SESSION_GATE_POST_IN_SESSION_IMMUTABLE",
      "ACADEMIC_COUNCILS_C1_C3_SESSION_GATE_VERIFIER_PASS",
    ]) {
      expect(noticeCheck.out).toContain(fragment);
    }
  }, 240_000);
});
