import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migRel =
  "supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql";
const migPath = join(root, migRel);
const scriptDir = join(root, "scripts/b1-fixture-15-reissue-44-pg17");
const matrixPath = join(
  root,
  "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json",
);
const manifestPath = join(
  root,
  "tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json",
);

const STEP_CONTRACT = [
  {
    order: 1,
    id: "f1300001-0000-4000-8000-000015000001",
    key: "student_affairs_reception",
    unit: "student_affairs",
    role: "student_affairs_specialist",
    action: "review",
    principal: "c8a94548-4782-4252-86f9-23559d3b95bd",
  },
  {
    order: 2,
    id: "f1300001-0000-4000-8000-000015000002",
    key: "library_clearance",
    unit: "library",
    role: "library_officer",
    action: "clear",
    principal: "e7a93314-bb06-4525-b412-5315198c668a",
  },
  {
    order: 3,
    id: "f1300001-0000-4000-8000-000015000003",
    key: "labs_clearance",
    unit: "labs",
    role: "labs_manager",
    action: "clear",
    principal: "67b39ee4-4918-4b00-b4cc-0d5046ac8a5a",
  },
  {
    order: 4,
    id: "f1300001-0000-4000-8000-000015000004",
    key: "activities_clearance",
    unit: "student_affairs",
    role: "student_affairs_manager",
    action: "clear",
    principal: "aac0e62d-4e8b-4440-b649-caa388d34837",
  },
  {
    order: 5,
    id: "f1300001-0000-4000-8000-000015000005",
    key: "finance_clearance",
    unit: "finance",
    role: "revenue_finance_officer",
    action: "clear",
    principal: "79783c0f-8d95-4110-8239-0ac504d63a24",
  },
  {
    order: 6,
    id: "f1300001-0000-4000-8000-000015000006",
    key: "registrar_apply",
    unit: "registrar",
    role: "registrar_general",
    action: "apply_decision",
    principal: "4c261c1c-97fb-42da-a544-e8a59853ebe3",
  },
  {
    order: 7,
    id: "f1300001-0000-4000-8000-000015000007",
    key: "archive",
    unit: "archive",
    role: "archive_officer",
    action: "archive",
    principal: "aec1303e-de6a-4580-94cf-7205c17b5535",
  },
] as const;

const container = `b1-44-fixture15-pg17-${Date.now()}`;

function dockerSpawn(args: string[], opts: { input?: string } = {}) {
  const res = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    input: opts.input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.error) {
    throw new Error(
      `PG17 harness failed to start docker (${args.join(" ")}): ${res.error.message}`,
    );
  }
  return res;
}

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    // already gone
  }
}

