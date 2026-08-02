import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migRel =
  "supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql";
const migPath = join(root, migRel);
const runMjs = join(root, "scripts/b1-fixture-15-reissue-44-pg17/04-run.mjs");
const matrixPath = join(
  root,
  "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json"
);
const manifestPath = join(
  root,
  "tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json"
);

describe("B1 Fixture-15 forward-only reissue 44 â€” source contract", () => {
  it("ships exactly one forward-only migration after 20260802225131", () => {
    expect(existsSync(migPath)).toBe(true);
    const migs = require("node:fs")
      .readdirSync(join(root, "supabase/migrations"))
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    expect(migs[migs.length - 1]).toBe(
      "20260803030000_b1_44_restore_sr_20260801_13000015.sql"
    );
    expect(migs).toContain(
      "20260802225131_c5d176f3-4841-49e9-b4e7-15df8ac7e0fe.sql"
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
      /\b(UPDATE|INSERT|DELETE)\b[\s\S]{0,80}\benrollment_certificate/i
    );
  });

  it("keeps authoritative positive Fixture 15 bindings", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const c15 = manifest.cases.find(
      (c: { case_index: number }) => c.case_index === 15
    );
    expect(c15.request_number).toBe("SR-20260801-13000015");
    expect(c15.request_id).toBe("f1300000-0000-4000-8000-000000000015");
    expect(c15.runtime_step_id).toBe(
      "f1300001-0000-4000-8000-000015000007"
    );
    expect(c15.service_code).toBe("file_withdrawal");
    expect(c15.exact_configured_action).toBe("archive");
    expect(c15.direct_assignee_principal_id).toBe(
      "aec1303e-de6a-4580-94cf-7205c17b5535"
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
        "utf8"
      )
    );
    expect(tm.matrix.negative_total).toBe(267);
    expect(tm.matrix.executable_negative_total).toBe(267);
    expect(tm.matrix.blocked_negative_total).toBe(0);
  });
});

describe("B1 Fixture-15 forward-only reissue 44 â€” disposable PostgreSQL 17", () => {
  it("restores 19/19, preserves other fixtures/EC, idempotent, fail-closed", () => {
    // Cross-platform Node harness (Web CI is Linux; PowerShell is Windows-only).
    expect(existsSync(runMjs)).toBe(true);
    const res = spawnSync(process.execPath, [runMjs], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const out = `${res.stdout || ""}\n${res.stderr || ""}${res.error ? `\n${res.error}` : ""}`;
    if (res.status !== 0) {
      throw new Error(`PG17 harness failed (status=${res.status}):\n${out}`);
    }
    expect(out).toContain("PRE_REPAIR_ACTIVE_18_CONFIRMED");
    expect(out).toContain("PG17_REPAIR_APPLIED");
    expect(out).toContain("PG17_OTHER_18_UNCHANGED");
    expect(out).toContain("PG17_EC_FINGERPRINT_UNCHANGED");
    expect(out).toContain("PG17_SECOND_APPLY_IDEMPOTENT");
    expect(out).toContain("PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED");
    expect(out).toContain("PASS_B1_44_FIXTURE_15_REISSUE_PG17");
  }, 180_000);
});
