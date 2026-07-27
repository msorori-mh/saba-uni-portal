import { describe, expect, test } from "bun:test";
import {
  B1DraftFormFieldError,
  B1_ATTACHMENT_REFERENCE_FIELDS,
  B1_INPUT_VALIDATION_FAILED,
  normalizeB1DraftFormData,
} from "../../src/lib/student-requests/b1-secure-draft/contracts";
import {
  B1SecureDraftRpcError,
  mapB1SecureDraftThrown,
} from "../../src/lib/student-requests/b1-secure-draft/rpc";

const UUID = "6c1b3d0a-1111-4111-8111-111111111111";
const ctx = { operation: "saveDraft", serviceCode: null, requestId: UUID };

function caught(fn: () => never): B1SecureDraftRpcError {
  try {
    fn();
  } catch (error) {
    return error as B1SecureDraftRpcError;
  }
  throw new Error("expected throw");
}

describe("B1 draft form normalization — attachment reference fields", () => {
  test("null/empty attachment references are omitted (backend expects absent key)", () => {
    expect(normalizeB1DraftFormData({ excuse_documents: null, absence_date: "2026-07-01" })).toEqual(
      { absence_date: "2026-07-01" },
    );
    expect(normalizeB1DraftFormData({ secondary_certificate_file: null })).toEqual({});
    expect(normalizeB1DraftFormData({ secondary_certificate_file: [] })).toEqual({});
    expect(normalizeB1DraftFormData({ excuse_documents: "" })).toEqual({});
  });

  test("valid uuid arrays are preserved", () => {
    expect(normalizeB1DraftFormData({ excuse_documents: [UUID] })).toEqual({
      excuse_documents: [UUID],
    });
  });

  test("malformed attachment references are rejected with the field name", () => {
    for (const field of B1_ATTACHMENT_REFERENCE_FIELDS) {
      const error = caught(() => {
        normalizeB1DraftFormData({ [field]: "not-a-uuid" }) as never;
        throw new Error("no throw");
      });
      expect(error).toBeInstanceOf(B1DraftFormFieldError);
      expect((error as unknown as B1DraftFormFieldError).field).toBe(field);
      expect(error.message).toContain(B1_INPUT_VALIDATION_FAILED);
    }
    expect(() => normalizeB1DraftFormData({ excuse_documents: [{ a: 1 }] })).toThrow();
  });

  test("non-attachment fields pass through untouched", () => {
    const values = { withdrawal_reason: "سبب", impact_acknowledgment: true };
    expect(normalizeB1DraftFormData(values)).toEqual(values);
  });
});

describe("mapB1SecureDraftThrown — no more blanket masking", () => {
  test("preserves B1SecureDraftRpcError as-is", () => {
    const original = new B1SecureDraftRpcError("B1_STALE_REQUEST_VERSION", "B1_STALE_REQUEST_VERSION");
    expect(caught(() => mapB1SecureDraftThrown(original, ctx))).toBe(original);
  });

  test("field errors become B1_INPUT_VALIDATION_FAILED with the field name", () => {
    const error = caught(() =>
      mapB1SecureDraftThrown(
        new B1DraftFormFieldError("excuse_documents", "attachment_reference_invalid"),
        ctx,
      ),
    );
    expect(error.code).toBe(B1_INPUT_VALIDATION_FAILED);
    expect(error.message).toContain("excuse_documents");
  });

  test("zod-like issues surface safe field paths only", () => {
    const zodLike = Object.assign(new Error("bad input"), {
      name: "ZodError",
      issues: [{ path: ["expectedUpdatedAt"], code: "invalid_string" }],
    });
    const error = caught(() => mapB1SecureDraftThrown(zodLike, ctx));
    expect(error.code).toBe(B1_INPUT_VALIDATION_FAILED);
    expect(error.message).toContain("expectedUpdatedAt");
    expect(error.message).not.toContain("bad input");
  });

  test("known backend codes survive instead of collapsing to the generic message", () => {
    for (const code of [
      "B1_DRAFT_FIELD_TYPE_INVALID",
      "B1_STALE_REQUEST_VERSION",
      "B1_ABSENCE_INPUT_INVALID",
    ]) {
      const error = caught(() =>
        mapB1SecureDraftThrown(new Error(`X error: ${code} at line 12`), ctx),
      );
      expect(error.code).toBe(code);
      expect(error.message).toBe(code);
      expect(error.unavailable).toBe(false);
    }
  });

  test("unknown errors fall back safely without stack or SQL", () => {
    const error = caught(() =>
      mapB1SecureDraftThrown(new Error('relation "student_requests" broke: SELECT 1'), ctx),
    );
    expect(error.message).not.toContain("SELECT");
    expect(error.message).not.toContain("student_requests");
    expect(error.code).toBe("");
  });
});
