import { describe, expect, it } from "bun:test";
import {
  canCreateSecureAttachmentIntent,
  isSecureAttachmentReference,
  validateSecureAttachmentMetadata,
} from "../../src/lib/student-requests/secure-attachments-contract";

describe("B1 transfer secure attachment contract 05A", () => {
  it("binds secondary_certificate to transfer aliases only", () => {
    for (const requestType of ["department_transfer", "transfer"]) {
      expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType,fieldKey:"secondary_certificate",currentCount:0 })).toBeNull();
    }
    expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType:"department_transfer",fieldKey:"excuse_documents",currentCount:0 })).toBe("ATTACHMENT_FIELD_NOT_ALLOWED");
    expect(canCreateSecureAttachmentIntent({ owner:true,requestStatus:"draft",requestType:"excused_absence",fieldKey:"secondary_certificate",currentCount:0 })).toBe("ATTACHMENT_FIELD_NOT_ALLOWED");
  });

  it("accepts certificate metadata under the existing private MIME/size policy", () => {
    expect(validateSecureAttachmentMetadata({ fileName:"certificate.pdf",mimeType:"application/pdf",sizeBytes:100,fieldKey:"secondary_certificate" })).toBeNull();
    expect(validateSecureAttachmentMetadata({ fileName:"certificate.exe",mimeType:"application/octet-stream",sizeBytes:100,fieldKey:"secondary_certificate" })).toBe("ATTACHMENT_MIME_NOT_ALLOWED");
  });

  it("keeps references opaque with no path or public URL", () => {
    const reference = {
      attachmentId:"33333333-3333-4333-8333-333333333333",
      studentRequestId:"22222222-2222-4222-8222-222222222222",
      studentProfileId:"11111111-1111-4111-8111-111111111111",
      fieldKey:"secondary_certificate",status:"attached",mimeType:"application/pdf",
      sizeBytes:100,originalFileName:"certificate.pdf",
    };
    expect(isSecureAttachmentReference(reference)).toBe(true);
    expect(isSecureAttachmentReference({ ...reference, publicUrl:"https://example.invalid" })).toBe(false);
    expect(isSecureAttachmentReference({ ...reference, storagePath:"raw/path" })).toBe(false);
  });
});
