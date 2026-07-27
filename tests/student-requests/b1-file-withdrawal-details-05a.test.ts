import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql"), "utf8");

describe("B1 file withdrawal details 05A draft", () => {
  it("is source-only, transaction bounded, and does not activate the service", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(sql).not.toMatch(/student_visible|UPDATE\s+public\.request_types|is_active\s*=/i);
  });

  it("creates the exact RPC-only detail contract", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.file_withdrawal_details");
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).toContain("file_withdrawal_details_reason_check");
    expect(sql).toContain("file_withdrawal_details_impact_check");
    expect(sql).toContain("FILE_WITHDRAWAL_DETAILS_SCHEMA_MISMATCH");
    expect(sql).toContain("FILE_WITHDRAWAL_REQUEST_FK_MISMATCH");
    expect(sql).toContain("FILE_WITHDRAWAL_PRIMARY_KEY_MISMATCH");
    expect(sql).toContain("FILE_WITHDRAWAL_CHECK_CONSTRAINT_MISMATCH");
    expect(sql).toContain("FILE_WITHDRAWAL_DEFAULT_MISMATCH");
    expect(sql).toContain("FILE_WITHDRAWAL_DEFAULT_INVENTORY_MISMATCH");
  });

  it("denies authenticated writes and permits owner read only", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.file_withdrawal_details FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON TABLE public.file_withdrawal_details FROM service_role");
    expect(sql).toContain("GRANT SELECT ON TABLE public.file_withdrawal_details TO authenticated");
    expect(sql).toContain("USING (public.is_owner_of_request(auth.uid(), request_id))");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL).*authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL).*service_role/i);
    expect(sql).toContain("FILE_WITHDRAWAL_POLICY_INVENTORY_MISMATCH");
    expect(sql).toContain("permissive='PERMISSIVE'");
    expect(sql).toContain("with_check IS NULL");
    expect(sql).toContain("aclexplode");
    expect(sql).toContain("FILE_WITHDRAWAL_ACL_INVENTORY_MISMATCH");
    expect(sql).toContain("NO FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("NOT c.relforcerowsecurity");
  });

  it("fail-safe revokes sandbox_exec when present and never allowlists it", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260725110400_b1_11_file_withdrawal_details_05a.sql"),
      "utf8",
    );
    for (const body of [sql, migration]) {
      expect(body).toContain("REVOKE ALL ON TABLE public.file_withdrawal_details FROM sandbox_exec");
      expect(body).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')");
      expect(body).toMatch(/rolname IN \('authenticated','service_role'\)/);
      expect(body).not.toMatch(/GRANT\s+.*\bTO\s+sandbox_exec\b/i);
    }
  });

  it("contains no financial ledger or destructive data operation", () => {
    expect(sql).not.toMatch(/fee_type|amount|currency|invoice|gateway|balance/i);
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
  });
});
