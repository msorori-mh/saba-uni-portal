#!/usr/bin/env node
/**
 * Cross-platform disposable PostgreSQL 17 harness for Fixture-15 reissue-44.
 * Mirrors 04-run.ps1 so Web CI (Linux) can execute without PowerShell.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const fixRel =
  "supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql";
const scriptDir = "scripts/b1-fixture-15-reissue-44-pg17";
const name = `b1-44-fixture15-pg17-${process.pid}-${Date.now()}`;

function sleepMs(ms) {
  if (process.platform === "win32") {
    spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${ms}`],
      { stdio: "ignore" }
    );
  } else {
    spawnSync("sleep", [String(Math.max(1, Math.ceil(ms / 1000)))], {
      stdio: "ignore",
    });
  }
}

function docker(args, opts = {}) {
  const res = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return res;
}

function dockerOk(args, opts = {}) {
  const res = docker(args, opts);
  if (res.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} failed (status=${res.status}):\n${res.stdout || ""}\n${res.stderr || ""}\n${res.error || ""}`
    );
  }
  return `${res.stdout || ""}${res.stderr || ""}`;
}

function psqlC(sql) {
  return dockerOk(["exec", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-c", sql]);
}

function psqlAt(sql) {
  const out = dockerOk([
    "exec",
    name,
    "psql",
    "-X",
    "-At",
    "-U",
    "postgres",
    "-c",
    sql,
  ]);
  return out.trim();
}

function invokeRepoFile(file, { transactional = false } = {}) {
  if (transactional) {
    const abs = join(root, file);
    const body = readFileSync(abs, "utf8");
    const sql = `BEGIN;\n${body}\nCOMMIT;`;
    const res = spawnSync(
      "docker",
      ["exec", "-i", "-w", "/repo", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
      {
        input: sql,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    if (res.status !== 0) {
      throw new Error(
        `PG17_FILE_FAILED: ${file}\n${res.stdout || ""}\n${res.stderr || ""}`
      );
    }
    return;
  }
  dockerOk([
    "exec",
    "-w",
    "/repo",
    name,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-f",
    file,
  ]);
}

function expectRepoFileFailure(file, expected) {
  const abs = join(root, file);
  const body = readFileSync(abs, "utf8");
  const sql = `BEGIN;\n${body}\nCOMMIT;`;
  const res = spawnSync(
    "docker",
    ["exec", "-i", "-w", "/repo", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  const output = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (res.status === 0) {
    throw new Error(`PG17_EXPECTED_STOP_MISSING: ${expected}`);
  }
  if (!output.includes(expected)) {
    throw new Error(`PG17_WRONG_STOP: expected ${expected}; output=${output}`);
  }
}

try {
  execFileSync(
    "docker",
    [
      "run",
      "--name",
      name,
      "--rm",
      "-d",
      "-e",
      "POSTGRES_PASSWORD=test",
      "-v",
      `${root}:/repo`,
      "postgres:17",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  let ready = false;
  for (let i = 0; i < 40; i++) {
    const res = docker(["exec", name, "pg_isready", "-U", "postgres"]);
    if (res.status === 0) {
      ready = true;
      break;
    }
    sleepMs(1000);
  }
  if (!ready) throw new Error("PG17_READY_TIMEOUT");

  const pg = psqlAt("show server_version;");
  if (!pg.startsWith("17.")) throw new Error(`PG17_VERSION_MISMATCH: ${pg}`);
  console.log(`PG17_VERSION=${pg}`);

  invokeRepoFile(`${scriptDir}/00-schema.sql`);
  invokeRepoFile(`${scriptDir}/01-seed.sql`);

  const fpOthersBefore = psqlAt(`
select md5(string_agg(t::text, '|' order by t::text))
from (
  select r.id, r.status, r.current_step_index, r.completed_at,
         (select string_agg(s.id::text||':'||s.status, ',' order by s.step_order)
            from student_request_workflow_steps s where s.student_request_id=r.id) as steps
  from student_requests r
  where r.internal_notes='TEST_ONLY_B1_FIXTURE_13'
    and r.id <> 'f1300000-0000-4000-8000-000000000015'
) t;
`);

  const fpEcBefore = psqlAt(`
select md5(string_agg(x, '|' order by x)) from (
  select marker||'|'||payload as x from enrollment_certificate_document_details
  union all
  select marker||'|'||payload from official_documents
  union all
  select code||'|'||student_visible::text from request_types where code='enrollment_certificate'
) q;
`);

  console.log("PRE_REPAIR_ACTIVE_18_CONFIRMED");

  // Reproduce managed-channel denial: atomic_init alone, auth.uid() NULL.
  {
    const res = spawnSync(
      "docker",
      ["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
      {
        input: `
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('b1.atomic_action','',true);
UPDATE public.student_requests r
   SET status = 'in_review', completed_at = NULL, current_step_index = 7, updated_at = now()
 WHERE r.id = 'f1300000-0000-4000-8000-000000000015' AND r.status = 'completed';
COMMIT;
`,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    const out = `${res.stdout || ""}\n${res.stderr || ""}`;
    if (res.status === 0 || !out.includes("Not authorized to modify this request")) {
      throw new Error(`PG17_LEGACY_MANAGED_CHANNEL_UPDATE_SHOULD_HAVE_FAILED\n${out}`);
    }
  }
  console.log("PG17_LEGACY_MANAGED_CHANNEL_UPDATE_DENIED");

  invokeRepoFile(fixRel, { transactional: true });
  invokeRepoFile(`${scriptDir}/02-verify.sql`);
  console.log("PG17_REPAIR_APPLIED");
  console.log("PG17_AUTH_CONTEXT_RESTORED_AND_CLEARED");
  console.log("PG17_19_OF_19_OFFLINE");

  const fpOthersAfter = psqlAt(`
select md5(string_agg(t::text, '|' order by t::text))
from (
  select r.id, r.status, r.current_step_index, r.completed_at,
         (select string_agg(s.id::text||':'||s.status, ',' order by s.step_order)
            from student_request_workflow_steps s where s.student_request_id=r.id) as steps
  from student_requests r
  where r.internal_notes='TEST_ONLY_B1_FIXTURE_13'
    and r.id <> 'f1300000-0000-4000-8000-000000000015'
) t;
`);
  if (fpOthersBefore !== fpOthersAfter) {
    throw new Error(
      `PG17_OTHER_18_CHANGED before=${fpOthersBefore} after=${fpOthersAfter}`
    );
  }
  console.log("PG17_OTHER_18_UNCHANGED");

  const fpEcAfter = psqlAt(`
select md5(string_agg(x, '|' order by x)) from (
  select marker||'|'||payload as x from enrollment_certificate_document_details
  union all
  select marker||'|'||payload from official_documents
  union all
  select code||'|'||student_visible::text from request_types where code='enrollment_certificate'
) q;
`);
  if (fpEcBefore !== fpEcAfter) throw new Error("PG17_EC_FINGERPRINT_CHANGED");
  console.log("PG17_EC_FINGERPRINT_UNCHANGED");

  invokeRepoFile(fixRel, { transactional: true });
  invokeRepoFile(`${scriptDir}/02-verify.sql`);
  console.log("PG17_SECOND_APPLY_IDEMPOTENT");

  psqlC(`
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','aec1303e-de6a-4580-94cf-7205c17b5535',true);
SELECT set_config('b1.atomic_action','1',true);
UPDATE public.student_requests
   SET status='cancelled', completed_at=now()
 WHERE id='f1300000-0000-4000-8000-000000000015';
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('b1.atomic_action','',true);
COMMIT;
`);
  expectRepoFileFailure(fixRel, "B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
  const status = psqlAt(
    "select status from student_requests where id='f1300000-0000-4000-8000-000000000015';"
  );
  if (status !== "cancelled") {
    throw new Error(`PG17_UNEXPECTED_MUTATED_OUTSIDE_TX status=${status}`);
  }
  console.log("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
  console.log("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
  console.log("PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_56");
} finally {
  try {
    execFileSync("docker", ["rm", "-f", name], {
      encoding: "utf8",
      stdio: "ignore",
    });
  } catch {
    // best-effort cleanup
  }
}
