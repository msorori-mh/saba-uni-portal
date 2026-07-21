import { describe, expect, test } from "bun:test";
import {
  MATERIAL_SCAN_STATES,
  SCAN_STATE_LABELS,
  MATERIAL_WEEK_MIN,
  MATERIAL_WEEK_MAX,
  MATERIALS_ALLOWED_MIME,
  MATERIALS_ALLOWED_EXT,
  MATERIALS_MAX_BYTES_DEFAULT,
  MATERIALS_SETTINGS_KEYS,
  MATERIALS_UPLOAD_POLICY_DEFAULTS,
  isMaterialScanState,
  isMaterialFileDownloadable,
  isValidMaterialWeekNumber,
  formatWeekLectureLabel,
  resolveMaterialsUploadPolicy,
  buildMaterialUsageSummary,
  buildMaterialsUsageReport,
} from "../../src/lib/course-materials.shared";

describe("scan-state model (fail-closed)", () => {
  test("scan states are exactly the designed lifecycle", () => {
    expect([...MATERIAL_SCAN_STATES]).toEqual(["pending", "clean", "infected", "failed"]);
    for (const state of MATERIAL_SCAN_STATES) {
      expect(SCAN_STATE_LABELS[state]).toBeTruthy();
    }
  });

  test("isMaterialScanState validates strictly", () => {
    expect(isMaterialScanState("pending")).toBe(true);
    expect(isMaterialScanState("clean")).toBe(true);
    expect(isMaterialScanState("infected")).toBe(true);
    expect(isMaterialScanState("failed")).toBe(true);
    expect(isMaterialScanState("Clean")).toBe(false);
    expect(isMaterialScanState("")).toBe(false);
    expect(isMaterialScanState(null)).toBe(false);
    expect(isMaterialScanState(undefined)).toBe(false);
    expect(isMaterialScanState(42)).toBe(false);
  });

  test("download gate opens ONLY on clean (fail-closed)", () => {
    expect(isMaterialFileDownloadable("clean")).toBe(true);
    expect(isMaterialFileDownloadable("pending")).toBe(false);
    expect(isMaterialFileDownloadable("infected")).toBe(false);
    expect(isMaterialFileDownloadable("failed")).toBe(false);
    expect(isMaterialFileDownloadable(null)).toBe(false);
    expect(isMaterialFileDownloadable(undefined)).toBe(false);
    expect(isMaterialFileDownloadable("")).toBe(false);
    expect(isMaterialFileDownloadable({})).toBe(false);
  });
});

describe("week linkage", () => {
  test("week bounds are conservative (1..20)", () => {
    expect(MATERIAL_WEEK_MIN).toBe(1);
    expect(MATERIAL_WEEK_MAX).toBe(20);
  });

  test("isValidMaterialWeekNumber accepts only integers in range", () => {
    expect(isValidMaterialWeekNumber(1)).toBe(true);
    expect(isValidMaterialWeekNumber(16)).toBe(true);
    expect(isValidMaterialWeekNumber(20)).toBe(true);
    expect(isValidMaterialWeekNumber(0)).toBe(false);
    expect(isValidMaterialWeekNumber(21)).toBe(false);
    expect(isValidMaterialWeekNumber(1.5)).toBe(false);
    expect(isValidMaterialWeekNumber("3")).toBe(false);
    expect(isValidMaterialWeekNumber(null)).toBe(false);
    expect(isValidMaterialWeekNumber(NaN)).toBe(false);
  });

  test("formatWeekLectureLabel renders week/lecture combinations", () => {
    expect(formatWeekLectureLabel(3, 2)).toBe("الأسبوع 3 • المحاضرة 2");
    expect(formatWeekLectureLabel(3, null)).toBe("الأسبوع 3");
    expect(formatWeekLectureLabel(null, 2)).toBe("المحاضرة 2");
    expect(formatWeekLectureLabel(null, null)).toBe("");
    expect(formatWeekLectureLabel(99, -1)).toBe("");
  });
});

