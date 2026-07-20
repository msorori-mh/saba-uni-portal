import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  new URL(
    "../../docs/migration-drafts/DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql",
    import.meta.url,
  ),
  "utf8",
);
describe("academic clearance SQL draft", () => {
  it("is source-only and models snapshots, decisions, approvals and append-only audit", () => {
    expect(sql).toContain("SOURCE-ONLY DRAFT");
    for (const table of [
      "academic_clearance_cases",
      "academic_clearance_source_courses",
      "academic_clearance_target_courses",
      "academic_clearance_equivalencies",
      "academic_clearance_approvals",
      "academic_clearance_audit_log",
    ])
      expect(sql).toContain(`create table public.${table}`);
    for (const decision of [
      "equivalent",
      "partially_equivalent",
      "general_requirement",
      "not_equivalent",
      "needs_review",
      "committee_decision_required",
    ])
      expect(sql).toContain(decision);
  });
  it("binds target chair and academic affairs explicitly without broad bypass", () => {
    expect(sql).toContain("r.code='department_head'");
    expect(sql).toContain("a.department_id=c.target_department_id");
    expect(sql).toContain("request_processing_units");
    expect(sql).toContain("request_processing_roles");
    expect(sql).toContain("academic_clearance_authority_config");
    expect(sql).toContain("cfg.is_approved");
    expect(sql).toContain("No broad admin/registrar/dean bypass");
  });
  it("blocks transfer, unresolved approval and direct client writes", () => {
    expect(sql).toContain("ACADEMIC_CLEARANCE_REQUIRED");
    expect(sql).toContain("ACADEMIC_CLEARANCE_UNRESOLVED");
    expect(sql).toContain("Mutations are RPC-only");
    expect(sql).toContain("for update");
    expect(sql).toContain("perform public.assert_department_transfer_clearance_approved(new.id)");
    expect(sql).toContain("ACADEMIC_CLEARANCE_CREDIT_EXCEEDS_BOUND");
    expect(sql).toContain("ACADEMIC_CLEARANCE_COMPARISON_INCOMPLETE");
    expect(sql).toContain("correct_academic_clearance");
  });
  it("provides minutes and operational/outcome reports", () => {
    for (const view of [
      "academic_clearance_minutes",
      "academic_clearance_reporting",
      "academic_clearance_course_outcomes",
    ])
      expect(sql).toContain(`create view public.${view}`);
  });
  it("uses same-case keys, immutable correction and canonical direct assignments", () => {
    expect(sql).toContain("foreign key(case_id,source_course_id)");
    expect(sql).toContain("foreign key(case_id,target_course_id)");
    expect(sql).toContain("a.user_id=auth.uid()");
    expect(sql).toContain("r.is_active");
    expect(sql).toContain("u.is_active");
    expect(sql).toContain("APPROVED_CLEARANCE_EVIDENCE_IMMUTABLE");
    expect(sql).toContain("supersedes_case_id");
    expect(sql).not.toContain("join processing_units");
    expect(sql).not.toContain("join processing_roles");
  });
});
