import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260807003000_gp_mvp_storage_insert_policy_predicate_fix_01.sql",
);
const verifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-storage-insert-policy-remediation-verifier.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-minimal-schema.sql",
);
const a1Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120000_gp_mvp_package_a1_foundation_01.sql",
);
const a2Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120100_gp_mvp_package_a2_storage_01.sql",
);
const a3Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120200_gp_mvp_package_a3_lifecycle_01.sql",
);
const foundationVerifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-foundation-verifier.sql",
);
const lifecycleVerifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-lifecycle-verifier.sql",
);

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const container = `gp-storage-insert-fix-${Date.now()}`;

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

function psqlAt(sql: string): string {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`PSQL-At error:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
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

describe("GP MVP storage insert policy remediation (forward fix)", () => {
  it("migration is fail-closed and uses a narrow SECURITY DEFINER predicate", () => {
    expect(migration).toContain("GP_MVP_STORAGE_INSERT_FIX_A1_MISSING");
    expect(migration).toContain("GP_MVP_STORAGE_INSERT_FIX_A2_MISSING");
    expect(migration).toContain("GP_MVP_STORAGE_INSERT_FIX_POLICY_MISSING");
    expect(migration).toContain("GP_MVP_STORAGE_INSERT_FIX_PREDICATE_EXISTS");
    expect(migration).toContain(
      "create or replace function public.can_upload_graduation_project_object(",
    );
    expect(migration).toContain("returns boolean");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("f.upload_status = 'pending'");
    expect(migration).toContain("a.active = true");
    expect(migration).toContain("a.ended_at is null");
    expect(migration).toContain(
      "revoke all on function public.can_upload_graduation_project_object(text) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.can_upload_graduation_project_object(text) to authenticated",
    );
    expect(migration).toContain(
      "drop policy if exists graduation_projects_storage_insert on storage.objects",
    );
    expect(migration).toContain(
      "create policy graduation_projects_storage_insert",
    );
    expect(migration).toContain(
      "public.can_upload_graduation_project_object(name)",
    );
    expect(migration).toContain("bucket_id = 'graduation-projects'");
    expect(migration).toContain("name like 'graduation-projects/%'");
    expect(migration).toContain("name not like '%..%'");
    expect(migration).not.toMatch(/getPublicUrl|publicURL/i);
  });

  it("verifier is transactional and covers the required proof surfaces", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    expect(verifier).toContain(
      "GP_MVP_STORAGE_INSERT_REMEDIATION_VERIFIER_PASS",
    );
    expect(verifier).toContain("B_POSITIVE_STORAGE_INSERT_ALLOWED");
    expect(verifier).toContain("C1_WRONG_USER_DENIED");
    expect(verifier).toContain("C2_INACTIVE_ASSIGNMENT_DENIED");
    expect(verifier).toContain(
      "C3_ASSIGNMENT_INTERVAL_PREVENTS_ACTIVE_ENDED_STATE",
    );
    expect(verifier).toContain("C3_ENDED_ASSIGNMENT_DENIED");
    expect(verifier).toContain("C4_NON_PENDING_FILE_DENIED");
    expect(verifier).toContain("C5_UNKNOWN_OBJECT_KEY_DENIED");
    expect(verifier).toContain("C6_WRONG_BUCKET_DENIED");
    expect(verifier).toContain("C7_PATH_TRAVERSAL_DENIED");
    expect(verifier).toContain("D_PREDICATE_ACL_OK");
    expect(verifier).toContain("E_NO_BROAD_TABLE_GRANTS");
    expect(verifier).toContain("A_GP_TABLE_SELECT_DENIED");
  });

  it("remediation migration is byte-identical to reviewed SHA fe4da88a", () => {
    // Pin the reviewed blob directly so shallow CI checkouts (fetch-depth: 1)
    // still prove byte-identity without requiring commit fe4da88a locally.
    const reviewedBlob = "2f16cc45a3d7a0b91c71cfcea93a19ff2cdd1f7b";
    const currentHash = execSync(`git hash-object ${migrationPath}`, {
      encoding: "utf8",
    }).trim();
    expect(currentHash).toBe(reviewedBlob);
  });

  it("launches disposable PG17 and proves the full chain", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    // Clean up any stale container from an interrupted run.
    teardownContainer();

    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );

    try {
      const ready = await waitReady();
      expect(ready).toBe(true);
      // Brief settle — CI runners can race between pg_isready and first SQL apply.
      await Bun.sleep(1000);
      const settled = await waitReady();
      expect(settled).toBe(true);

      // 1) Minimal stub schema (auth, storage, synthetic identities).
      let schemaOut = psqlFile(minimalSchemaPath);
      if (!schemaOut.ok && /No such file or directory|Connection refused/i.test(schemaOut.out)) {
        await Bun.sleep(1500);
        expect(await waitReady()).toBe(true);
        schemaOut = psqlFile(minimalSchemaPath);
      }
      if (!schemaOut.ok) {
        throw new Error(`minimal-schema failed:\n${schemaOut.out}`);
      }
      expect(schemaOut.ok).toBe(true);

      // 2) A1 foundation.
      const a1Out = psqlFile(a1Path);
      expect(a1Out.ok).toBe(true);

      // 3) A2 storage package.
      const a2Out = psqlFile(a2Path);
      expect(a2Out.ok).toBe(true);

      // 4) A3 lifecycle package.
      const a3Out = psqlFile(a3Path);
      expect(a3Out.ok).toBe(true);

      // Table grants before remediation: authenticated must have no SELECT on GP tables.
      const beforeSelectFiles = psqlAt(
        "SELECT has_table_privilege('authenticated','public.graduation_project_files','SELECT')::text;",
      );
      const beforeSelectAssignments = psqlAt(
        "SELECT has_table_privilege('authenticated','public.graduation_project_assignments','SELECT')::text;",
      );
      expect(beforeSelectFiles).toBe("false");
      expect(beforeSelectAssignments).toBe("false");

      // 5) New remediation migration.
      const migOut = psqlFile(migrationPath);
      expect(migOut.ok).toBe(true);

      // Table grants after remediation: still no direct SELECT on GP tables.
      const afterSelectFiles = psqlAt(
        "SELECT has_table_privilege('authenticated','public.graduation_project_files','SELECT')::text;",
      );
      const afterSelectAssignments = psqlAt(
        "SELECT has_table_privilege('authenticated','public.graduation_project_assignments','SELECT')::text;",
      );
      expect(afterSelectFiles).toBe("false");
      expect(afterSelectAssignments).toBe("false");

      // Predicate ACL after remediation.
      const predicateAcl = psqlAt(`
SELECT has_function_privilege('authenticated','public.can_upload_graduation_project_object(text)','EXECUTE')::text ||
  ':' || has_function_privilege('anon','public.can_upload_graduation_project_object(text)','EXECUTE')::text ||
  ':' || has_function_privilege('public','public.can_upload_graduation_project_object(text)','EXECUTE')::text;
`);
      expect(predicateAcl).toBe("true:false:false");

      // 6) Focused storage-policy verifier.
      const verifierOut = psqlFile(verifierPath);
      expect(verifierOut.ok).toBe(true);
      expect(verifierOut.out).toContain(
        "GP_MVP_STORAGE_INSERT_REMEDIATION_VERIFIER_PASS",
      );
      expect(verifierOut.out).toContain(
        "C3_ASSIGNMENT_INTERVAL_PREVENTS_ACTIVE_ENDED_STATE",
      );
      expect(verifierOut.out).toContain("C3_ENDED_ASSIGNMENT_DENIED");

      // 7) Existing GP verifiers where applicable (regression guard).
      const foundationOut = psqlFile(foundationVerifierPath);
      expect(foundationOut.ok).toBe(true);
      expect(foundationOut.out).toContain("PACKAGE_A_FOUNDATION_VERIFIER_PASS");

      const lifecycleOut = psqlFile(lifecycleVerifierPath);
      expect(lifecycleOut.ok).toBe(true);
      expect(lifecycleOut.out).toContain("PACKAGE_A_VERIFIER_PASS");

      console.log("PASS_GP_MVP_STORAGE_INSERT_POLICY_FORWARD_FIX_READY");
    } finally {
      teardownContainer();
    }
  }, 300_000);
});
