import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("department administrative positions production preflight", () => {
  const sql = read(
    "docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-PREFLIGHT.sql",
  );

  test("is executable as a literal PostgreSQL read-only transaction", () => {
    expect(sql).toContain("BEGIN TRANSACTION READ ONLY;");
    expect(sql).toContain("ROLLBACK;");
    expect(sql).toContain("WITH separation_preflight_checks");
    expect(sql).not.toMatch(/CREATE\s+(?:TEMP|TEMPORARY)\s+TABLE/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i);
  });

  test("preserves the fail-closed gate and protected-record checks", () => {
    expect(sql).toContain("DEPARTMENT_POSITION_SEPARATION_PREFLIGHT_STOP");
    expect(sql).toContain("SR-20260713-2DE64041");
    expect(sql).toContain("SR-20260715-FEDCB3E1");
    expect(sql).toContain("SR-20260716-26BAD4C8");
    expect(sql).toContain("enrollment_certificate");
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
