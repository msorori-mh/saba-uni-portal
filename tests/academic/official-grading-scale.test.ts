/**
 * PORTAL_OFFICIAL_GRADING_SCALE_NO_GPA_AND_P1_FINAL_PIN_04
 *
 * Pins the approved grading policy: no GPA anywhere, 48 pass mark, official
 * result normalization 48..49.99 -> 50, and the Arabic grade bands.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  FAIL_GRADE_LABEL,
  OFFICIAL_PASS_FLOOR,
  gradeArabicLabel,
  normalizeOfficialResult,
  officialCourseResult,
  officialWeightedAverage,
} from "../../src/lib/academic/grading-scale";
import { COURSE_PASS_PERCENT } from "../../src/lib/academic/pass-threshold";

describe("official grading scale", () => {
  it("keeps the approved pass mark and official floor", () => {
    expect(COURSE_PASS_PERCENT).toBe(48);
    expect(OFFICIAL_PASS_FLOOR).toBe(50);
  });

  it("fails below 48 without normalization", () => {
    expect(normalizeOfficialResult(47.99)).toBe(48); // rounded display only
    expect(gradeArabicLabel(47.99)).toBe(FAIL_GRADE_LABEL);
    expect(gradeArabicLabel(0)).toBe(FAIL_GRADE_LABEL);
    expect(officialCourseResult(47.99).passed).toBe(false);
  });

  it("normalizes 48..49.99 to the official 50", () => {
    expect(normalizeOfficialResult(48)).toBe(50);
    expect(normalizeOfficialResult(49.9)).toBe(50);
    expect(gradeArabicLabel(48)).toBe("مقبول");
    expect(officialCourseResult(48)).toEqual({ official: 50, label: "مقبول", passed: true });
  });

  it("maps the official bands", () => {
    expect(gradeArabicLabel(50)).toBe("مقبول");
    expect(gradeArabicLabel(64.9)).toBe("مقبول");
    expect(gradeArabicLabel(65)).toBe("جيد");
    expect(gradeArabicLabel(79.9)).toBe("جيد");
    expect(gradeArabicLabel(80)).toBe("جيد جدًا");
    expect(gradeArabicLabel(89.9)).toBe("جيد جدًا");
    expect(gradeArabicLabel(90)).toBe("ممتاز");
    expect(gradeArabicLabel(100)).toBe("ممتاز");
  });

  it("weights aggregates by credit hours on the official percentage scale", () => {
    expect(
      officialWeightedAverage([
        { raw: 48, creditHours: 3 }, // -> 50
        { raw: 90, creditHours: 1 },
      ]),
    ).toBe(60);
    expect(officialWeightedAverage([])).toBe(0);
  });

  it("has no GPA scale anywhere in application source", () => {
    const out = execFileSync(
      "bash",
      [
        "-lc",
        "rg -n --glob '!**/enrollment-certificate-pdf-assets.server.ts' -i '\bgpa\b' src | grep -v 'NOT a GPA' | grep -v 'NO GPA' | grep -v base64 || true",
      ],
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("P1-05 draft carries the same policy and no grade points", () => {
    const sql = readFileSync("docs/migration-drafts/p1/P1-05-PASS-THRESHOLD-48.sql", "utf8");
    expect(sql).not.toMatch(/gpa_points/);
    expect(sql).not.toMatch(/cumulative_gpa/);
    expect(sql).toContain("avgOfficialPercentage");
    expect(sql).toContain("official_result");
    expect(sql).toContain("grade_label");
    expect(sql).toContain("'ضعيف'");
    expect(sql).toContain("'مقبول'");
    expect(sql).toContain("'جيد'");
    expect(sql).toContain("'جيد جدًا'");
    expect(sql).toContain("'ممتاز'");
  });
});
