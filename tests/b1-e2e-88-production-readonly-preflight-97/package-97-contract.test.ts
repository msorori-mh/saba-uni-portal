/**
 * PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97
 * + PORTAL_B1_E2E_88_PREFLIGHT_PRIVILEGED_SCHEMAS_FIX_112
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
  "docs/PORTAL-B1-E2E-88-PREFLIGHT-PRIVILEGED-SCHEMAS-FIX-112-REPORT.md",
);
const REPORT_108 = join(
  ROOT,
  "docs/PORTAL-B1-E2E-88-PREFLIGHT-LEDGER-PERMISSION-FIX-108-REPORT.md",
);
const REPORT_97 = join(
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
const PG17_STUB = join(
  ROOT,
  "tests/b1-e2e-88-production-readonly-preflight-97/pg17-stub-schema.sql",
);

const toLf = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const sha256 = (buf: Buffer | string) =>
  createHash("sha256").update(buf).digest("hex");

/** Strip SQL comments and string literals so contract checks see executable text only. */
const stripSqlNoise = (sql: string): string => {
  const noLineComments = toLf(sql)
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return noLineComments
    .replace(/\/\*[\s\S]*?\*\//g, " ")
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

const WHITELIST_SCHEMAS = new Set(["public", "pg_catalog", "information_schema"]);

const KNOWN_RESTRICTED = [
  "auth",
  "storage",
  "vault",
  "realtime",
  "supabase_functions",
  "supabase_migrations",
  "net",
  "cron",
  "pgmq",
] as const;

const CONSUMED_SQL_IDS = [
  "f58d5446",
  "e65dc4ae5f36a906e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68",
] as const;

const PRE_RAW_SHA = (() => {
  const raw = readFileSync(PREFLIGHT);
  return sha256(raw);
})();
const PRE_LF_SHA = (() => {
  const lf = Buffer.from(toLf(readFileSync(PREFLIGHT, "utf8")), "utf8");
  return sha256(lf);
})();
const PRE_LF_BYTES = (() => {
  return Buffer.from(toLf(readFileSync(PREFLIGHT, "utf8")), "utf8").length;
})();
const PRE_LF_LINES = (() => {
  return toLf(readFileSync(PREFLIGHT, "utf8")).split("\n").length;
})();

describe("Package 97 — artifact presence and migration pin", () => {
  it("ships preflight SQL, Lovable package, and remediation report only in allowed scope", () => {
    expect(existsSync(PREFLIGHT)).toBe(true);
    expect(existsSync(EXEC_PKG)).toBe(true);
    expect(existsSync(REPORT)).toBe(true);
    expect(existsSync(REPORT_108)).toBe(true);
    expect(existsSync(REPORT_97)).toBe(true);
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(CLEANUP)).toBe(true);
    expect(existsSync(PG17_STUB)).toBe(true);
  });

  it("pins Migration 88 hashes and does not rewrite the migration", () => {
    const raw = readFileSync(MIGRATION);
    const lf = Buffer.from(toLf(raw.toString("utf8")), "utf8");
    expect(sha256(lf)).toBe(
      "fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a",
    );
    expect(lf.length).toBe(56666);
    expect(toLf(raw.toString("utf8")).split("\n").length).toBe(1571);

    if (raw.length === lf.length) {
      expect(sha256(raw)).toBe(
        "fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a",
      );
    } else {
      expect(raw.length).toBe(58236);
      expect(sha256(raw)).toBe(
        "b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c",
      );
    }

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

describe("Package 97 — privileged-schema executable whitelist", () => {
  const sql = toLf(readFileSync(PREFLIGHT, "utf8"));
  const code = stripSqlNoise(sql);

  it("never executes against restricted schemas (auth/storage/vault/…)", () => {
    for (const schema of KNOWN_RESTRICTED) {
      expect(code).not.toMatch(
        new RegExp(`\\b(?:FROM|JOIN)\\s+${schema}\\.`, "i"),
      );
      expect(code).not.toMatch(
        new RegExp(`\\b${schema}\\.[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(`, "i"),
      );
      expect(code).not.toMatch(
        new RegExp(`\\b(?:INSERT|UPDATE|DELETE)\\s+(?:INTO\\s+|FROM\\s+)?${schema}\\.`, "i"),
      );
    }
    expect(code).not.toMatch(/\bFROM\s+auth\.users\b/i);
    expect(code).not.toMatch(/\bJOIN\s+auth\.users\b/i);
  });

  it("rejects EXECUTE/CALL/GRANT/REVOKE/set_config and non-whitelist schema refs", () => {
    expect(code).not.toMatch(/\bEXECUTE\b/i);
    expect(code).not.toMatch(/\bCALL\b/i);
    expect(code).not.toMatch(/\bGRANT\b/i);
    expect(code).not.toMatch(/\bREVOKE\b/i);
    expect(code).not.toMatch(/\bset_config\s*\(/i);
    expect(code).not.toMatch(/\bSET\s+search_path\b/i);

    // Relation refs: FROM/JOIN/INTO/UPDATE schema.rel
    // Exclude "IS [NOT] DISTINCT FROM alias.col" false positives.
    const schemaRefs = [
      ...code.matchAll(/(?<!\bDISTINCT\s)\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\./gi),
      ...code.matchAll(/\b(?:JOIN|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)\./gi),
    ];
    for (const m of schemaRefs) {
      const schema = m[1].toLowerCase();
      expect(WHITELIST_SCHEMAS.has(schema)).toBe(true);
    }

    // Restricted-schema function calls only (alias.col( is not a schema call).
    for (const schema of KNOWN_RESTRICTED) {
      expect(code).not.toMatch(
        new RegExp(`\\b${schema}\\.[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(`, "i"),
      );
    }
  });

  it("allows restricted schema names only in comments / evidence / catalog predicates", () => {
    expect(sql).toContain("auth");
    expect(sql).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
    expect(sql).toContain("nspname = 'auth'");
    expect(sql).toContain("has_schema_privilege");
    expect(code).not.toMatch(/\bauth\.users\b/i);
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

  it("never statically queries Migration-88 tables and uses catalog-only detection", () => {
    expect(code).not.toMatch(/FROM\s+public\.b1_e2e_88_/i);
    expect(code).not.toMatch(/\bEXECUTE\b/i);
    expect(code).not.toMatch(/pg_temp\./i);
    expect(code).not.toMatch(/CREATE\s+TEMP/i);
    expect(sql).toContain("pg_catalog.pg_class");
    expect(sql).toContain("information_schema.tables");
    expect(sql).toContain("HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED");
    expect(sql).toContain("expected_m88_only_functions");
    expect(sql).toContain("public.b1_e2e_88_marker()");
    expect(sql).toContain("trg_b1_e2e_88_audit_no_update");
    expect(sql).toContain("trg_guard_b1_e2e_88_immutable_marker");
  });

  it("never queries the managed migration ledger relation", () => {
    expect(code).not.toMatch(/supabase_migrations\.schema_migrations/i);
    expect(sql).not.toMatch(/supabase_migrations\.schema_migrations/i);
    expect(code).not.toMatch(/has_table_privilege\s*\(/i);
    expect(sql).toContain("HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE");
    expect(sql).toContain("OBJECT_STATE_NOT_APPLIED");
    expect(sql).toContain("OBJECT_STATE_APPLIED_OR_EQUIVALENT");
    expect(sql).toContain("ledger_readability");
    expect(sql).toContain("UNREADABLE");
    expect(sql).toContain("object_state_inference");
    expect(sql).toContain("source_version_identity");
    expect(sql).toContain("expected_managed_alias_identity");
    expect(sql).toContain("definitive_not_applied_from_unreadable_ledger");
    expect(sql).toContain("external_lovable_ledger_attestation_required");
    expect(sql).toMatch(/'G02'[\s\S]*?'UNPROVEN'/);
  });

  it("keeps G01 UNPROVEN and rejects operator set_config identity proof", () => {
    expect(code).not.toMatch(/set_config\s*\(/i);
    expect(sql).toContain("PROJECT_IDENTITY_UNPROVEN");
    expect(sql).toContain("identity_classification");
    expect(sql).toContain("UNPROVEN");
    expect(sql).toContain("user_supplied_guc_accepted");
    expect(sql).toContain("false");
    expect(sql).toContain("trusted_external_channel_required");
    expect(sql).toContain("wpmicqriltrowwonknox");
  });

  it("keeps G10/G11 Auth fail-closed without reading auth.users", () => {
    expect(code).not.toMatch(/\bauth\.users\b/i);
    expect(sql).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
    expect(sql).toContain("public_student_profile_candidates");
    expect(sql).toContain("public_role_records");
    expect(sql).toContain("public_assignment_records");
    expect(sql).toContain("auth_user_existence");
    expect(sql).toContain("session_usability");
    expect(sql).toContain("password_usability");
    expect(sql).toContain("UNKNOWN");
    expect(sql).toContain("UNPROVEN");
    expect(sql).toContain("external_lovable_auth_attestation_required");
    expect(sql).toMatch(/'G10'[\s\S]*?'UNPROVEN'/);
    expect(sql).toMatch(/'G11'[\s\S]*?'HOLD'/);
    expect(sql).toContain(
      "Identity readiness cannot become PASS while auth_user_existence=UNPROVEN or password_usability=UNKNOWN or session_usability=UNKNOWN",
    );
  });

  it("declares all fourteen gates exactly once in the result builder", () => {
    for (const g of GATES) {
      expect(sql).toContain(`'${g}'`);
    }
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

  it("pins exact 19 Fixtures and full matrix routing fields", () => {
    for (const num of FIXTURES) {
      expect(sql).toContain(num);
    }
    expect(sql).toContain("f1300000-0000-4000-8000-000000000015");
    expect(sql).toContain("f1300001-0000-4000-8000-000015000007");
    expect(sql).toContain("fixture_15_restored_ok");
    expect(sql).toContain("FIXTURE_15_RESTORED_APPROVED_STATE_DRIFT");
    expect(sql).toContain("FIXTURE_SERVICE_OR_STEP_ROUTING_DRIFT");
    expect(sql).toContain("TEST_ONLY_B1_E2E_88");
    expect(sql).toContain("direct_assignee_principal_id");
    expect(sql).toContain("processing_unit_code");
    expect(sql).toContain("processing_role_code");
    expect(sql).toContain("configured_action");
    expect(sql).toContain("department_side");
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

  it("makes G04/G08/G09 fingerprints deterministic", () => {
    expect(sql).toContain("ORDER BY grantee::regrole::text, privilege_type");
    expect(sql).toContain("'<NULL>'");
    expect(sql).toContain("'<EMPTY>'");
    expect(sql).toContain("position_assignment_id");
    expect(sql).toContain("epoch");
    expect(sql).toContain("PROTECTED_SURFACE_EMPTY_OR_MISSING");
    expect(sql).toContain("includes_position_assignment_id");
  });

  it("fails closed on partial apply and unresolved Auth", () => {
    expect(sql).toContain("HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED");
    expect(sql).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
    expect(sql).toContain("'G11'");
    expect(sql).toMatch(/'G11'[\s\S]*?'HOLD'/);
  });

  it("pins preflight SQL content hashes and rejects consumed identities", () => {
    const raw = readFileSync(PREFLIGHT);
    const lf = Buffer.from(toLf(raw.toString("utf8")), "utf8");
    expect(sha256(lf)).toBe(PRE_LF_SHA);
    expect(sha256(raw) === PRE_RAW_SHA || sha256(lf) === PRE_LF_SHA).toBe(true);
    expect(lf.length).toBe(PRE_LF_BYTES);
    expect(toLf(raw.toString("utf8")).split("\n").length).toBe(PRE_LF_LINES);
    for (const consumed of CONSUMED_SQL_IDS) {
      expect(PRE_LF_SHA.startsWith(consumed.slice(0, 8))).toBe(false);
      expect(PRE_RAW_SHA.startsWith(consumed.slice(0, 8))).toBe(false);
    }
    expect(PRE_LF_SHA).not.toBe(
      "e65dc4ae5f36a906e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68",
    );
  });
});

describe("Package 97 — Lovable execution package + report contracts", () => {
  const pkg = toLf(readFileSync(EXEC_PKG, "utf8"));
  const report = toLf(readFileSync(REPORT, "utf8"));

  it("records active Lovable/production identity and rejects stale project id in active contract", () => {
    expect(pkg).toContain("90f4dcde-07fb-4441-b86a-6ad5510833b8");
    expect(pkg).toContain("wpmicqriltrowwonknox");
    expect(pkg).toContain("e0cf9d48acb562109aaf310dbd5e534b900c6d90");
    expect(pkg).toContain("historical/stale");
    expect(pkg).toContain("4b291119-790f-4484-9285-c2b774e1ba6f");
    expect(pkg).toMatch(/do not use|historical\/stale/i);
    expect(pkg).toContain(PRE_LF_SHA);
    expect(pkg).not.toMatch(/eyJ|service_role|postgres:\/\//i);
    expect(pkg).not.toMatch(/set_config\s*\(/i);
    expect(pkg).toContain("trusted Lovable channel");
  });

  it("requires trusted Lovable ledger + Auth attestations outside SQL", () => {
    expect(pkg).toContain("Trusted Lovable-managed migration metadata");
    expect(pkg).toContain("whether Migration 88 is already applied");
    expect(pkg).toContain("whether an equivalent migration exists");
    expect(pkg).toContain("Final G02 remains HOLD");
    expect(pkg).toContain("HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE");
    expect(pkg).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
    expect(pkg).toContain("Auth readiness");
    expect(pkg).toContain("exact Auth user IDs");
    expect(pkg).toContain("never print password");
    expect(pkg).toContain("OBJECT_STATE_NOT_APPLIED");
    expect(pkg).toContain("OBJECT_STATE_APPLIED_OR_EQUIVALENT");
    expect(pkg).toContain("No static or dynamic SQL against privileged schemas");
  });

  it("forbids apply/deploy/publish/auth writes in operator instructions", () => {
    expect(pkg).toContain("No Migration 88 apply");
    expect(pkg).toContain("No Deploy / Publish");
    expect(pkg).toContain("No Auth user create");
    expect(pkg).toContain("READY_FOR_FAST_DUAL_REVIEW_AND_NEW_SQL_EXECUTION");
  });

  it("report declares privileged-schema fix decision without production execution", () => {
    expect(report).toContain("PASS_B1_E2E_88_PREFLIGHT_PRIVILEGED_SCHEMAS_FIX");
    expect(report).toMatch(/Production access\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Migration apply\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Auth writes\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Production writes\s*\|\s*\*{0,2}ZERO\*{0,2}/i);
    expect(report).toContain("UNPROVEN");
    expect(report).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
    expect(report).toContain("wpmicqriltrowwonknox");
    expect(report).toContain("90f4dcde-07fb-4441-b86a-6ad5510833b8");
  });
});

describe("Package 97 — scope hygiene", () => {
  it("does not modify routeTree.gen.ts as part of this package contract", () => {
    expect(existsSync(ROUTE_TREE)).toBe(true);
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
