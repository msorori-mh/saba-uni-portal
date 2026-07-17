import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sql=readFileSync(join(process.cwd(),"docs","migration-drafts","REQUEST-B1-SERVICE-DETAILS-05A.sql"),"utf8");

describe("B1 five-service detail dispatcher 05A",()=>{
  it("dispatches exactly the five canonical services and aliases only from the locked request",()=>{
    for(const code of ["enrollment_suspension","excused_absence","department_transfer","final_chance","file_withdrawal"])
      expect(sql).toContain(`'${code}'`);
    expect(sql).toContain("WHEN 'absence_excuse' THEN 'excused_absence'");
    expect(sql).toContain("WHEN 'transfer' THEN 'department_transfer'");
    expect(sql).toContain("WHEN 'extra_chance' THEN 'final_chance'");
  });
  it("requires owner, writable state, exact type, object payload and field allowlists",()=>{
    for(const marker of ["B1_ACTIVE_REQUEST_OWNER_REQUIRED","B1_REQUEST_NOT_WRITABLE","B1_REQUEST_TYPE_MISMATCH","B1_FORM_OBJECT_REQUIRED","B1_UNEXPECTED_FORM_FIELD"])
      expect(sql).toContain(marker);
    expect(sql).toContain("FOR UPDATE");
  });
  it("uses trusted validators, server profile derivation and secure attachments",()=>{
    expect(sql).toContain("assert_b1_academic_period_reference");
    expect(sql).toContain("assert_b1_active_course_enrollment");
    expect(sql).toContain("assert_b1_target_program_department");
    expect(sql.match(/assert_required_student_request_attachments/g)).toHaveLength(2);
    expect(sql).toContain("v_profile.program_id");
    expect(sql).toContain("v_profile.department_id");
    expect(sql).toContain("secondary_certificate_file");
  });
  it("writes final_chance only and contains no internal financial fields",()=>{
    expect(sql).toContain("chance_type='final_chance'");
    expect(sql).not.toMatch(/fee_type|amount|currency|invoice|gateway|payment_reference|internal_balance/i);
  });
  it("installs the dispatcher without prematurely cutting over legacy callers",()=>{
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details");
    expect(sql).not.toMatch(/SELECT\s+public\.apply_b1_detail_rpc_write_boundaries\s*\(/i);
    expect(sql).toMatch(/^COMMIT;/m);
  });
  it("fails closed instead of mixing resubmission with prior effects or clearances",()=>{
    expect(sql).toContain("B1_ABSENCE_EFFECT_ALREADY_APPLIED");
    expect(sql).toContain("record_applied_at IS NOT NULL");
    expect(sql).toContain("B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED");
    expect(sql).toContain("chance_applied_at IS NOT NULL");
    expect(sql).toContain("B1_WITHDRAWAL_CLEARANCE_ALREADY_APPLIED");
    expect(sql).toContain("records_transferred_at");
  });
  it("does not activate services, change visibility or mutate historical aliases",()=>{
    expect(sql).not.toMatch(/UPDATE\s+public\.request_types|student_visible|DELETE\s+FROM|TRUNCATE|BACKFILL/i);
  });
});
