import { describe, expect, it } from "bun:test";
import { withSecureAttachmentReferences } from "../../src/lib/student-requests/b1-ui/attachment-references";
import { normalizeB1DraftFormData } from "../../src/lib/student-requests/b1-secure-draft/contracts";
import { extractB1SecureAttachmentIds } from "../../src/lib/student-requests/student-request-submit-contract";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const att = (attachmentId: string, attachmentType: string, status = "attached") => ({
  attachmentId,
  attachmentType,
  status,
});

/** helper -> normalizer -> stored form_data -> extractor */
const roundTrip = (
  serviceCode: string,
  values: Record<string, unknown>,
  attachments: ReturnType<typeof att>[],
) => {
  const merged = withSecureAttachmentReferences(serviceCode, values, attachments);
  const stored = normalizeB1DraftFormData(merged);
  return { merged, stored, ids: extractB1SecureAttachmentIds(serviceCode, stored) };
};

describe("B1 canonical UUID-array attachment reference contract", () => {
  it("excused_absence: upload -> save -> submit resolves the exact ids", () => {
    const { merged, stored, ids } = roundTrip("excused_absence", { absence_reason_detail: "x" }, [
      att(ID_A, "excuse_documents"),
      att(ID_B, "excuse_documents"),
    ]);
    expect(merged.excuse_documents).toEqual([ID_A, ID_B]);
    expect(stored.excuse_documents).toEqual([ID_A, ID_B]);
    expect(stored.absence_reason_detail).toBe("x");
    expect(ids).toEqual([ID_A, ID_B]);
  });

  it("department_transfer: stored form_data holds a UUID array only", () => {
    const { stored, ids } = roundTrip("department_transfer", {}, [
      att(ID_A, "secondary_certificate"),
    ]);
    expect(stored.secondary_certificate_file).toEqual([ID_A]);
    expect(JSON.stringify(stored)).not.toMatch(/fieldKey|status|storage|path/i);
    expect(ids).toEqual([ID_A]);
  });

  it("stores no object shape, metadata or storage coordinates", () => {
    const { stored } = roundTrip("excused_absence", {}, [att(ID_A, "excuse_documents")]);
    for (const item of stored.excuse_documents as unknown[]) {
      expect(typeof item).toBe("string");
    }
  });

  it("delete removes the UUID from stored form_data and blocks submit extraction", () => {
    const first = roundTrip("excused_absence", {}, [
      att(ID_A, "excuse_documents"),
      att(ID_B, "excuse_documents"),
    ]);
    expect(first.ids).toEqual([ID_A, ID_B]);

    const afterDelete = roundTrip("excused_absence", first.stored, [att(ID_B, "excuse_documents")]);
    expect(afterDelete.stored.excuse_documents).toEqual([ID_B]);
    expect(afterDelete.ids).toEqual([ID_B]);

    const afterDeleteAll = withSecureAttachmentReferences("excused_absence", afterDelete.stored, []);
    const storedEmpty = normalizeB1DraftFormData(afterDeleteAll);
    expect("excuse_documents" in storedEmpty).toBe(false);
    expect(() => extractB1SecureAttachmentIds("excused_absence", storedEmpty)).toThrow(
      "SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID",
    );
  });

  it("dedupes, lowercases and drops malformed or non-attached attachments", () => {
    const { ids } = roundTrip("excused_absence", {}, [
      att(ID_A.toUpperCase(), "excuse_documents"),
      att(ID_A, "excuse_documents"),
      att(ID_B, "excuse_documents", "rejected"),
      att("not-a-uuid", "excuse_documents"),
      att(ID_B, "secondary_certificate"),
    ]);
    expect(ids).toEqual([ID_A]);
  });

  it("services without secure attachments pass through untouched", () => {
    for (const service of ["enrollment_suspension", "final_chance", "file_withdrawal"]) {
      const values = { note: "n" };
      expect(withSecureAttachmentReferences(service, values, [att(ID_A, "excuse_documents")])).toBe(
        values,
      );
      expect(extractB1SecureAttachmentIds(service, values)).toEqual([]);
    }
  });

  it("extractor rejects the legacy object shape and wrong field types", () => {
    const legacy = {
      excuse_documents: [{ attachmentId: ID_A, fieldKey: "excuse_documents", status: "attached" }],
    };
    expect(() => extractB1SecureAttachmentIds("excused_absence", legacy)).toThrow(
      "SECURE_ATTACHMENT_REFERENCE_INVALID",
    );
    expect(() => extractB1SecureAttachmentIds("excused_absence", { excuse_documents: ID_A })).toThrow(
      "SECURE_ATTACHMENT_REFERENCE_INVALID",
    );
    expect(() =>
      extractB1SecureAttachmentIds("excused_absence", { excuse_documents: ["bad"] }),
    ).toThrow("SECURE_ATTACHMENT_REFERENCE_INVALID");
    expect(() =>
      extractB1SecureAttachmentIds("excused_absence", { excuse_documents: [ID_A, ID_A] }),
    ).toThrow("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
  });

  it("normalizer rejects any non-UUID shape that could reach form_data", () => {
    expect(() =>
      normalizeB1DraftFormData({
        excuse_documents: [{ attachmentId: ID_A, fieldKey: "excuse_documents" }],
      }),
    ).toThrow(/attachment_reference_invalid/);
  });
});
