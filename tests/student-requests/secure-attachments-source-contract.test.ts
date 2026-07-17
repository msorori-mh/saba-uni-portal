import { describe, expect, it } from "bun:test";
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

describe("secure attachments source-contract — upload", () => {
  it("allows only owner draft excused_absence intent", () => expect(canCreateSecureAttachmentIntent({ owner: true, requestStatus: "draft", requestType: "excused_absence", fieldKey: "excuse_documents", currentCount: 0 })).toBeNull());
  it.each([[false,"draft"],[true,"submitted"],[true,"completed"],[true,"returned"]] as const)("denies other owner/state combinations", (owner,status) => expect(canCreateSecureAttachmentIntent({ owner, requestStatus: status, requestType: "excused_absence", fieldKey: "excuse_documents", currentCount: 0 })).not.toBeNull());
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
  it("allows owner or exact direct active assignee only", () => { expect(canDownloadSecureAttachment({authenticated:true,owner:true,directAssignee:false,activeStep:false,unitMatches:false})).toBe(true); expect(canDownloadSecureAttachment({authenticated:true,owner:false,directAssignee:true,activeStep:true,unitMatches:true})).toBe(true); for (const input of [{authenticated:true,owner:false,directAssignee:false,activeStep:true,unitMatches:true},{authenticated:true,owner:false,directAssignee:true,activeStep:true,unitMatches:false},{authenticated:false,owner:true,directAssignee:false,activeStep:false,unitMatches:false}]) expect(canDownloadSecureAttachment(input)).toBe(false); });
  it("permits only pending→uploaded/rejected and uploaded→attached/rejected", () => { expect(canTransitionSecureAttachment("pending","uploaded")).toBe(true); expect(canTransitionSecureAttachment("uploaded","attached")).toBe(true); expect(canTransitionSecureAttachment("pending","rejected")).toBe(true); expect(canTransitionSecureAttachment("uploaded","rejected")).toBe(true); expect(canTransitionSecureAttachment("rejected","attached")).toBe(false); expect(canTransitionSecureAttachment("attached","pending")).toBe(false); });
});
