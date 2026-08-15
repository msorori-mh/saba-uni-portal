import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MATERIAL_UPLOAD_ERRORS,
  MATERIAL_UPLOAD_GENERIC_ERROR,
  buildMaterialStorageObjectName,
  resolveUploadScanState,
  toSafeMaterialUploadMessage,
  MATERIALS_MAX_BYTES_DEFAULT,
  MATERIALS_ALLOWED_MIME,
} from "../../src/lib/course-materials.shared";

const facultyFns = readFileSync("src/lib/faculty-materials.functions.ts", "utf8");
const studentFns = readFileSync("src/lib/student-materials.functions.ts", "utf8");
const facultyUi = readFileSync("src/routes/faculty-portal.materials.$sectionId.tsx", "utf8");

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const DOC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("storage object key is ASCII-safe (root cause of the upload failure)", () => {
  test("arabic filenames produce ascii-only object keys", () => {
    const key = buildMaterialStorageObjectName(1, "محاضرة الأسبوع الأول.pdf");
    expect(key).toMatch(/^1-[A-Za-z0-9._-]+$/);
    expect(key.endsWith(".pdf")).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]+$/.test(key)).toBe(true);
  });

  test("ascii filenames stay readable and versioned", () => {
    expect(buildMaterialStorageObjectName(2, "Lecture 01.PDF")).toBe("2-Lecture-01.pdf");
    expect(buildMaterialStorageObjectName(1, "../../etc/passwd")).not.toContain("/");
  });

  test("upload uses the ascii key builder, not the unicode sanitizer", () => {
    expect(facultyFns).toContain("buildMaterialStorageObjectName(nextVersion, data.filename)");
  });
});

describe("real file signatures", () => {
  test("REAL_PDF_UPLOAD_PASS / REAL_DOCX_UPLOAD_PASS", () => {
    expect(resolveUploadScanState(PDF, "application/pdf")).toBe("clean");
    expect(resolveUploadScanState(DOCX, DOCX_MIME)).toBe("clean");
    expect(resolveUploadScanState(DOC, "application/msword")).toBe("clean");
  });

  test("BAD_SIGNATURE_DENY — renamed file is rejected, no extension-only fallback", () => {
    expect(resolveUploadScanState(DOCX, "application/pdf")).toBe("failed");
    expect(resolveUploadScanState(PDF, DOCX_MIME)).toBe("failed");
    expect(resolveUploadScanState(new Uint8Array([1, 2, 3]), "application/pdf")).toBe("failed");
  });

  test("OVERSIZE_DENY threshold stays at the documented limit", () => {
    expect(MATERIALS_MAX_BYTES_DEFAULT).toBe(25 * 1024 * 1024);
    expect(facultyFns).toContain("buffer.byteLength > policy.maxBytes");
  });

  test("allowed MIME set unchanged (pdf/doc/docx/ppt/pptx)", () => {
    expect(MATERIALS_ALLOWED_MIME.length).toBe(5);
  });
});

describe("SAFE_UPLOAD_ERROR_VISIBLE", () => {
  test("safe server messages are preserved for the user", () => {
    for (const message of Object.values(MATERIAL_UPLOAD_ERRORS)) {
      expect(toSafeMaterialUploadMessage(new Error(message))).toBe(message);
    }
    expect(toSafeMaterialUploadMessage(new Error("حجم الملف يتجاوز 25 ميجابايت")))
      .toBe("حجم الملف يتجاوز 25 ميجابايت");
  });

  test("unsafe internals are never surfaced", () => {
    for (const raw of [
      "duplicate key value violates unique constraint \"course_material_files_pkey\"",
      "SUPABASE_SERVICE_ROLE_KEY invalid",
      "TypeError: undefined is not a function\n at handler",
    ]) {
      expect(toSafeMaterialUploadMessage(new Error(raw))).toBe(MATERIAL_UPLOAD_GENERIC_ERROR);
    }
  });

  test("faculty UI maps errors through the safe mapper", () => {
    expect(facultyUi).toContain("toSafeMaterialUploadMessage(err)");
    expect(facultyUi).not.toContain('} catch {\n      setUploadErr("تعذّر رفع الملف');
  });

  test("server hides storage/registration internals", () => {
    expect(facultyFns).toContain("MATERIAL_UPLOAD_ERRORS.STORAGE_UNAVAILABLE");
    expect(facultyFns).toContain("MATERIAL_UPLOAD_ERRORS.REGISTER_FAILED");
    expect(facultyFns).not.toContain("throw new Error(upErr.message)");
  });
});

describe("publish invariant — a published material always has a real file", () => {
  test("PUBLISH_ZERO_FILES_DENIED / PUBLISH_PENDING_ONLY_DENIED / PUBLISH_CLEAN_FILE_ALLOWED", () => {
    expect(facultyFns).toContain("async function assertMaterialHasCleanStoredFile");
    expect(facultyFns).toContain('.eq("scan_state", "clean")');
    expect(facultyFns).toContain("await assertMaterialHasCleanStoredFile(supabaseAdmin, data.materialId)");
    // storage existence is part of the gate
    expect(facultyFns).toContain("PUBLISH_REQUIRES_CLEAN_FILE");
  });

  test("gate runs before the status update (no bypass)", () => {
    const publishBlock = facultyFns.slice(facultyFns.indexOf("export const publishCourseMaterial"));
    const gate = publishBlock.indexOf("assertMaterialHasCleanStoredFile");
    const update = publishBlock.indexOf('status: "published"');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(update);
  });

  test("faculty ownership is asserted before upload and publish", () => {
    expect(facultyFns).toContain("await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id)");
    expect(facultyFns).toContain("MATERIAL_UPLOAD_ERRORS.NOT_MATERIAL_OWNER");
  });
});

describe("student truthful counts and visibility", () => {
  test("STUDENT_COUNT_IGNORES_PUBLISHED_WITHOUT_CLEAN_FILE", () => {
    expect(studentFns).toContain("files:course_material_files(scan_state)");
    expect(studentFns).toContain("if (!(m.files ?? []).some((f) => isMaterialFileDownloadable(f?.scan_state))) continue;");
  });

  test("STUDENT_DETAIL_HIDES_EMPTY_PUBLISHED_MATERIAL", () => {
    expect(studentFns).toContain(".filter((m) => m.files.length > 0)");
  });

  test("entitlement + signed download stay enforced server-side", () => {
    expect(studentFns).toContain("لا يمكنك الوصول إلى مواد هذه المجموعة");
    expect(studentFns).toContain("createSignedUrl");
    expect(studentFns).not.toContain("getPublicUrl");
  });
});

describe("faculty CTA wording", () => {
  test("CTA_ADD_EDUCATIONAL_MATERIAL_PASS", () => {
    expect(facultyUi).toContain("إضافة مادة تعليمية");
    expect(facultyUi).not.toMatch(/إضافة مادة(?!\s*تعليمية)/);
  });
});
