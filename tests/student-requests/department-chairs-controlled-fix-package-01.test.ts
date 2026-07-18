import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dir, "..", "..");
const sql = readFileSync(
  join(root, "docs/migration-drafts/DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql"),
  "utf8",
);
const runner = readFileSync(
  join(root, "scripts/department-chairs-controlled-fix-package-01/run-pg17.ps1"),
  "utf8",
);

describe("department chairs controlled fix package", () => {
  it("anchors exact approved identities without email", () => {
    for (const value of [
      "د. اسامه عبدالجليل احمد سيف",
      "F2025006",
      "د. خالد قاسم محمد البراحي",
      "F2025005",
      "د. رمزي حميد الجابري",
      "F2025004",
    ])
      expect(sql).toContain(value);
    expect(sql).toContain("from auth.users");
    expect(sql).not.toMatch(/[\w.+-]+@[\w.-]+/);
  });
  it("uses the explicit seven-argument audit overload and a local actor", () => {
    expect(sql).toContain("log_audit(text,uuid,text,jsonb,jsonb,text,uuid)");
    expect(sql).toContain("department_chairs_controlled_fix_actor");
    expect(sql).toContain("v_actor::uuid");
    expect(sql).not.toContain("auth.uid()");
  });
  it("is concurrent, idempotent, and reuses zero-or-one inactive CS row", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("lock table");
    expect(sql).toContain("OSAMA_CS_INACTIVE_DUPLICATES_");
    expect(sql).toContain("if v_count=1 then");
    expect(sql).toContain("if not exists");
  });
  it("preserves history and never touches position assignments", () => {
    expect(sql).not.toMatch(/^\s*delete\b/im);
    expect(sql).not.toMatch(/(?:update|insert into)\s+public\.position_assignments/i);
    expect(sql).toContain("KHALED_OR_RAMZI_CHANGED");
  });
  it("ships an isolated PostgreSQL 17 behavioral harness", () => {
    expect(runner).toContain("postgres:17");
    for (const scenario of ["positive", "reuse", "idempotency", "stale", "duplicate", "rollback"])
      expect(runner).toContain(scenario);
  });
});
