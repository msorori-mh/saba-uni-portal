import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql"), "utf8");

describe("B1 excused absence vocabulary 05A draft", () => {
  it("is source-only and transaction bounded", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it("fails closed unless the exact historical constraint is present", () => {
    expect(sql).toContain("pg_get_constraintdef");
    expect(sql).toContain("aed_reason_chk");
    expect(sql).toContain("AED_REASON_CONSTRAINT_MISSING");
    expect(sql).toContain("AED_REASON_CONSTRAINT_UNEXPECTED");
  });

  it("allows canonical new values and preserves historical values without mapping", () => {
    for (const value of ["medical", "family_emergency", "official", "other", "family", "emergency"]) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql).toContain("no backfill");
    expect(sql).not.toMatch(/UPDATE\s+public\.absence_excuse_details|INSERT\s+INTO\s+public\.absence_excuse_details|DELETE\s+FROM/i);
    expect(sql).not.toMatch(/CASE\s+reason_type|family_emergency\s*(?:=>|->)|official\s*(?:=>|->)/i);
  });

  it("does not activate services or introduce financial data", () => {
    expect(sql).not.toMatch(/student_visible|is_active\s*=|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
