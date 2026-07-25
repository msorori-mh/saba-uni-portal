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
import {
  dashboardMetric,
  formatDashboardMetric,
} from "../../src/components/portal/dashboard-metrics";
import {
  DashboardMetricValue,
  DashboardQueryError,
} from "../../src/components/portal/DashboardStates";

const root = join(import.meta.dir, "../..");
/** Normalize CRLF so newline-sensitive contracts stay green under Windows autocrlf. */
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

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
    expect(studentDashboard).toContain("profileFetched && !profile");
    expect(studentDashboard).toContain("refetchProfile");
    expect(studentDashboard).toContain("تعذّر تحميل ملفك الأكاديمي");
  });

  test("registered-courses failure shows an error, not a fake empty state", () => {
    expect(studentDashboard).toContain("enrollmentsError");
    expect(studentDashboard).toContain("enrollmentsLoading");
    expect(studentDashboard).toContain("تعذّر تحميل مقرراتك المسجلة");
    // The genuine empty state still exists for the truly empty case.
    expect(studentDashboard).toContain("لم يتم تسجيلك في أي مجموعة دراسية بعد");
  });

  test("grades failure shows an error, not a fake empty state", () => {
    expect(studentDashboard).toContain("isError");
    expect(studentDashboard).toContain("تعذّر تحميل درجاتك");
    expect(studentDashboard).toContain("لا توجد درجات معتمدة حالياً.");
  });

  test("schedule has distinct loading, error, empty, and success branches", () => {
    expect(studentDashboard).toContain("scheduleLoading");
    expect(studentDashboard).toContain("academicStatusError || scheduleError");
    expect(studentDashboard).toContain("تعذّر تحميل جدولك الدراسي");
    expect(studentDashboard).toContain("لا توجد محاضرات مجدولة حاليًا");
  });

  test("logout clears identity-keyed cached dashboard data", () => {
    expect(studentDashboard).toContain("useQueryClient");
    expect(studentDashboard).toContain("queryClient.clear()");
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
    expect(facultyDashboard).toContain("profileFetched && !profile");
    expect(facultyDashboard).toContain("تعذّر تحميل ملفك الوظيفي");
  });

  test("teaching failure shows an error, not a fake empty state", () => {
    expect(facultyDashboard).toContain("teachingError");
    expect(facultyDashboard).toContain("teachingLoading");
    expect(facultyDashboard).toContain("تعذّر تحميل جدولك التدريسي");
    expect(facultyDashboard).toContain("لا توجد مجموعات مرتبطة بك حالياً.");
  });

  test("section students failure shows an error, not a fake empty state", () => {
    expect(facultyDashboard).toContain("تعذّر تحميل قائمة الطلاب");
    expect(facultyDashboard).toContain("onRetry={() => void refetch()}");
  });

  test("logout clears cached faculty and student-scope data", () => {
    expect(facultyDashboard).toContain("useQueryClient");
    expect(facultyDashboard).toContain("queryClient.clear()");
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
    expect(adminDashboard).toContain("<DashboardMetricValue value={c.value} />");
    expect(adminDashboard).toContain("dashboardMetric");
  });

  test("query failures surface a partial-error banner with retry", () => {
    expect(adminDashboard).toContain("anyQueryError");
    expect(adminDashboard).toContain("admin-dashboard-partial-error");
    expect(adminDashboard).toContain("تعذّر تحميل بعض المؤشرات");
  });

  test("recent documents failure shows an error, not a fake empty state", () => {
    expect(adminDashboard).toContain("recentDocsQ.isPending");
    expect(adminDashboard).toContain("جارٍ تحميل آخر الوثائق");
    expect(adminDashboard).toContain("recentDocsQ.isError");
    expect(adminDashboard).toContain("تعذّر تحميل آخر الوثائق");
    expect(adminDashboard).toContain("لا توجد وثائق صادرة بعد.");
  });

  test("readiness cards degrade to WARNING on query failure instead of lying", () => {
    expect(adminDashboard).toMatch(
      /adminCountsQ\.isPending \|\| adminCountsQ\.isError\s*\n\s*\?\s*"WARNING"/,
    );
    expect(adminDashboard).toContain('adminCountsQ.isPending\n                ? "جارٍ التحقق"');
    expect(adminDashboard).toContain("تعذّر التحقق");
    expect(adminDashboard).toMatch(/hardeningQ\.isPending\s*\n\s*\?\s*"جارٍ التحقق"/);
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
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('tabindex="-1"');
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

  test("unavailable metric dash has an accessible name and real zero remains zero", () => {
    const unavailable = renderToStaticMarkup(createElement(DashboardMetricValue, { value: null }));
    const zero = renderToStaticMarkup(createElement(DashboardMetricValue, { value: 0 }));
    expect(unavailable).toContain('aria-label="القيمة غير متاحة"');
    expect(unavailable).toContain("—");
    expect(zero).toContain(">٠<");
    expect(zero).not.toContain("القيمة غير متاحة");
  });

  test("new shared presentation helpers do not import Supabase or expose technical identifiers", () => {
    const states = read("src/components/portal/DashboardStates.tsx");
    const metrics = read("src/components/portal/dashboard-metrics.ts");
    for (const source of [states, metrics]) {
      expect(source).not.toMatch(
        /integrations\/supabase|@supabase|error\.message|user_id|profile_id/i,
      );
    }
  });

  test("student and faculty reads stay bound to their own authoritative profile scope", () => {
    expect(studentDashboard).toContain('.eq("student_profile_id", studentId)');
    expect(facultyDashboard).toContain('.eq("faculty_profile_id", facultyProfileId)');
    expect(facultyDashboard).not.toMatch(/isAdmin\s*\?\s*\[\]|department_id\s*\?\?/);
  });
});
