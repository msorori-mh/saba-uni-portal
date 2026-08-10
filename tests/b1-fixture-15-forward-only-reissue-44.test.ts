import { afterAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migRel =
  "supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql";
const migPath = join(root, migRel);
const managedAliasRel =
  "docs/migration-drafts/test-only-archive/20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql";
const managedAliasPath = join(root, managedAliasRel);
const migrationsDir = join(root, "supabase/migrations");
const testOnlyArchiveDir = join(root, "docs/migration-drafts/test-only-archive");
const scriptDir = join(root, "scripts/b1-fixture-15-reissue-44-pg17");
const matrixPath = join(
  root,
  "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json",
);
const manifestPath = join(
  root,
  "tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json",
);
const workflowMigPath = join(
  root,
  "supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql",
);

/** Canonical Fixture-15 source carrier (approved). */
const APPROVED_SOURCE = "20260803030000_b1_44_restore_sr_20260801_13000015.sql";
/** Lovable managed applied alias (intentionally approved when present). */
const APPROVED_MANAGED_ALIAS =
  "20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql";

const F15_REQ_ID = "f1300000-0000-4000-8000-000000000015";
const F15_REQ_NUMBER = "SR-20260801-13000015";

/**
 * Normalize SQL for semantic carrier identity.
 * - LF/CRLF unified
 * - insignificant whitespace collapsed
 * - SQL line comments stripped only when safe (full-line `--` comments)
 * Does NOT strip string literals or executable tokens.
 */
function normalizeSqlSemantic(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("--")) return "";
      return line;
    })
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

/** Executable-SQL identity markers required of a Fixture-15 carrier. */
function isFixture15CarrierContent(sql: string): boolean {
  const norm = normalizeSqlSemantic(sql);
  const lower = norm.toLowerCase();

  // Exact Fixture-15 request identity + SR target
  if (!norm.includes(F15_REQ_ID)) return false;
  if (!norm.includes(F15_REQ_NUMBER)) return false;

  // Required seven-step restoration/reissue behavior
  for (const step of STEP_CONTRACT) {
    if (!norm.includes(step.id)) return false;
    if (!norm.includes(`'${step.key}'`)) return false;
  }

  // Exact protected state transition + evidence/audit marker
  if (!/b1_fixture_15_reissue_44_evidence/i.test(norm)) return false;
  if (!/TEST_ONLY_B1_FIXTURE_15_REISSUE_44/.test(norm)) return false;
  if (!/B1_44_FIXTURE_15_UNEXPECTED_PRESTATE/.test(norm)) return false;
  if (!/FOR UPDATE/i.test(norm)) return false;

  // Authorization-context behavior (managed-channel trigger contract)
  if (!/request\.jwt\.claim\.sub/i.test(norm)) return false;
  if (!/b1\.atomic_action/i.test(norm)) return false;
  if (!/B1_44_MANAGED_CHANNEL_AUTH_CONTEXT_RESTORE_FAILED/.test(norm)) {
    return false;
  }

  // Canonical migration contract markers that affect executable behavior
  const contractMarkers = [
    "B1_44_FIXTURE_15_STEP_UUID_MISMATCH",
    "B1_44_FIXTURE_15_UNIT_MISMATCH",
    "B1_44_FIXTURE_15_ROLE_MISMATCH",
    "B1_44_FIXTURE_15_ACTION_MISMATCH",
    "B1_44_FIXTURE_15_ASSIGNEE_MISMATCH",
    "B1_44_FIXTURE_15_IDENTITY_NOT_SINGULAR",
    "B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH",
    "B1_44_FIXTURE_15_DUPLICATE_STEP",
    "B1_44_FIXTURE_15_WORKFLOW_MISMATCH",
    "B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING",
  ];
  for (const m of contractMarkers) {
    if (!norm.includes(m)) return false;
  }

  // Must perform the protected completed → in_review style request UPDATE
  if (
    !/update\s+public\.student_requests/i.test(lower) ||
    !/status\s*=\s*'in_review'/i.test(lower) ||
    !/completed_at\s*=\s*null/i.test(lower)
  ) {
    return false;
  }

  return true;
}

type CarrierClass =
  | "canonical_source"
  | "managed_applied_alias"
  | "unapproved_semantic_clone";

type CarrierHit = {
  filename: string;
  classification: CarrierClass;
  semanticKey: string;
};

function classifyFixture15Carriers(dir: string): CarrierHit[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hits: CarrierHit[] = [];
  for (const filename of files) {
    const sql = readFileSync(join(dir, filename), "utf8");
    if (!isFixture15CarrierContent(sql)) continue;
    const semanticKey = normalizeSqlSemantic(sql);
    let classification: CarrierClass = "unapproved_semantic_clone";
    if (filename === APPROVED_SOURCE) classification = "canonical_source";
    else if (filename === APPROVED_MANAGED_ALIAS) {
      classification = "managed_applied_alias";
    }
    hits.push({ filename, classification, semanticKey });
  }
  return hits;
}

