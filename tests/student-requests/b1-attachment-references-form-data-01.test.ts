import { describe, expect, it } from "bun:test";
import { withSecureAttachmentReferences } from "../../src/lib/student-requests/b1-ui/attachment-references";
import { extractB1SecureAttachmentIds } from "../../src/lib/student-requests/student-request-submit-contract";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const att = (attachmentId: string, attachmentType: string, status = "attached") => ({
  attachmentId,
  attachmentType,
  status,
});

describe("B1 secure attachment references in draft form data", () => {
  it("binds excused_absence attachments to excuse_documents", () => {
    const next = withSecureAttachmentReferences(
      "excused_absence",
      { absence_reason_detail: "x" },
      [att(ID_A, "excuse_documents")],
    );
    expect(next.excuse_documents).toEqual([
      { fieldKey: "excuse_documents", status: "attached", attachmentId: ID_A },
    ]);
    expect(next.absence_reason_detail).toBe("x");
    expect(extractB1SecureAttachmentIds("excused_absence", next)).toEqual([ID_A]);
  });

  it("binds department_transfer attachments to secondary_certificate_file", () => {
    const next = withSecureAttachmentReferences("department_transfer", {}, [
      att(ID_A, "secondary_certificate"),
    ]);
    expect(next.secondary_certificate_file).toEqual([
      { fieldKey: "secondary_certificate", status: "attached", attachmentId: ID_A },
    ]);
    expect(extractB1SecureAttachmentIds("department_transfer", next)).toEqual([ID_A]);
  });

  it("leaves services without secure attachments untouched", () => {
    for (const service of ["enrollment_suspension", "final_chance", "file_withdrawal"]) {
      const values = { note: "n" };
      expect(withSecureAttachmentReferences(service, values, [att(ID_A, "excuse_documents")])).toBe(
        values,
      );
    }
  });

  it("ignores non-attached status, foreign fieldKey and malformed ids", () => {
    expect(
      withSecureAttachmentReferences("excused_absence", {}, [
        att(ID_A, "excuse_documents", "rejected"),
        att(ID_B, "secondary_certificate"),
        att("not-a-uuid", "excuse_documents"),
      ]),
    ).toEqual({});
  });

  it("drops a stale reference when the last attachment is removed", () => {
    const stale = {
      excuse_documents: [{ fieldKey: "excuse_documents", status: "attached", attachmentId: ID_A }],
    };
    expect(withSecureAttachmentReferences("excused_absence", stale, [])).toEqual({});
  });

  it("deduplicates and normalizes attachment ids", () => {
    const next = withSecureAttachmentReferences("excused_absence", {}, [
      att(ID_A.toUpperCase(), "excuse_documents"),
      att(ID_A, "excuse_documents"),
      att(ID_B, "excuse_documents"),
    ]);
    expect(extractB1SecureAttachmentIds("excused_absence", next)).toEqual([ID_A, ID_B]);
  });
});
