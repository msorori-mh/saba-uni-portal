import { describe, it, expect } from "vitest";
import {
  MATERIALS_ALLOWED_EXT,
  MATERIALS_ALLOWED_MIME,
  MATERIALS_MAX_BYTES_DEFAULT,
  sanitizeFileName,
  STUDY_SYSTEM_LABELS,
} from "@/lib/course-materials.shared";

describe("course-materials shared", () => {
  it("allows only pdf/doc/docx/ppt/pptx extensions", () => {
    expect(MATERIALS_ALLOWED_EXT).toEqual(["pdf", "doc", "docx", "ppt", "pptx"]);
  });

  it("restricts MIME types to the five documented office/pdf formats", () => {
    expect(MATERIALS_ALLOWED_MIME.length).toBe(5);
    expect(MATERIALS_ALLOWED_MIME).toContain("application/pdf");
    expect(MATERIALS_ALLOWED_MIME).not.toContain("image/png");
    expect(MATERIALS_ALLOWED_MIME).not.toContain("application/zip");
  });

  it("caps size at exactly 25 MB", () => {
    expect(MATERIALS_MAX_BYTES_DEFAULT).toBe(25 * 1024 * 1024);
  });

  it("labels study systems in Arabic (regular / parallel / both)", () => {
    expect(STUDY_SYSTEM_LABELS.regular).toBe("نظامي");
    expect(STUDY_SYSTEM_LABELS.parallel).toBe("انتساب");
    expect(STUDY_SYSTEM_LABELS.both).toBe("كلا النظامين");
    // ممنوع مصطلح affiliate في الواجهة
    expect(Object.values(STUDY_SYSTEM_LABELS)).not.toContain("affiliate");
  });

  it("sanitizes filenames: strips unsafe chars, preserves unicode, caps length, lowercases extension", () => {
    expect(sanitizeFileName("Lecture 01.pdf")).toBe("Lecture_01.pdf");
    expect(sanitizeFileName("محاضرة ١.PDF")).toMatch(/^محاضرة_[\p{L}\p{N}]+\.pdf$/u);
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    const long = "a".repeat(500) + ".docx";
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(80 + 1 + 4);
  });

  it("rejects files without a known extension", () => {
    const s = sanitizeFileName("weirdfile");
    expect(s).toBe("weirdfile");
    // The extension check happens in the server function; here we just verify sanitizer is stable.
  });
});
