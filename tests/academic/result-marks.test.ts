import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isExcludedResultMark,
  isResultMark,
  parseResultMark,
  RESULT_MARK_VALUES,
} from "../../src/lib/academic/result-marks";

const ROOT = resolve(import.meta.dir, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("CYB-HISTORY-RESULT-MARKS-01 — official result marks", () => {
  test("accepts exactly the four official marks, verbatim", () => {
    expect(RESULT_MARK_VALUES).toEqual(["غ ض", "م ح ض", "غ ب ض", "ق ض"]);
    expect(parseResultMark("  غ   ض ")).toBe("غ ض");
    expect(parseResultMark("")).toBeNull();
    expect(parseResultMark(null)).toBeNull();
    expect(parseResultMark("راسب")).toBe("invalid");
  });

  test("absent and deprived count as failures; excused marks are not counted", () => {
    expect(isExcludedResultMark("غ ض")).toBe(false);
    expect(isExcludedResultMark("م ح ض")).toBe(false);
    expect(isExcludedResultMark("غ ب ض")).toBe(true);
    expect(isExcludedResultMark("ق ض")).toBe(true);
    expect(isExcludedResultMark(null)).toBe(false);
    expect(isResultMark("غ ب ض")).toBe(true);
    expect(isResultMark("x")).toBe(false);
  });

  test("progress engine reads the mark, skips excused attempts and shows the mark", () => {
    const src = read("src/lib/academic-status.functions.ts");
    expect(src).toContain("enrollment_status, result_mark, section:course_sections(");
    expect(src).toContain("if (isExcludedResultMark(e.result_mark)) continue;");
    expect(src).toContain("grade_label: resultMark ?? ");
    expect(src).toContain('"passed" | "failed" | "in_progress" | "excused"');
  });

  test("transcript shows the mark instead of a percentage", () => {
    const ui = read("src/components/academic/AcademicTranscript.tsx");
    expect(ui).toContain("course.result_mark || course.official_result == null");
    expect(ui).toContain('"غير محتسب"');
  });

  test("enrollment import carries the mark and the migration constrains it", () => {
    const v = read("src/lib/imports/validators.ts");
    expect(v).toContain("parseResultMark(raw.result_mark)");
    expect(v).toContain("رمز النتيجة يتطلب حالة تسجيل completed");
    const e = read("src/lib/imports/engine.server.ts");
    expect(e).toContain("result_mark: p.result_mark,");
    const m = read("docs/migration-drafts/ENROLLMENT-RESULT-MARK-01.sql");
    expect(m).toContain("add column if not exists result_mark text");
    expect(m).toContain("enrollment_status = 'completed'");
  });
});
