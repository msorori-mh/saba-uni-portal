import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
const sql=readFileSync(new URL("../../docs/migration-drafts/DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql",import.meta.url),"utf8");
describe("academic clearance SQL draft",()=>{
  it("is source-only and models snapshots, decisions, approvals and append-only audit",()=>{
    expect(sql).toContain("SOURCE-ONLY DRAFT");
    for(const table of ["academic_clearance_cases","academic_clearance_source_courses","academic_clearance_target_courses","academic_clearance_equivalencies","academic_clearance_approvals","academic_clearance_audit_log"]) expect(sql).toContain(`create table public.${table}`);
    for(const decision of ["equivalent","partially_equivalent","general_requirement","not_equivalent","needs_review","committee_decision_required"]) expect(sql).toContain(decision);
  });
  it("binds target chair and academic affairs explicitly without broad bypass",()=>{
    expect(sql).toContain("r.code='department_head'"); expect(sql).toContain("a.department_id=c.target_department_id");
    expect(sql).toContain("u.code='academic_affairs'"); expect(sql).toContain("r.code='academic_affairs_reviewer'");
    expect(sql).toContain("No broad admin/registrar/dean bypass");
  });
  it("blocks transfer, unresolved approval and direct client writes",()=>{
    expect(sql).toContain("ACADEMIC_CLEARANCE_REQUIRED"); expect(sql).toContain("ACADEMIC_CLEARANCE_UNRESOLVED");
    expect(sql).toContain("Mutations are RPC-only"); expect(sql).toContain("for update");
  });
  it("provides minutes and operational/outcome reports",()=>{ for(const view of ["academic_clearance_minutes","academic_clearance_reporting","academic_clearance_course_outcomes"]) expect(sql).toContain(`create view public.${view}`); });
});
