import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const SHA = "0e2d25c9a2d7923ce74cfae079b99691d61eb1b6";
const SQL_ABS = "C:\\projects\\portal-local-reports\\D02-PRODUCTION-READONLY-EXECUTE.sql";
const FORBID =
  /INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT ON|COPY FROM|\bCALL\b|CREATE TEMP|auth\.admin/i;
const SECRETISH =
  /password\s*[:=]|passwd\s*[:=]|api[_-]?key\s*[:=]|bearer\s+[a-z0-9._\-]+|eyJ[a-zA-Z0-9_-]{10,}\.|postgres(?:ql)?:\/\/|DATABASE_URL\s*[:=]|service_role|sb_secret_/i;

const report = readFileSync(
  join(root, "docs", "PORTAL-D02-READONLY-PRODUCTION-EXECUTION-01-REPORT.md"),
  "utf8",
);

describe("PORTAL-D02-READONLY-PRODUCTION-EXECUTION-01", () => {
  test("report holds on missing channel and pins SOURCE_SHA", () => {
    expect(report).toContain("HOLD_D02_EXECUTION_CHANNEL_REQUIRED");
    expect(report).toContain(SHA);
    expect(report).toContain("SOURCE_SHA");
    expect(report).toMatch(/DEPLOYED_SHA[\s\S]*UNKNOWN/);
    expect(report).toContain("NOT_RUN");
    expect(report).toMatch(/not executed/i);
    expect(report).toContain("STUDENT_ACCOUNTS_SOURCE_PRESENT");
    expect(report).toContain("wpmicqriltrowwonknox");
    expect(report).toMatch(/Cannot issue[\s\S]{0,80}PASS_D02_READONLY_EXECUTED/i);
    expect(report).toMatch(/No claim of[\s\S]{0,40}PASS_D02_READONLY_EXECUTED/i);
    expect(report).not.toMatch(/decision[\s\S]{0,40}PASS_D02_READONLY_EXECUTED/i);
  });

  test("report has no password/token/connection-string patterns", () => {
    expect(report).not.toMatch(SECRETISH);
  });

  test("outside-git SQL exists and passes static forbid check", () => {
    expect(existsSync(SQL_ABS)).toBe(true);
    const sql = readFileSync(SQL_ABS, "utf8");
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toContain("SET TRANSACTION READ ONLY");
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toMatch(/ROLLBACK;\s*$/);
    expect(sql).not.toMatch(FORBID);
    expect(sql).toContain("SECTION_1_Q1_SCHEMA_MIGRATIONS_FULL");
    expect(sql).toContain("DEPLOYED_SHA_UNKNOWN_REQUIRES_EXTERNAL_PROOF");
  });
});