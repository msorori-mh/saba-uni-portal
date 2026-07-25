// B1-RPC-AUTHORIZATION-MATRIX-01 - static contract tests (bun test).
// These tests validate the machine-readable matrix, its cross-consistency with
// the sequential-apply manifest, and the presence/ordering of the PG harness.
// They CANNOT catch findings 1-2 (recon note): executable coverage lives in the
// PG harness (tests/b1-rpc-matrix/pg/*), whose results are reported separately.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const PG = join(ROOT, "tests", "b1-rpc-matrix", "pg");
const matrixText = readFileSync(
  join(ROOT, "docs", "b1", "B1-RPC-AUTHORIZATION-MATRIX-01.json"),
  "utf8",
).replace(/\r\n/g, "\n");
const matrix = JSON.parse(matrixText);
const manifest = JSON.parse(
  readFileSync(join(ROOT, "docs", "b1", "B1-SEQUENTIAL-APPLY-MANIFEST.json"), "utf8"),
);
const orderText = readFileSync(join(PG, "20-draft-apply-order.txt"), "utf8");

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  }
  return v;
}
// eslint-disable-next-line no-control-regex -- explicitly rejects non-text matrix bytes
const isAscii = (s) => !/[^\x00-\x7F]/.test(s);

describe("matrix JSON: determinism + encoding", () => {
  test("pure ASCII", () => {
    expect(isAscii(matrixText)).toBe(true);
  });
  test("deterministic key order (sorted, 2-space, trailing newline)", () => {
    expect(JSON.stringify(sortKeys(matrix), null, 2) + "\n").toBe(matrixText);
  });
  test("top-level identity fields", () => {
    expect(matrix.matrix_id).toBe("B1-RPC-AUTHORIZATION-MATRIX-01");
    expect(matrix.track).toBe("B1-RPC-AUTHORIZATION-MATRIX-SOURCE-CLOSURE-01");
    expect(matrix.version).toBe("1.0.0");
  });
});