describe("configurable upload policy (narrow-only, D-16 pending)", () => {
  test("defaults are the conservative baseline", () => {
    expect(MATERIALS_UPLOAD_POLICY_DEFAULTS.maxBytes).toBe(MATERIALS_MAX_BYTES_DEFAULT);
    expect(MATERIALS_UPLOAD_POLICY_DEFAULTS.maxMb).toBe(25);
    expect([...MATERIALS_UPLOAD_POLICY_DEFAULTS.allowedMimeTypes]).toEqual([...MATERIALS_ALLOWED_MIME]);
    expect([...MATERIALS_UPLOAD_POLICY_DEFAULTS.allowedExtensions]).toEqual([...MATERIALS_ALLOWED_EXT]);
    expect(MATERIALS_UPLOAD_POLICY_DEFAULTS.narrowedFromDefaults).toBe(false);
  });

  test("settings keys are stable", () => {
    expect(MATERIALS_SETTINGS_KEYS.maxMb).toBe("materials_max_mb");
    expect(MATERIALS_SETTINGS_KEYS.allowedMimeTypes).toBe("materials_allowed_mime_types");
    expect(MATERIALS_SETTINGS_KEYS.allowedExtensions).toBe("materials_allowed_extensions");
  });

  test("null/undefined settings fall back to defaults", () => {
    expect(resolveMaterialsUploadPolicy(null)).toEqual(MATERIALS_UPLOAD_POLICY_DEFAULTS);
    expect(resolveMaterialsUploadPolicy(undefined)).toEqual(MATERIALS_UPLOAD_POLICY_DEFAULTS);
    expect(resolveMaterialsUploadPolicy({})).toEqual(MATERIALS_UPLOAD_POLICY_DEFAULTS);
  });

  test("max size may narrow but never widen beyond 25MB", () => {
    const narrowed = resolveMaterialsUploadPolicy({ maxMb: "10" });
    expect(narrowed.maxMb).toBe(10);
    expect(narrowed.maxBytes).toBe(10 * 1024 * 1024);
    expect(narrowed.narrowedFromDefaults).toBe(true);

    const widened = resolveMaterialsUploadPolicy({ maxMb: "500" });
    expect(widened.maxMb).toBe(25);
    expect(widened.maxBytes).toBe(MATERIALS_MAX_BYTES_DEFAULT);
    expect(widened.narrowedFromDefaults).toBe(false);

    expect(resolveMaterialsUploadPolicy({ maxMb: 5 }).maxMb).toBe(5);
    expect(resolveMaterialsUploadPolicy({ maxMb: 0 }).maxMb).toBe(25);
    expect(resolveMaterialsUploadPolicy({ maxMb: -3 }).maxMb).toBe(25);
    expect(resolveMaterialsUploadPolicy({ maxMb: "abc" }).maxMb).toBe(25);
    expect(resolveMaterialsUploadPolicy({ maxMb: 0.2 }).maxMb).toBe(1);
  });

  test("mime list may narrow but never widen", () => {
    const narrowed = resolveMaterialsUploadPolicy({ allowedMimeTypes: "application/pdf" });
    expect([...narrowed.allowedMimeTypes]).toEqual(["application/pdf"]);
    expect(narrowed.narrowedFromDefaults).toBe(true);

    const widened = resolveMaterialsUploadPolicy({ allowedMimeTypes: "application/pdf,image/png" });
    expect([...widened.allowedMimeTypes]).toEqual(["application/pdf"]);

    const garbageOnly = resolveMaterialsUploadPolicy({ allowedMimeTypes: "image/png,text/html" });
    expect([...garbageOnly.allowedMimeTypes]).toEqual([...MATERIALS_ALLOWED_MIME]);
    expect(garbageOnly.narrowedFromDefaults).toBe(false);

    const arrayForm = resolveMaterialsUploadPolicy({
      allowedMimeTypes: [" application/pdf ", "APPLICATION/MSWORD", "video/mp4"],
    });
    expect([...arrayForm.allowedMimeTypes]).toEqual(["application/pdf", "application/msword"]);
  });

  test("extension list may narrow but never widen", () => {
    const narrowed = resolveMaterialsUploadPolicy({ allowedExtensions: "pdf, pptx" });
    expect([...narrowed.allowedExtensions]).toEqual(["pdf", "pptx"]);

    const widened = resolveMaterialsUploadPolicy({ allowedExtensions: "pdf,exe,js" });
    expect([...widened.allowedExtensions]).toEqual(["pdf"]);

    const dotted = resolveMaterialsUploadPolicy({ allowedExtensions: ".pdf" });
    expect([...dotted.allowedExtensions]).toEqual(["pdf"]);

    const garbageOnly = resolveMaterialsUploadPolicy({ allowedExtensions: "exe,bat" });
    expect([...garbageOnly.allowedExtensions]).toEqual([...MATERIALS_ALLOWED_EXT]);
  });

  test("narrowedFromDefaults compares sets, not lengths", () => {
    // Same length as the default list but a different set (a duplicate
    // displaced a default entry) must still read as narrowed.
    const displaced = resolveMaterialsUploadPolicy({ allowedExtensions: "pdf,doc,docx,ppt,ppt" });
    expect(displaced.narrowedFromDefaults).toBe(true);

    const displacedMime = resolveMaterialsUploadPolicy({
      allowedMimeTypes: "application/pdf,application/pdf",
    });
    expect(displacedMime.narrowedFromDefaults).toBe(true);

    // Reordered entries with a harmless duplicate covering the full default
    // set are NOT a narrowing.
    const reorderedDup = resolveMaterialsUploadPolicy({ allowedExtensions: "pptx,pdf,doc,ppt,docx,pdf" });
    expect(reorderedDup.narrowedFromDefaults).toBe(false);
    expect([...new Set(reorderedDup.allowedExtensions)].sort()).toEqual([...MATERIALS_ALLOWED_EXT].sort());
  });
});

describe("usage reporting aggregation", () => {
  const material = {
    id: "m1",
    title: "محاضرة 1",
    status: "published" as const,
    week_number: 3,
    lecture_number: 2,
    files: [
      { scan_state: "clean" },
      { scan_state: "clean" },
      { scan_state: "pending" },
      { scan_state: "infected" },
    ],
  };

  const events = [
    { course_material_id: "m1", event: "downloaded", actor_user_id: "u1", created_at: "2026-07-01T10:00:00Z" },
    { course_material_id: "m1", event: "downloaded", actor_user_id: "u2", created_at: "2026-07-02T10:00:00Z" },
    { course_material_id: "m1", event: "downloaded", actor_user_id: "u1", created_at: "2026-07-03T10:00:00Z" },
    { course_material_id: "m1", event: "published", actor_user_id: "u9", created_at: "2026-07-04T10:00:00Z" },
    { course_material_id: "other", event: "downloaded", actor_user_id: "u1", created_at: "2026-07-05T10:00:00Z" },
  ];