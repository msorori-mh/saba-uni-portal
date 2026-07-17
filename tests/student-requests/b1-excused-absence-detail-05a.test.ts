import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql"), "utf8");

describe("B1 excused absence detail 05A", () => {
  it("adds a nullable no-default historical-compatible column", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS absence_reason_detail text");
    expect(sql).toContain("NOT a.attnotnull");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM pg_attrdef");
    expect(sql).not.toMatch(/UPDATE\s+public\.absence_excuse_details|backfill\s+absence_reason_detail/i);
  });
  it("requires a meaningful value for new or changed writes only", () => {
    expect(sql).toMatch(/TG_OP='INSERT'\s+OR NEW\.absence_reason_detail IS DISTINCT FROM OLD\.absence_reason_detail/);
    for (const field of ["reason_type", "course_section_id", "absence_date"]) {
      expect(sql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(sql).toContain("length(btrim(NEW.absence_reason_detail)) < 3");
    expect(sql).toContain("ABSENCE_REASON_DETAIL_REQUIRED");
  });
  it("pins exact trigger column and unconditional semantics", () => {
    expect(sql).toContain("tgtype=23");
    expect(sql).toContain("tgqual IS NULL");
    expect(sql).toContain("tgattr::smallint[]");
    expect(sql).toContain("cardinality(tgattr::smallint[])=4");
  });
  it("does not activate, grant client execution, or add financial data", () => {
    expect(sql).not.toMatch(/student_visible|is_active\s*=|GRANT EXECUTE|fee_type|amount|currency|invoice|gateway|balance/i);
  });
  it("closes legacy direct mutation grants and policies before dispatcher installation", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.absence_excuse_details FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT SELECT ON TABLE public.absence_excuse_details TO authenticated,service_role");
    for (const policy of ["aed_select", "aed_insert", "aed_update", "aed_delete"]) expect(sql).toContain(`DROP POLICY IF EXISTS ${policy}`);
    expect(sql).toContain("DROP POLICY IF EXISTS absence_excuse_details_owner_select");
    expect(sql).toContain("ABSENCE_EXCUSE_POLICY_INVENTORY_MISMATCH");
    expect(sql).toContain("ABSENCE_EXCUSE_ACL_INVENTORY_MISMATCH");
    expect(sql).toContain("NO FORCE ROW LEVEL SECURITY");
  });
});
