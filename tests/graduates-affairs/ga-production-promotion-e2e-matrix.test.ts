import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();

const setupPath = join(
  root,
  "tests",
  "graduates-affairs",
  "graduates-affairs-authorization-04.pg-setup.sql",
);
const foundationPath = join(
  root,
  "supabase",
  "migrations",
  "20260808210000_ga_mvp_foundation_01.sql",
);
const completionPath = join(
  root,
  "supabase",
  "migrations",
  "20260808210100_ga_mvp_completion_01.sql",
);
const auth04Path = join(
  root,
  "supabase",
  "migrations",
  "20260808210200_ga_authorization_04.sql",
);

const verifierPaths = {
  authorization: join(
    root,
    "tests",
    "graduates-affairs",
    "graduates-affairs-authorization-04.pg-verify.sql",
  ),
  concurrency: join(
    root,
    "tests",
    "graduates-affairs",
    "graduates-affairs-remediation-concurrency-01.pg-verify.sql",
  ),
  followupAuthorityRace: join(
    root,
    "tests",
    "graduates-affairs",
    "graduates-affairs-followup-authority-race-01.pg-verify.sql",
  ),
  codex: join(
    root,
    "tests",
    "graduates-affairs",
    "graduates-affairs-codex-final-high-profile-binding-03.pg-verify.sql",
  ),
  contextRpc: join(
    root,
    "tests",
    "graduates-affairs",
    "graduates-affairs-context-rpc-functional-matrix-04.pg-verify.sql",
  ),
};

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function makeContainer(label: string): string {
  return `ga-promo-e2e-${label}-${Date.now()}`;
}

function teardownContainer(name: string) {
  try {
    execSync(`docker rm -f ${name}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(container: string, sql: string): { ok: boolean; out: string } {
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

function psqlFile(container: string, filePath: string): { ok: boolean; out: string } {
  return psql(container, readFileSync(filePath, "utf8"));
}

async function waitReady(container: string): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      const probe = psql(container, "select 1;");
      if (probe.ok) return true;
    }
    await Bun.sleep(500);
  }
  return false;
}

async function runChain(
  label: string,
  extraVerifier?: { path: string; passToken: string },
): Promise<{ ok: boolean; out: string }> {
  const container = makeContainer(label);
  try {
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    const ready = await waitReady(container);
    if (!ready) throw new Error("postgres not ready");
    await Bun.sleep(1000);
    if (!(await waitReady(container))) throw new Error("postgres not ready after settle");

    const promoted = [
      ["setup", setupPath],
      ["foundation", foundationPath],
      ["completion", completionPath],
      ["auth04", auth04Path],
    ] as const;

    for (const [step, path] of promoted) {
      let result = psqlFile(container, path);
      if (!result.ok) {
        await Bun.sleep(1500);
        if (!(await waitReady(container))) {
          throw new Error(`${step} failed (postgres not ready):\n${result.out}`);
        }
        result = psqlFile(container, path);
      }
      if (!result.ok) {
        throw new Error(`${step} failed:\n${result.out}`);
      }
    }

    if (extraVerifier) {
      const result = psqlFile(container, extraVerifier.path);
      if (!result.ok) {
        throw new Error(`verifier failed:\n${result.out}`);
      }
      if (!result.out.includes(extraVerifier.passToken)) {
        throw new Error(`verifier did not emit expected pass token: ${extraVerifier.passToken}\n${result.out}`);
      }
    }

    return { ok: true, out: `${label}: PASS` };
  } finally {
    teardownContainer(container);
  }
}

describe("GA production promotion package — full auth/E2E matrix", () => {
  it("authorization matrix verifier passes against promoted migrations", async () => {
    if (!dockerReady) throw new Error("docker is required");
    const result = await runChain("authorization", {
      path: verifierPaths.authorization,
      passToken: "graduates-affairs-authorization-04 pg-verify: PASS",
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it("concurrency race verifier passes against promoted migrations", async () => {
    if (!dockerReady) throw new Error("docker is required");
    const result = await runChain("concurrency", {
      path: verifierPaths.concurrency,
      passToken: "graduates-affairs-remediation-concurrency-01 forward R6: PASS",
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it("follow-up authority-loss race verifier passes against promoted migrations", async () => {
    if (!dockerReady) throw new Error("docker is required");
    const result = await runChain("followup-authority-race", {
      path: verifierPaths.followupAuthorityRace,
      passToken: "graduates-affairs-followup-authority-race-01 pg-verify: PASS",
    });
    expect(result.ok).toBe(true);
  }, 180_000);

  it("codex high-profile binding verifier passes against promoted migrations", async () => {
    if (!dockerReady) throw new Error("docker is required");
    const result = await runChain("codex", {
      path: verifierPaths.codex,
      passToken: "graduates-affairs-codex-final-high-profile-binding-03 pg-verify: PASS",
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it("context RPC functional matrix passes against promoted migrations", async () => {
    if (!dockerReady) throw new Error("docker is required");
    const result = await runChain("context-rpc", {
      path: verifierPaths.contextRpc,
      passToken: "graduates-affairs-context-rpc-functional-matrix-04 pg-verify: PASS",
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it("promoted migrations have the expected promotion header contract", () => {
    for (const path of [foundationPath, completionPath, auth04Path]) {
      const sql = readFileSync(path, "utf8");
      expect(sql).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(sql).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
      expect(sql).toContain("HASH_CONTRACT: SHA256_LF_NORMALIZED_V1");
      expect(sql).toContain("begin;");
      expect(sql).toContain("commit;");
      expect(sql).not.toContain("DRAFT ONLY");
      expect(sql).not.toContain("DO NOT APPLY.");
    }
  });

  it("promoted migrations carry idempotent prestate guards", () => {
    const foundation = readFileSync(foundationPath, "utf8");
    expect(foundation).toContain("GA_FOUNDATION_PREFLIGHT_MISSING");
    expect(foundation).toContain("GA_FOUNDATION_PREFLIGHT_MISSING_UNIT");
    expect(foundation).toContain("GA_FOUNDATION_PREFLIGHT_MISSING_ROLES");
    expect(foundation).toContain("GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED");

    const completion = readFileSync(completionPath, "utf8");
    expect(completion).toContain("GA_COMPLETION_PREFLIGHT_MISSING");
    expect(completion).toContain("GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED");

    const auth04 = readFileSync(auth04Path, "utf8");
    expect(auth04).toContain("GA_AUTH04_PREFLIGHT_MISSING");
    expect(auth04).toContain("GA_AUTH04_PREFLIGHT_ALREADY_APPLIED");
  });
});
