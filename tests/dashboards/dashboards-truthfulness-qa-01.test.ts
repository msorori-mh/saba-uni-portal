/**
 * PORTAL-DASHBOARDS-UX-TRUTHFULNESS-AND-EMPTY-STATES-QA-01
 *
 * Regression guards for dashboard truthfulness: no fabricated metrics, no
 * lying empty states on query failure, no raw backend errors, RTL/a11y
 * basics. Source contracts + static renders (no DOM in this repo).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardQueryError } from "../../src/components/portal/DashboardStates";
import {
  dashboardMetric,
  formatDashboardMetric,
} from "../../src/components/portal/dashboard-metrics";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const studentDashboard = read("src/routes/student.index.tsx");
const facultyDashboard = read("src/routes/faculty-portal.index.tsx");
const adminDashboard = read("src/routes/admin/index.lazy.tsx");

describe("student dashboard truthfulness", () => {
  test("grades/enrollments queries use the real supabase client (no stray identifiers)", () => {
    expect(studentDashboard).not.toMatch(/\bsb\.from\(/);
    expect(studentDashboard).toMatch(/supabase\s*\n\s*\.from\("student_grades"\)/);
  });

  test("profile failure shows a retryable error instead of an infinite skeleton", () => {
    expect(studentDashboard).toContain("profileError");
    expect(studentDashboard).toContain("refetchProfile");
    expect(studentDashboard).toContain("تعذّر تحميل ملفك الأكاديمي");
  });

  test("registered-courses failure shows an error, not a fake empty state", () => {
    expect(studentDashboard).toContain("enrollmentsError");
    expect(studentDashboard).toContain("تعذّر تحميل مقرراتك المسجلة");
    // The genuine empty state still exists for the truly empty case.
    expect(studentDashboard).toContain("لم يتم تسجيلك في أي مجموعة دراسية بعد");
  });

  test("grades failure shows an error, not a fake empty state", () => {
    expect(studentDashboard).toContain("isError");
    expect(studentDashboard).toContain("تعذّر تحميل درجاتك");
    expect(studentDashboard).toContain("لا توجد درجات معتمدة حالياً.");
  });

  test("never renders the raw backend error message", () => {
    expect(studentDashboard).not.toMatch(/error\.message|err\.message/);
  });
});

describe("faculty dashboard truthfulness and RTL", () => {
  test("main content is RTL-rooted", () => {
    expect(facultyDashboard).toContain('dir="rtl"');
  });

  test("profile failure shows a retryable error", () => {
    expect(facultyDashboard).toContain("profileError");
    expect(facultyDashboard).toContain("تعذّر تحميل ملفك الوظيفي");
  });

  test("teaching failure shows an error, not a fake empty state", () => {
    expect(facultyDashboard).toContain("teachingError");
    expect(facultyDashboard).toContain("تعذّر تحميل جدولك التدريسي");
    expect(facultyDashboard).toContain("لا توجد مجموعات مرتبطة بك حالياً.");
  });

  test("section students failure shows an error, not a fake empty state", () => {
    expect(facultyDashboard).toContain("تعذّر تحميل قائمة الطلاب");
  });

  test("never renders the raw backend error message", () => {
    expect(facultyDashboard).not.toMatch(/error\.message|err\.message/);
  });
});

describe("admin dashboard truthfulness", () => {
  test("no hardcoded metric values remain (fabricated 0/1 cards)", () => {
    expect(adminDashboard).not.toMatch(/value:\s*[01],/);
  });

  test("every metric routes through the truthfulness helper", () => {
    // Cards must not fall back to zero on missing data anymore.
    expect(adminDashboard).not.toMatch(/\?\?\s*0, icon:/);
    expect(adminDashboard).toContain("formatDashboardMetric(c.value)");
    expect(adminDashboard).toContain("dashboardMetric");
  });

  test("query failures surface a partial-error banner with retry", () => {
    expect(adminDashboard).toContain("anyQueryError");
    expect(adminDashboard).toContain("admin-dashboard-partial-error");
    expect(adminDashboard).toContain("تعذّر تحميل بعض المؤشرات");
  });

  test("recent documents failure shows an error, not a fake empty state", () => {
    expect(adminDashboard).toContain("recentDocsQ.isError");
    expect(adminDashboard).toContain("تعذّر تحميل آخر الوثائق");
    expect(adminDashboard).toContain("لا توجد وثائق صادرة بعد.");
  });

  test("readiness cards degrade to WARNING on query failure instead of lying", () => {
    expect(adminDashboard).toMatch(/adminCountsQ\.isError\s*\n\s*\?\s*"WARNING"/);
    expect(adminDashboard).toContain("تعذّر التحقق");
  });

  test("never renders the raw backend error message", () => {
    expect(adminDashboard).not.toMatch(/error\.message|err\.message/);
  });
});

describe("shared dashboard states component", () => {
  test("error block renders role=alert, rtl, and never a raw message", () => {
    const html = renderToStaticMarkup(createElement(DashboardQueryError, { onRetry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("إعادة المحاولة");
    expect(html).not.toMatch(/supabase|postgres|rpc|permission denied for/i);
  });

  test("dashboardMetric hides values while pending/error instead of inventing zero", () => {
    expect(dashboardMetric(5, { isPending: true, isError: false })).toBe(null);
    expect(dashboardMetric(5, { isPending: false, isError: true })).toBe(null);
    expect(dashboardMetric(undefined, { isPending: false, isError: false })).toBe(null);
    expect(dashboardMetric(0, { isPending: false, isError: false })).toBe(0);
    expect(dashboardMetric(42, { isPending: false, isError: false })).toBe(42);
  });

  test("formatDashboardMetric renders a dash for unavailable values", () => {
    expect(formatDashboardMetric(null)).toBe("—");
    expect(formatDashboardMetric(0)).not.toBe("—");
  });
});
