import { afterAll, describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();

const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260822030000_staff_self_service_live_read_side_02d.sql",
  ),
  "utf8",
);
const foundation = readFileSync(
  join(
    root,
    "supabase/migrations/20260821220000_staff_self_service_backend_foundation_02a.sql",
  ),
  "utf8",
);
const storage = readFileSync(
  join(
    root,
    "supabase/migrations/20260822010000_staff_self_service_storage_binding_02b.sql",
  ),
  "utf8",
);
const minimalSchemaPath = join(
  root,
  "tests/staff-self-service/pg17/00-minimal-schema.sql",
);
const verifier = readFileSync(
  join(root, "tests/staff-self-service/pg17/20-verifier-02d.sql"),
  "utf8",
);

const readAdapter = readFileSync(root + "/src/lib/staff-self-service-read.ts", "utf8");
const pdfServer = readFileSync(
  root + "/src/lib/staff/staff-payroll-pdf.server.ts",
  "utf8",
);
const pdfFunctions = readFileSync(
  root + "/src/lib/staff/staff-payroll-pdf.functions.ts",
  "utf8",
);
const dashboard = readFileSync(
  root + "/src/components/staff-showcase/StaffSelfServiceLiveDashboard.tsx",
  "utf8",
);
const workbench = readFileSync(
  root + "/src/components/staff-showcase/StaffSelfServiceLiveWorkbench.tsx",
  "utf8",
);
const staffRoute = readFileSync(root + "/src/routes/staff.index.tsx", "utf8");
const adminRoute = readFileSync(
  root + "/src/routes/admin/staff-management.tsx",
  "utf8",
);

