import { afterAll, describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

const foundation = read(
  "supabase/migrations/20260821220000_staff_self_service_backend_foundation_02a.sql",
);
const storage = read(
  "supabase/migrations/20260822010000_staff_self_service_storage_binding_02b.sql",
);
const readSide = read(
  "supabase/migrations/20260822030000_staff_self_service_live_read_side_02d.sql",
);
const valueAdded = read(
  "supabase/migrations/20260822040000_staff_self_service_value_added_02e.sql",
);
const migration = read(
  "supabase/migrations/20260822050000_staff_self_service_governance_02f.sql",
);
const verifier = read("tests/staff-self-service/pg17/40-verifier-02f.sql");
const adapter = read("src/lib/staff-self-service-governance.ts");
const panels = read(
  "src/components/staff-showcase/StaffGovernancePanels.tsx",
);
const features = read("src/lib/portal-features.ts");
const employeeRoute = read("src/routes/staff.index.tsx");
const adminRoute = read("src/routes/admin/staff-management.tsx");
const minimalSchemaPath = join(
  root,
  "tests/staff-self-service/pg17/00-minimal-schema.sql",
);

describe("PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F — source contract", () => {
  test("depends on the complete employee self-service chain", () => {
    expect(migration).toContain("STAFF_SERVICE_02F_REQUIRES_02A_02B_02D_02E");
    expect(migration).toContain("staff_service_read_audit_events");
    expect(migration).toContain("staff_value_added_audit_events");
    expect(migration).toContain("staff_service_reject_event_mutation()");
  });

  test("MFA is checked from trusted JWT claims and enforced by data RPCs", () => {
    expect(migration).toContain("request.jwt.claim.aal");
    expect(migration).toContain("request.jwt.claims");
    expect(migration).toContain("function public.staff_service_require_aal2()");
    expect(migration.slice(
      migration.indexOf("function public.staff_service_list_governance_report"),
      migration.indexOf("function public.staff_service_record_governance_report_export"),
    )).toContain("staff_service_governance_report_scope");
    for (const fn of [
      "staff_service_get_integration_health",
      "staff_service_list_governance_audit",
    ]) {
      const start = migration.indexOf(`function public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      expect(migration.slice(start, start + 1800)).toContain(
        "staff_service_require_aal2",
      );
    }
  });

  test("integration tables are structured read-only projections", () => {
    expect(migration).toContain("create table public.staff_hr_read_snapshots");
    expect(migration).toContain(
      "create table public.staff_finance_read_snapshots",
    );
    expect(migration).not.toMatch(/create table public\.staff_(hr|finance)_read_snapshots[\s\S]{0,1200}\b(payload|endpoint|credential|access_token)\b/);
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("from public, anon, authenticated;");
  });

  test("manager reports are explicitly department-scoped", () => {
    expect(migration).toContain("v_scope = 'institution'");
    expect(migration).toContain("a.role = 'direct_manager'");
    expect(migration).toContain("a.department_id = sp.department_id");
    expect(migration).toContain("STAFF_SERVICE_REPORT_ACCESS_DENIED");
  });

  test("unified audit is append-only and emits an allowlisted DTO", () => {
    expect(migration).toContain("staff_governance_audit_immutable_update");
    expect(migration).toContain("staff_governance_audit_immutable_delete");
    expect(migration).toContain("jsonb_build_object(");
    expect(migration).not.toContain("'metadata', metadata");
    expect(migration).not.toContain("'reason', reason");
    expect(adapter).toContain("governanceForbiddenFields");
  });

  test("adapter is RPC-only, typed and validates all DTOs", () => {
    expect(adapter).toContain('import { z } from "zod"');
    expect(adapter).not.toContain("supabase.from");
    for (const rpc of [
      "staff_service_get_governance_capabilities",
      "staff_service_get_own_integration_provenance",
      "staff_service_list_governance_report",
      "staff_service_record_governance_report_export",
      "staff_service_get_integration_health",
      "staff_service_list_governance_audit",
    ]) {
      expect(adapter).toContain(`"${rpc}"`);
    }
  });

  test("React surfaces are RTL and contain no direct Supabase access", () => {
    expect(panels).toContain('dir="rtl"');
    expect(panels).toContain("staff-governance-employee-panel");
    expect(panels).toContain("staff-governance-admin-panel");
    expect(panels).toContain("staff-02f-mfa-required");
    expect(panels).not.toContain("@/integrations/supabase");
    expect(panels).not.toContain(".from(");
    expect(panels).not.toContain(".rpc(");
  });

  test("feature flag stays fail-closed and both portals are wired", () => {
    expect(features).toContain("staffSelfServiceGovernance: false");
    expect(employeeRoute).toContain("StaffGovernanceEmployeePanel");
    expect(employeeRoute).toContain(
      "portalFeatures.staffSelfServiceGovernance",
    );
    expect(adminRoute).toContain("StaffGovernanceAdminPanel");
    expect(adminRoute).toContain("portalFeatures.staffSelfServiceGovernance");
  });

  test("PG17 verifier pins all role and security boundaries", () => {
    for (const marker of [
      "A_AUTHENTICATED_INGEST_UNEXPECTED_SUCCESS",
      "B_OWN_PROVENANCE_LEAK",
      "C_AAL1_REPORT_UNEXPECTED_SUCCESS",
      "D_MANAGER_CROSS_DEPARTMENT_UNEXPECTED_SUCCESS",
      "D_MANAGER_EXPORT_UNEXPECTED_SUCCESS",
      "E_HR_INSTITUTION_SCOPE_WRONG",
      "F_FINANCE_REPORT_UNEXPECTED_SUCCESS",
      "F_OUTSIDER_REPORT_UNEXPECTED_SUCCESS",
      "G_UNIFIED_AUDIT_SENSITIVE_FIELD_LEAK",
      "H_GOVERNANCE_AUDIT_UPDATE_UNEXPECTED_SUCCESS",
      "I_ANON_GOVERNANCE_RPC_GRANT",
      "PASS_STAFF_SELF_SERVICE_PG17_GOVERNANCE_02F",
    ]) {
      expect(verifier).toContain(marker);
    }
  });
});

type Backend = "local" | "docker";

const container = `staff-self-service-02f-${Date.now()}`;
let backend: Backend | null = null;
let dataDir = "";
let socketDir = "";
let started = false;
let asRunner: string[] = [];

function hasLocalPg17() {
  const version = spawnSync("postgres", ["--version"], { encoding: "utf8" });
  return version.status === 0 && (version.stdout ?? "").includes("17.");
}

function hasDocker() {
  return spawnSync("docker", ["--version"], { encoding: "utf8" }).status === 0;
}

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
      // Disposable container may already be absent.
    }
    return;
  }
  if (started) {
    try {
      runLocal("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"]);
    } catch {
      // Local disposable cluster may already be stopped.
    }
    started = false;
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (socketDir) rmSync(socketDir, { recursive: true, force: true });
}

async function startLocal() {
  dataDir = mkdtempSync(join(tmpdir(), "staff-02f-pg17-"));
  socketDir = mkdtempSync(join(tmpdir(), "staff-02f-sock-"));
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

describe("PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F — PostgreSQL 17 runtime", () => {
  test(
    "applies 02A + 02B + 02D + 02E + 02F and proves governance boundaries",
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
        const e = psql(valueAdded);
        if (!e.ok) throw new Error(`02E apply failed:\n${e.out}`);
        const f = psql(migration);
        if (!f.ok) throw new Error(`02F apply failed:\n${f.out}`);

        const verification = psql(verifier);
        if (!verification.ok) {
          throw new Error(`02F verification failed:\n${verification.out}`);
        }
        expect(verification.out).toContain(
          "PASS_STAFF_SELF_SERVICE_PG17_GOVERNANCE_02F",
        );
      } finally {
        teardown();
      }
    },
    300_000,
  );
});
