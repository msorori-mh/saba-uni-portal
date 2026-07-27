import { describe, expect, test } from "bun:test";
import {
  parseOwnedStudentRequestAttachmentUpload,
  prepareOwnedAttachmentStorageUpload,
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

  test("rejects invalid objects (empty / missing required keys)", () => {
    expect(() => parseOwnedStudentRequestAttachmentUpload({})).toThrow(
      "ATTACHMENT_OBJECT_MISMATCH",
    );
    expect(() =>
      parseOwnedStudentRequestAttachmentUpload({
        upload_status: "pending",
        mime_type: "application/pdf",
        // missing size_bytes / storage_*
      }),
    ).toThrow("ATTACHMENT_OBJECT_MISMATCH");
    expect(() =>
      parseOwnedStudentRequestAttachmentUpload([
        {
          upload_status: "pending",
          mime_type: "",
          size_bytes: 1,
          storage_bucket: "b",
          storage_object_path: "p",
        },
      ]),
    ).toThrow("ATTACHMENT_OBJECT_MISMATCH");
  });
});

describe("prepareOwnedAttachmentStorageUpload — zero mutation on reject", () => {
  const row = {
    upload_status: "pending",
    mime_type: "application/pdf",
    size_bytes: 12,
    storage_bucket: "student-request-secure-attachments",
    storage_object_path: "student-requests/x/y/z/content.pdf",
  };

  function gateThenUpload(ownedRaw: unknown, upload: () => string): string {
    const prepared = prepareOwnedAttachmentStorageUpload({
      ownedRaw,
      expectedMimeType: "application/pdf",
      expectedSizeBytes: 12,
      maxBytes: 5 * 1024 * 1024,
    });
    return upload() + prepared.storageObjectPath;
  }

  test("object and single-row array prepare storage paths (PASS)", () => {
    expect(
      prepareOwnedAttachmentStorageUpload({
        ownedRaw: row,
        expectedMimeType: "application/pdf",
        expectedSizeBytes: 12,
        maxBytes: 5 * 1024 * 1024,
      }).storageObjectPath,
    ).toBe(row.storage_object_path);
    expect(
      prepareOwnedAttachmentStorageUpload({
        ownedRaw: [row],
        expectedMimeType: "application/pdf",
        expectedSizeBytes: 12,
        maxBytes: 5 * 1024 * 1024,
      }).storageBucket,
    ).toBe(row.storage_bucket);
  });

  test("empty/multiple/null/invalid reject before storage upload (zero mutation)", () => {
    let uploadCalls = 0;
    const upload = () => {
      uploadCalls += 1;
      return "mutated";
    };

    for (const ownedRaw of [
      null,
      undefined,
      [],
      [row, { ...row, storage_object_path: "other.pdf" }],
      {},
      "x",
    ]) {
      expect(() => gateThenUpload(ownedRaw, upload)).toThrow("ATTACHMENT_OBJECT_MISMATCH");
    }
    expect(uploadCalls).toBe(0);
  });
});
