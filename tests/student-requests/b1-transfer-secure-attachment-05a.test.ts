import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sql=readFileSync(join(process.cwd(),"docs","migration-drafts","REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql"),"utf8");

describe("B1 transfer secure attachment 05A draft",()=>{
  it("maps only approved stored/canonical service aliases to exact fields",()=>{
    expect(sql).toContain("WHEN 'absence_excuse' THEN 'excuse_documents'");
    expect(sql).toContain("WHEN 'transfer' THEN 'secondary_certificate'");
    expect(sql).toContain("ELSE NULL");
    expect(sql).toContain("p_field_key IS DISTINCT FROM v_expected_field");
  });
  it("locks and verifies the exact opaque attachment set",()=>{
    expect(sql).toContain("a.id=ANY(p_attachment_ids)");
    expect(sql).toContain("a.student_profile_id=v_profile_id FOR UPDATE");
    expect(sql).toContain("a.field_key=v_expected_field");
    expect(sql).toContain("v_expected<>(SELECT count(DISTINCT x)");
  });
  it("keeps object identity server-generated and the legacy wrapper revoked",()=>{
    expect(sql).toContain("v_path:=format('student-requests/%s/%s/%s/content.%s'");
    expect(sql).toContain("RETURN jsonb_build_object('attachment_id',v_id)");
    expect(sql).not.toMatch(/publicUrl|storage_object_path',v_path/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[])");
  });
  it("does not activate, expose storage SELECT, or add financial data",()=>{
    expect(sql).not.toMatch(/student_visible|is_active\s*=|FOR SELECT TO authenticated|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
