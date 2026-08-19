import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMobileHomeServices,
  buildMobileMoreHub,
} from "@/lib/mobile/student-services";
import {
  projectStudentSelfReports,
} from "@/lib/reports/student-projection";
import { REPORT_CATALOG_ENTRIES, emptyCatalogViewer } from "@/lib/reports/catalog";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("mobile student service information architecture", () => {
  test("home and more contain no duplicate service destinations", () => {
    const input = { gpEligible: false, isGraduate: false };
    const home = buildMobileHomeServices(input).map((item) => item.to);
    const more = buildMobileMoreHub(input).map((item) => item.to);
    expect(home.filter((to) => more.includes(to))).toEqual([]);
  });

  test("requests use two tabs and the approved section order", () => {
    const src = read("src/routes/mobile.student.requests.index.tsx");
    expect(src).toContain("الخدمات المتاحة");
    expect(src).toContain("طلباتي السابقة");
    expect(src.indexOf("الحالة والقيد الأكاديمي")).toBeLessThan(
      src.indexOf("الوثائق والإفادات والشكاوى"),
    );
    for (const label of [
      "enrollment_certificate",
      "replacement_student_card",
      "grade_appeal",
      "october_exam_entry_form",
    ]) {
      expect(src).toContain(label);
    }
    expect(src).toContain("isTestOnlyRequest");
    expect(src).toContain("REQUESTS_E2E");
  });
});

describe("mobile academic self report", () => {
  const viewer = emptyCatalogViewer({
    roles: ["student"],
    studentProfileId: "11111111-1111-1111-1111-111111111111",
  });

  test("catalog exposes only an operational academic destination", () => {
    const items = projectStudentSelfReports(REPORT_CATALOG_ENTRIES, viewer, {
      surface: "mobile",
    });
    expect(items.some((item) => item.title === "بياناتي الأكاديمية")).toBe(true);
    expect(items.find((item) => item.title === "بياناتي الأكاديمية")?.to).toBe(
      "/mobile/student/profile",
    );
    expect(items.some((item) => item.title.includes("خطة المحاضرات"))).toBe(false);
  });

  test("academic page loads self-scoped summary and renders current status", () => {
    const src = read("src/routes/mobile.student.profile.tsx");
    expect(src).toContain("getStudentSelfReportsSummary");
    expect(src).toContain("الحالة والقيد الأكاديمي");
    expect(src).toContain("العام الأكاديمي");
    expect(src).toContain("الفصل الحالي");
    expect(src).toContain("activeEnrollments");
    expect(src).toContain("openRequests");
    expect(src).toContain("issuedDocuments");
  });

  test("reports page has distinct page and list headings", () => {
    const src = read("src/routes/mobile.student.reports.tsx");
    expect(src).toContain('title="التقارير المتاحة"');
  });
});