describe("matrix JSON: case schema + tags", () => {
  const REQUIRED = [
    "id",
    "service",
    "rpc",
    "actor",
    "setup",
    "expected_outcome",
    "expected_sqlstate",
    "expected_error_code",
    "desired_contract_outcome",
    "tag",
    "execution",
    "evidence",
    "notes",
  ];
  const TAGS = new Set(["CORE", "EXTENDED", "BLOCKER", "DIVERGENCE", "HARNESS"]);
  test("every case carries the full schema", () => {
    for (const c of matrix.cases) {
      for (const k of REQUIRED) expect(Object.prototype.hasOwnProperty.call(c, k)).toBe(true);
      expect(TAGS.has(c.tag)).toBe(true);
      expect(["pg", "static"]).toContain(c.execution);
      expect(["PASS", "DENY", "NOTE"]).toContain(c.expected_outcome);
    }
  });
  test("case ids are unique", () => {
    const ids = matrix.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("F1 has no remaining BLOCKER cases", () => {
    expect(matrix.cases.filter((x) => x.tag === "BLOCKER")).toEqual([]);
  });
  test("F2 has no remaining DIVERGENCE cases", () => {
    expect(matrix.cases.filter((x) => x.tag === "DIVERGENCE")).toEqual([]);
  });
  test("static cases are NOTE-class documentation", () => {
    for (const c of matrix.cases.filter((x) => x.execution === "static")) {
      expect(c.expected_outcome).toBe("NOTE");
    }
  });
});

describe("matrix JSON: coverage", () => {
  const ids = matrix.cases.map((c) => c.id);
  test("5 services with exact aliases + step/transition counts", () => {
    expect(matrix.services.length).toBe(5);
    const byCode = Object.fromEntries(matrix.services.map((s) => [s.canonical_code, s]));
    expect(Object.keys(byCode).sort()).toEqual(
      [
        "department_transfer",
        "enrollment_suspension",
        "excused_absence",
        "file_withdrawal",
        "final_chance",
      ].sort(),
    );
    expect(byCode.enrollment_suspension.steps.length).toBe(3);
    expect(byCode.excused_absence.steps.length).toBe(3);
    expect(byCode.file_withdrawal.steps.length).toBe(7);
    expect(byCode.department_transfer.steps.length).toBe(6);
    expect(byCode.final_chance.steps.length).toBe(5);
    expect(byCode.enrollment_suspension.transitions.length).toBe(4);
    expect(byCode.excused_absence.transitions.length).toBe(4);
    expect(byCode.file_withdrawal.transitions.length).toBe(8);
    expect(byCode.department_transfer.transitions.length).toBe(7);
    expect(byCode.final_chance.transitions.length).toBe(6);
    expect(byCode.excused_absence.stored_alias).toBe("absence_excuse");
    expect(byCode.department_transfer.stored_alias).toBe("transfer");
    expect(byCode.final_chance.stored_alias).toBe("extra_chance");
  });
  test("11 RPCs inventoried", () => {
    expect(matrix.rpcs.length).toBe(11);
  });
  test("all 22 core cases M01..M22 present + full case universe", () => {
    for (let i = 1; i <= 40; i++) expect(ids).toContain("M" + String(i).padStart(2, "0"));
    for (let i = 1; i <= 17; i++) expect(ids).toContain("X-" + String(i).padStart(2, "0"));
    for (let i = 1; i <= 5; i++) expect(ids).toContain("E-0" + i);
    expect(ids).toContain("H-01");
    expect(matrix.cases.length).toBe(63);
  });
  test("pg-executed vs static split is recorded", () => {
    expect(matrix.cases.filter((c) => c.execution === "pg").length).toBe(51);
    expect(matrix.cases.filter((c) => c.execution === "static").length).toBe(12);
  });
  test("findings F1 and F2 are recorded as remediated notes", () => {
    const f = matrix.findings.map((x) => x.id);
    expect(f).toContain("F1-REMEDIATED");
    expect(f).toContain("F2-REMEDIATED");
    expect(
      matrix.findings.filter((x) => ["critical", "high", "medium"].includes(x.severity)),
    ).toEqual([]);
  });
});

describe("cross-check: matrix vs sequential-apply manifest", () => {
  test("manifest has exactly 24 entries in sequence 1..24", () => {
    expect(manifest.migrations.length).toBe(24);
    const seq = manifest.migrations.map((m) => m.sequence_order);
    expect(seq).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
  test("harness applies the manifest exactly, then the F1/F2 remediation", () => {
    const orderLines = orderText
      .split("\n")
      .filter((l) => /^\d{2} docs\/migration-drafts\//.test(l))
      .map((l) => l.trim().split(/\s+/)[1].split("/").pop());
    const manifestFiles = manifest.migrations.map((m) => m.filename);
    expect(orderLines.slice(0, manifestFiles.length)).toEqual(manifestFiles);
    expect(orderLines.slice(manifestFiles.length)).toEqual([
      "B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql",
    ]);
  });
});

describe("PG harness files: presence, ordering, markers", () => {
  const FILES = [
    "10-minimal-schema.sql",
    "20-draft-apply-order.txt",
    "30-pre-activation-assert.sql",
    "35-activate-workflows-local-only.sql",
    "40-verifier.sql",
    "45-acl-cases.sql",
    "run-harness.sh",
  ];
  test("all harness files present", () => {
    for (const f of FILES) expect(existsSync(join(PG, f))).toBe(true);
  });
  test("verifier references every pg-executed matrix case", () => {
    const v40 = readFileSync(join(PG, "40-verifier.sql"), "utf8");
    const v45 = readFileSync(join(PG, "45-acl-cases.sql"), "utf8");
    const all = v40 + "\n" + v45;
    for (const c of matrix.cases.filter((x) => x.execution === "pg" && x.id !== "H-01")) {
      expect(all).toContain("'" + c.id + "'");
    }
  });
  test("pre-activation gate asserts the fail-closed error", () => {
    const f = readFileSync(join(PG, "30-pre-activation-assert.sql"), "utf8");
    expect(f).toContain("B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0");
  });
  test("activation file is marked LOCAL ONLY and touches 5 workflows", () => {
    const f = readFileSync(join(PG, "35-activate-workflows-local-only.sql"), "utf8");
    expect(f).toContain("LOCAL HARNESS ONLY");
    expect(f).toContain("enrollment_suspension_free_workflow");
    expect(f).toContain("excused_absence_free_workflow");
    expect(f).toContain("file_withdrawal_free_workflow");
    expect(f).toContain("department_transfer_external_payment_workflow");
    expect(f).toContain("final_chance_external_payment_workflow");
  });
});

describe("forbidden patterns", () => {
  test("no cloud/production connection material anywhere in deliverables", () => {
    const targets = [
      matrixText,
      orderText,
      ...[
        "10-minimal-schema.sql",
        "30-pre-activation-assert.sql",
        "35-activate-workflows-local-only.sql",
        "40-verifier.sql",
        "45-acl-cases.sql",
      ].map((f) => readFileSync(join(PG, f), "utf8")),
    ];
    for (const t of targets) {
      expect(t).not.toMatch(/supabase\.co/i);
      expect(t).not.toMatch(/service_role_key/i);
      expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT material
    }
  });
  test("harness files are pure ASCII", () => {
    for (const f of [
      "10-minimal-schema.sql",
      "20-draft-apply-order.txt",
      "30-pre-activation-assert.sql",
      "35-activate-workflows-local-only.sql",
      "40-verifier.sql",
      "45-acl-cases.sql",
      "run-harness.sh",
    ]) {
      expect(isAscii(readFileSync(join(PG, f), "utf8"))).toBe(true);
    }
  });
  test("unresolved release-evidence placeholder is never applied silently", () => {
    const schema = readFileSync(join(PG, "10-minimal-schema.sql"), "utf8");
    expect(schema).not.toContain("APPROVED_RELEASE_COMMIT_PLACEHOLDER");
  });
});