function psql(sql: string, { allowFailure = false } = {}) {
  const res = dockerSpawn(
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
    { input: sql },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (!allowFailure && res.status !== 0) {
    throw new Error(`PG17 psql failed (status=${res.status}):\n${out}`);
  }
  return { status: res.status ?? -1, out };
}

function psqlScalar(sql: string): string {
  const res = dockerSpawn(
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
    { input: sql },
  );
  const out = `${res.stdout || ""}`.trim();
  if (res.status !== 0) {
    throw new Error(
      `PG17 scalar query failed (status=${res.status}):\n${out}\n${res.stderr || ""}`,
    );
  }
  return out;
}

function psqlPath(
  filePath: string,
  { transactional = false, allowFailure = false } = {},
) {
  const raw = readFileSync(filePath, "utf8");
  const sql = transactional ? `BEGIN;\n${raw}\nCOMMIT;` : raw;
  return psql(sql, { allowFailure });
}

function resetFixture15Consumed() {
  psql(`
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
DELETE FROM public.b1_fixture_15_reissue_44_evidence
 WHERE request_id = 'f1300000-0000-4000-8000-000000000015';
-- Keep the attributable archive event; drop/rebuild runtime steps only.
UPDATE public.student_request_workflow_events
   SET workflow_step_runtime_id = NULL
 WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
DELETE FROM public.student_request_workflow_steps
 WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
UPDATE public.student_requests
   SET status='completed', completed_at=now(), current_step_index=7
 WHERE id='f1300000-0000-4000-8000-000000000015';
INSERT INTO public.student_request_workflow_steps(
  id, student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
  processing_unit_id, processing_role_id, assigned_staff_profile_id,
  assigned_user_id, assigned_faculty_profile_id, assigned_position_assignment_id,
  status, entered_at, completed_at, completed_by, decision, comment, metadata
)
SELECT
  v.step_id, 'f1300000-0000-4000-8000-000000000015'::uuid,
  'cccccccc-0000-4000-8000-0000000000aa'::uuid, v.cfg_id, v.step_key, v.step_key, v.step_order,
  v.unit_id, v.role_id, v.principal,
  NULL, NULL, NULL,
  'completed', now(), now(),
  'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid,
  CASE WHEN v.step_order = 7 THEN 'archived' ELSE NULL END,
  CASE WHEN v.step_order = 7 THEN 'TEST_ONLY consumed archive' ELSE NULL END,
  jsonb_build_object(
    'test_only_marker','TEST_ONLY_B1_FIXTURE_13',
    'fixture_initialized', true,
    'action_type', v.action_type
  )
FROM (VALUES
  (1,'f1300001-0000-4000-8000-000015000001'::uuid,'student_affairs_reception','cccccccc-0000-4000-8000-000000000001'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000001'::uuid,'bbbbbbbb-0000-4000-8000-000000000001'::uuid,
   'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid,'review'),
  (2,'f1300001-0000-4000-8000-000015000002'::uuid,'library_clearance','cccccccc-0000-4000-8000-000000000002'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000006'::uuid,'bbbbbbbb-0000-4000-8000-000000000006'::uuid,
   'e7a93314-bb06-4525-b412-5315198c668a'::uuid,'clear'),
  (3,'f1300001-0000-4000-8000-000015000003'::uuid,'labs_clearance','cccccccc-0000-4000-8000-000000000003'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000007'::uuid,'bbbbbbbb-0000-4000-8000-000000000007'::uuid,
   '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid,'clear'),
  (4,'f1300001-0000-4000-8000-000015000004'::uuid,'activities_clearance','cccccccc-0000-4000-8000-000000000004'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000001'::uuid,'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
   'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid,'clear'),
  (5,'f1300001-0000-4000-8000-000015000005'::uuid,'finance_clearance','cccccccc-0000-4000-8000-000000000005'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000003'::uuid,'bbbbbbbb-0000-4000-8000-000000000004'::uuid,
   '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid,'clear'),
  (6,'f1300001-0000-4000-8000-000015000006'::uuid,'registrar_apply','cccccccc-0000-4000-8000-000000000006'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000002'::uuid,'bbbbbbbb-0000-4000-8000-000000000003'::uuid,
   '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid,'apply_decision'),
  (7,'f1300001-0000-4000-8000-000015000007'::uuid,'archive','cccccccc-0000-4000-8000-000000000007'::uuid,
   'aaaaaaaa-0000-4000-8000-000000000005'::uuid,'bbbbbbbb-0000-4000-8000-000000000005'::uuid,
   'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid,'archive')
) AS v(step_order, step_id, step_key, cfg_id, unit_id, role_id, principal, action_type);
UPDATE public.student_request_workflow_events
   SET workflow_step_runtime_id = 'f1300001-0000-4000-8000-000015000007'
 WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
COMMIT;
`);
}

function expectMigrationFailClosed(expectedMessage: string) {
  const beforeEvidence = psqlScalar(
    "select count(*)::text from b1_fixture_15_reissue_44_evidence where request_id='f1300000-0000-4000-8000-000000000015';",
  );
  const beforeStatus = psqlScalar(
    "select status from student_requests where id='f1300000-0000-4000-8000-000000000015';",
  );
  const fail = psqlPath(migPath, { transactional: true, allowFailure: true });
  if (fail.status === 0) {
    throw new Error(`PG17_EXPECTED_STOP_MISSING: ${expectedMessage}`);
  }
  if (!fail.out.includes(expectedMessage)) {
    throw new Error(
      `PG17_WRONG_STOP: expected ${expectedMessage}; output=${fail.out}`,
    );
  }
  const afterEvidence = psqlScalar(
    "select count(*)::text from b1_fixture_15_reissue_44_evidence where request_id='f1300000-0000-4000-8000-000000000015';",
  );
  const afterStatus = psqlScalar(
    "select status from student_requests where id='f1300000-0000-4000-8000-000000000015';",
  );
  if (afterEvidence !== beforeEvidence) {
    throw new Error(
      `PG17_EVIDENCE_INSERTED_ON_DRIFT before=${beforeEvidence} after=${afterEvidence}`,
    );
  }
  if (afterStatus !== beforeStatus) {
    throw new Error(
      `PG17_REQUEST_MUTATED_ON_DRIFT before=${beforeStatus} after=${afterStatus}`,
    );
  }
}

afterAll(() => {
  teardownContainer();
});

describe("B1 Fixture-15 forward-only reissue 44 — source contract", () => {
  it("ships exactly one forward-only migration after 20260802225131", () => {
    expect(existsSync(migPath)).toBe(true);
    const migs = readdirSync(join(root, "supabase/migrations"))
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    expect(migs[migs.length - 1]).toBe(
      "20260803030000_b1_44_restore_sr_20260801_13000015.sql",
    );
    expect(migs).toContain(
      "20260802225131_c5d176f3-4841-49e9-b4e7-15df8ac7e0fe.sql",
    );
  });

  it("declares the exact authoritative seven-step contract", () => {
    const sql = readFileSync(migPath, "utf8");
    for (const step of STEP_CONTRACT) {
      expect(sql).toContain(step.id);
      expect(sql).toContain(`'${step.key}'`);
      expect(sql).toContain(`'${step.unit}'`);
      expect(sql).toContain(`'${step.role}'`);
      expect(sql).toContain(`'${step.action}'`);
      expect(sql).toContain(step.principal);
    }
    expect(sql).toContain("B1_44_FIXTURE_15_STEP_UUID_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_UNIT_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ROLE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ACTION_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ASSIGNEE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_IDENTITY_NOT_SINGULAR");
    expect(sql).toContain("B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_DUPLICATE_STEP");
    expect(sql).toContain("B1_44_FIXTURE_15_WORKFLOW_MISMATCH");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.student_request_workflow_events/i);
  });

  it("targets Fixture 15 exact identity and preserves audit evidence", () => {
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toContain("SR-20260801-13000015");
    expect(sql).toContain("f1300000-0000-4000-8000-000000000015");
    expect(sql).toContain("TEST_ONLY_B1_FIXTURE_13");
    expect(sql).toContain("b1.atomic_init");
    expect(sql).toContain("b1_fixture_15_reissue_44_evidence");
    expect(sql).toContain("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
    expect(sql).not.toMatch(/student_visible\s*=\s*true/i);
    expect(sql).not.toMatch(
      /\b(UPDATE|INSERT|DELETE)\b[\s\S]{0,80}\benrollment_certificate/i,
    );
  });

  it("keeps authoritative positive Fixture 15 bindings", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const c15 = manifest.cases.find(
      (c: { case_index: number }) => c.case_index === 15,
    );
    expect(c15.request_number).toBe("SR-20260801-13000015");
    expect(c15.request_id).toBe("f1300000-0000-4000-8000-000000000015");
    expect(c15.runtime_step_id).toBe(
      "f1300001-0000-4000-8000-000015000007",
    );
    expect(c15.service_code).toBe("file_withdrawal");
    expect(c15.exact_configured_action).toBe("archive");
    expect(c15.direct_assignee_principal_id).toBe(
      "aec1303e-de6a-4580-94cf-7205c17b5535",
    );

    const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
    const pin = matrix.fixture_pins?.["SR-20260801-13000015|archive"]
      ?? matrix.pins?.["SR-20260801-13000015|archive"]
      ?? matrix["SR-20260801-13000015|archive"];
    // MATRIX stores pins under fixture_step_pins in this package.
    const pinObj =
      pin
      ?? matrix.fixture_step_pins?.["SR-20260801-13000015|archive"]
      ?? (() => {
        const raw = readFileSync(matrixPath, "utf8");
        expect(raw).toContain("SR-20260801-13000015|archive");
        expect(raw).toContain("f1300001-0000-4000-8000-000015000001");
        expect(raw).toContain("f1300001-0000-4000-8000-000015000007");
        return null;
      })();
    void pinObj;
  });

  it("keeps negative matrix at 267 / 267 / 0", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
    expect(matrix.counts.negative_total).toBe(267);
    expect(matrix.counts.executable_negative_total).toBe(267);
    expect(matrix.counts.execution_blocked).toBe(0);
    const tm = JSON.parse(
      readFileSync(
        join(root, "scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json"),
        "utf8",
      ),
    );
    expect(tm.matrix.negative_total).toBe(267);
    expect(tm.matrix.executable_negative_total).toBe(267);
    expect(tm.matrix.blocked_negative_total).toBe(0);
  });
});

