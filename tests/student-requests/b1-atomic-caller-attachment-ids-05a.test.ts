import { describe,expect,it } from "bun:test";
import { extractB1SecureAttachmentIds } from "../../src/lib/student-requests/student-request-submit-contract";

const absence={attachmentId:"00000000-0000-4000-8000-000000000001",fieldKey:"excuse_documents",status:"attached"};
const transfer={attachmentId:"00000000-0000-4000-8000-000000000002",fieldKey:"secondary_certificate",status:"attached"};

describe("B1 atomic caller secure attachment ids",()=>{
  it("extracts ids from the exact canonical form fields",()=>{
    expect(extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[absence]})).toEqual([absence.attachmentId]);
    expect(extractB1SecureAttachmentIds("transfer",{secondary_certificate_file:transfer})).toEqual([transfer.attachmentId]);
  });
  it("returns no ids for services without secure attachments",()=>{
    expect(extractB1SecureAttachmentIds("final_chance",{})).toEqual([]);
    expect(extractB1SecureAttachmentIds("enrollment_suspension",{})).toEqual([]);
    expect(extractB1SecureAttachmentIds("file_withdrawal",{})).toEqual([]);
  });
  it("rejects wrong field identity, state, malformed ids, duplicates and missing refs",()=>{
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:{...absence,fieldKey:"secondary_certificate"}})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("department_transfer",{secondary_certificate_file:{...transfer,status:"pending"}})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("department_transfer",{secondary_certificate_file:{...transfer,attachmentId:"bad"}})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[absence,absence]})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:[absence,{...absence,attachmentId:absence.attachmentId.toUpperCase()}]})).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
  });
  it("never accepts a path or filename in place of authoritative attachment identity",()=>{
    expect(()=>extractB1SecureAttachmentIds("excused_absence",{excuse_documents:{fileName:"x.pdf",storagePath:"public/x"}})).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
  });
});
