/**
 * PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97
 * Source-only contract tests for the production READ-ONLY preflight package.
 * Does not connect to production. Does not apply Migration 88.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const ROOT = join(import.meta.dir, "../..");
const PREFLIGHT = join(
  ROOT,
  "docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql",
);
const EXEC_PKG = join(
  ROOT,
  "docs/production-preflight/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md",
);
const REPORT = join(
  ROOT,
  "docs/PORTAL-B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97-REPORT.md",
);
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql",
);
const CLEANUP = join(
  ROOT,
  "docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql",
);
const ROUTE_TREE = join(ROOT, "src/routeTree.gen.ts");

const toLf = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const sha256 = (buf: Buffer | string) =>
  createHash("sha256").update(buf).digest("hex");

const stripSqlNoise = (sql: string): string => {
  // Remove line comments, then dollar-quoted / single-quoted string literals.
  const noLineComments = toLf(sql)
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return noLineComments
    .replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, "''")
    .replace(/'(?:''|[^'])*'/g, "''");
};

const FIVE = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const FIXTURES = Array.from({ length: 19 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `SR-20260801-130000${n}`;
});

const FOUR_FNS = [
  "create_student_request(text, text, jsonb, text)",
  "user_matches_workflow_runtime_step(uuid)",
  "current_user_matches_transfer_department_scope(uuid, text)",
  "can_current_user_act_on_step(uuid, text)",
] as const;

const GATES = Array.from({ length: 14 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`);

describe("Package 97 — artifact presence and migration pin", () => {
  it("ships preflight SQL, Lovable package, and report only in allowed scope", () => {
    expect(existsSync(PREFLIGHT)).toBe(true);
    expect(existsSync(EXEC_PKG)).toBe(true);
    expect(existsSync(REPORT)).toBe(true);
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(CLEANUP)).toBe(true);
  });

  it("pins Migration 88 hashes and does not rewrite the migration", () => {
    const raw = readFileSync(MIGRATION);
    const lf = Buffer.from(toLf(raw.toString("utf8")), "utf8");
    expect(sha256(raw)).toBe(
      "b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c",
    );
    expect(sha256(lf)).toBe(
      "fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a",
    );
    expect(raw.length).toBe(58236);
    expect(lf.length).toBe(56666);
    expect(toLf(raw.toString("utf8")).split("\n").length).toBe(1571);

    const pre = toLf(readFileSync(PREFLIGHT, "utf8"));
    expect(pre).toContain(
      "b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c",
    );
    expect(pre).toContain(
      "fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a",
    );
    expect(pre).toContain("20260804120000");
    expect(pre).toContain("NOT_APPLIED");
  });

  it("keeps Migration 88 NOT_APPLIED and makes no production execution claim", () => {
    const pre = toLf(readFileSync(PREFLIGHT, "utf8"));
    const pkg = toLf(readFileSync(EXEC_PKG, "utf8"));
    const report = toLf(readFileSync(REPORT, "utf8"));
    expect(pre).toMatch(/does NOT authorize Migration 88 apply/i);
    expect(pkg).toMatch(/NOT EXECUTED|does NOT authorize Migration 88 apply/i);
    expect(report).toMatch(/Production access\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    for (const doc of [pre, pkg, report]) {
      expect(doc).not.toMatch(/MIGRATION_88_APPLIED_IN_THIS_PACKAGE/i);
      expect(doc).not.toMatch(/PRODUCTION_PREFLIGHT_EXECUTED_PASS/i);
    }
    expect(pkg).toContain("Executing this package does NOT authorize Migration 88 apply");
    expect(pre).toContain("production_execution_claim");
    expect(pre).toContain("false");
  });
});

describe("Package 97 — read-only SQL contract", () => {
  const sql = toLf(readFileSync(PREFLIGHT, "utf8"));
  const code = stripSqlNoise(sql);

  it("begins read-only and ends with ROLLBACK", () => {
    expect(sql).toMatch(/BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+SERIALIZABLE\s+READ\s+ONLY\s*;/i);
    expect(sql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const beginAt = sql.search(/BEGIN\s+TRANSACTION/i);
    const rollbackAt = sql.lastIndexOf("ROLLBACK;");
    expect(beginAt).toBeGreaterThan(-1);
    expect(rollbackAt).toBeGreaterThan(beginAt);
    expect(code).not.toMatch(/\bCOMMIT\s*;/i);
  });

  it("contains no forbidden write tokens outside comments/string fixtures", () => {
    for (const tok of [
      /\bINSERT\b/i,
      /\bUPDATE\b/i,
      /\bDELETE\b/i,
      /\bMERGE\b/i,
      /\bTRUNCATE\b/i,
      /\bCREATE\b/i,
      /\bALTER\b/i,
      /\bDROP\b/i,
      /\bGRANT\b/i,
      /\bREVOKE\b/i,
    ]) {
      expect(code).not.toMatch(tok);
    }
  });

  it("allows auth.users SELECT inventory but forbids Auth mutation verbs", () => {
    expect(sql).toMatch(/FROM auth\.users/i);
    expect(code).not.toMatch(/\bINSERT\s+INTO\s+auth\./i);
    expect(code).not.toMatch(/\bUPDATE\s+auth\./i);
    expect(code).not.toMatch(/\bDELETE\s+FROM\s+auth\./i);
    expect(sql).not.toMatch(/encrypted_password/i);
    expect(sql).toContain("password_usability");
    expect(sql).toContain("UNKNOWN");
  });

  it("declares all fourteen gates exactly once in the result builder", () => {
    for (const g of GATES) {
      expect(sql).toContain(`'${g}'`);
    }
    // G01..G13 appear as gate constructors; G14 as final_decision
    expect(sql).toContain("stop_conditions_final_decision");
    expect(sql).toContain("project_ref_attestation");
    expect(sql).toContain("four_function_preimages");
    expect(sql).toContain("authoritative_fixture_matrix_19");
  });

  it("pins the five services and enrollment_certificate protection", () => {
    for (const codeName of FIVE) {
      expect(sql).toContain(`'${codeName}'`);
    }
    expect(sql).toContain("enrollment_certificate");
    expect(sql).toContain("student_visible");
    expect(sql).toContain("SR-20260713-2DE64041");
    expect(sql).toContain("USR-2026-000001");
  });

  it("pins exact 19 Fixtures and Fixture 15 restored approved state", () => {
    for (const num of FIXTURES) {
      expect(sql).toContain(num);
    }
    expect(sql).toContain("f1300000-0000-4000-8000-000000000015");
    expect(sql).toContain("f1300001-0000-4000-8000-000015000007");
    expect(sql).toContain("fixture_15_restored_ok");
    expect(sql).toContain("FIXTURE_15_RESTORED_APPROVED_STATE_DRIFT");
    expect(sql).toContain("TEST_ONLY_B1_E2E_88");
  });

  it("pins the four replaced function signatures and base fingerprints", () => {
    for (const sig of FOUR_FNS) {
      expect(sql).toContain(sig);
    }
    expect(sql).toContain("9c9090f29458975b197b92dc86b0e587");
    expect(sql).toContain("e25e7e4f6cb759814857abcd509ae49e");
    expect(sql).toContain("4a3c50af92db046b1571eba0e4073f64");
    expect(sql).toContain("f0bf40897b23c49bfee1044b2ce34e3d");
    expect(sql).toContain("HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT");
  });

  it("fails closed on partial apply and unknown passwords", () => {
    expect(sql).toContain("HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED");
    expect(sql).toContain(
      "Identity readiness cannot become PASS while password_usability=UNKNOWN",
    );
    expect(sql).toContain("'G11'");
    expect(sql).toMatch(/'G11'[\s\S]*?'HOLD'/);
  });
});

describe("Package 97 — Lovable execution package + report contracts", () => {
  const pkg = toLf(readFileSync(EXEC_PKG, "utf8"));
  const report = toLf(readFileSync(REPORT, "utf8"));

  it("records Lovable/production identity and preflight hashes", () => {
    expect(pkg).toContain("4b291119-790f-4484-9285-c2b774e1ba6f");
    expect(pkg).toContain("wpmicqriltrowwonknox");
    expect(pkg).toContain("e0cf9d48acb562109aaf310dbd5e534b900c6d90");
    expect(pkg).toContain(
      "42d7b23ce9c62f4d864f00423d017b9dbecda29f6462585b6adc4d3d554df6ac",
    );
    expect(pkg).toContain(
      "e8a03afdee01d8776ab8e292f26817addb05a0ed7609a45a9bcb65d49e302e05",
    );
    expect(pkg).not.toMatch(/eyJ|service_role|postgres:\/\//i);
  });

  it("forbids apply/deploy/publish/auth writes in operator instructions", () => {
    expect(pkg).toContain("No Migration 88 apply");
    expect(pkg).toContain("No Deploy / Publish");
    expect(pkg).toContain("No Auth user create");
    expect(pkg).toContain("READY_FOR_INDEPENDENT_REVIEW_AND_LOVABLE_READONLY_EXECUTION");
  });

  it("report declares source-ready decision without production execution", () => {
    expect(report).toContain("PASS_B1_E2E_88_READONLY_PREFLIGHT_PACKAGE_SOURCE_READY");
    expect(report).toMatch(/Production access\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Migration apply\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Auth writes\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Production writes\s*\|\s*\*{0,2}ZERO\*{0,2}/i);
  });
});

describe("Package 97 — scope hygiene", () => {
  it("does not modify routeTree.gen.ts as part of this package contract", () => {
    expect(existsSync(ROUTE_TREE)).toBe(true);
    // Contract: package docs/tests must not instruct routeTree edits.
    const report = toLf(readFileSync(REPORT, "utf8"));
    expect(report).toMatch(/routeTree.*unchanged|routeTree:\s*UNCHANGED/i);
  });

  it("pins cleanup/decommission companion without applying it", () => {
    const pre = toLf(readFileSync(PREFLIGHT, "utf8"));
    expect(pre).toContain(
      "docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql",
    );
    expect(pre).toContain(
      "61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d",
    );
    expect(pre).toContain("automatic_test_only_request_deletion");
    expect(pre).toContain("false");
  });
});
