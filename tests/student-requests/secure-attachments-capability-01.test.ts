import { describe, expect, test } from "bun:test";
import {
  parseOwnedStudentRequestAttachmentUpload,
  resolveSecureAttachmentsRuntimeAvailable,
  SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS,
  SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR,
} from "@/lib/student-requests/secure-attachments-capability";
import { SECURE_ATTACHMENTS_RUNTIME_AVAILABLE } from "@/lib/student-requests/secure-attachments-contract";

describe("secure attachments runtime capability", () => {
  test("compile-time flag stays fail-closed (never hardcoded true)", () => {
    expect(SECURE_ATTACHMENTS_RUNTIME_AVAILABLE).toBe(false);
  });

  test("resolver is fail-closed without capability/attachments/rpc presence", () => {
    expect(
      resolveSecureAttachmentsRuntimeAvailable({
        capabilityAvailable: false,
        reads: ["attachments"],
        rpcPresence: {
          create_intent: true,
          upload: true,
          complete: true,
          download: true,
        },
      }).available,
    ).toBe(false);

    expect(
      resolveSecureAttachmentsRuntimeAvailable({
        capabilityAvailable: true,
        reads: ["draft"],
        rpcPresence: {
          create_intent: true,
          upload: true,
          complete: true,
          download: true,
        },
      }).available,
    ).toBe(false);

    expect(
      resolveSecureAttachmentsRuntimeAvailable({
        capabilityAvailable: true,
        reads: ["attachments"],
        rpcPresence: {
          create_intent: true,
          upload: true,
          complete: false,
          download: true,
        },
      }).missing,
    ).toEqual(["complete"]);
  });

  test("resolver opens only when all create-intent/upload/complete/download are present", () => {
    const resolved = resolveSecureAttachmentsRuntimeAvailable({
      capabilityAvailable: true,
      reads: ["form_options", "attachments", "draft"],
      rpcPresence: Object.fromEntries(
        SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS.map((key) => [key, true]),
      ),
    });
    expect(resolved.available).toBe(true);
    expect(resolved.missing).toEqual([]);
    expect(SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR).toContain("create_intent");
    expect(SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR).not.toMatch(/غير مفعّل/);
  });
});

describe("parseOwnedStudentRequestAttachmentUpload", () => {
  const row = {
    id: "00000000-0000-4000-8000-0000000000a1",
    upload_status: "pending",
    mime_type: "application/pdf",
    size_bytes: 12,
    storage_bucket: "student-request-secure-attachments",
    storage_object_path: "student-requests/x/y/z/content.pdf",
  };

  test("accepts a single object", () => {
    expect(parseOwnedStudentRequestAttachmentUpload(row)).toEqual(row);
  });

  test("accepts an array of length 1", () => {
    expect(parseOwnedStudentRequestAttachmentUpload([row])).toEqual(row);
  });

  test("rejects an empty array", () => {
    expect(() => parseOwnedStudentRequestAttachmentUpload([])).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
  });

  test("rejects an array with more than one row", () => {
    expect(() => parseOwnedStudentRequestAttachmentUpload([row, { ...row, id: "2" }])).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
  });

  test("rejects null/undefined/non-object payloads", () => {
    expect(() => parseOwnedStudentRequestAttachmentUpload(null)).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
    expect(() => parseOwnedStudentRequestAttachmentUpload(undefined)).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
    expect(() => parseOwnedStudentRequestAttachmentUpload("x")).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
  });
});
