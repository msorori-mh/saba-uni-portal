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

  it("targets Fixture 15 exact identity and preserves audit evidence", () => {
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toContain("SR-20260801-13000015");
    expect(sql).toContain("f1300000-0000-4000-8000-000000000015");
    expect(sql).toContain("f1300001-0000-4000-8000-000015000007");
    expect(sql).toContain("TEST_ONLY_B1_FIXTURE_13");
    expect(sql).toContain("aec1303e-de6a-4580-94cf-7205c17b5535");
    expect(sql).toContain("b1.atomic_init");
    expect(sql).toContain("b1_fixture_15_reissue_44_evidence");
    expect(sql).toContain("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.student_request_workflow_events/i);
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
  it("restores 19/19, preserves other fixtures/EC, idempotent, fail-closed", async () => {
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

      let ready = false;
      for (let i = 0; i < 40; i++) {
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
        await Bun.sleep(1000);
      }
      if (!ready) {
        throw new Error("PG17_READY_TIMEOUT");
      }

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

      psql(`
SELECT set_config('b1.atomic_init','1',true);
UPDATE public.student_requests
   SET status='cancelled', completed_at=now()
 WHERE id='f1300000-0000-4000-8000-000000000015';
`);

      const fail = psqlPath(migPath, {
        transactional: true,
        allowFailure: true,
      });
      if (fail.status === 0) {
        throw new Error(
          "PG17_EXPECTED_STOP_MISSING: B1_44_FIXTURE_15_UNEXPECTED_PRESTATE",
        );
      }
      if (!fail.out.includes("B1_44_FIXTURE_15_UNEXPECTED_PRESTATE")) {
        throw new Error(
          `PG17_WRONG_STOP: expected B1_44_FIXTURE_15_UNEXPECTED_PRESTATE; output=${fail.out}`,
        );
      }

      const status = psqlScalar(
        "select status from student_requests where id='f1300000-0000-4000-8000-000000000015';",
      );
      if (status !== "cancelled") {
        throw new Error(`PG17_UNEXPECTED_MUTATED_OUTSIDE_TX status=${status}`);
      }
      log.push("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
      log.push("PASS_B1_44_FIXTURE_15_REISSUE_PG17");

      const combined = log.join("\n");
      expect(combined).toContain("PRE_REPAIR_ACTIVE_18_CONFIRMED");
      expect(combined).toContain("PG17_REPAIR_APPLIED");
      expect(combined).toContain("PG17_OTHER_18_UNCHANGED");
      expect(combined).toContain("PG17_EC_FINGERPRINT_UNCHANGED");
      expect(combined).toContain("PG17_SECOND_APPLY_IDEMPOTENT");
      expect(combined).toContain("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
      expect(combined).toContain("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
    } finally {
      teardownContainer();
    }
  }, 180_000);
});
