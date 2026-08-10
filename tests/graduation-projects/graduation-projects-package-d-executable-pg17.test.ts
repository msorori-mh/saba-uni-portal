import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

/**
 * PORTAL-24H-GP-GA-OPERATIONAL-E2E-FULL-CLOSURE-01
 * Executable Package D disposable PG17 harness (SET U + fixtures + matrix).
 */

const root = process.cwd();
const minimalSchemaPath = join(root, "tests/graduation-projects/postgres-minimal-schema.sql");
const a1Path = join(
  root,
  "supabase/migrations/20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql",
);
const a2Path = join(
  root,
  "supabase/migrations/20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql",
);
const a3Path = join(
  root,
  "supabase/migrations/20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql",
);
const storageFixPath = join(
  root,
  "supabase/migrations/20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql",
);
const fixturesPath = join(
  root,
  "docs/migration-drafts/GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql",
);
const foundationVerifierPath = join(
  root,
  "tests/graduation-projects/postgres-foundation-verifier.sql",
);
const lifecycleVerifierPath = join(
  root,
  "tests/graduation-projects/postgres-lifecycle-verifier.sql",
);
const packageDVerifierPath = join(
  root,
  "tests/graduation-projects/package-d-verifier.sql",
);

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const container = `gp-pkg-d-exec-${Date.now()}`;

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

describe("Package D executable PG17 operational harness", () => {
  it("runs full SET U + fixtures + Package D matrix including Branch B revisions loop", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the Package D PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);
    expect(await waitReady()).toBe(true);

    const chain: Array<[string, string]> = [
      ["minimal-schema", minimalSchemaPath],
      ["U1-A1", a1Path],
      ["U2-A2", a2Path],
      ["U3-A3", a3Path],
      ["U4-storage-fix", storageFixPath],
      ["package-d-fixtures", fixturesPath],
      ["foundation-verifier", foundationVerifierPath],
      ["lifecycle-verifier", lifecycleVerifierPath],
      ["package-d-verifier", packageDVerifierPath],
    ];

    let packageDOut = "";
    for (const [label, path] of chain) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1500);
        if (!(await waitReady())) {
          throw new Error(`${label} failed (postgres not ready):\n${result.out}`);
        }
        result = psqlFile(path);
      }
      if (!result.ok) {
        throw new Error(`${label} failed:\n${result.out}`);
      }
      if (label === "package-d-verifier") {
        packageDOut = result.out;
      }
      if (label === "foundation-verifier") {
        expect(result.out).toContain("PACKAGE_A_FOUNDATION_VERIFIER_PASS");
      }
      if (label === "lifecycle-verifier") {
        expect(result.out).toContain("PACKAGE_A_VERIFIER_PASS");
      }
    }

    expect(packageDOut).toContain("PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_PASS");
    expect(packageDOut).toContain("PACKAGE_D_BRANCH_A_PASS");
    expect(packageDOut).toContain("PACKAGE_D_BRANCH_B_PASS");
    expect(packageDOut).toContain("PACKAGE_D_BRANCH_C_PASS");
    expect(packageDOut).toContain("PACKAGE_D_CLEANUP_PASS");
    expect(packageDOut).toMatch(/PACKAGE_D_ACL_ASSERTIONS=216/);
    expect(packageDOut).toMatch(/PACKAGE_D_POSITIVE_RPC_CASES=37/);
    expect(packageDOut).toMatch(/PACKAGE_D_NEGATIVE_RPC_CASES=45/);
  }, 300_000);
});
