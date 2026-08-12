/**
 * PORTAL-ENROLLMENT-CERTIFICATE-VIOLATION-BANNER-TRUTHFULNESS-UX-01
 *
 * Regression guards for violation-banner truthfulness in the enrollment
 * certificate (and student requests) flow: red only for a proven
 * backend-backed violation, never on normal open / loading / undefined,
 * and never any raw backend error text.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentRequestEligibilityNotice } from "../../src/components/student-requests/StudentRequestEligibilityNotice";
import {
  getStudentRequestFormDefinition,
  validateStudentRequestFormValues,
} from "../../src/lib/student-requests/request-form-registry";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const detailRoute = read("src/routes/student.requests.$id.tsx");
const indexRoute = read("src/routes/student.requests.index.tsx");
const newRoute = read("src/routes/student.requests.new.tsx");
const noticeSource = read("src/components/student-requests/StudentRequestEligibilityNotice.tsx");

const eligiblePicker = {
  is_eligible: true,
  is_disabled: false,
  request_audience: "active_student",
};
const activeStudent = { studentStatus: "active", isActiveStudent: true, isGraduate: false };
const emptyValidation = validateStudentRequestFormValues(
  getStudentRequestFormDefinition("enrollment_certificate")!,
  {},
);

const renderNotice = (props: Parameters<typeof StudentRequestEligibilityNotice>[0]) =>
  renderToStaticMarkup(createElement(StudentRequestEligibilityNotice, props));

describe("violation banner truthfulness — visual classification", () => {
  it("renders no red banner on a normal eligible open", () => {
    const html = renderNotice({
      requestTypeCode: "enrollment_certificate",
      typePickerState: eligiblePicker,
      studentContext: activeStudent,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: false,
    });
    expect(html).not.toContain("bg-rose-100");
    expect(html).not.toContain("أسباب المنع");
    // Service information stays informational (blue), never error-styled.
    expect(html).toContain("border-blue-200 bg-blue-50");
    expect(html).toContain("معلومات الخدمة");
  });

  it("renders no red banner while eligibility context is loading/undefined", () => {
    const html = renderNotice({
      requestTypeCode: "enrollment_certificate",
      typePickerState: null,
      studentContext: null,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: false,
    });
    expect(html).not.toContain("bg-rose-100");
    // Unresolved verification degrades to a soft amber hint, not an error.
    expect(html).toContain("bg-amber-50/70");
  });

  it("shows the red banner only for a proven backend-backed violation", () => {
    const html = renderNotice({
      requestTypeCode: "enrollment_certificate",
      typePickerState: {
        ...eligiblePicker,
        is_eligible: false,
        disabled_reason: "يوجد طلب نشط مسبق لهذه الخدمة.",
      },
      studentContext: activeStudent,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: true,
    });
    expect(html).toContain("bg-rose-100");
    expect(html).toContain("يوجد طلب نشط مسبق لهذه الخدمة.");
    expect(html).toContain('role="alert"');
  });

  it("hides creation eligibility entirely for every post-draft lifecycle state", () => {
    for (const status of [
      "submitted",
      "in_review",
      "processing",
      "completed",
      "archived",
      "cancelled",
      "rejected",
      "returned_for_completion",
    ]) {
      const html = renderNotice({
        requestTypeCode: "enrollment_certificate",
        typePickerState: eligiblePicker,
        studentContext: activeStudent,
        formSupported: true,
        formValidation: emptyValidation,
        hasSubject: true,
        existingRequestStatus: status,
      });
      expect(html, status).toBe("");
    }
  });
});

describe("no raw backend errors in student request routes", () => {
  it("never renders error.message raw in the three certificate-facing routes", () => {
    for (const [name, source] of [
      ["detail", detailRoute],
      ["index", indexRoute],
      ["new", newRoute],
    ] as const) {
      expect(/\.message\s*\}/.test(source), name).toBe(false);
      expect(/\(e as Error\)\.message/.test(source), name).toBe(false);
      expect(/\(error as Error\)\?\.message/.test(source), name).toBe(false);
    }
  });

  it("detail and index failures render safe generic Arabic alerts", () => {
    expect(detailRoute).toContain("تعذّر تحميل الطلب. تحقق من الاتصال ثم أعد المحاولة لاحقاً.");
    expect(indexRoute).toContain("تعذّر تحميل الطلبات. تحقق من الاتصال ثم حاول مرة أخرى.");
    expect(newRoute).toContain("تعذّر إرسال الطلب. تحقق من الاتصال ثم أعد المحاولة");
  });

  it("keeps role=alert on failure surfaces for screen readers", () => {
    expect(detailRoute).toContain('role="alert"');
    expect(indexRoute).toContain('role="alert"');
    expect(newRoute).toContain('role="alert"');
  });

  it("does not turn a request-type permission failure into an empty state", () => {
    expect(newRoute).toContain("typesError ? (");
    expect(newRoute).toContain("تعذّر تحميل أنواع الطلبات. أعد المحاولة أو حدّث الصفحة.");
    expect(newRoute.indexOf("typesError ? (")).toBeLessThan(
      newRoute.indexOf("typedTypes.length === 0 ? ("),
    );
  });

  it("touches nothing protected (student_visible / workflow / B1 services)", () => {
    for (const source of [detailRoute, indexRoute, newRoute, noticeSource]) {
      expect(source).not.toContain("student_visible");
    }
  });
});
