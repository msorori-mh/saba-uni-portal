import { describe,expect,it } from "bun:test";
import { extractB1SecureAttachmentIds } from "../../src/lib/student-requests/student-request-submit-contract";

const ABSENCE_ID = "00000000-0000-4000-8000-000000000001";
const TRANSFER_ID = "00000000-0000-4000-8000-000000000002";

describe("B1 atomic caller secure attachment ids (canonical UUID arrays)",()=>{
  it("extracts ids from the exact canonical form fields",()=>{
    expect(extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[ABSENCE_ID]})).toEqual([ABSENCE_ID]);
    expect(extractB1SecureAttachmentIds("transfer",{secondary_certificate_file:[TRANSFER_ID]})).toEqual([TRANSFER_ID]);
  });
  it("returns no ids for services without secure attachments",()=>{
    expect(extractB1SecureAttachmentIds("final_chance",{})).toEqual([]);
    expect(extractB1SecureAttachmentIds("enrollment_suspension",{})).toEqual([]);
    expect(extractB1SecureAttachmentIds("file_withdrawal",{})).toEqual([]);
  });
  it("rejects the legacy object shape, malformed ids, duplicates and missing refs",()=>{
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[{attachmentId:ABSENCE_ID,fieldKey:"excuse_documents",status:"attached"}]})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("department_transfer",{secondary_certificate_file:TRANSFER_ID})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("department_transfer",{secondary_certificate_file:["bad"]})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[ABSENCE_ID,ABSENCE_ID]})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[ABSENCE_ID,ABSENCE_ID.toUpperCase()]})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
  });
  it("never accepts a path or filename in place of authoritative attachment identity",()=>{
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:{fileName:"x.pdf",storagePath:"public/x"}})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
  });
});
