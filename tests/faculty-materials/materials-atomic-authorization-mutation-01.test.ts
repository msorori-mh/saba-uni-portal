import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const sql = readFileSync(
  join(root, "docs/migration-drafts/20260718000000_materials_atomic_authorization_mutation.sql"),
  "utf8",
);
const runtime = readFileSync(join(root, "src/lib/faculty-materials.functions.ts"), "utf8");
const report = readFileSync(
  join(root, "docs/MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01-REPORT.md"),
  "utf8",
);

describe("materials atomic mutation remediation", () => {
  it("keeps runtime independent until the migration-first release gate", () => {
    expect(runtime).not.toContain("faculty_mutate_course_material_atomic");
    expect(runtime).not.toContain("mutateCourseMaterialAtomically");
    expect(report).toContain("does not wire runtime code to an unapplied RPC");
    expect(report).toContain("separate caller release");
    expect(sql).not.toContain("randomUUID");
    expect(sql).toContain(
      "create or replace procedure public.apply_materials_rpc_only_dml_cutover",
    );
    expect(sql).not.toContain("call public.apply_materials_rpc_only_dml_cutover");
  });

  it("requires a caller-stable key and binds lost-response retries to a canonical fingerprint", () => {
    expect(sql).toContain("p_idempotency_key uuid");
    expect(sql).toContain("v_fingerprint := encode(digest(");
    expect(sql).toContain("coalesce(p_expected_updated_at::text,'')");
    expect(sql).toContain("coalesce(p_patch,'{}'::jsonb)::text");
    expect(sql).toContain("v_prior_fingerprint is distinct from v_fingerprint");
    expect(sql).toContain("IDEMPOTENCY_KEY_REUSE");
    expect(report).toContain("retain one stable `mutationId` across lost-response retries");
  });

  it("uses deterministic locks and serializes canonical-term changes", () => {
    const ordered = [
      "select fp.id into strict v_fp_id from public.faculty_profiles fp",
      "lock table public.academic_years in share mode",
      "lock table public.semesters in share mode",
      "select cs.course_offering_id into strict v_offering_id",
      "perform 1 from public.course_offerings co",
      "select m.* into strict v_material from public.course_materials m",
    ].map((token) => sql.indexOf(token));
    expect(ordered.every((index) => index >= 0)).toBeTrue();
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    expect(sql).toContain("for update");
    expect(sql).toContain("STALE_MATERIAL_VERSION");
    expect(sql).toContain("CURRENT_ACTIVE_SECTION_REQUIRED");
  });

  it("fails closed on bypass inventory and coordinates upload/download before DML cutover", () => {
    expect(sql).toContain("UNEXPECTED_MATERIAL_POLICY_INVENTORY");
    expect(sql).toContain("UNEXPECTED_MATERIAL_GRANT_INVENTORY");
    expect(sql).toContain("UPLOAD_AND_DOWNLOAD_ATOMIC_PATHS_REQUIRED_BEFORE_DML_CUTOVER");
    expect(sql).toContain("faculty_reserve_course_material_upload");
    expect(sql).toContain("faculty_finalize_course_material_upload");
    expect(sql).toContain("record_course_material_download");
    expect(sql).toContain(
      "revoke insert,update,delete on public.course_materials,public.course_material_files from authenticated,service_role",
    );
    expect(sql).not.toContain("has_any_role");
  });

  it("binds exact owner and immutable target with no generic privileged execution", () => {
    expect(sql).toContain("fp.user_id = v_uid and fp.status = 'active'");
    expect(sql).toContain("cs.faculty_profile_id = v_fp_id");
    expect(sql).toContain("m.faculty_profile_id = v_fp_id");
    expect(sql).toContain("IMMUTABLE_TARGET_VIOLATION");
    expect(sql).toContain("from public, anon, service_role");
    expect(sql).toContain("to authenticated");
  });
});