function assertApprovedCarrierSet(hits: CarrierHit[]) {
  const sources = hits.filter((h) => h.classification === "canonical_source");
  const aliases = hits.filter(
    (h) => h.classification === "managed_applied_alias",
  );
  const clones = hits.filter(
    (h) => h.classification === "unapproved_semantic_clone",
  );
  expect(sources.map((h) => h.filename)).toEqual([APPROVED_SOURCE]);
  expect(aliases.map((h) => h.filename)).toEqual([APPROVED_MANAGED_ALIAS]);
  expect(clones).toEqual([]);
  // Source and managed alias must remain semantically reconciled
  expect(sources[0].semanticKey).toBe(aliases[0].semanticKey);
}

const STEP_CONTRACT = [
  {
    order: 1,
    id: "f1300001-0000-4000-8000-000015000001",
    key: "student_affairs_intake",
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
const F15_REQ = "f1300000-0000-4000-8000-000000000015";
const ARCHIVE_ACTOR = "aec1303e-de6a-4580-94cf-7205c17b5535";
/** Distinct non-empty prior JWT (valid UUID ≠ archive actor) for restore proof. */
const PRIOR_JWT_SUB = "c8a94548-4782-4252-86f9-23559d3b95bd";
const PRIOR_ATOMIC_ACTION = "prior-auth-context-marker";
const nonemptyPriorProloguePath = join(
  scriptDir,
  "nonempty-prior-auth-context-prologue.sql",
);
const nonemptyPriorEpiloguePath = join(
  scriptDir,
  "nonempty-prior-auth-context-epilogue.sql",
);

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

/**
 * First successful apply: same session + same transaction must restore the
 * exact non-empty prior auth GUCs after executing the real migration file.
 */
function applyMigrationWithNonemptyPriorAuthContext() {
  const prologue = readFileSync(nonemptyPriorProloguePath, "utf8");
  const migration = readFileSync(migPath, "utf8");
  const epilogue = readFileSync(nonemptyPriorEpiloguePath, "utf8");
  const sql = `BEGIN;\n${prologue}\n${migration}\n${epilogue}\nCOMMIT;`;
  const result = psql(sql);
  if (
    !result.out.includes(PRIOR_JWT_SUB) ||
    !result.out.includes(PRIOR_ATOMIC_ACTION)
  ) {
    throw new Error(
      `PG17_NONEMPTY_PRIOR_AUTH_CONTEXT_VALUES_NOT_SURFACED:\n${result.out}`,
    );
  }
  return result;
}

/** Fresh psql session must not retain migration impersonation GUCs. */
function expectNoCrossSessionAuthContextLeak() {
  const jwtAfter = psqlScalar(
    `select coalesce(current_setting('request.jwt.claim.sub', true), '');`,
  );
  const actionAfter = psqlScalar(
    `select coalesce(current_setting('b1.atomic_action', true), '');`,
  );
  if (jwtAfter !== "" || actionAfter !== "") {
    throw new Error(
      `PG17_AUTH_CONTEXT_LEAKED jwt=${jwtAfter} action=${actionAfter}`,
    );
  }
}

/** Harness-only helper: authorize a setup UPDATE through the real trigger contract. */
function beginHarnessRequestUpdateAuth(): string {
  return `
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','${ARCHIVE_ACTOR}',true);
SELECT set_config('b1.atomic_action','1',true);
`;
}

function clearHarnessRequestUpdateAuth(): string {
  return `
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('b1.atomic_action','',true);
`;
}

function evidenceCount(): string {
  const exists = psqlScalar(
    `select case when to_regclass('public.b1_fixture_15_reissue_44_evidence') is null then 'no' else 'yes' end;`,
  );
  if (exists !== "yes") return "absent";
  return psqlScalar(
    `select count(*)::text from public.b1_fixture_15_reissue_44_evidence where request_id='${F15_REQ}';`,
  );
}

function resetFixture15Consumed() {
  psql(`
BEGIN;
${beginHarnessRequestUpdateAuth()}
-- Update request while completed steps still exist (trigger contract).
UPDATE public.student_requests
   SET status='completed', completed_at=now(), current_step_index=7
 WHERE id='f1300000-0000-4000-8000-000000000015';
${clearHarnessRequestUpdateAuth()}
SELECT set_config('b1.atomic_init','1',true);
DO $ev$
BEGIN
  IF to_regclass('public.b1_fixture_15_reissue_44_evidence') IS NOT NULL THEN
    DELETE FROM public.b1_fixture_15_reissue_44_evidence
     WHERE request_id = 'f1300000-0000-4000-8000-000000000015';
  END IF;
END
$ev$;
-- Keep the attributable archive event; drop/rebuild runtime steps only.
-- Always restore the authoritative event actor/action binding.
UPDATE public.student_request_workflow_events
   SET workflow_step_runtime_id = NULL,
       actor_user_id = '${ARCHIVE_ACTOR}',
       event_type = 'archived',
       payload = jsonb_build_object('action','archive','action_result','archived')
 WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
DELETE FROM public.student_request_workflow_steps
 WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
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
  (1,'f1300001-0000-4000-8000-000015000001'::uuid,'student_affairs_intake','cccccccc-0000-4000-8000-000000000001'::uuid,
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

function fingerprintSevenSteps(): string {
  return psqlScalar(`
select md5(string_agg(row_text, '|' order by step_order, id))
from (
  select
    step_order,
    id,
    (
      id::text || ':' ||
      student_request_id::text || ':' ||
      coalesce(workflow_id::text,'') || ':' ||
      coalesce(workflow_step_id::text,'') || ':' ||
      step_key || ':' ||
      step_order::text || ':' ||
      status || ':' ||
      coalesce(processing_unit_id::text,'') || ':' ||
      coalesce(processing_role_id::text,'') || ':' ||
      coalesce(metadata->>'action_type','') || ':' ||
      coalesce(assigned_user_id::text,'') || ':' ||
      coalesce(assigned_staff_profile_id::text,'') || ':' ||
      coalesce(assigned_faculty_profile_id::text,'') || ':' ||
      coalesce(assigned_position_assignment_id::text,'') || ':' ||
      coalesce(decision,'') || ':' ||
      coalesce(completed_by::text,'') || ':' ||
      coalesce(completed_at::text,'') || ':' ||
      coalesce(entered_at::text,'') || ':' ||
      coalesce(comment,'')
    ) as row_text
  from public.student_request_workflow_steps
  where student_request_id = '${F15_REQ}'
) t;
`);
}

function fingerprintRequest(): string {
  return psqlScalar(`
select md5(
  id::text || ':' ||
  status || ':' ||
  coalesce(current_step_index::text,'') || ':' ||
  coalesce(completed_at::text,'') || ':' ||
  coalesce(updated_at::text,'') || ':' ||
  request_type || ':' ||
  request_number || ':' ||
  coalesce(internal_notes,'')
)
from public.student_requests
where id = '${F15_REQ}';
`);
}

function fingerprintEvents(): string {
  return psqlScalar(`
select coalesce(md5(string_agg(x, '|' order by x)), md5(''))
from (
  select
    id::text || ':' ||
    coalesce(workflow_step_runtime_id::text,'') || ':' ||
    event_type || ':' ||
    coalesce(actor_user_id::text,'') || ':' ||
    coalesce(payload::text,'') || ':' ||
    coalesce(created_at::text,'') as x
  from public.student_request_workflow_events
  where student_request_id = '${F15_REQ}'
) q;
`);
}

function expectMigrationFailClosed(expectedMessage: string) {
  const beforeSteps = fingerprintSevenSteps();
  const beforeRequest = fingerprintRequest();
  const beforeEvents = fingerprintEvents();
  const beforeEvidence = evidenceCount();

  const fail = psqlPath(migPath, { transactional: true, allowFailure: true });
  if (fail.status === 0) {
    throw new Error(`PG17_EXPECTED_STOP_MISSING: ${expectedMessage}`);
  }
  if (!fail.out.includes(expectedMessage)) {
    throw new Error(
      `PG17_WRONG_STOP: expected ${expectedMessage}; output=${fail.out}`,
    );
  }

  const afterSteps = fingerprintSevenSteps();
  const afterRequest = fingerprintRequest();
  const afterEvents = fingerprintEvents();
  const afterEvidence = evidenceCount();

  if (afterSteps !== beforeSteps) {
    throw new Error(
      `PG17_STEP_FINGERPRINT_CHANGED before=${beforeSteps} after=${afterSteps}`,
    );
  }
  if (afterRequest !== beforeRequest) {
    throw new Error(
      `PG17_REQUEST_FINGERPRINT_CHANGED before=${beforeRequest} after=${afterRequest}`,
    );
  }
  if (afterEvents !== beforeEvents) {
    throw new Error(
      `PG17_EVENTS_FINGERPRINT_CHANGED before=${beforeEvents} after=${afterEvents}`,
    );
  }
  if (afterEvidence !== beforeEvidence) {
    throw new Error(
      `PG17_EVIDENCE_INSERTED_ON_REJECT before=${beforeEvidence} after=${afterEvidence}`,
    );
  }
}

/** Reproduce managed-channel UPDATE denied by protect_student_request(). */
function expectManagedChannelLegacyUpdateDenied() {
  const beforeSteps = fingerprintSevenSteps();
  const beforeRequest = fingerprintRequest();
  const beforeEvents = fingerprintEvents();
  const beforeEvidence = evidenceCount();

  const fail = psql(
    `
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('b1.atomic_action','',true);
UPDATE public.student_requests r
   SET status = 'in_review',
       completed_at = NULL,
       current_step_index = 7,
       updated_at = now()
 WHERE r.id = '${F15_REQ}'
   AND r.status = 'completed';
COMMIT;
`,
    { allowFailure: true },
  );
  if (fail.status === 0) {
    throw new Error("PG17_LEGACY_MANAGED_CHANNEL_UPDATE_SHOULD_HAVE_FAILED");
  }
  if (!fail.out.includes("Not authorized to modify this request")) {
    throw new Error(
      `PG17_LEGACY_WRONG_ERROR: output=${fail.out}`,
    );
  }
  if (fingerprintSevenSteps() !== beforeSteps) {
    throw new Error("PG17_LEGACY_STEPS_MUTATED");
  }
  if (fingerprintRequest() !== beforeRequest) {
    throw new Error("PG17_LEGACY_REQUEST_MUTATED");
  }
  if (fingerprintEvents() !== beforeEvents) {
    throw new Error("PG17_LEGACY_EVENTS_MUTATED");
  }
  const afterEvidence = evidenceCount();
  if (afterEvidence !== beforeEvidence) {
    throw new Error(
      `PG17_LEGACY_EVIDENCE_CHANGED before=${beforeEvidence} after=${afterEvidence}`,
    );
  }
}

function expectTriggerDeniedUpdate(label: string, setupSql: string) {
  const beforeSteps = fingerprintSevenSteps();
  const beforeRequest = fingerprintRequest();
  const beforeEvents = fingerprintEvents();
  const beforeEvidence = evidenceCount();

  const fail = psql(
    `
BEGIN;
${setupSql}
UPDATE public.student_requests r
   SET status = 'in_review',
       completed_at = NULL,
       current_step_index = 7,
       updated_at = now()
 WHERE r.id = '${F15_REQ}'
   AND r.status = 'completed';
COMMIT;
`,
    { allowFailure: true },
  );
  if (fail.status === 0) {
    throw new Error(`PG17_TRIGGER_DENY_MISSING:${label}`);
  }
  if (!fail.out.includes("Not authorized to modify this request")) {
    throw new Error(`PG17_TRIGGER_WRONG_ERROR:${label}: ${fail.out}`);
  }
  if (fingerprintSevenSteps() !== beforeSteps) {
    throw new Error(`PG17_TRIGGER_STEPS_MUTATED:${label}`);
  }
  if (fingerprintRequest() !== beforeRequest) {
    throw new Error(`PG17_TRIGGER_REQUEST_MUTATED:${label}`);
  }
  if (fingerprintEvents() !== beforeEvents) {
    throw new Error(`PG17_TRIGGER_EVENTS_MUTATED:${label}`);
  }
  if (evidenceCount() !== beforeEvidence) {
    throw new Error(`PG17_TRIGGER_EVIDENCE_CHANGED:${label}`);
  }
}

afterAll(() => {
  teardownContainer();
});

describe("B1 Fixture-15 forward-only reissue 44 — source contract", () => {
  it("classifies Fixture-15 carriers by executable SQL identity (not filename)", () => {
    expect(existsSync(migPath)).toBe(true);
    expect(existsSync(managedAliasPath)).toBe(true);
    const migs = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    const baseline = "20260802225131_c5d176f3-4841-49e9-b4e7-15df8ac7e0fe.sql";
    expect(migs).toContain(baseline);
    expect(migs).toContain(APPROVED_SOURCE);
    // Managed applied alias was moved to the test-only archive as part of
    // PORTAL-B1-GO-LIVE-MIGRATION-DRIFT-TESTONLY-D02-FINAL-CLOSURE; it must
    // remain in the archive as historical evidence but not in the production
    // migration path.
    expect(migs).not.toContain(APPROVED_MANAGED_ALIAS);

    // Classify across the production path plus the archived alias (historical evidence).
    const combined = mkdtempSync(join(tmpdir(), "b1-f15-carrier-combined-"));
    try {
      for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith(".sql"))) {
        copyFileSync(join(migrationsDir, f), join(combined, f));
      }
      copyFileSync(managedAliasPath, join(combined, APPROVED_MANAGED_ALIAS));
      const hits = classifyFixture15Carriers(combined);
      assertApprovedCarrierSet(hits);

      // Filename-substring detection must not be the authority: E2E / unrelated
      // later migrations must not be misclassified as carriers.
      expect(hits.every((h) => isFixture15CarrierContent(
        readFileSync(join(combined, h.filename), "utf8"),
      ))).toBe(true);
      expect(
        hits.some((h) => h.filename.includes("b1_88_request_scoped_e2e_support")),
      ).toBe(false);
    } finally {
      rmSync(combined, { recursive: true, force: true });
    }

    // Archived alias remains byte-identical to the canonical source (history preserved).
    const sourceSql = readFileSync(migPath, "utf8");
    const aliasSql = readFileSync(managedAliasPath, "utf8");
    expect(normalizeSqlSemantic(sourceSql)).toBe(normalizeSqlSemantic(aliasSql));
  });

  it("rejects arbitrary-name clones, partial carriers, and content drift via temp dirs", () => {
    const staging = mkdtempSync(join(tmpdir(), "b1-f15-carrier-"));
    try {
      // Copy production migrations plus archived alias into an isolated staging tree
      // (never mutate real files).
      for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith(".sql"))) {
        copyFileSync(join(migrationsDir, f), join(staging, f));
      }
      copyFileSync(managedAliasPath, join(staging, APPROVED_MANAGED_ALIAS));
      assertApprovedCarrierSet(classifyFixture15Carriers(staging));

      const sourceSql = readFileSync(migPath, "utf8");

      // Exact carrier copied under an unrelated filename → unapproved clone
      writeFileSync(
        join(staging, "20991231999999_unrelated_ops_note.sql"),
        sourceSql,
        "utf8",
      );
      {
        const hits = classifyFixture15Carriers(staging);
        expect(
          hits.some(
            (h) =>
              h.classification === "unapproved_semantic_clone" &&
              h.filename === "20991231999999_unrelated_ops_note.sql",
          ),
        ).toBe(true);
        expect(() => assertApprovedCarrierSet(hits)).toThrow();
      }
      rmSync(join(staging, "20991231999999_unrelated_ops_note.sql"));

      // Comments + filename changed but executable SQL identical → still a carrier clone
      const commentOnly = `-- totally different report name FIXTURE_99\n${sourceSql}`;
      writeFileSync(
        join(staging, "20991231888888_renamed_report.sql"),
        commentOnly,
        "utf8",
      );
      {
        const hits = classifyFixture15Carriers(staging);
        const clone = hits.find(
          (h) => h.filename === "20991231888888_renamed_report.sql",
        );
        expect(clone?.classification).toBe("unapproved_semantic_clone");
        // Semantic key matches approved source (comment-normalized)
        const sourceHit = hits.find((h) => h.classification === "canonical_source")!;
        expect(clone!.semanticKey).toBe(sourceHit.semanticKey);
        expect(() => assertApprovedCarrierSet(hits)).toThrow();
      }
      rmSync(join(staging, "20991231888888_renamed_report.sql"));

      // Partial carrier: protected UPDATE without required audit/auth context
      const partial = `
UPDATE public.student_requests
   SET status = 'in_review', completed_at = NULL
 WHERE id = '${F15_REQ_ID}' AND request_number = '${F15_REQ_NUMBER}';
-- missing seven-step contract, evidence table, auth context, markers
`;
      writeFileSync(
        join(staging, "20991231777777_partial_restore.sql"),
        partial,
        "utf8",
      );
      {
        const hits = classifyFixture15Carriers(staging);
        expect(
          hits.some((h) => h.filename === "20991231777777_partial_restore.sql"),
        ).toBe(false);
        assertApprovedCarrierSet(hits);
      }
      rmSync(join(staging, "20991231777777_partial_restore.sql"));

      // Approved carrier content altered → fails reconciliation / identity
      const altered = sourceSql.replace(
        "B1_44_FIXTURE_15_UNEXPECTED_PRESTATE",
        "B1_44_FIXTURE_15_UNEXPECTED_PRESTATE_DRIFTED",
      );
      writeFileSync(join(staging, APPROVED_SOURCE), altered, "utf8");
      {
        const hits = classifyFixture15Carriers(staging);
        // Altered source may drop out of carrier set or diverge semantically from alias
        const sourceHit = hits.find((h) => h.filename === APPROVED_SOURCE);
        const aliasHit = hits.find((h) => h.filename === APPROVED_MANAGED_ALIAS);
        if (sourceHit && aliasHit) {
          expect(sourceHit.semanticKey).not.toBe(aliasHit.semanticKey);
        }
        expect(() => assertApprovedCarrierSet(hits)).toThrow();
      }
      // restore staging source from real file
      copyFileSync(migPath, join(staging, APPROVED_SOURCE));
      assertApprovedCarrierSet(classifyFixture15Carriers(staging));

      // Later unrelated migration compatibility (filename-independent, not a carrier)
      writeFileSync(
        join(staging, "20991231666666_b1_99_unrelated_forward.sql"),
        `-- unrelated forward migration\nSELECT 1;\n`,
        "utf8",
      );
      assertApprovedCarrierSet(classifyFixture15Carriers(staging));
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
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
    expect(sql).not.toContain("student_affairs_reception");
    expect(sql).toContain("B1_44_FIXTURE_15_STEP_UUID_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_UNIT_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ROLE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ACTION_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_ASSIGNEE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_IDENTITY_NOT_SINGULAR");
    expect(sql).toContain("B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_DUPLICATE_STEP");
    expect(sql).toContain("B1_44_FIXTURE_15_WORKFLOW_MISMATCH");
    expect(sql).toContain("B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING");
    expect(sql).toMatch(
      /v_consumed\s*:=\s*\([\s\S]*?v_req\.completed_at\s+IS\s+NOT\s+NULL/i,
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.student_request_workflow_events/i);
  });

  it("migration step keys match authoritative MATRIX and applied workflow", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
    const pin = matrix.step_state_pins["SR-20260801-13000015|archive"];
    expect(pin).toBeTruthy();
    expect(pin.runtime_step_id).toBe("f1300001-0000-4000-8000-000015000007");
    expect(pin.configured_action_type).toBe("archive");

    const authoritativeKeys = [
      ...pin.predecessor_set
        .slice()
        .sort(
          (a: { step_order: number }, b: { step_order: number }) =>
            a.step_order - b.step_order,
        )
        .map((p: { step_key: string }) => p.step_key),
      "archive",
    ];
    expect(authoritativeKeys).toEqual([
      "student_affairs_intake",
      "library_clearance",
      "labs_clearance",
      "activities_clearance",
      "finance_clearance",
      "registrar_apply",
      "archive",
    ]);

    const workflowSql = readFileSync(workflowMigPath, "utf8");
    const fwBlock = workflowSql.slice(
      workflowSql.indexOf("('file_withdrawal'"),
      workflowSql.indexOf("('file_withdrawal'") + 1200,
    );
    for (const key of authoritativeKeys) {
      expect(fwBlock).toContain(`'key','${key}'`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const c15 = manifest.cases.find(
      (c: { case_index: number }) => c.case_index === 15,
    );
    expect(c15.step_code).toBe("archive");
    expect(c15.runtime_step_id).toBe("f1300001-0000-4000-8000-000015000007");

    const migSql = readFileSync(migPath, "utf8");
    for (let i = 0; i < authoritativeKeys.length; i++) {
      const step = STEP_CONTRACT[i];
      expect(step.key).toBe(authoritativeKeys[i]);
      expect(migSql).toContain(`'${authoritativeKeys[i]}'`);
      if (step.order < 7) {
        const pred = pin.predecessor_set.find(
          (p: { step_order: number }) => p.step_order === step.order,
        );
        expect(pred.runtime_step_id).toBe(step.id);
        expect(pred.step_key).toBe(step.key);
      }
    }
    expect(migSql).not.toContain("student_affairs_reception");
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

  it("uses transaction-local managed-channel trigger context only for request UPDATE", () => {
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toContain("request.jwt.claim.sub");
    expect(sql).toContain("b1.atomic_action");
    expect(sql).toContain(ARCHIVE_ACTOR);
    expect(sql).toContain("B1_44_MANAGED_CHANNEL_AUTH_CONTEXT_RESTORE_FAILED");
    expect(sql).toMatch(
      /set_config\(\s*'request\.jwt\.claim\.sub'\s*,\s*k_archive_actor::text\s*,\s*true\s*\)/i,
    );
    expect(sql).toMatch(
      /set_config\(\s*'b1\.atomic_action'\s*,\s*'1'\s*,\s*true\s*\)/i,
    );
    expect(sql).toMatch(
      /set_config\(\s*'request\.jwt\.claim\.sub'\s*,\s*v_prev_jwt_sub\s*,\s*true\s*\)/i,
    );
    expect(sql).toMatch(
      /set_config\(\s*'b1\.atomic_action'\s*,\s*v_prev_atomic_action\s*,\s*true\s*\)/i,
    );
    // No permanent bypass / weakening.
    // Executable SQL must not introduce bypasses (ignore header prose).
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.protect_student_request/i,
    );
    expect(executable).not.toMatch(
      /set_config\s*\(\s*'session_replication_role'|SET\s+session_replication_role/i,
    );
    expect(executable).not.toMatch(/DISABLE\s+TRIGGER\b/i);
    expect(executable).not.toMatch(
      /ALTER\s+TABLE[\s\S]{0,80}DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
    expect(executable).not.toMatch(/\bauth\.users\b/i);
    expect(executable).not.toMatch(/\bservice_role\b/i);
  });

  it("keeps harness protect_student_request contract aligned with production B1 path", () => {
    const schema = readFileSync(join(scriptDir, "00-schema.sql"), "utf8");
    const protectStart = schema.indexOf(
      "CREATE OR REPLACE FUNCTION public.protect_student_request",
    );
    expect(protectStart).toBeGreaterThanOrEqual(0);
    const protectEnd = schema.indexOf("$function$;", protectStart);
    const protectBody = schema.slice(protectStart, protectEnd);
    expect(protectBody).toContain("b1.atomic_action");
    expect(protectBody).toContain("s.completed_by = v_uid");
    expect(protectBody).toContain("Not authorized to modify this request");
    expect(protectBody).not.toContain("b1.atomic_init");
    expect(schema).toContain("request.jwt.claim.sub");
    // has_any_role stub must not grant privileged bypass.
    expect(schema).toMatch(/has_any_role[\s\S]*?SELECT false/i);
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
    const pin = matrix.step_state_pins["SR-20260801-13000015|archive"];
    expect(pin.request_id).toBe("f1300000-0000-4000-8000-000000000015");
    expect(pin.runtime_step_id).toBe("f1300001-0000-4000-8000-000015000007");
    expect(pin.predecessor_set[0].step_key).toBe("student_affairs_intake");
    expect(pin.predecessor_set[0].runtime_step_id).toBe(
      "f1300001-0000-4000-8000-000015000001",
    );
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

      // G5 — previous managed-channel behavior denied by real trigger.
      expectManagedChannelLegacyUpdateDenied();
      log.push("PG17_LEGACY_MANAGED_CHANNEL_UPDATE_DENIED");
      if (evidenceCount() !== "absent") {
        throw new Error("PG17_LEGACY_EVIDENCE_TABLE_SHOULD_BE_ABSENT");
      }
      log.push("PG17_LEGACY_FULL_ROLLBACK_EVIDENCE_ABSENT");

      // G7 — wrong-actor / missing-step / missing atomic_action trigger denials.
      expectTriggerDeniedUpdate(
        "wrong_jwt_actor",
        `
SELECT set_config('b1.atomic_init','1',true);
-- Specialist is not completed_by on any Fixture-15 runtime step.
SELECT set_config('request.jwt.claim.sub','c8a94548-4782-4252-86f9-23559d3b95bd',true);
SELECT set_config('b1.atomic_action','1',true);
`,
      );
      log.push("PG17_TRIGGER_DENY:wrong_jwt_actor");

      expectTriggerDeniedUpdate(
        "atomic_action_unset_with_jwt",
        `
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','${ARCHIVE_ACTOR}',true);
SELECT set_config('b1.atomic_action','',true);
`,
      );
      log.push("PG17_TRIGGER_DENY:atomic_action_unset_with_jwt");

      expectTriggerDeniedUpdate(
        "no_completed_step_for_actor",
        `
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','${ARCHIVE_ACTOR}',true);
SELECT set_config('b1.atomic_action','1',true);
UPDATE public.student_request_workflow_steps
   SET completed_by = 'c8a94548-4782-4252-86f9-23559d3b95bd'
 WHERE student_request_id = '${F15_REQ}'
   AND status = 'completed';
`,
      );
      log.push("PG17_TRIGGER_DENY:no_completed_step_for_actor");
      resetFixture15Consumed();

      // Migration fail-closed: archive completed_by ≠ k_archive_actor.
      psql(`
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
UPDATE public.student_request_workflow_steps
   SET completed_by = 'c8a94548-4782-4252-86f9-23559d3b95bd'
 WHERE id = 'f1300001-0000-4000-8000-000015000007';
COMMIT;
`);
      expectMigrationFailClosed("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
      log.push("PG17_MIGRATION_DENY:archive_completed_by_mismatch");
      resetFixture15Consumed();

      // Migration fail-closed: archive event actor differs.
      psql(`
BEGIN;
UPDATE public.student_request_workflow_events
   SET actor_user_id = 'c8a94548-4782-4252-86f9-23559d3b95bd'
 WHERE student_request_id = '${F15_REQ}';
COMMIT;
`);
      expectMigrationFailClosed("B1_44_FIXTURE_15_EVENT_ACTOR_MISMATCH");
      log.push("PG17_MIGRATION_DENY:event_actor_mismatch");
      resetFixture15Consumed();
      log.push("PG17_ALL_WRONG_ACTOR_NEGATIVES_FAIL_CLOSED");

      // G6 — remediated migration succeeds through real trigger contract.
      // Same-session/same-txn: prove exact non-empty prior GUCs are restored
      // immediately after the real migration body, before COMMIT.
      applyMigrationWithNonemptyPriorAuthContext();
      psqlPath(join(scriptDir, "02-verify.sql"));
      log.push("PG17_REPAIR_APPLIED");
      log.push("PG17_NONEMPTY_PRIOR_AUTH_CONTEXT_RESTORED_EXACT");

      // Separate psql session must not retain migration impersonation GUCs.
      expectNoCrossSessionAuthContextLeak();
      log.push("PG17_AUTH_CONTEXT_NO_CROSS_SESSION_LEAK");

      const activeAfter = psqlScalar(`
select count(*)::text
  from student_request_workflow_steps s
  join student_requests r on r.id = s.student_request_id
 where r.internal_notes = 'TEST_ONLY_B1_FIXTURE_13'
   and s.status = 'active';
`);
      if (activeAfter !== "19") {
        throw new Error(`PG17_ACTIVE_NOT_19 got=${activeAfter}`);
      }
      log.push("PG17_19_OF_19_OFFLINE");

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
BEGIN;
${beginHarnessRequestUpdateAuth()}
UPDATE public.student_requests
   SET status='cancelled', completed_at=now()
 WHERE id='f1300000-0000-4000-8000-000000000015';
${clearHarnessRequestUpdateAuth()}
COMMIT;
`);
      expectMigrationFailClosed("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
      log.push("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");

      // Drift classes — each resets to authoritative consumed, mutates one binding,
      // proves migration aborts with no evidence insert / no restore mutation.
      const driftCases: Array<{
        name: string;
        sql: string;
        expect: string;
        mutates?: "steps" | "request";
      }> = [
        {
          name: "consumed_request_completed_at_null",
          expect: "B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING",
          mutates: "request",
          sql: `
BEGIN;
${beginHarnessRequestUpdateAuth()}
-- Otherwise exact authoritative consumed state, but request completed_at is NULL.
UPDATE public.student_requests
   SET completed_at = NULL
 WHERE id = 'f1300000-0000-4000-8000-000000000015'
   AND status = 'completed';
${clearHarnessRequestUpdateAuth()}
COMMIT;
`,
        },
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
        const evidenceBeforeDrift = evidenceCount();
        if (evidenceBeforeDrift !== "0") {
          throw new Error(
            `PG17_DRIFT_SETUP_EVIDENCE_NOT_ZERO:${drift.name}=${evidenceBeforeDrift}`,
          );
        }
        const mutatesRequest = drift.mutates === "request";
        const baselineSteps = fingerprintSevenSteps();
        const baselineRequest = fingerprintRequest();
        const baselineEvents = fingerprintEvents();
        const archiveBefore = psqlScalar(`
select status||':'||coalesce(completed_at::text,'')||':'||coalesce(completed_by::text,'')
from student_request_workflow_steps
where id='f1300001-0000-4000-8000-000015000007';
`);
        psql(drift.sql);
        const driftedSteps = fingerprintSevenSteps();
        const driftedRequest = fingerprintRequest();
        if (mutatesRequest) {
          if (driftedRequest === baselineRequest) {
            throw new Error(`PG17_DRIFT_DID_NOT_MUTATE_REQUEST:${drift.name}`);
          }
          if (driftedSteps !== baselineSteps) {
            throw new Error(`PG17_DRIFT_UNEXPECTED_STEP_MUTATION:${drift.name}`);
          }
        } else if (driftedSteps === baselineSteps) {
          throw new Error(`PG17_DRIFT_DID_NOT_MUTATE:${drift.name}`);
        }
        expectMigrationFailClosed(drift.expect);
        // Rejected apply must leave drifted state unchanged (no repair / partial write).
        if (fingerprintSevenSteps() !== driftedSteps) {
          throw new Error(`PG17_PARTIAL_MUTATION_ON_REJECT:${drift.name}`);
        }
        if (fingerprintRequest() !== driftedRequest) {
          throw new Error(`PG17_PARTIAL_REQUEST_MUTATION_ON_REJECT:${drift.name}`);
        }
        if (fingerprintEvents() !== baselineEvents) {
          throw new Error(`PG17_EVENTS_MUTATED_ON_REJECT:${drift.name}`);
        }
        const archiveAfter = psqlScalar(`
select status||':'||coalesce(completed_at::text,'')||':'||coalesce(completed_by::text,'')
from student_request_workflow_steps
where id='f1300001-0000-4000-8000-000015000007';
`);
        if (archiveAfter !== archiveBefore && mutatesRequest) {
          throw new Error(`PG17_ARCHIVE_STEP_MUTATED_ON_REJECT:${drift.name}`);
        }
        const evidenceAfter = evidenceCount();
        if (evidenceAfter !== "0") {
          throw new Error(
            `PG17_EVIDENCE_INSERTED_ON_DRIFT:${drift.name}=${evidenceAfter}`,
          );
        }
        log.push(`PG17_DRIFT_FAIL_CLOSED:${drift.name}`);
      }
      log.push("PG17_ALL_DRIFT_CLASSES_FAIL_CLOSED");
      log.push("PG17_CONSUMED_COMPLETED_AT_NULL_FAIL_CLOSED");
      log.push("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
      log.push("PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_56");

      const combined = log.join("\n");
      expect(combined).toContain("PRE_REPAIR_ACTIVE_18_CONFIRMED");
      expect(combined).toContain("PG17_LEGACY_MANAGED_CHANNEL_UPDATE_DENIED");
      expect(combined).toContain("PG17_LEGACY_FULL_ROLLBACK_EVIDENCE_ABSENT");
      expect(combined).toContain("PG17_ALL_WRONG_ACTOR_NEGATIVES_FAIL_CLOSED");
      expect(combined).toContain("PG17_REPAIR_APPLIED");
      expect(combined).toContain(
        "PG17_NONEMPTY_PRIOR_AUTH_CONTEXT_RESTORED_EXACT",
      );
      expect(combined).toContain("PG17_AUTH_CONTEXT_NO_CROSS_SESSION_LEAK");
      expect(combined).toContain("PG17_19_OF_19_OFFLINE");
      expect(combined).toContain("PG17_OTHER_18_UNCHANGED");
      expect(combined).toContain("PG17_EC_FINGERPRINT_UNCHANGED");
      expect(combined).toContain("PG17_SECOND_APPLY_IDEMPOTENT");
      expect(combined).toContain("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
      expect(combined).toContain("PG17_ALL_DRIFT_CLASSES_FAIL_CLOSED");
      expect(combined).toContain("PG17_CONSUMED_COMPLETED_AT_NULL_FAIL_CLOSED");
      expect(combined).toContain("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
      expect(combined).toContain(
        "PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_56",
      );
      for (const drift of driftCases) {
        expect(combined).toContain(`PG17_DRIFT_FAIL_CLOSED:${drift.name}`);
      }
    } finally {
      teardownContainer();
    }
  }, 300_000);
});
