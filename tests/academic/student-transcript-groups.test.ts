import { describe, expect, test } from "bun:test";
import { buildAcademicTranscriptTerms } from "@/lib/academic/transcript-groups";

describe("student academic transcript terms", () => {
  test("orders terms chronologically and excludes in-progress work from averages", () => {
    const terms = buildAcademicTranscriptTerms([
      {
        enrollment_id: "current", course_id: "c2", course_code: "CS102", course_name_ar: "الثاني",
        credit_hours: 3, academic_year_id: "y2", academic_year_name: "2026/2027", academic_year_start_date: "2026-09-01",
        semester_id: "s2", semester_name: "الأول", semester_code: "1", semester_start_date: "2026-09-01",
        official_result: null, grade_label: null, result: "in_progress",
      },
      {
        enrollment_id: "passed", course_id: "c1", course_code: "CS101", course_name_ar: "الأول",
        credit_hours: 3, academic_year_id: "y1", academic_year_name: "2025/2026", academic_year_start_date: "2025-09-01",
        semester_id: "s1", semester_name: "الأول", semester_code: "1", semester_start_date: "2025-09-01",
        official_result: 80, grade_label: "جيد جدًا", result: "passed",
      },
    ]);
    expect(terms.map((term) => term.academicYearName)).toEqual(["2025/2026", "2026/2027"]);
    expect(terms[0].earnedHours).toBe(3);
    expect(terms[1].termAverage).toBe(0);
    expect(terms[1].cumulativeAverage).toBe(80);
  });
});