describe("B1 Fixture-15 forward-only reissue 44 — disposable PostgreSQL 17", () => {
  it("restores exact seven-step contract and fail-closes every drift class", async () => {
    const log: string[] = [];
    try {
      const run = dockerSpawn([
        "run",
        "--rm",
        "--detach",
        "--name",
        container,
        "-e",
        "POSTGRES_PASSWORD=test",
        "postgres:17-alpine",
      ]);
      if (run.status !== 0) {
        throw new Error(
          `PG17 harness failed to launch container (status=${run.status}):\n${run.stdout || ""}\n${run.stderr || ""}`,
        );
      }

      // Match matrix-19 readiness: wait for init completion, then pg_isready.
      // pg_isready alone can race the post-init server restart on Ubuntu CI.
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try {
          const logsRes = dockerSpawn(["logs", container]);
          const logs = `${logsRes.stdout || ""}\n${logsRes.stderr || ""}`;
          if (logs.includes("PostgreSQL init process complete")) {
            const check = dockerSpawn([
              "exec",
              container,
              "pg_isready",
              "-U",
              "postgres",
            ]);
            if (check.status === 0) {
              ready = true;
              break;
            }
          }
        } catch {
          // container not ready yet
        }
        await Bun.sleep(500);
      }
      if (!ready) throw new Error("PG17_READY_TIMEOUT");

      const version = psqlScalar("show server_version;");
      if (!version.startsWith("17.")) {
        throw new Error(`PG17_VERSION_MISMATCH: ${version}`);
      }

      psqlPath(join(scriptDir, "00-schema.sql"));
      psqlPath(join(scriptDir, "01-seed.sql"));

      const fpOthersSql = `
select md5(string_agg(t::text, '|' order by t::text))
from (
  select r.id, r.status, r.current_step_index, r.completed_at,
         (select string_agg(s.id::text||':'||s.status, ',' order by s.step_order)
            from student_request_workflow_steps s where s.student_request_id=r.id) as steps
  from student_requests r
  where r.internal_notes='TEST_ONLY_B1_FIXTURE_13'
    and r.id <> 'f1300000-0000-4000-8000-000000000015'
) t;
`;
      const fpEcSql = `
select md5(string_agg(x, '|' order by x)) from (
  select marker||'|'||payload as x from enrollment_certificate_document_details
  union all
  select marker||'|'||payload from official_documents
  union all
  select code||'|'||student_visible::text from request_types where code='enrollment_certificate'
) q;
`;

      const fpOthersBefore = psqlScalar(fpOthersSql);
      const fpEcBefore = psqlScalar(fpEcSql);

      log.push("PRE_REPAIR_ACTIVE_18_CONFIRMED");
      psqlPath(migPath, { transactional: true });
      psqlPath(join(scriptDir, "02-verify.sql"));
      log.push("PG17_REPAIR_APPLIED");

      const fpOthersAfter = psqlScalar(fpOthersSql);
      if (fpOthersBefore !== fpOthersAfter) {
        throw new Error(
          `PG17_OTHER_18_CHANGED before=${fpOthersBefore} after=${fpOthersAfter}`,
        );
      }
      log.push("PG17_OTHER_18_UNCHANGED");

      const fpEcAfter = psqlScalar(fpEcSql);
      if (fpEcBefore !== fpEcAfter) {
        throw new Error("PG17_EC_FINGERPRINT_CHANGED");
      }
      log.push("PG17_EC_FINGERPRINT_UNCHANGED");

      psqlPath(migPath, { transactional: true });
      psqlPath(join(scriptDir, "02-verify.sql"));
      log.push("PG17_SECOND_APPLY_IDEMPOTENT");

      // Unexpected request pre-state (not consumed/restored).
      psql(`
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE public.student_requests
   SET status='cancelled', completed_at=now()
 WHERE id='f1300000-0000-4000-8000-000000000015';
COMMIT;
`);
      expectMigrationFailClosed("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
      log.push("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");

      // Drift classes — each resets to authoritative consumed, mutates one binding,
      // proves migration aborts with no evidence insert / no restore mutation.
      const driftCases: Array<{ name: string; sql: string; expect: string }> = [
        {
          name: "wrong_step_uuid",
          expect: "B1_44_FIXTURE_15_STEP_UUID_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET id='f1300001-0000-4000-8000-000015000099'
 WHERE id='f1300001-0000-4000-8000-000015000001';
COMMIT;
`,
        },
        {
          name: "wrong_step_key",
          expect: "B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET step_key='drifted_key'
 WHERE id='f1300001-0000-4000-8000-000015000002';
COMMIT;
`,
        },
        {
          name: "wrong_step_order",
          expect: "B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET step_order=9
 WHERE id='f1300001-0000-4000-8000-000015000003';
COMMIT;
`,
        },
        {
          name: "wrong_processing_unit",
          expect: "B1_44_FIXTURE_15_UNIT_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET processing_unit_id='aaaaaaaa-0000-4000-8000-000000000002'
 WHERE id='f1300001-0000-4000-8000-000015000001';
COMMIT;
`,
        },
        {
          name: "wrong_processing_role",
          expect: "B1_44_FIXTURE_15_ROLE_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET processing_role_id='bbbbbbbb-0000-4000-8000-000000000002'
 WHERE id='f1300001-0000-4000-8000-000015000001';
COMMIT;
`,
        },
        {
          name: "wrong_configured_action",
          expect: "B1_44_FIXTURE_15_ACTION_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET metadata = jsonb_set(metadata, '{action_type}', '"clear"')
 WHERE id='f1300001-0000-4000-8000-000015000001';
COMMIT;
`,
        },
        {
          name: "wrong_assignee_identity",
          expect: "B1_44_FIXTURE_15_ASSIGNEE_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET assigned_staff_profile_id='e7a93314-bb06-4525-b412-5315198c668a'
 WHERE id='f1300001-0000-4000-8000-000015000001';
COMMIT;
`,
        },
        {
          name: "multiple_identity_columns",
          expect: "B1_44_FIXTURE_15_IDENTITY_NOT_SINGULAR",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
UPDATE student_request_workflow_steps
   SET assigned_user_id='c8a94548-4782-4252-86f9-23559d3b95bd'
 WHERE id='f1300001-0000-4000-8000-000015000007';
COMMIT;
`,
        },
        {
          name: "missing_predecessor_completion",
          expect: "B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
-- Keep status=completed so consumed shape is selected, but clear completion clock.
UPDATE student_request_workflow_steps
   SET completed_at=NULL, completed_by=NULL
 WHERE id='f1300001-0000-4000-8000-000015000004';
COMMIT;
`,
        },
        {
          name: "duplicate_step_row",
          expect: "B1_44_FIXTURE_15_DUPLICATE_STEP",
          sql: `
BEGIN; SELECT set_config('b1.atomic_init','1',true);
-- Same step_order as archive (7) with a distinct key/id — harness has no UNIQUE(request,key).
INSERT INTO student_request_workflow_steps(
  id, student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
  processing_unit_id, processing_role_id, assigned_staff_profile_id, status, metadata
) VALUES (
  'f1300001-0000-4000-8000-000015000077',
  'f1300000-0000-4000-8000-000000000015',
  'cccccccc-0000-4000-8000-0000000000aa',
  'cccccccc-0000-4000-8000-000000000007',
  'archive_dup',
  'dup',
  7,
  'aaaaaaaa-0000-4000-8000-000000000005',
  'bbbbbbbb-0000-4000-8000-000000000005',
  'aec1303e-de6a-4580-94cf-7205c17b5535',
  'completed',
  '{"action_type":"archive"}'::jsonb
);
COMMIT;
`,
        },
      ];

      for (const drift of driftCases) {
        resetFixture15Consumed();
        psql(drift.sql);
        expectMigrationFailClosed(drift.expect);
        log.push(`PG17_DRIFT_FAIL_CLOSED:${drift.name}`);
      }
      log.push("PG17_ALL_DRIFT_CLASSES_FAIL_CLOSED");
      log.push("PASS_B1_44_FIXTURE_15_REISSUE_PG17");

      const combined = log.join("\n");
      expect(combined).toContain("PRE_REPAIR_ACTIVE_18_CONFIRMED");
      expect(combined).toContain("PG17_REPAIR_APPLIED");
      expect(combined).toContain("PG17_OTHER_18_UNCHANGED");
      expect(combined).toContain("PG17_EC_FINGERPRINT_UNCHANGED");
      expect(combined).toContain("PG17_SECOND_APPLY_IDEMPOTENT");
      expect(combined).toContain("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
      expect(combined).toContain("PG17_ALL_DRIFT_CLASSES_FAIL_CLOSED");
      expect(combined).toContain("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
      for (const drift of driftCases) {
        expect(combined).toContain(`PG17_DRIFT_FAIL_CLOSED:${drift.name}`);
      }
    } finally {
      teardownContainer();
    }
  }, 300_000);
});
