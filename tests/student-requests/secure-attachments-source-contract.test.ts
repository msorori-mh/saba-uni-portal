import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  SECURE_ATTACHMENT_MAX_BYTES,
  buildSecureAttachmentObjectPath,
  canCreateSecureAttachmentIntent,
  canDownloadSecureAttachment,
  canTransitionSecureAttachment,
  isSecureAttachmentReference,
  validateSecureAttachmentMetadata,
  validateSecureAttachmentCompletion,
  validateSecureAttachmentSubmit,
} from "../../src/lib/student-requests/secure-attachments-contract";

const ids = { studentProfileId: "11111111-1111-4111-8111-111111111111", studentRequestId: "22222222-2222-4222-8222-222222222222", attachmentId: "33333333-3333-4333-8333-333333333333" };
const ref = { ...ids, fieldKey: "excuse_documents" as const, status: "attached" as const, mimeType: "application/pdf" as const, sizeBytes: 100, originalFileName: "excuse.pdf" };
const draftSql = readFileSync(new URL("../../docs/migration-drafts/STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql", import.meta.url), "utf8");
const submitContractSource = readFileSync(new URL("../../src/lib/student-requests/student-request-submit-contract.ts", import.meta.url), "utf8");

describe("secure attachments source-contract — upload", () => {
  it("allows only owner draft excused_absence intent", () => expect(canCreateSecureAttachmentIntent({ owner: true, requestStatus: "draft", requestType: "excused_absence", fieldKey: "excuse_documents", currentCount: 0 })).toBeNull());
  it.each([[false,"draft"],[true,"submitted"],[true,"completed"]] as const)("denies other owner/state combinations", (owner,status) => expect(canCreateSecureAttachmentIntent({ owner, requestStatus: status, requestType: "excused_absence", fieldKey: "excuse_documents", currentCount: 0 })).not.toBeNull());
  it.each(["returned","returned_for_completion"] as const)("allows owned resubmit attachment replacement", (status) => expect(canCreateSecureAttachmentIntent({ owner:true, requestStatus:status, requestType:"excused_absence", fieldKey:"excuse_documents", currentCount:0 })).toBeNull());
  it("denies client path/bucket and fourth attachment", () => {
    expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType:"excused_absence",fieldKey:"excuse_documents",currentCount:0,clientSuppliedPath:"x" })).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType:"excused_absence",fieldKey:"excuse_documents",currentCount:0,clientSuppliedBucket:"x" })).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType:"excused_absence",fieldKey:"excuse_documents",currentCount:3 })).toBe("ATTACHMENT_COUNT_EXCEEDED");
  });
  it("validates MIME, size, filename and server path", () => {
    expect(validateSecureAttachmentMetadata({fileName:"a.pdf",mimeType:"application/pdf",sizeBytes:1,fieldKey:"excuse_documents"})).toBeNull();
    expect(validateSecureAttachmentMetadata({fileName:"a.exe",mimeType:"application/octet-stream",sizeBytes:1,fieldKey:"excuse_documents"})).toBe("ATTACHMENT_MIME_NOT_ALLOWED");
    expect(validateSecureAttachmentMetadata({fileName:"a.pdf",mimeType:"application/pdf",sizeBytes:SECURE_ATTACHMENT_MAX_BYTES+1,fieldKey:"excuse_documents"})).toBe("ATTACHMENT_SIZE_EXCEEDED");
    expect(buildSecureAttachmentObjectPath({...ids,mimeType:"application/pdf"})).toBe(`student-requests/${ids.studentProfileId}/${ids.studentRequestId}/${ids.attachmentId}/content.pdf`);
  });
});

describe("secure attachments HIGH remediation source guards", () => {
  it("uses fail-closed direct-assignment precedence", () => {
    const direct = draftSql.indexOf("WHEN s.assigned_user_id IS NOT NULL");
    const staff = draftSql.indexOf("WHEN s.assigned_staff_profile_id IS NOT NULL");
    const faculty = draftSql.indexOf("WHEN s.assigned_faculty_profile_id IS NOT NULL");
    const position = draftSql.indexOf("WHEN s.assigned_position_assignment_id IS NOT NULL");
    expect(direct).toBeGreaterThan(-1);
    expect(direct).toBeLessThan(staff);
    expect(staff).toBeLessThan(faculty);
    expect(faculty).toBeLessThan(position);
  });

  it("has no authenticated Storage SELECT policy", () => {
    expect(draftSql).not.toContain("FOR SELECT TO authenticated");
    expect(draftSql).not.toContain("secure_attachment_owner_select");
    expect(draftSql).not.toContain("secure_attachment_direct_assignee_select");
  });

  it("binds exact IDs before the real submit RPC in one wrapper", () => {
    const wrapper = draftSql.indexOf("CREATE FUNCTION public.submit_student_request_with_secure_attachments");
    const assertion = draftSql.indexOf("PERFORM public.assert_required_student_request_attachments", wrapper);
    const submit = draftSql.indexOf("PERFORM public.submit_student_request(p_request_id)", wrapper);
    expect(wrapper).toBeGreaterThan(-1);
    expect(assertion).toBeGreaterThan(wrapper);
    expect(submit).toBeGreaterThan(assertion);
    expect(draftSql).toContain("a.id=ANY(p_attachment_ids)");
    expect(draftSql).toContain("sp.user_id=v_uid");
    expect(draftSql).toContain("WHERE r.id=p_student_request_id AND r.student_profile_id=v_profile_id");
    expect(draftSql).toContain("AND a.student_profile_id=v_profile_id FOR UPDATE");
  });

  it("keeps authenticated submit EXECUTE temporarily and defers revoke to an independent cutover", () => {
    // R-2 owner decision: do NOT revoke authenticated EXECUTE on
    // submit_student_request(uuid) in this draft; cutover is separate.
    expect(draftSql).toContain("DEFERRED CUTOVER");
    expect(draftSql).toMatch(/authenticated EXECUTE remains exactly as today/i);
    expect(draftSql).not.toContain(
      "REVOKE ALL ON FUNCTION public.submit_student_request(uuid) FROM PUBLIC,anon,authenticated",
    );
    // Attachment ACL / wrapper boundary remain fail-closed.
    expect(draftSql).toContain("REVOKE ALL ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[]) FROM PUBLIC,anon");
    expect(draftSql).toContain("GRANT EXECUTE ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[]) TO authenticated");
    expect(draftSql).toContain("AND sp.user_id=auth.uid()");
    expect(draftSql).toContain("IF v_request.request_type IN ('excused_absence','absence_excuse') THEN");
    expect(draftSql).toContain("ELSIF coalesce(cardinality(p_attachment_ids),0)<>0 THEN");
  });

  it("does not trust client identity during generic form validation", () => {
    expect(submitContractSource).not.toContain("String(normalized.formData._studentProfileId");
    expect(submitContractSource).not.toContain("requestId: normalized.existingRequestId ??");
    expect(submitContractSource).toContain('normalized.requestTypeCode !== "excused_absence"');
  });
});

