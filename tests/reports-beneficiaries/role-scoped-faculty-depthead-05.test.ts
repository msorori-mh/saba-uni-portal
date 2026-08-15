/**
 * PORTAL_DR_RAMZI_ROLE_SCOPED_REPORTS_GP_COUNCILS_FIX_05
 * Faculty / department-head role-scoped report projection.
 */

import { describe, expect, it } from "vitest";
import { REPORT_CATALOG_ENTRIES } from "@/lib/reports/catalog";
import { emptyCatalogViewer } from "@/lib/reports/catalog/viewer-scope";
import {
  buildRoleScopedReportSections,
  resolveViewerReportRoute,
} from "@/lib/reports/catalog/role-scoped-view";

const ramzi = emptyCatalogViewer({
  roles: ["faculty_member", "department_head"],
  facultyProfileId: "fac-1",
  departmentId: "dept-1",
  denied: false,
  denyReasonAr: null,
});

const sections = buildRoleScopedReportSections(REPORT_CATALOG_ENTRIES, ramzi, {
  departmentNameAr: "قسم تكنولوجيا المعلومات",
});
const allItems = sections.flatMap((s) => s.items);

describe("role-scoped faculty/department-head reports", () => {
  it("never hands an /admin destination to a non-admin viewer", () => {
    for (const item of allItems) {
      expect(item.route.startsWith("/admin")).toBe(false);
    }
  });

  it("never advertises a parameterized route as an operational destination", () => {
    for (const item of allItems) expect(item.route).not.toContain("$");
  });

  it("only advertises LIVE reports", () => {
    for (const item of allItems) expect(item.entry.status).toBe("LIVE");
  });

  it("only advertises faculty/department facets", () => {
    for (const item of allItems) {
      const beneficiaries = new Set(item.entry.beneficiaries);
      expect(
        beneficiaries.has("faculty_supervisor") ||
          beneficiaries.has("dept_head_coordinator"),
      ).toBe(true);
    }
  });

  it("excludes university-wide aggregates", () => {
    for (const item of allItems) {
      expect(item.entry.data_scope.toLowerCase()).not.toContain("university");
    }
  });

  it("uses at most two sections, titled by role scope", () => {
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.length).toBeLessThanOrEqual(2);
    expect(sections[0]!.titleAr).toBe("تقاريري الأكاديمية");
    const dept = sections.find((s) => s.key === "department");
    if (dept) expect(dept.titleAr).toContain("قسم تكنولوجيا المعلومات");
  });

  it("gives a plain faculty member no department section", () => {
    const faculty = emptyCatalogViewer({
      roles: ["faculty_member"],
      facultyProfileId: "fac-2",
      departmentId: "dept-1",
      denied: false,
      denyReasonAr: null,
    });
    const facultySections = buildRoleScopedReportSections(
      REPORT_CATALOG_ENTRIES,
      faculty,
    );
    expect(facultySections.some((s) => s.key === "department")).toBe(false);
  });

  it("prefers the faculty destination over the admin alternative", () => {
    const entry = REPORT_CATALOG_ENTRIES.find(
      (e) => e.report_code === "DEPT-ACADEMIC-LOAD",
    )!;
    expect(resolveViewerReportRoute(entry, ["department_head"])).toBe(
      "/faculty-portal/department-reports",
    );
    expect(resolveViewerReportRoute(entry, ["admin"])).toBe(
      "/admin/department-reports",
    );
  });
});
