import { afterAll, describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const container = `staff-self-service-02b-${Date.now()}`;
const schemaPath = join(
  root,
  "tests",
  "staff-self-service",
  "pg17",
  "00-minimal-schema.sql",
);
const foundationPath = join(
  root,
  "supabase",
  "migrations",
  "20260821220000_staff_self_service_backend_foundation_02a.sql",
);
const storagePath = join(
  root,
  "supabase",
  "migrations",
  "20260822010000_staff_self_service_storage_binding_02b.sql",
);
const verifierPath = join(
  root,
  "tests",
  "staff-self-service",
  "pg17",
  "10-verifier.sql",
);

const foundation = readFileSync(foundationPath, "utf8");
const storage = readFileSync(storagePath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

function teardown() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    // Disposable container may not exist after a failed start.
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function psqlFile(path: string) {
  return psql(readFileSync(path, "utf8"));
}

async function waitReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (ready.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

afterAll(teardown);

describe("PORTAL_STAFF_SELF_SERVICE_STORAGE_BINDING_02B", () => {
  test("keeps the storage contract private and fail-closed", () => {
    expect(storage).toContain("STAFF_SERVICE_02B_REQUIRES_02A");
    expect(storage).toContain("STAFF_SERVICE_02B_STORAGE_SCHEMA_REQUIRED");
    expect(storage).toContain("'staff-service-private'");
    expect(storage).toContain("public = false");
    expect(storage).toContain("file_size_limit = 10485760");
    expect(storage).toContain("name not like '%..%'");
    expect(storage).not.toMatch(/getPublicUrl|publicURL/i);
    expect(storage).not.toMatch(
      /create policy staff_service_private_(update|delete)/i,
    );
  });

  test("pins idempotency, scan, signed-download, and ACL invariants", () => {
    expect(storage).toContain("staff_service_attachment_idempotency_uq");
    expect(storage).toContain("STAFF_SERVICE_ATTACHMENT_REPLAY_MISMATCH");
    expect(storage).toContain("staff_service_can_upload_object");
    expect(storage).toContain("staff_service_can_download_object");
    expect(storage).toContain("scan_state = 'clean'");
    expect(storage).toContain("'expires_in_seconds', 300");
    expect(storage).toContain(
      "grant execute on function public.staff_service_mark_attachment_scan_state(uuid, text, text)\n  to service_role",
    );
    expect(storage).toContain(
      "revoke all on function public.staff_service_mark_attachment_scan_state(uuid, text, text)\n  from public, anon, authenticated",
    );
  });

  test("verifier is transactional and covers the role/security matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const marker of [
      "A_IDEMPOTENT_REPLAY_CHANGED_REQUEST",
      "B_SELF_APPROVAL_UNEXPECTED_SUCCESS",
      "C_REASONLESS_REJECTION_UNEXPECTED_SUCCESS",
      "D_AUDIT_UPDATE_UNEXPECTED_SUCCESS",
      "E_MANAGER_PAYROLL_DISCLOSURE",
      "F_OUTSIDER_UPLOAD_UNEXPECTED_SUCCESS",
      "F_UNSCANNED_DOWNLOAD_UNEXPECTED_SUCCESS",
      "G_BROAD_CLIENT_TABLE_GRANT",
      "PASS_STAFF_SELF_SERVICE_PG17_STORAGE_BINDING_02B",
    ]) {
      expect(verifier).toContain(marker);
    }
  });

  test(
    "applies 02A and 02B on disposable PostgreSQL 17 and proves runtime paths",
    async () => {
      try {
        execSync("docker --version", { stdio: "ignore" });
      } catch {
        throw new Error("docker is required for the staff-service PG17 gate");
      }

      teardown();
      execSync(
        `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine`,
        { stdio: "ignore" },
      );

      try {
        expect(await waitReady()).toBe(true);

        const schema = psqlFile(schemaPath);
        if (!schema.ok) throw new Error(`minimal schema failed:\n${schema.out}`);

        const foundationApply = psql(foundation);
        if (!foundationApply.ok) {
          throw new Error(`02A apply failed:\n${foundationApply.out}`);
        }

        const storageApply = psql(storage);
        if (!storageApply.ok) {
          throw new Error(`02B apply failed:\n${storageApply.out}`);
        }

        const verification = psql(verifier);
        if (!verification.ok) {
          throw new Error(`02B verification failed:\n${verification.out}`);
        }
        expect(verification.out).toContain(
          "PASS_STAFF_SELF_SERVICE_PG17_STORAGE_BINDING_02B",
        );
      } finally {
        teardown();
      }
    },
    240_000,
  );
});