describe("secure attachments source-contract — completion and submit", () => {
  it("allows completion only for the matching pending owned object", () => {
    const base = { owner:true,status:"pending" as const,expectedBucket:"b",expectedPath:"p",expectedMime:"application/pdf",expectedSize:100 };
    expect(validateSecureAttachmentCompletion({...base,object:{bucket:"b",path:"p",mime:"application/pdf",size:100}})).toBeNull();
    expect(validateSecureAttachmentCompletion({...base,object:null})).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(validateSecureAttachmentCompletion({...base,object:{bucket:"b",path:"wrong",mime:"application/pdf",size:100}})).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(validateSecureAttachmentCompletion({...base,object:{bucket:"b",path:"p",mime:"image/png",size:100}})).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(validateSecureAttachmentCompletion({...base,object:{bucket:"b",path:"p",mime:"application/pdf",size:99}})).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(validateSecureAttachmentCompletion({...base,owner:false,object:{bucket:"b",path:"p",mime:"application/pdf",size:100}})).toBe("ATTACHMENT_REQUEST_NOT_OWNED");
    expect(validateSecureAttachmentCompletion({...base,status:"uploaded",object:{bucket:"b",path:"p",mime:"application/pdf",size:100}})).toBe("ATTACHMENT_UPLOAD_NOT_COMPLETED");
  });
  it("accepts only opaque attached references", () => { expect(isSecureAttachmentReference(ref)).toBe(true); expect(isSecureAttachmentReference({...ref,status:"pending"})).toBe(false); expect(isSecureAttachmentReference({...ref,storagePath:"raw"})).toBe(false); expect(isSecureAttachmentReference({fileName:"placeholder"})).toBe(false); });
  it("denies zero, four, wrong owner/request, pending and runtime unavailable", () => {
    expect(validateSecureAttachmentSubmit({runtimeAvailable:true,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[]})).toBe("ATTACHMENT_UPLOAD_NOT_COMPLETED");
    expect(validateSecureAttachmentSubmit({runtimeAvailable:true,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[ref,ref,ref,ref]})).toBe("ATTACHMENT_COUNT_EXCEEDED");
    expect(validateSecureAttachmentSubmit({runtimeAvailable:true,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[{...ref,studentProfileId:ids.attachmentId}]})).toBe("ATTACHMENT_OBJECT_MISMATCH");
    expect(validateSecureAttachmentSubmit({runtimeAvailable:false,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[ref]})).toBe("SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE");
  });
  it("allows one or three attached references", () => { expect(validateSecureAttachmentSubmit({runtimeAvailable:true,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[ref]})).toBeNull(); expect(validateSecureAttachmentSubmit({runtimeAvailable:true,requestId:ids.studentRequestId,studentProfileId:ids.studentProfileId,references:[ref,ref,ref]})).toBeNull(); });
});

describe("secure attachments source-contract — download and state machine", () => {
  it("allows only the exact direct active assignee", () => { expect(canDownloadSecureAttachment({authenticated:true,owner:false,directAssignee:true,activeStep:true,unitMatches:true})).toBe(true); for (const input of [{authenticated:true,owner:true,directAssignee:false,activeStep:false,unitMatches:false},{authenticated:true,owner:false,directAssignee:false,activeStep:true,unitMatches:true},{authenticated:true,owner:false,directAssignee:true,activeStep:true,unitMatches:false},{authenticated:false,owner:false,directAssignee:true,activeStep:true,unitMatches:true}]) expect(canDownloadSecureAttachment(input)).toBe(false); });
  it("permits only pending→uploaded/rejected and uploaded→attached/rejected", () => { expect(canTransitionSecureAttachment("pending","uploaded")).toBe(true); expect(canTransitionSecureAttachment("uploaded","attached")).toBe(true); expect(canTransitionSecureAttachment("pending","rejected")).toBe(true); expect(canTransitionSecureAttachment("uploaded","rejected")).toBe(true); expect(canTransitionSecureAttachment("rejected","attached")).toBe(false); expect(canTransitionSecureAttachment("attached","pending")).toBe(false); });
});
