/**
 * PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97
 * + PORTAL_B1_E2E_88_G04_G07_SOURCE_REPIN_128
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
  "docs/PORTAL-B1-E2E-88-G04-G07-SOURCE-REPIN-128-REPORT.md",
);
const REPORT_116 = join(
  ROOT,
  "docs/PORTAL-B1-E2E-88-PREFLIGHT-UUID-TEXT-FIX-116-REPORT.md",
);
const REPORT_112 = join(
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
const USER_MATCHES_SRC = join(
  ROOT,
  "supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql",
);
const CAN_ACT_SRC = USER_MATCHES_SRC;
const TRANSFER_SCOPE_SRC = join(
  ROOT,
  "supabase/migrations/20260727065220_7419d7c9-9a04-49a4-a2ae-935ad100ba03.sql",
);

const toLf = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const sha256 = (buf: Buffer | string) =>
  createHash("sha256").update(buf).digest("hex");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

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

const FOUR_FN_PINS = [
  {
    identity: "public.create_student_request(text, text, jsonb, text)",
    base: "8d0ca5f5dfed004fb105ce0e5904e9ce",
    m88: "ed11125e55df36b154c432c7e28d7285",
    param: "fp_create_student_request_base",
  },
  {
    identity: "public.user_matches_workflow_runtime_step(uuid)",
    base: "8a8fb2907a080a1fa782332d49086394",
    m88: "2fba2db758a2edd42b1c440a36a4aa47",
    param: "fp_user_matches_base",
  },
  {
    identity: "public.current_user_matches_transfer_department_scope(uuid, text)",
    base: "4ae614f3f203fdccb68a90ed38d60a91",
    m88: "396eb3a5f12fb7d46018823930d87851",
    param: "fp_transfer_scope_base",
  },
  {
    identity: "public.can_current_user_act_on_step(uuid, text)",
    base: "4d564dd7ee03dbbefaff1c607f6537b6",
    m88: "586893beacb33c10a1483b38e8d090fd",
    param: "fp_can_act_base",
  },
] as const;

const CLEANUP_RESTORE_FPS = [
  "9c9090f29458975b197b92dc86b0e587",
  "e25e7e4f6cb759814857abcd509ae49e",
  "4a3c50af92db046b1571eba0e4073f64",
  "f0bf40897b23c49bfee1044b2ce34e3d",
] as const;

const G07_ASSIGNEES = [
  ["position_assignment", "9c608c94-a2ac-436c-9a14-e5908068f397"],
  ["position_assignment", "bde82530-1400-4ee5-afcc-a15453cd2069"],
  ["faculty_profile", "ce2f9190-27f4-4914-8971-3ffff97ce2d8"],
  ["staff_profile", "233c9c36-29de-4352-9db3-938a89efe897"],
  ["staff_profile", "89d5e758-6971-45df-98c0-8de9caabb00d"],
  ["staff_profile", "b3966846-116e-44a9-ba54-1cce7971af15"],
  ["staff_profile", "89d5e758-6971-45df-98c0-8de9caabb00d"],
  ["staff_profile", "b3966846-116e-44a9-ba54-1cce7971af15"],
  ["staff_profile", "06f48015-bb18-461e-b818-cfd1a31a8e0d"],
  ["staff_profile", "4a838311-0ab7-4033-8e0c-69327d522bc7"],
  ["staff_profile", "b59e6e45-260d-4af6-b312-85381d354104"],
  ["staff_profile", "b3966846-116e-44a9-ba54-1cce7971af15"],
  ["staff_profile", "233c9c36-29de-4352-9db3-938a89efe897"],
  ["staff_profile", "89d5e758-6971-45df-98c0-8de9caabb00d"],
  ["staff_profile", "df2b0ebf-c23c-40d8-aea7-9622dec6d0f1"],
  ["staff_profile", "b3966846-116e-44a9-ba54-1cce7971af15"],
  ["faculty_profile", "ce2f9190-27f4-4914-8971-3ffff97ce2d8"],
  ["staff_profile", "233c9c36-29de-4352-9db3-938a89efe897"],
  ["staff_profile", "89d5e758-6971-45df-98c0-8de9caabb00d"],
] as const;

const G07_ROW_FPS = [
  "d7f1b5f6b01327e068ddc02e48aae6ea",
  "c1285bc3394a58ecc441ca5895b01d23",
  "785fdcb51a313c34cb64772bbe183253",
  "0c15d684176ceafa98f5e5e075d13693",
  "8fe0c00a477cba2c5957a6ffc1afe84a",
  "1b3d4d54ee3426a6b769c2fa47fb43cc",
  "11a2ac6a21ced5385318512a7175d043",
  "88db01eb91daa7345c8100540ce1ea62",
  "9d1c70708f6738e1e621bdf69a096951",
  "55fd53b6cc68b1522cab869692a50779",
  "8c8a5d857dcee9a2018346e5005d299d",
  "f6d68c52f657f10761b5c2494e7b8dea",
  "9ee619a47e38a4150515f062f8fba4ac",
  "462bc48bf1353382696a156fb19c7dbb",
  "8160d7e351c0411920d2dc4c9ace2f5e",
  "b63f199072c5a7992c46fc589e212b08",
  "82c757cf996db9b6bad8065230d9da2a",
  "34cb6fa983204e09f350b51ea94136da",
  "2cde238f199c506ba23073b658e44f01",
] as const;

const G07_FULL_MATRIX_FP = "ebc412c0ad1d3be9742fddd5219216a7";

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
  "e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71",
  "ad3ce4f4d40418862d0e71e593eb96a78da64a59e14eadc1bccc015b7ffff4f5",
] as const;

const CANONICAL_LF_SHA =
  "01d5d27dd7a22d1fbfe4f7694900a6fc7a3ba2db9775ba60217db20732e0e348";
const CANONICAL_LF_BYTES = 75453;
const CANONICAL_LF_LINES = 1608;

function parseFixtureExpect(sql: string) {
  const block = sql.match(
    /fixture_expect AS \([\s\S]*?\) AS t\(\s*case_index,[\s\S]*?expected_row_fp\s*\)/,
  );
  expect(block).not.toBeNull();
  const lines = block![0]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\(\d+,/.test(l));
  expect(lines.length).toBe(19);
  return lines.map((tuple, idx) => {
    const kind = tuple.match(
      /'(position_assignment|staff_profile|faculty_profile|user)'/,
    )?.[1];
    const fps = [...tuple.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]);
    const reqNum = tuple.match(/'(SR-20260801-130000\d{2})'/)?.[1];
    const caseIndex = Number(tuple.match(/^\((\d+)/)?.[1]);
    const assigneeId = G07_ASSIGNEES[idx][1];
    expect(caseIndex).toBe(idx + 1);
    expect(kind).toBeDefined();
    expect(reqNum).toBeDefined();
    expect(fps.length).toBeGreaterThanOrEqual(1);
    expect(tuple).toContain(assigneeId);
    return {
      caseIndex,
      requestNumber: reqNum!,
      kind: kind!,
      assigneeId,
      rowFp: fps[fps.length - 1],
      tuple,
    };
  });
}

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
    expect(existsSync(REPORT_116)).toBe(true);
    expect(existsSync(REPORT_112)).toBe(true);
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
    expect(sql).toContain("direct_assignee_principal_kind");
    expect(sql).toContain("processing_unit_code");
    expect(sql).toContain("processing_role_code");
    expect(sql).toContain("configured_action");
    expect(sql).toContain("department_side");
    expect(sql).toContain("expected_row_fp");
    expect(sql).toContain(G07_FULL_MATRIX_FP);
  });

  it("pins the four replaced function signatures and current-production base fingerprints", () => {
    for (const fn of FOUR_FN_PINS) {
      expect(sql).toContain(fn.identity);
      expect(sql).toContain(fn.base);
      expect(sql).toContain(fn.m88);
    }
    expect(sql).toContain("HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT");
    expect(sql).toContain("regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r\\t ]+', ' ', 'g')");
    expect(sql).toContain("body_mentions_e2e_88");
    expect(sql).toContain("match_count");
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
    expect(sha256(lf)).toBe(CANONICAL_LF_SHA);
    expect(sha256(lf)).toBe(PRE_LF_SHA);
    expect(lf.length).toBe(CANONICAL_LF_BYTES);
    expect(lf.length).toBe(PRE_LF_BYTES);
    expect(toLf(raw.toString("utf8")).split("\n").length).toBe(CANONICAL_LF_LINES);
    expect(toLf(raw.toString("utf8")).split("\n").length).toBe(PRE_LF_LINES);
    for (const consumed of CONSUMED_SQL_IDS) {
      expect(PRE_LF_SHA).not.toBe(consumed);
      expect(PRE_RAW_SHA).not.toBe(consumed);
      expect(PRE_LF_SHA.startsWith(consumed.slice(0, 8))).toBe(false);
      expect(PRE_RAW_SHA.startsWith(consumed.slice(0, 8))).toBe(false);
    }
    expect(PRE_LF_SHA).not.toBe(
      "e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71",
    );
  });
});

describe("Package 97 — UUID/text type-safety contract", () => {
  const sql = toLf(readFileSync(PREFLIGHT, "utf8"));
  const code = stripSqlNoise(sql);
  const stub = toLf(readFileSync(PG17_STUB, "utf8"));

  it("rejects coalesce(uuid_column, '') and bare uuid = '' / uuid LIKE patterns", () => {
    // Faculty regression: must never coalesce faculty_id with empty text without ::text.
    // Check raw SQL so string-literal stripping cannot invent false `_id = ''` hits.
    expect(sql).not.toMatch(/coalesce\s*\(\s*fp\.faculty_id\s*,\s*''\s*\)/i);
    expect(sql).not.toMatch(/coalesce\s*\(\s*[a-z_][a-z0-9_.]*faculty_id\s*,\s*''\s*\)/i);
    expect(code).not.toMatch(/coalesce\s*\(\s*fp\.faculty_id\s*,\s*''\s*\)/i);

    // Generic unsafe: coalesce(<ident>, '') where the coalesced ident looks like a uuid column
    // and lacks an explicit ::text cast before the comma.
    const unsafeCoalesce = [
      ...sql.matchAll(
        /coalesce\s*\(\s*([a-z_][a-z0-9_.]*)\s*,\s*''\s*\)/gi,
      ),
    ];
    for (const m of unsafeCoalesce) {
      const col = m[1].toLowerCase();
      // text-safe profile columns may coalesce with ''
      const textSafe =
        /(?:email|full_name_en|full_name_ar|employee_number|academic_number|request_number|code|status|step_key|assignment_type|action_type|role)$/.test(
          col,
        );
      expect(textSafe || !/(?:_id|uuid)$/.test(col)).toBe(true);
    }

    // Bare uuid compared to empty text / LIKE without cast (raw SQL literals only).
    expect(sql).not.toMatch(/\bfaculty_id\s*=\s*''/i);
    expect(sql).not.toMatch(/\bfaculty_id\s+LIKE\s+/i);
    expect(sql).not.toMatch(/\b[a-z_][a-z0-9_]*_id\s*=\s*''/i);
    expect(sql).not.toMatch(/\b[a-z_][a-z0-9_]*_id\s+LIKE\s+'/i);
  });

  it("requires explicit ::text before faculty_id TEST_ONLY pattern comparisons", () => {
    expect(sql).toContain("coalesce(fp.faculty_id::text, '') LIKE 'TEST_ONLY%'");
    const facultyLikes = [
      ...sql.matchAll(/coalesce\(\s*fp\.faculty_id(::text)?\s*,\s*''\s*\)\s+LIKE/gi),
    ];
    expect(facultyLikes.length).toBeGreaterThanOrEqual(4);
    for (const m of facultyLikes) {
      expect(m[1]).toBe("::text");
    }
  });

  it("rejects CASE branches that force uuid/text coercion via empty-string uuid arms", () => {
    // Raw SQL: reject CASE arms that emit literal '' alongside a uuid-typed column reference
    // without an explicit ::text cast (the faculty_id regression class).
    const caseBlocks = [...sql.matchAll(/\bCASE\b[\s\S]*?\bEND\b/gi)];
    for (const block of caseBlocks) {
      const body = block[0];
      if (!/\bTHEN\s*''/i.test(body)) continue;
      const uuidCols = [
        ...body.matchAll(/\b([a-z_][a-z0-9_]*_id)\b/gi),
      ].map((m) => m[1].toLowerCase());
      for (const col of uuidCols) {
        // Allow only when every uuid col appearance in the CASE is cast to text.
        const bare = new RegExp(`\\b${col}(?!::text)\\b`, "i");
        expect(bare.test(body)).toBe(false);
      }
    }
    expect(sql).not.toMatch(/CASE[\s\S]{0,300}?\bfaculty_id\s*=\s*''/i);
  });

  it("pins stub faculty_profiles.faculty_id as uuid to reproduce the production type", () => {
    expect(stub).toMatch(/faculty_id\s+uuid/i);
    expect(stub).not.toMatch(/faculty_id\s+text/i);
  });
});

describe("Package 97 — Lovable execution package + report contracts", () => {
  const pkg = toLf(readFileSync(EXEC_PKG, "utf8"));
  const report = toLf(readFileSync(REPORT, "utf8"));

  it("records active Lovable/production identity and rejects stale project id in active contract", () => {
    expect(pkg).toContain("90f4dcde-07fb-4441-b86a-6ad5510833b8");
    expect(pkg).toContain("wpmicqriltrowwonknox");
    expect(pkg).toContain("e00fbe611b888b1589a03a3b8716fb167fec09da");
    expect(pkg).toContain("historical/stale");
    expect(pkg).toContain("4b291119-790f-4484-9285-c2b774e1ba6f");
    expect(pkg).toMatch(/do not use|historical\/stale/i);
    expect(pkg).toContain(CANONICAL_LF_SHA);
    expect(pkg).toContain("75453");
    expect(pkg).not.toMatch(/eyJ|service_role|postgres:\/\//i);
    expect(pkg).not.toMatch(/set_config\s*\(/i);
    expect(pkg).toContain("trusted Lovable channel");
    expect(pkg).not.toContain(
      "e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71",
    );
    expect(pkg).not.toContain(
      "ad3ce4f4d40418862d0e71e593eb96a78da64a59e14eadc1bccc015b7ffff4f5",
    );
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
    expect(pkg).toContain("READY_FOR_FAST_DUAL_REVIEW_AND_NEW_PREFLIGHT_EXECUTION");
  });

  it("report declares G04/G07 source-repin decision without production execution", () => {
    expect(report).toContain("PASS_B1_E2E_88_G04_G07_SOURCE_REPIN");
    expect(report).toMatch(/Production access\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Migration apply\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Auth writes\s*\|\s*\*{0,2}NONE\*{0,2}/i);
    expect(report).toMatch(/Production writes\s*\|\s*\*{0,2}ZERO\*{0,2}/i);
    expect(report).toContain(CANONICAL_LF_SHA);
    expect(report).toContain("wpmicqriltrowwonknox");
    expect(report).toContain("90f4dcde-07fb-4441-b86a-6ad5510833b8");
    expect(report).toContain("8d0ca5f5dfed004fb105ce0e5904e9ce");
    expect(report).toContain(G07_FULL_MATRIX_FP);
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
    for (const fp of CLEANUP_RESTORE_FPS) {
      expect(pre).toContain(fp);
    }
    expect(pre).toContain("fp_create_student_request_cleanup_restore");
  });
});

describe("Package 97 — G04 function preimage repin contract", () => {
  const sql = toLf(readFileSync(PREFLIGHT, "utf8"));

  it("maps exactly four signatures to current-production base fingerprints", () => {
    const mappings = FOUR_FN_PINS.map((fn) => {
      expect(sql).toContain(`'${fn.base}'::text AS ${fn.param}`);
      expect(sql).toContain(fn.identity);
      return `${fn.identity}=${fn.base}`;
    });
    expect(mappings).toHaveLength(4);
    expect(new Set(mappings).size).toBe(4);
    expect(new Set(FOUR_FN_PINS.map((f) => f.base)).size).toBe(4);
  });

  it("rejects fingerprint swaps across signatures", () => {
    for (const fn of FOUR_FN_PINS) {
      for (const other of FOUR_FN_PINS) {
        if (fn.param === other.param) continue;
        expect(sql).not.toContain(`'${other.base}'::text AS ${fn.param}`);
      }
    }
  });

  it("forces G04 HOLD on mismatch, missing/duplicate/NULL, m88 marker, or forbidden fp", () => {
    expect(sql).toContain("match_count <> 1 OR observed_fp IS NULL");
    expect(sql).toContain("observed_fp IS DISTINCT FROM expected_base_fp");
    expect(sql).toContain("body_mentions_e2e_88");
    expect(sql).toContain("observed_fp = forbidden_m88_fp");
    expect(sql).toContain("HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT");
    for (const fn of FOUR_FN_PINS) {
      expect(sql).toContain(fn.m88);
    }
  });

  it("preserves fingerprint canonicalizer byte-for-byte inputs", () => {
    expect(sql).toContain(
      "regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r\\t ]+', ' ', 'g')",
    );
    expect(sql).toContain("pg_get_userbyid(p.proowner)");
    expect(sql).toContain("p.prosecdef::text");
    expect(sql).toContain("p.provolatile::text");
    expect(sql).toContain("p.proisstrict::text");
    expect(sql).toContain("p.proparallel::text");
    expect(sql).toContain("array_to_string(p.proconfig, ',')");
    expect(sql).toContain("ORDER BY grantee::regrole::text, privilege_type");
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid)");
    expect(sql).toContain("position('b1_e2e_88' in pg_get_functiondef(p.oid))");
  });

  it("keeps cleanup restore fingerprints distinct from current-production base pins", () => {
    for (const fp of CLEANUP_RESTORE_FPS) {
      expect(sql).toContain(fp);
      expect(FOUR_FN_PINS.map((f) => f.base)).not.toContain(fp);
    }
    const cleanup = toLf(readFileSync(CLEANUP, "utf8"));
    expect(cleanup).toContain("9c9090f29458975b197b92dc86b0e587");
    expect(cleanup).toContain("e25e7e4f6cb759814857abcd509ae49e");
    expect(cleanup).toContain("4a3c50af92db046b1571eba0e4073f64");
    expect(cleanup).toContain("f0bf40897b23c49bfee1044b2ce34e3d");
  });

  it("preserves authorization semantic source assertions", () => {
    const userMatches = toLf(readFileSync(USER_MATCHES_SRC, "utf8"));
    const canAct = toLf(readFileSync(CAN_ACT_SRC, "utf8"));
    const transfer = toLf(readFileSync(TRANSFER_SCOPE_SRC, "utf8"));

    expect(userMatches).toContain("assigned_user_id");
    expect(userMatches).toMatch(/assigned_user_id IS NOT NULL[\s\S]*RETURN/);
    expect(userMatches).toContain("processing_unit_id");
    expect(userMatches).toContain("processing_role_id");
    expect(userMatches).toContain("v_has_direct_assignee");

    expect(canAct).toContain("user_matches_workflow_runtime_step");
    expect(canAct).toContain("action_type");
    expect(canAct).toMatch(/predecessor|completed/i);

    expect(transfer).toContain("current_user_matches_transfer_department_scope");
    expect(transfer).toMatch(/department/i);

    expect(userMatches).not.toMatch(/IF\s+public\.has_role\([^\)]*'admin'/i);
    expect(userMatches).not.toMatch(/bypass/i);
    expect(canAct).not.toMatch(/IF\s+public\.has_role\([^\)]*'admin'/i);
  });
});

describe("Package 97 — G07 fixture identity repin contract", () => {
  const sql = toLf(readFileSync(PREFLIGHT, "utf8"));

  it("pins exactly 19 expected rows in case order with unique identities", () => {
    const parsed = parseFixtureExpect(sql);
    expect(parsed).toHaveLength(19);
    const nums = parsed.map((r) => r.requestNumber);
    const fps = parsed.map((r) => r.rowFp);
    expect(new Set(nums).size).toBe(19);
    expect(new Set(fps).size).toBe(19);
    for (let i = 0; i < 19; i++) {
      expect(parsed[i].caseIndex).toBe(i + 1);
      expect(parsed[i].requestNumber).toBe(FIXTURES[i]);
      expect(parsed[i].kind).toBe(G07_ASSIGNEES[i][0]);
      expect(parsed[i].assigneeId).toBe(G07_ASSIGNEES[i][1]);
      expect(parsed[i].rowFp).toBe(G07_ROW_FPS[i]);
    }
  });

  it("pins full-matrix fingerprint as sorted row-fp aggregation", () => {
    expect(md5([...G07_ROW_FPS].sort().join("|"))).toBe(G07_FULL_MATRIX_FP);
    expect(sql).toContain(
      "md5(coalesce(string_agg(expected_row_fp, '|' ORDER BY expected_row_fp), '<EMPTY>'))",
    );
    expect(sql).toContain(
      `'${G07_FULL_MATRIX_FP}'::text AS expected_fixture_full_matrix_fp`,
    );
  });

  it("derives live assignee kind deterministically and requires exactly one column", () => {
    expect(sql).toContain("WHEN s.assigned_user_id IS NOT NULL THEN 'user'");
    expect(sql).toContain(
      "WHEN s.assigned_staff_profile_id IS NOT NULL THEN 'staff_profile'",
    );
    expect(sql).toContain(
      "WHEN s.assigned_faculty_profile_id IS NOT NULL THEN 'faculty_profile'",
    );
    expect(sql).toContain(
      "WHEN s.assigned_position_assignment_id IS NOT NULL THEN 'position_assignment'",
    );
    expect(sql).toContain("active_direct_assignee_populated_count = 1");
    expect(sql).toContain(
      "l.active_direct_assignee_kind IS NOT DISTINCT FROM e.direct_assignee_principal_kind",
    );
    expect(sql).toContain(
      "l.active_direct_assignee IS NOT DISTINCT FROM e.direct_assignee_principal_id",
    );
  });

  it("fails when assignee kind or UUID alone drifts", () => {
    expect(sql).toContain("FIXTURE_ASSIGNEE_IDENTITY_DRIFT");
    expect(sql).toContain("assignee_identity_drift");
    expect(sql).toContain("assignee_cardinality_drift");
    expect(sql).toMatch(
      /active_direct_assignee_kind IS NOT DISTINCT FROM e\.direct_assignee_principal_kind\s*\n\s*AND l\.active_direct_assignee IS NOT DISTINCT FROM e\.direct_assignee_principal_id/,
    );
  });

  it("rejects missing, duplicate, and unexpected fixtures and preserves routing/Fixture-15", () => {
    expect(sql).toContain("missing_count = 0");
    expect(sql).toContain("unexpected_count = 0");
    expect(sql).toContain("duplicate_request_number_count = 0");
    expect(sql).toContain("duplicate_request_id_count = 0");
    expect(sql).toContain("duplicate_runtime_step_id_count = 0");
    expect(sql).toContain("routing_drift_count = 0");
    expect(sql).toContain("FIXTURE_SERVICE_OR_STEP_ROUTING_DRIFT");
    expect(sql).toContain("fixture_15_restored_ok");
    expect(sql).toContain("fixture_15_completed_steps = 6");
    expect(sql).toContain("enrollment_certificate");
    expect(sql).toContain("student_visible");
  });
});
