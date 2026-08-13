import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_CATALOG_ENTRIES, emptyCatalogViewer } from "@/lib/reports/catalog";
import {
  projectStudentSelfReports,
  STUDENT_FORBIDDEN_REPORT_FIELDS,
} from "@/lib/reports/student-projection";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const studentViewer = (overrides = {}) =>
  emptyCatalogViewer({
    roles: ["student"],
    studentProfileId: "11111111-1111-1111-1111-111111111111",
    denied: false,
    denyReasonAr: null,
    ...overrides,
  });

describe("student report projection is technical-metadata free", () => {
  const items = projectStudentSelfReports(REPORT_CATALOG_ENTRIES, studentViewer());

  test("returns at least one self-only item", () => {
    expect(items.length).toBeGreaterThan(0);
  });

  test("payload keys are exactly id/title/summary/to", () => {
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["id", "summary", "title", "to"]);
    }
  });

  test("no forbidden field name or value ever reaches the client payload", () => {
    const serialized = JSON.stringify(items);
    for (const field of STUDENT_FORBIDDEN_REPORT_FIELDS) {
      expect(serialized).not.toContain(field);
    }
    for (const entry of REPORT_CATALOG_ENTRIES) {
      expect(serialized).not.toContain(entry.report_code);
      if (entry.route) expect(serialized).not.toContain(entry.route);
      for (const dep of entry.dependencies) expect(serialized).not.toContain(dep);
      for (const ev of entry.evidence) expect(serialized).not.toContain(ev);
    }
    for (const token of [
      "sensitivity",
      "personal",
      "internal",
      "university",
      "faculty_supervisor",
      "dept_head_coordinator",
      "vp_academic_affairs",
      "operational_units_staff",
      "LIVE",
      "DATA_DEPENDENT",
      "/admin",
      "/faculty-portal",
    ]) {
      expect(serialized).not.toContain(token);
    }
  });

  test("ids are opaque, not catalog codes", () => {
    for (const item of items) expect(item.id).toMatch(/^r-[0-9a-z]+$/);
  });

  test("non-student viewers get nothing", () => {
    const denied = projectStudentSelfReports(
      REPORT_CATALOG_ENTRIES,
      emptyCatalogViewer({ roles: ["student"], studentProfileId: null }),
    );
    expect(denied).toEqual([]);
  });

  test("mobile surface never emits /student/* destinations", () => {
    const mobileItems = projectStudentSelfReports(
      REPORT_CATALOG_ENTRIES,
      studentViewer(),
      { surface: "mobile" },
    );
    for (const item of mobileItems) {
      expect(item.to.startsWith("/mobile")).toBe(true);
    }
  });

  test("graduation-project gated items require canonical L4", () => {
    const l1 = projectStudentSelfReports(REPORT_CATALOG_ENTRIES, studentViewer(), {
      fourthLevelEligible: false,
    });
    expect(JSON.stringify(l1)).not.toContain("graduation");
    expect(JSON.stringify(l1)).not.toContain("مشروع التخرج");
  });
});

describe("student reports UI uses the safe projection, not the generic catalog", () => {
  const page = read("src/routes/student.reports.tsx");
  const list = read("src/components/reports/StudentSelfReportsList.tsx");

  test("page renders the student-safe list", () => {
    expect(page).toContain("StudentSelfReportsList");
    expect(page).toContain("getStudentSelfReportCatalog");
    expect(page).not.toContain("REPORT_CATALOG_ENTRIES");
    expect(page).not.toContain("viewerRoles");
  });

  test("no beneficiary groups or technical tags in the student list UI", () => {
    for (const token of [
      "ReportCard",
      "beneficiaries",
      "report_code",
      "sensitivity",
      "data_scope",
      "required_role",
      "هيئة التدريس",
      "رئيس القسم",
      "منسق",
    ]) {
      expect(list).not.toContain(token);
    }
  });
});
