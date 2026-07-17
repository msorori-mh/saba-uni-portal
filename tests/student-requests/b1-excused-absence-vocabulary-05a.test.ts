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

  it("rejects new historical values while allowing untouched historical rows", () => {
    expect(sql).toContain("TG_OP = 'INSERT' OR NEW.reason_type IS DISTINCT FROM OLD.reason_type");
    expect(sql).toContain("NEW.reason_type NOT IN ('medical','family_emergency','official','other')");
    expect(sql).toContain("CANONICAL_ABSENCE_REASON_REQUIRED");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF reason_type");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.enforce_canonical_absence_reason_write()");
  });

  it("recognizes the exact target constraint and trigger state on rerun", () => {
    expect(sql).toContain("'family_emergency''::text,''official''::text");
    expect(sql).toContain("CANONICAL_ABSENCE_REASON_TRIGGER_MISMATCH");
    expect(sql).toContain("tgfoid='public.enforce_canonical_absence_reason_write()'::regprocedure");
    expect(sql).toContain("tgtype=23");
    expect(sql).toContain("tgqual IS NULL");
    expect(sql).toContain("tgattr::smallint[] = ARRAY[");
    expect(sql).toContain("a.attname='reason_type'");
    expect(sql).toContain("c.convalidated");
    expect(sql).toContain("ELSIF NOT v_validated THEN");
  });

  it("does not activate services or introduce financial data", () => {
    expect(sql).not.toMatch(/student_visible|is_active\s*=|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
