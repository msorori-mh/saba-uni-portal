import { afterAll, describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

const migration = read(
  "supabase/migrations/20260822040000_staff_self_service_value_added_02e.sql",
);
const foundation = read(
  "supabase/migrations/20260821220000_staff_self_service_backend_foundation_02a.sql",
);
const storage = read(
  "supabase/migrations/20260822010000_staff_self_service_storage_binding_02b.sql",
);
const readSide = read(
  "supabase/migrations/20260822030000_staff_self_service_live_read_side_02d.sql",
);
const minimalSchemaPath = join(
  root,
  "tests/staff-self-service/pg17/00-minimal-schema.sql",
);
const verifier = read("tests/staff-self-service/pg17/30-verifier-02e.sql");
const adapter = read("src/lib/staff-self-service-value-added.ts");
const employeePanel = read(
  "src/components/staff-showcase/StaffValueAddedEmployeePanel.tsx",
);
const adminPanel = read(
  "src/components/staff-showcase/StaffValueAddedAdminPanel.tsx",
);
const publicRoute = read("src/routes/verify-document.tsx");

describe("PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E \u2014 source contract", () => {
  test("migration depends on 02A/02B/02D and never re-implements authority", () => {
    expect(migration).toContain("STAFF_SERVICE_02E_REQUIRES_02A");
    expect(migration).toContain("STAFF_SERVICE_02E_REQUIRES_02B");
    expect(migration).toContain("STAFF_SERVICE_02E_REQUIRES_02D");
    expect(migration).toContain("public.staff_service_reject_event_mutation()");
    expect(migration).toContain("public.staff_service_touch_updated_at()");
  });

  test("all eight modules exist with RLS enabled", () => {
    for (const table of [
      "staff_issued_documents",
      "staff_performance_evaluations",
      "staff_attendance_days",
      "staff_overtime_claims",
      "staff_training_enrollments",
      "staff_promotion_cases",
      "staff_clearance_cases",
      "staff_value_added_audit_events",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  test("verification tokens are opaque and stored only as a digest", () => {
    expect(migration).toContain("verification_token_digest text not null unique");
    expect(migration).toContain("encode(sha256(convert_to(");
    expect(migration).toContain("gen_random_uuid()");
    expect(migration).not.toContain("verification_token text not null");
    expect(adapter).toContain("verification_token_digest");
    expect(adapter).toContain("staffValueAddedForbiddenColumns");
  });

  test("only the public verifier is granted to anon", () => {
    expect(migration).toContain(
      "grant execute on function public.staff_service_verify_issued_document(text) to anon, authenticated;",
    );
    for (const fn of [
      "staff_service_issue_document(uuid, integer)",
      "staff_service_revoke_issued_document(uuid, text)",
      "staff_service_decide_clearance_checkpoint(uuid, text, text)",
      "staff_service_get_value_added_capabilities()",
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn} from public, anon;`);
    }
  });

  test("critical actions are audited and the ledger is append-only", () => {
    for (const event of [
      "document_issued",
      "document_revoked",
      "document_verified",
      "evaluation_finalized",
      "evaluation_acknowledged",
      "overtime_submitted",
      "training_completed",
      "clearance_custody_override",
      "clearance_completed",
    ]) {
      expect(migration).toContain(event);
    }
    expect(migration).toContain("staff_value_added_audit_immutable_update");
    expect(migration).toContain("staff_value_added_audit_immutable_delete");
  });

  test("finance impact is a separate least-privilege table", () => {
    expect(migration).toContain("create table public.staff_overtime_financial_impact");
    expect(migration).toContain("create table public.staff_promotion_financial_impact");
    expect(migration).toContain(
      "create policy staff_overtime_financial_impact_finance_read",
    );
    expect(migration).toContain(
      "create policy staff_promotion_financial_impact_finance_read",
    );
  });

  test("clearance checkpoints require a real assignment, not admin implication", () => {
    expect(migration).toContain("STAFF_SERVICE_CHECKPOINT_OWNER_ONLY");
    expect(migration).toContain("from public.staff_service_role_assignments a");
    expect(migration).toContain("STAFF_SERVICE_CLEARANCE_OVERRIDE_DENIED");
  });

  test("adapter uses strict projections, Zod and RPC-only writes", () => {
    expect(adapter).toContain("STAFF_SELF_SERVICE_VALUE_ADDED_MARKER");
    expect(adapter).not.toContain('.select("*")');
    expect(adapter).toContain("toSafeReadError");
    expect(adapter).toContain('"staff_service_get_value_added_capabilities"');
  });

  test("UI is RTL, capability-gated and never queries the database directly", () => {
    for (const source of [employeePanel, adminPanel]) {
      expect(source).toContain('dir="rtl"');
      expect(source).not.toContain("@/integrations/supabase/client");
      expect(source).toContain("staff-self-service-value-added");
    }
    expect(adminPanel).toContain("fetchStaffValueAddedCapabilities");
    expect(adminPanel).toContain("capabilities.can_view_financial_impact");
    expect(adminPanel).toContain("capabilities.can_issue_documents");
    expect(adminPanel).toContain("capabilities.can_view_audit_scope");
  });

  test("public verification route is opaque-token based and minimal", () => {
    expect(publicRoute).toContain("verifyIssuedDocument");
    expect(publicRoute).toContain("staff-02e-public-verification");
    expect(publicRoute).toContain('name: "robots", content: "noindex"');
    expect(publicRoute).not.toContain("staff_profile_id");
  });

  test("both surfaces stay behind the fail-closed feature flag", () => {
    const features = read("src/lib/portal-features.ts");
    const staffRoute = read("src/routes/staff.index.tsx");
    const adminRoute = read("src/routes/admin/staff-management.tsx");
    expect(features).toContain("staffSelfServiceValueAdded: false");
    expect(staffRoute).toContain("<StaffValueAddedEmployeePanel />");
    expect(staffRoute).toContain("portalFeatures.staffSelfServiceValueAdded");
    expect(adminRoute).toContain("<StaffValueAddedAdminPanel />");
    expect(adminRoute).toContain("portalFeatures.staffSelfServiceValueAdded");
  });

  test("verifier is transactional and pins the negative matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const marker of [
      "A_EMPLOYEE_SELF_ISSUE_UNEXPECTED_SUCCESS",
      "A_UNAPPROVED_REQUEST_ISSUE_UNEXPECTED_SUCCESS",
      "B_TOKEN_STORED_IN_CLEAR",
      "B_REVOKED_DOCUMENT_STILL_VALID",
      "B_ANON_DOCUMENT_TABLE_READ_UNEXPECTED_SUCCESS",
      "C_SELF_FINALIZE_UNEXPECTED_SUCCESS",
      "C_DRAFT_EVALUATION_DISCLOSED_TO_EMPLOYEE",
      "D_PEER_ATTENDANCE_DISCLOSURE",
      "E_SELF_APPROVAL_UNEXPECTED_SUCCESS",
      "E_STAGE_SKIP_UNEXPECTED_SUCCESS",
      "E_EMPLOYEE_FINANCIAL_IMPACT_DISCLOSURE",
      "F_CROSS_CHECKPOINT_UNEXPECTED_SUCCESS",
      "F_HR_CUSTODY_OVERRIDE_UNEXPECTED_SUCCESS",
      "F_CUSTODY_OVERRIDE_NOT_AUDITED",
      "G_AUDIT_UPDATE_UNEXPECTED_SUCCESS",
      "H_OUTSIDER_CAPABILITY_LEAK",
      "I_ANON_RPC_GRANT",
      "PASS_STAFF_SELF_SERVICE_PG17_VALUE_ADDED_02E",
    ]) {
      expect(verifier).toContain(marker);
    }
  });
});

/**
 * Runtime gate — dual backend.
 * Uses a local PostgreSQL 17 toolchain when available, otherwise a disposable
 * `postgres:17` Docker container (the 02B pattern). If neither backend exists
 * the test fails loudly; it never skips silently.
 */

type Backend = "local" | "docker";

const container = `staff-self-service-02e-${Date.now()}`;
let backend: Backend | null = null;
let dataDir = "";
let socketDir = "";
let started = false;

function hasLocalPg17() {
  const version = spawnSync("postgres", ["--version"], { encoding: "utf8" });
  return version.status === 0 && (version.stdout ?? "").includes("17.");
}

function hasDocker() {
  return spawnSync("docker", ["--version"], { encoding: "utf8" }).status === 0;
}

/**
 * PostgreSQL refuses to run as root, so a local cluster is driven through an
 * unprivileged uid discovered from the environment (never a hard-coded one).
 * The Docker path needs no uid juggling at all.
 */
function unprivilegedUid(): number | null {
  const candidates = [
    process.env["SUDO_UID"],
    process.env["PG_TEST_UID"],
    "1000",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const uid = Number.parseInt(candidate, 10);
    if (Number.isInteger(uid) && uid > 0) {
      const probe = spawnSync("id", ["-u", String(uid)], { encoding: "utf8" });
      if (probe.status === 0) return uid;
    }
  }
  return null;
}

let asRunner: string[] = [];

function runLocal(command: string, args: string[]) {
  const full = [...asRunner, command, ...args];
  return spawnSync(full[0]!, full.slice(1), { encoding: "utf8" });
}

function psql(sql: string): { ok: boolean; out: string } {
  const result =
    backend === "docker"
      ? spawnSync(
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
          { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        )
      : spawnSync(
          "psql",
          [
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-h",
            socketDir,
            "-U",
            "postgres",
            "-d",
            "postgres",
          ],
          { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        );
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function teardown() {
  if (backend === "docker") {
    try {
      execSync(`docker rm -f ${container}`, { stdio: "ignore" });
    } catch {
      // Container may not exist after a failed start.
    }
    return;
  }
  if (started) {
    try {
      runLocal("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"]);
    } catch {
      // Cluster may already be down.
    }
    started = false;
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (socketDir) rmSync(socketDir, { recursive: true, force: true });
}

async function startLocal() {
  dataDir = mkdtempSync(join(tmpdir(), "staff-02e-pg17-"));
  socketDir = mkdtempSync(join(tmpdir(), "staff-02e-sock-"));
  if (process.getuid?.() === 0) {
    const uid = unprivilegedUid();
    if (uid === null) {
      throw new Error(
        "local postgres backend requires a non-root uid (set PG_TEST_UID)",
      );
    }
    asRunner = ["setpriv", `--reuid=${uid}`, `--regid=${uid}`, "--clear-groups"];
    execSync(`chown -R ${uid}:${uid} ${dataDir} ${socketDir}`);
  }
  chmodSync(socketDir, 0o777);

  const init = runLocal("initdb", [
    "-D",
    dataDir,
    "-U",
    "postgres",
    "--auth=trust",
  ]);
  if (init.status !== 0) {
    throw new Error(`initdb failed:\n${init.stdout}\n${init.stderr}`);
  }
  const start = runLocal("pg_ctl", [
    "-D",
    dataDir,
    "-o",
    `-k ${socketDir} -c listen_addresses=''`,
    "-l",
    `${dataDir}/log`,
    "start",
    "-w",
  ]);
  if (start.status !== 0) {
    throw new Error(`pg_ctl start failed:\n${start.stdout}\n${start.stderr}`);
  }
  started = true;
}

async function startDocker() {
  teardown();
  execSync(
    `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine`,
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (ready.status === 0 && psql("select 1;").ok) return;
    await Bun.sleep(500);
  }
  throw new Error("docker postgres:17 did not become ready");
}

afterAll(teardown);

describe("PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02E — PostgreSQL 17 runtime", () => {
  test(
    "applies 02A + 02B + 02D + 02E and proves the value-added security matrix",
    async () => {
      if (hasLocalPg17()) {
        backend = "local";
        await startLocal();
      } else if (hasDocker()) {
        backend = "docker";
        await startDocker();
      } else {
        throw new Error(
          "no PostgreSQL 17 backend available: install postgres 17 locally or provide Docker",
        );
      }

      try {
        const ready = psql("select version();");
        if (!ready.ok) throw new Error(`cluster not ready:\n${ready.out}`);
        expect(ready.out).toContain("PostgreSQL 17.");

        const schema = psql(readFileSync(minimalSchemaPath, "utf8"));
        if (!schema.ok) throw new Error(`minimal schema failed:\n${schema.out}`);

        const a = psql(foundation);
        if (!a.ok) throw new Error(`02A apply failed:\n${a.out}`);

        const b = psql(storage);
        if (!b.ok) throw new Error(`02B apply failed:\n${b.out}`);

        const d = psql(readSide);
        if (!d.ok) throw new Error(`02D apply failed:\n${d.out}`);

        const e = psql(migration);
        if (!e.ok) throw new Error(`02E apply failed:\n${e.out}`);

        const verification = psql(verifier);
        if (!verification.ok) {
          throw new Error(`02E verification failed:\n${verification.out}`);
        }
        expect(verification.out).toContain(
          "PASS_STAFF_SELF_SERVICE_PG17_VALUE_ADDED_02E",
        );
      } finally {
        teardown();
      }
    },
    300_000,
  );
});
