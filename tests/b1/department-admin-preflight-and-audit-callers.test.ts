import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

describe("department administrative positions production preflight", () => {
  const sql = read(
    "docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-PREFLIGHT.sql",
  );
  const executableSql = stripSqlComments(sql);

  test("is executable as a literal PostgreSQL read-only transaction", () => {
    expect(executableSql).toContain("BEGIN TRANSACTION READ ONLY;");
    expect(executableSql).toContain("ROLLBACK;");
    expect(executableSql).toContain("WITH separation_preflight_checks");
    expect(executableSql).not.toMatch(/CREATE\s+(?:TEMP|TEMPORARY)\s+TABLE/i);
    expect(executableSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i);
  });

  test("preserves the fail-closed gate and protected-record checks", () => {
    expect(executableSql).toContain("DEPARTMENT_POSITION_SEPARATION_PREFLIGHT_STOP");
    expect(executableSql).toContain("SR-20260713-2DE64041");
    expect(executableSql).toContain("SR-20260715-FEDCB3E1");
    expect(executableSql).toContain("SR-20260716-26BAD4C8");
    expect(executableSql).toContain("enrollment_certificate");
  });
});

describe("document audit caller after log_audit closure", () => {
  const source = read("src/lib/document-audit.functions.ts");

  test("uses the server service-role client and records the authenticated actor", () => {
    expect(source).toContain('supabaseAdmin.rpc("log_audit"');
    expect(source).toContain("_actor_user_id: context.userId");
    expect(source).not.toContain('context.supabase as any;\n      await sb.rpc("log_audit"');
  });
});
