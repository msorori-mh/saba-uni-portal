import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const draftPath = join(root, "docs", "migration-drafts", "REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260725110300_b1_10_excused_absence_detail_05a.sql",
);
const preflightPath = join(
  root,
  "docs",
  "migration-drafts",
  "b1-backend-verifiers",
  "10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-PREFLIGHT.sql",
);
const postPath = join(
  root,
  "docs",
  "migration-drafts",
  "b1-backend-verifiers",
  "10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-POST-VERIFIER.sql",
);
const sql = readFileSync(draftPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const preflight = readFileSync(preflightPath, "utf8");
const post = readFileSync(postPath, "utf8");
const shaLf = (path: string) =>
  createHash("sha256")
    .update(readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
    .digest("hex");

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
    for (const policy of ["aed_select", "aed_insert", "aed_update", "aed_delete", "absence_excuse_details_owner_select"]) {
      expect(sql).toContain(`'${policy}'`);
    }
    expect(sql).toContain("format('%s POLICY IF EXISTS %I ON public.%I', 'DROP', v_policy, v_table)");
    expect(sql).toContain("FROM pg_policies");
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).toContain("ABSENCE_EXCUSE_POLICY_INVENTORY_MISMATCH");
    expect(sql).toContain("ABSENCE_EXCUSE_ACL_INVENTORY_MISMATCH");
    expect(sql).toContain("NO FORCE ROW LEVEL SECURITY");
  });
  it("fail-safe revokes sandbox_exec when present and never allowlists it", () => {
    for (const body of [sql, migration]) {
      expect(body).toContain("REVOKE ALL ON TABLE public.absence_excuse_details FROM sandbox_exec");
      expect(body).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')");
      expect(body).toMatch(/rolname IN \('authenticated','service_role'\)/);
      expect(body).not.toMatch(/rolname IN \('[^']*'sandbox_exec[^']*'\)/);
      expect(body).not.toMatch(/GRANT\s+.*\bTO\s+sandbox_exec\b/i);
    }
    expect(preflight).toContain("remediable_pre_state");
    expect(preflight).toContain("no unexpected ACL grantee outside remediable pre-state set");
    expect(preflight).toContain("'sandbox_exec'");
    expect(preflight).toContain("'PUBLIC'");
    expect(preflight).toContain("'anon'");
    expect(post).toContain("sandbox_exec absent or has zero table privileges");
    expect(post).toContain("ACL inventory matches owner + authenticated/service_role SELECT only");
  });
  it("pins PROMOTION-MAP LF SHAs for SEQ10 draft and migration", () => {
    const map = JSON.parse(
      readFileSync(
        join(root, "docs", "migration-drafts", "b1-backend-verifiers", "PROMOTION-MAP.json"),
        "utf8",
      ),
    ) as Array<{ order: number; draft_sha_lf: string; migration_sha_lf: string }>;
    const entry = map.find((row) => row.order === 10);
    expect(entry).toBeTruthy();
    expect(entry!.draft_sha_lf).toBe(shaLf(draftPath));
    expect(entry!.migration_sha_lf).toBe(shaLf(migrationPath));
    expect(entry!.migration_sha_lf).toBe(
      "ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505",
    );
    expect(entry!.draft_sha_lf).toBe(
      "a94233525724f96959568672744b7466a88b22d338298eaf13a6b75319f97df4",
    );
  });
});