describe("PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D — source contract", () => {
  test("migration removes the client receipt UPDATE path and adds an append-only ledger", () => {
    expect(migration).toContain("STAFF_SERVICE_02D_REQUIRES_02A");
    expect(migration).toContain("STAFF_SERVICE_02D_REQUIRES_02B");
    expect(migration).toContain(
      "revoke update on table public.staff_correspondence_recipients",
    );
    expect(migration).toContain(
      "drop policy if exists staff_correspondence_recipients_owner_ack",
    );
    expect(migration).toContain("create table public.staff_service_read_audit_events");
    expect(migration).toContain("staff_service_read_audit_immutable_update");
    expect(migration).toContain("staff_service_read_audit_immutable_delete");
    expect(migration).toContain(
      "alter table public.staff_service_read_audit_events enable row level security",
    );
  });

  test("read-side RPCs are security definer, monotonic, and fail closed", () => {
    for (const fn of [
      "staff_service_record_correspondence_read",
      "staff_service_acknowledge_correspondence",
      "staff_service_authorize_payroll_statement_download",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}(`);
      expect(migration).toContain(
        `revoke all on function public.${fn}(uuid)\n  from public, anon`,
      );
    }
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("STAFF_SERVICE_AUTH_REQUIRED");
    expect(migration).toContain("STAFF_SERVICE_CORRESPONDENCE_ACCESS_DENIED");
    expect(migration).toContain("STAFF_SERVICE_PAYROLL_ACCESS_DENIED");
    expect(migration).toContain("STAFF_SERVICE_PAYROLL_STATEMENT_NOT_PUBLISHED");
    // The unpublished payroll gap is closed at the RLS layer, not only in RPC.
    expect(migration).toContain(
      "drop policy if exists staff_payroll_statements_owner_or_finance_read",
    );
    expect(migration).toContain(
      "drop policy if exists staff_payroll_components_owner_or_finance_read",
    );
    expect(migration).toContain("and ps.published_at is not null");
    // Payroll downloads are appended per call; only receipt facts are unique.
    expect(migration).toContain(
      "create unique index staff_service_read_audit_correspondence_uq",
    );
    expect(migration).toContain("where subject_kind = 'correspondence'");
    expect(migration).toContain(
      "create or replace function public.staff_service_get_current_capabilities()",
    );
    expect(migration).toContain(
      "revoke all on function public.staff_service_get_current_capabilities()\n  from public, anon",
    );
    // Monotonic: existing timestamps are never overwritten.
    expect(migration).toContain("read_at = coalesce(r.read_at, v_now)");
    expect(migration).toContain(
      "acknowledged_at = coalesce(r.acknowledged_at, v_now)",
    );
  });

  test("read adapter uses strict projections and never leaks sensitive columns", () => {
    expect(readAdapter).toContain("STAFF_SELF_SERVICE_READ_SIDE_MARKER");
    for (const forbidden of [
      "payload",
      "last_error",
      "idempotency_key",
      "sha256",
      "object_path",
      "pdf_object_path",
      "source_reference",
    ]) {
      expect(readAdapter).toContain(forbidden);
    }
    // Circular body is the point of the inbox and is already RLS-guarded.
    expect(readAdapter).toContain("body,importance");
    expect(readAdapter).not.toContain('"body",\n] as const');
    // Projections are explicit column lists, never select("*").
    expect(readAdapter).not.toContain('.select("*")');
    expect(readAdapter).toContain("STAFF_READ_GENERIC_ERROR");
    expect(readAdapter).toContain("toSafeReadError");
    expect(readAdapter).toContain(
      '"staff_service_record_correspondence_read"',
    );
    expect(readAdapter).toContain('"staff_service_acknowledge_correspondence"');
    expect(readAdapter).toContain(
      '"staff_service_authorize_payroll_statement_download"',
    );
  });

  test("payroll PDF is server-only and re-authorizes through the RPC", () => {
    expect(pdfServer).toContain("pdf-lib");
    expect(pdfServer).toContain("drawBidiLine");
    expect(pdfFunctions).toContain("createServerFn");
    expect(pdfFunctions).toContain("requireSupabaseAuth");
    expect(pdfFunctions).toContain(
      "staff_service_authorize_payroll_statement_download",
    );
    // The client never imports the server-only builder directly.
    expect(dashboard).not.toContain("staff-payroll-pdf.server");
    expect(dashboard).toContain("generateStaffPayrollStatementPdf");
  });

  test("UI is RTL, fail-closed, and never queries the database directly", () => {
    for (const source of [dashboard, workbench]) {
      expect(source).toContain('dir="rtl"');
      expect(source).not.toContain("@/integrations/supabase/client");
      expect(source).toContain("staff-self-service-read");
    }
    expect(dashboard).toContain("staff-self-service-live-read-dashboard");
    expect(workbench).toContain("staff-self-service-live-workbench");
    // Section visibility comes from the boolean-only capability probe, never
    // from the presence of another employee's row.
    expect(workbench).toContain("fetchStaffServiceCapabilities");
    expect(workbench).toContain("capabilities.can_view_payroll_scope");
    expect(workbench).toContain("capabilities.can_view_hr_scope");
    expect(workbench).toContain("capabilities.can_view_audit_scope");
    expect(workbench).not.toContain("statement.staff_profile_id !== ownProfileId");
    expect(workbench).toContain("staff-02d-wb-payroll-empty");
    expect(workbench).toContain("لا تملك صلاحية الاطلاع على بيانات الرواتب");
    expect(workbench).toContain("fetchStaffCorrespondenceReceiptSummary");
    expect(workbench).toContain("recipients_total");
    // Employee inbox renders the circular body after opening it.
    expect(dashboard).toContain("staff-02d-correspondence-body");
    expect(dashboard).toContain("{letter.body}");
  });

  test("both surfaces activate under the controlled 02G showcase flag", () => {
    const features = readFileSync(root + "/src/lib/portal-features.ts", "utf8");
    expect(features).toContain("staffSelfServiceLive: true");
    expect(staffRoute).toContain("<StaffSelfServiceLiveDashboard />");
    expect(staffRoute).toContain("portalFeatures.staffSelfServiceLive");
    expect(adminRoute).toContain("<StaffSelfServiceLiveWorkbench />");
    expect(adminRoute).toContain("portalFeatures.staffSelfServiceLive");
  });

  test("verifier is transactional and pins the negative matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const marker of [
      "A_CLIENT_RECEIPT_UPDATE_GRANT_STILL_PRESENT",
      "B_READ_TIMESTAMP_NOT_MONOTONIC",
      "B_UNPUBLISHED_CORRESPONDENCE_UNEXPECTED_SUCCESS",
      "C_OUTSIDER_ACK_UNEXPECTED_SUCCESS",
      "D_MANAGER_PAYROLL_DISCLOSURE",
      "D_PEER_PAYROLL_DISCLOSURE",
      "D_UNPUBLISHED_PAYROLL_UNEXPECTED_SUCCESS",
      "E_AUDIT_CROSS_ACTOR_DISCLOSURE",
      "E_AUDIT_UPDATE_UNEXPECTED_SUCCESS",
      "F_BROAD_CLIENT_TABLE_GRANT",
      "F_ANON_RPC_GRANT",
      "D_UNPUBLISHED_STATEMENT_DIRECT_SELECT_DISCLOSURE",
      "D_UNPUBLISHED_COMPONENTS_DIRECT_SELECT_DISCLOSURE",
      "D_PAYROLL_DOWNLOAD_AUDIT_NOT_APPENDED",
      "D_CORRESPONDENCE_AUDIT_NOT_IDEMPOTENT",
      "G_EMPLOYEE_PAYROLL_CAPABILITY_LEAK",
      "G_MANAGER_PAYROLL_CAPABILITY_LEAK",
      "G_FINANCE_CAPABILITY_WRONG",
      "G_OUTSIDER_CAPABILITY_LEAK",
      "PASS_STAFF_SELF_SERVICE_PG17_LIVE_READ_SIDE_02D",
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

const container = `staff-self-service-02d-${Date.now()}`;
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
  dataDir = mkdtempSync(join(tmpdir(), "staff-02d-pg17-"));
  socketDir = mkdtempSync(join(tmpdir(), "staff-02d-sock-"));
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

describe("PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D — PostgreSQL 17 runtime", () => {
  test(
    "applies 02A + 02B + 02D and proves the read-side security matrix",
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

        const d = psql(migration);
        if (!d.ok) throw new Error(`02D apply failed:\n${d.out}`);

        const verification = psql(verifier);
        if (!verification.ok) {
          throw new Error(`02D verification failed:\n${verification.out}`);
        }
        expect(verification.out).toContain(
          "PASS_STAFF_SELF_SERVICE_PG17_LIVE_READ_SIDE_02D",
        );
      } finally {
        teardown();
      }
    },
    300_000,
  );
});
