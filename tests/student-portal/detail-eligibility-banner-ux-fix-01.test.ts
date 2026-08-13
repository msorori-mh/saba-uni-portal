/**
 * STUDENT-REQUEST-DETAIL-ELIGIBILITY-BANNER-UX-FIX-01
 *
 * Source-level guards (no DB, no RPC):
 *
 *  1. The student request DETAIL route does NOT import or render the
 *     creation-time eligibility notice.
 *  2. The eligibility notice component hides itself when handed a live
 *     request status (submitted / in_review / processing / completed /
 *     archived).
 *  3. The eligibility notice does NOT render a big red card when the
 *     student is eligible (badge === "available").
 *  4. The eligibility notice renders a blocked (red) card only when
 *     there are actual blockedReasons — the ineligible student path.
 *  5. The new-request route still renders the notice for the creation
 *     flow.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  HIDDEN_FOR_EXISTING_REQUEST,
  StudentRequestEligibilityNotice,
} from "@/components/student-requests/StudentRequestEligibilityNotice";

const ROOT = join(import.meta.dir, "../..");

const DETAIL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StudentRequestDetailsScreen.tsx"),
  "utf-8",
);
const NEW_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/NewStudentRequestScreen.tsx"),
  "utf-8",
);
const COMPONENT_SRC = readFileSync(
  join(
    ROOT,
    "src/components/student-requests/StudentRequestEligibilityNotice.tsx",
  ),
  "utf-8",
);

describe("student request detail: eligibility banner is scoped to creation", () => {
  it("detail route does not import the eligibility notice", () => {
    expect(DETAIL_SRC).not.toContain("StudentRequestEligibilityNotice");
    expect(DETAIL_SRC).not.toContain("request-eligibility-ui");
  });

  it("detail route does not render the blocked eligibility card copy", () => {
    expect(DETAIL_SRC).not.toContain("أسباب المنع");
    expect(DETAIL_SRC).not.toContain("حالة التوفر والأهلية");
  });

  it("new-request route still renders the eligibility notice", () => {
    expect(NEW_SRC).toContain("StudentRequestEligibilityNotice");
  });

  it("component exposes lifecycle statuses that must hide the banner", () => {
    for (const s of ["submitted", "in_review", "processing", "completed", "archived"]) {
      expect(HIDDEN_FOR_EXISTING_REQUEST.has(s)).toBe(true);
    }
  });

  it("component source guards against re-evaluating existing requests", () => {
    expect(COMPONENT_SRC).toContain("existingRequestStatus");
    expect(COMPONENT_SRC).toContain("HIDDEN_FOR_EXISTING_REQUEST");
  });

  it("detail route renders status-specific banners for returned / rejected / cancelled", () => {
    // returned uses the existing showReturnBanner path
    expect(DETAIL_SRC).toContain("showReturnBanner");
    expect(DETAIL_SRC).toContain("طلبك أُعيد إليك للاستكمال");
    // rejected
    expect(DETAIL_SRC).toContain("student-request-rejected-banner");
    expect(DETAIL_SRC).toContain("تم رفض هذا الطلب");
    // cancelled
    expect(DETAIL_SRC).toContain("student-request-cancelled-banner");
    expect(DETAIL_SRC).toContain("تم إلغاء هذا الطلب");
  });

  it("detail route does not use the eligibility card for lifecycle banners", () => {
    // Guardrail: status-specific banners must not fall back to the eligibility
    // component or copy.
    expect(DETAIL_SRC).not.toContain("StudentRequestEligibilityNotice");
    expect(DETAIL_SRC).not.toContain("حالة التوفر والأهلية");
  });
});

function render(props: Parameters<typeof StudentRequestEligibilityNotice>[0]) {
  return renderToStaticMarkup(createElement(StudentRequestEligibilityNotice, props));
}

describe("StudentRequestEligibilityNotice render behavior", () => {
  const basePickerEligible = {
    is_eligible: true,
    is_disabled: false,
    disabled_reason: null,
    request_audience: "active_student" as const,
    ineligible_display_mode: "hidden" as const,
  };
  const baseCtx = {
    studentStatus: "active",
    isActiveStudent: true,
    isGraduate: false,
  };

  it("renders nothing for a submitted existing request even if inputs would block", () => {
    const html = render({
      requestTypeCode: "enrollment_certificate",
      typePickerState: {
        is_eligible: false,
        is_disabled: true,
        disabled_reason: "غير مؤهل",
        request_audience: "active_student",
        ineligible_display_mode: "hidden",
      },
      studentContext: baseCtx,
      formValidation: { valid: true },
      serviceWindow: { checked: false },
      formSupported: true,
      hasSubject: true,
      existingRequestStatus: "submitted",
    });
    expect(html).toBe("");
  });

  it("renders nothing for in_review / completed existing requests", () => {
    for (const status of ["in_review", "completed", "archived", "processing"]) {
      const html = render({
        requestTypeCode: "enrollment_certificate",
        typePickerState: basePickerEligible,
        studentContext: baseCtx,
        formValidation: { valid: true },
        serviceWindow: { checked: false },
        formSupported: true,
        hasSubject: true,
        existingRequestStatus: status,
      });
      expect(html).toBe("");
    }
  });

  it("renders nothing on the creation page for an eligible student (no red card)", () => {
    const html = render({
      requestTypeCode: "enrollment_certificate",
      typePickerState: basePickerEligible,
      studentContext: baseCtx,
      formValidation: { valid: true },
      serviceWindow: { checked: false },
      formSupported: true,
      hasSubject: true,
    });
    // Contract: eligible students must not see a blocked/red card. Optional
    // blue service-information notices (role=note) are allowed UX, not a deny.
    expect(html).not.toContain("bg-rose-100");
    expect(html).not.toContain("أسباب المنع");
    expect(html).not.toContain('role="alert"');
    if (html.length > 0) {
      expect(html).toContain("معلومات الخدمة");
      expect(html).toContain('role="note"');
    }
  });

  it("renders a blocked red card on the creation page for an ineligible student", () => {
    const html = render({
      requestTypeCode: "enrollment_certificate",
      typePickerState: {
        is_eligible: false,
        is_disabled: false,
        disabled_reason: "الحساب غير مؤهل",
        request_audience: "active_student",
        ineligible_display_mode: "hidden",
      },
      studentContext: baseCtx,
      formValidation: { valid: true },
      serviceWindow: { checked: false },
      formSupported: true,
      hasSubject: true,
    });
    expect(html).toContain("أسباب المنع");
    expect(html).toContain("الحساب غير مؤهل");
    expect(html).toContain("role=\"alert\"");
    expect(html).toContain("bg-rose-100");
  });

  it("renders a compact non-red hint for needs_verification", () => {
    const html = render({
      requestTypeCode: "enrollment_suspension", // service-window type → needs_verification
      typePickerState: basePickerEligible,
      studentContext: baseCtx,
      formValidation: { valid: true },
      serviceWindow: { checked: false },
      formSupported: true,
      hasSubject: true,
    });
    expect(html).not.toContain("bg-rose-100");
    expect(html).not.toContain("أسباب المنع");
    expect(html).toContain("role=\"note\"");
  });
});
