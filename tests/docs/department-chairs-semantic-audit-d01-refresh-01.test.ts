import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01 — anti-regression static
// guards for the semantic audit SQL + refreshed D-01 package. Scans for the
// historical failure modes (D-02 naming-based chair query, naming-derived
// seeds, history deletion, account/profile creation) and pins the structural
// contract of the new files.

const root = process.cwd();
const DRAFTS = join(root, "docs", "migration-drafts");

const AUDIT = "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql";
const PG_SCHEMA = "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-MINIMAL-SCHEMA.sql";
const PG_FIXTURES = "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-FIXTURES.sql";
const PG_VERIFIER = "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-VERIFIER.sql";
const PREFLIGHT = "DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-PREFLIGHT.sql";
const PACKAGE = "DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02.sql";
const POST_VERIFIER = "DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-POST-VERIFIER.sql";
const ROLLBACK = "DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK-BY-FORWARD.sql";
const REPORT = join("docs", "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01-REPORT.md");

const ALL_SQL = [
  AUDIT,
  PG_SCHEMA,
  PG_FIXTURES,
  PG_VERIFIER,
  PREFLIGHT,
  PACKAGE,
  POST_VERIFIER,
  ROLLBACK,
];
const PACKAGE_FAMILY = [PREFLIGHT, PACKAGE, POST_VERIFIER, ROLLBACK];

const read = (name: string): string => readFileSync(join(DRAFTS, name), "utf8");

// line/block comment stripper; the shipped SQL carries no `--` or `/*` inside
// string literals (guarded by a test below), so stripping is sound here.
const stripSqlComments = (sql: string): string =>
  sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const sharedBody = (sql: string): string => {
  // the verifier header mentions the markers descriptively; anchor the search
  // after the expected_chairs CTE so only the real delimiters match.
  const anchor = sql.indexOf("WITH expected_chairs");
  const begin = sql.indexOf("-- >>SHARED:CLASSIFICATION_BODY>>", anchor);
  const end = sql.indexOf("-- <<SHARED:CLASSIFICATION_BODY>>", begin);
  expect(anchor).toBeGreaterThan(-1);
  expect(begin).toBeGreaterThan(anchor);
  expect(end).toBeGreaterThan(begin);
  return sql.slice(begin, end);
};

