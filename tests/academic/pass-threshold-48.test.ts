import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  COURSE_PASS_PERCENT,
  COURSE_PASS_RATIO,
  isCoursePassed,
  isCoursePassedRaw,
  normalizePercentage,
} from "@/lib/academic/pass-threshold";
import {
  computeRemainingRequiredCourses,
  evaluateOctoberExamEligibility,
  OCTOBER_DENY_REASONS,
} from "@/lib/student-requests/p1/october-exam-entry";

const read = (p: string) => readFileSync(p, "utf8");

describe("approved academic pass mark = 48/100", () => {
  it("pins the canonical constant", () => {
    expect(COURSE_PASS_PERCENT).toBe(48);
    expect(COURSE_PASS_RATIO).toBe(0.48);
  });

  it("honours the exact boundary", () => {
    expect(isCoursePassed(47.99)).toBe(false);
    expect(isCoursePassed(48.0)).toBe(true);
    expect(isCoursePassed(48.01)).toBe(true);
    expect(isCoursePassed(50)).toBe(true);
    expect(isCoursePassed(59)).toBe(true);
    expect(isCoursePassed(60)).toBe(true);
    expect(isCoursePassed(null)).toBe(false);
  });

  it("normalizes when component maximum is not 100", () => {
    expect(isCoursePassedRaw(96, 200)).toBe(true); // 48.00%
    expect(isCoursePassedRaw(95.9, 200)).toBe(false);
    expect(isCoursePassedRaw(24, 50)).toBe(true);
    expect(normalizePercentage(24, 50)).toBe(48);
    expect(normalizePercentage(5, 0)).toBeNull();
  });
});

describe("no active source uses 60 as the course pass mark", () => {
  const files = [
    "src/lib/academic-status.functions.ts",
    "src/routes/mobile.student.grades.tsx",
    "src/lib/admin-reports.functions.ts",
  ];
  for (const f of files) {
    it(`${f} derives its threshold from the canonical constant`, () => {
      const src = read(f);
      expect(src).toContain("@/lib/academic/pass-threshold");
      expect(src).not.toMatch(/PASS_PERCENT\s*=\s*60/);
      expect(src).not.toMatch(/percentage\s*\??\s*\.?\s*>=\s*60\b/);
    });
  }

  it("web and mobile agree on the same threshold", () => {
    const web = read("src/lib/academic-status.functions.ts");
    const mob = read("src/routes/mobile.student.grades.tsx");
    expect(web).toContain("COURSE_PASS_PERCENT");
    expect(mob).toContain("COURSE_PASS_PERCENT");
  });
});

describe("SQL duplication sites are pinned to 48", () => {
  it("P1-02 October remaining calculation uses 0.48", () => {
    const sql = read("docs/migration-drafts/p1/P1-02-BACKEND-VALIDATION.sql");
    expect(sql).toContain(">= 0.48");
    expect(sql).not.toContain(">= 0.60");
  });

  it("P1-05 corrects every backend duplication of the old pass mark", () => {
    const sql = read("docs/migration-drafts/p1/P1-05-PASS-THRESHOLD-48.sql");
    expect(sql).toContain("get_admin_dashboard_kpis");
    expect(sql).toContain("get_admin_progress_kpis");
    expect(sql).toContain("student_unofficial_transcript");
    expect(sql).toContain("percentage >= 48");
    expect(sql).toContain("pct >= 48");
    expect(sql).toContain(">= 48::numeric");
    expect(sql).not.toMatch(/>=\s*60\b/);
    expect(sql).not.toMatch(/>=\s*50::numeric/);
  });
});

/* ---------------- October eligibility boundary matrix ---------------- */

type Req = { requirementId: string; courseId: string; courseCodeAr: string; courseNameAr: string; isRequired: boolean };
const req = (n: number): Req => ({
  requirementId: `r${n}`, courseId: `c${n}`, courseCodeAr: `C${n}`, courseNameAr: `مقرر ${n}`, isRequired: true,
});
const result = (courseId: string, pct: number) => ({ courseId, passed: isCoursePassed(pct) });

describe("October 48% boundary matrix", () => {
  it("A: level 4 with 4 remaining requirements → ELIGIBLE", () => {
    const e = evaluateOctoberExamEligibility({
      academicLevelOrder: 4,
      studyPlanRequirements: [req(1), req(2), req(3), req(4), req(5)],
      approvedResults: [result("c5", 48)],
    });
    expect(e.eligible).toBe(true);
    expect(e.remainingCount).toBe(4);
  });

  it("B: level 4 with 5 genuinely remaining → DENY", () => {
    const e = evaluateOctoberExamEligibility({
      academicLevelOrder: 4,
      studyPlanRequirements: [1, 2, 3, 4, 5].map(req),
      approvedResults: [],
    });
    expect(e.eligible).toBe(false);
    expect(e.denyReason).toBe(OCTOBER_DENY_REASONS.TOO_MANY_REMAINING);
  });

  it("C: 47.99% keeps the course outstanding", () => {
    const c = computeRemainingRequiredCourses({
      academicLevelOrder: 4, studyPlanRequirements: [req(1)], approvedResults: [result("c1", 47.99)],
    });
    expect(c.remainingCount).toBe(1);
  });

  it("D: 48.00% removes the course from remaining", () => {
    const c = computeRemainingRequiredCourses({
      academicLevelOrder: 4, studyPlanRequirements: [req(1)], approvedResults: [result("c1", 48.0)],
    });
    expect(c.remainingCount).toBe(0);
  });

  it("E: 60% is PASSED", () => {
    const c = computeRemainingRequiredCourses({
      academicLevelOrder: 4, studyPlanRequirements: [req(1)], approvedResults: [result("c1", 60)],
    });
    expect(c.remainingCount).toBe(0);
  });

  it("F: repeated attempts 47% then 52% count as PASSED once", () => {
    const c = computeRemainingRequiredCourses({
      academicLevelOrder: 4,
      studyPlanRequirements: [req(1), req(2)],
      approvedResults: [result("c1", 47), result("c1", 52)],
    });
    expect(c.remainingCount).toBe(1);
    expect(c.passedCourseIds).toEqual(["c1"]);
  });

  it("G: duplicate approved rows never double-count", () => {
    const c = computeRemainingRequiredCourses({
      academicLevelOrder: 4,
      studyPlanRequirements: [req(1), req(1), req(2)],
      approvedResults: [result("c1", 48), result("c1", 48)],
    });
    expect(c.remainingCount).toBe(1);
    expect(c.passedCourseIds).toEqual(["c1"]);
  });
});
