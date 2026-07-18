import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sql=readFileSync(join(process.cwd(),"docs","migration-drafts","B1-FREE-SERVICE-WORKFLOWS-08.sql"),"utf8");

describe("B1 free-service workflows 08 draft",()=>{
  it("covers exactly the three free services with approved step counts",()=>{
    for(const service of ["enrollment_suspension","excused_absence","file_withdrawal"]) expect(sql).toContain(`('${service}'::text`);
    expect(sql).not.toMatch(/department_transfer|final_chance|extra_chance/);
    expect(sql.match(/jsonb_build_object\('key'/g)).toHaveLength(13);
    const suspension=sql.slice(sql.indexOf("('enrollment_suspension'::text"),sql.indexOf("('excused_absence'::text"));
    const absence=sql.slice(sql.indexOf("('excused_absence'::text"),sql.indexOf("('file_withdrawal'::text"));
    const withdrawal=sql.slice(sql.indexOf("('file_withdrawal'::text"),sql.indexOf(") AS services"));
    expect(suspension.match(/jsonb_build_object\('key'/g)).toHaveLength(3);
    expect(absence.match(/jsonb_build_object\('key'/g)).toHaveLength(3);
    expect(withdrawal.match(/jsonb_build_object\('key'/g)).toHaveLength(7);
  });
  it("pins the strict authorization tuples and sequential withdrawal chain",()=>{
    for(const tuple of ["'initial_review'","'manager_approval'","'record_apply'","'library_clearance'","'labs_clearance'","'activities_clearance'","'finance_clearance'","'registrar_apply'","'archive'"])
      expect(sql).toContain(tuple);
    expect(sql).toContain("'specific_user'");
    expect(sql).toContain("'exactly_one_direct_assignee'");
  });
  it("creates inactive reusable drafts and validates their complete structure",()=>{
    expect(sql).toContain("'draft',false");
    expect(sql).toContain("FREE_WORKFLOW_STEP_STRUCTURE_MISMATCH");
    expect(sql).toContain("FREE_WORKFLOW_TRANSITION_STRUCTURE_MISMATCH");
    expect(sql).toContain("FREE_WORKFLOW_INVENTORY_MISMATCH");
    expect(sql).toContain("v_count=1 AND v_matching_count<>1");
    expect(sql).toContain("status='draft' AND is_active=false AND description_ar=v_marker");
    expect(sql).toContain("v_count<>jsonb_array_length(v_service.steps)");
    expect(sql).toContain("v_count<>jsonb_array_length(v_service.transitions)");
  });
  it("contains no payment, finance transaction, document, activation, or production command",()=>{
    expect(sql).toContain("'FREE_NO_PAYMENT'");
    expect(sql).toContain("requires_payment IS DISTINCT FROM false");
    expect(sql).toContain("produces_document IS DISTINCT FROM false");
    expect(sql).not.toMatch(/confirm_payment|payment_confirmation|awaiting_payment|payment_confirmed|fee_type|amount|currency|invoice|gateway|internal_balance/i);
    expect(sql).not.toMatch(/student_visible|UPDATE\s+public\.request_type_workflows|supabase|deploy|publish/i);
  });
  it("does not mutate requests, details, protected records, or historical notifications",()=>{
    expect(sql).not.toMatch(/student_requests|_details\b|notifications/i);
    for(const id of ["93807768-a281-42de-bfb4-0c0c03786b20","SR-20260713-2DE64041","SR-20260715-FEDCB3E1","USR-2026-000001"])
      expect(sql).not.toContain(id);
  });
});