describe("DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01", () => {
  test("no file uses the D-02 naming flaw: chair-substring pattern or d.code", () => {
    for (const name of ALL_SQL) {
      const sql = read(name);
      // eslint-disable-next-line no-useless-escape
      expect(sql).not.toMatch(/%chair%/i);
      expect(sql).not.toMatch(/\bd\.code\b/);
      expect(stripSqlComments(sql)).not.toMatch(/position_title\s+(i)?like/i);
    }
  });

  test("no file creates accounts/profiles or deletes assignment history", () => {
    for (const name of ALL_SQL) {
      const stripped = stripSqlComments(read(name));
      expect(stripped).not.toMatch(/insert\s+into\s+(public\.)?auth\.?users/i);
      expect(stripped).not.toMatch(/insert\s+into\s+auth\.users/i);
      expect(stripped).not.toMatch(/delete\s+from\s+(public\.)?request_processing_assignments/i);
      expect(stripped).not.toMatch(/delete\s+from\s+(public\.)?faculty_profiles/i);
      expect(stripped).not.toMatch(/truncate\s+(public\.)?request_processing_assignments/i);
    }
    // fixtures legitimately seed b_chairs.* rows; everywhere else no
    // faculty_profiles INSERT is allowed.
    for (const name of ALL_SQL.filter((n) => n !== PG_FIXTURES)) {
      expect(stripSqlComments(read(name))).not.toMatch(
        /insert\s+into\s+(public\.)?faculty_profiles/i,
      );
    }
  });

  test("audit SQL is strictly read-only and ends with ROLLBACK", () => {
    const audit = read(AUDIT);
    expect(audit).toContain("READ ONLY");
    expect(audit.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const stripped = stripSqlComments(audit);
    expect(stripped).not.toMatch(
      /\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i,
    );
    expect(audit).toContain("SET LOCAL search_path TO b_chairs, public;");
  });

  test("audit SQL pins the semantic anchors and all 8 classifications", () => {
    const audit = read(AUDIT);
    expect(audit).toContain("'department'");
    expect(audit).toContain("'department_head'");
    expect(audit).toContain("assignment_type = 'faculty_profile'");
    expect(audit).toContain("employee_number");
    for (const c of [
      "MATCHED",
      "MISSING",
      "DUPLICATE",
      "WRONG_UNIT",
      "WRONG_IDENTITY",
      "INACTIVE",
      "EXPIRED",
      "AMBIGUOUS",
    ]) {
      expect(audit).toContain(`'${c}'`);
    }
    // approved expected identities (academic numbers) + department anchors
    expect(audit).toContain("'F2025006'");
    expect(audit).toContain("'F2025005'");
    expect(audit).toContain("'F2025004'");
    expect(audit).toContain("11111111-1111-4111-8111-111111111111");
    expect(audit).toContain("ce485c67-5f7c-498d-b120-4b1130a86ae8");
    expect(audit).toContain("22222222-2222-4222-8222-222222222222");
    // runtime-version pin (recon section 7)
    expect(audit).toContain("20260710180000");
    expect(audit).toContain("STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING");
  });

  test("verifier embeds the byte-identical shared classification body", () => {
    expect(sharedBody(read(PG_VERIFIER))).toBe(sharedBody(read(AUDIT)));
    const verifier = read(PG_VERIFIER);
    for (const label of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"]) {
      expect(verifier).toContain(`'${label}'`);
    }
    expect(verifier).toContain("AUDIT_CLASSIFICATION_MISMATCH");
    expect(verifier).toContain("PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17_ALL_8_CLASSIFICATIONS");
  });

  test("package is forward-only: single INSERT target, whitelist, evidence gate", () => {
    const stripped = stripSqlComments(read(PACKAGE));
    const inserts = [...stripped.matchAll(/insert\s+into\s+([\w.]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(inserts.length).toBeGreaterThan(0);
    for (const target of inserts) {
      expect(target).toBe("public.request_processing_assignments");
    }
    expect(stripped).not.toMatch(/\bdelete\b/i);
    expect(read(PACKAGE)).toContain("app.department_chairs_semantic_fix_evidence");
    expect(read(PACKAGE)).toContain(
      "DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006",
    );
    expect(read(PACKAGE)).toContain("TOUCH_OUTSIDE_WHITELIST_ASSIGNMENTS");
    expect(read(PACKAGE)).toContain("TOUCH_OUTSIDE_WHITELIST_FACULTY_PROFILES");
    expect(read(PACKAGE)).toContain("ASSIGNMENT_HISTORY_ROW_LOST");
    expect(read(PACKAGE)).toContain("IT_DUPLICATE_UNKNOWN_MEMBER_STOP");
    expect(read(PACKAGE)).toContain("ACTIVE_HEAD_OUTSIDE_CS_IT_IS_STOP");
    expect(read(PACKAGE)).toContain("CHAIR_POST_TOTAL_DEPARTMENT_");
    expect(read(PACKAGE)).toContain("gen_random_uuid");
    expect(read(PACKAGE)).toContain("public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)");
  });

  test("package family pins protected identities and runtime version", () => {
    for (const name of [PREFLIGHT, PACKAGE]) {
      const sql = read(name);
      for (const id of [
        "SR-20260713-2DE64041",
        "SR-20260715-FEDCB3E1",
        "SR-20260716-26BAD4C8",
        "USR-2026-000001",
        "USR-2026-000002",
      ]) {
        expect(sql).toContain(id);
      }
      expect(sql).toContain("F2025006");
      expect(sql).toContain("F2025005");
      expect(sql).toContain("F2025004");
      expect(sql).toContain("20260710180000");
    }
    const rollback = stripSqlComments(read(ROLLBACK));
    expect(rollback).not.toMatch(/\bdelete\b/i);
    expect(read(ROLLBACK)).toContain("SEMANTIC_FIX_ROLLBACK_TICKET_REQUIRED");
    expect(read(ROLLBACK)).toContain("department_chair_semantic_fix_rollback_by_forward");
  });

  test("post-verifier is read-only and fail-closed", () => {
    const post = read(POST_VERIFIER);
    expect(post).toContain("READ ONLY");
    expect(post.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const stripped = stripSqlComments(post);
    expect(stripped).not.toMatch(/\b(insert|update|delete|create\s+table|alter|drop)\b/i);
    expect(post).toContain("POST_WRONG_ROW_HISTORY_LOST");
    expect(post).toContain("POST_ACTIVE_HEAD_OUTSIDE_SCOPE");
    expect(post).toContain("PASS_DEPARTMENT_CHAIRS_SEMANTIC_FIX_PACKAGE_02_POST_VERIFIED");
  });

  test("preflight is read-only and emits the stop-condition checklist", () => {
    const pre = read(PREFLIGHT);
    expect(pre).toContain("READ ONLY");
    expect(pre.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const stripped = stripSqlComments(pre);
    expect(stripped).not.toMatch(/\b(insert|update|delete|create\s+table|alter|drop)\b/i);
    expect(pre).toContain("IT_DUPLICATE_PRESTATE_MEMBERSHIP");
    expect(pre).toContain("NO_ACTIVE_HEADS_OUTSIDE_CS_IT_IS");
  });

  test("PG17 harness set is self-consistent and schema-scoped to b_chairs", () => {
    const schema = read(PG_SCHEMA);
    expect(schema).toContain("CREATE SCHEMA b_chairs;");
    expect(schema).not.toMatch(/create\s+table\s+(?!b_chairs\.)/i);
    const fixtures = read(PG_FIXTURES);
    expect(fixtures).toContain("'department_head'");
    // decoy role proving the semantic (non-naming) filter
    expect(fixtures).toContain("'department_member'");
  });

  test("report exists and carries verdict + protected identities", () => {
    const report = readFileSync(join(root, REPORT), "utf8");
    expect(report).toContain("PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17_ALL_8_CLASSIFICATIONS");
    expect(report).toContain("د. أسامة عبدالجليل أحمد سيف");
    expect(report).toContain("F2025006");
    for (const id of [
      "SR-20260713-2DE64041",
      "SR-20260715-FEDCB3E1",
      "SR-20260716-26BAD4C8",
      "USR-2026-000001",
      "USR-2026-000002",
    ]) {
      expect(report).toContain(id);
    }
  });

  test("no trailing whitespace and no comment-strip hazards in shipped files", () => {
    for (const name of ALL_SQL) {
      const text = readFileSync(join(DRAFTS, name), "utf8");
      for (const line of text.split("\n")) {
        expect(line).not.toMatch(/[ \t]+$/);
      }
    }
    for (const line of readFileSync(join(root, REPORT), "utf8").split("\n")) {
      expect(line).not.toMatch(/[ \t]+$/);
    }
    // soundness guard for stripSqlComments: after stripping, string literals
    // must be balanced and must not contain comment openers (a `--` inside a
    // real literal would let the stripper eat live SQL and hide DML).
    for (const name of ALL_SQL) {
      const stripped = stripSqlComments(read(name));
      expect(stripSqlComments(stripped)).toBe(stripped);
      expect((stripped.match(/'/g) ?? []).length % 2).toBe(0);
      for (const literal of stripped.match(/'[^']*'/g) ?? []) {
        expect(literal).not.toContain("--");
        expect(literal).not.toContain("/*");
      }
    }
  });
});
