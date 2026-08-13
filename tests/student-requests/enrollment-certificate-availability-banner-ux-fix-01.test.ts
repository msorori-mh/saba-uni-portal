import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getStudentRequestUiEligibility } from "../../src/lib/student-requests/request-eligibility-ui";
import {
  getStudentRequestFormDefinition,
  validateStudentRequestFormValues,
} from "../../src/lib/student-requests/request-form-registry";

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

describe("enrollment certificate availability banner UX fix", () => {
  it("keeps an eligible pristine empty form available without blocking reasons", () => {
    const result = getStudentRequestUiEligibility({
      requestTypeCode: "enrollment_certificate",
      typePickerState: eligiblePicker,
      studentContext: activeStudent,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: false,
    });
    expect(result.badge).toBe("available");
    expect(result.blockedReasons).toEqual([]);
    expect(result.canSubmit).toBe(false);
  });
  it("keeps field validation separate after an attempted submit", () => {
    expect(emptyValidation.valid).toBe(false);
    expect(emptyValidation.missingFields).toEqual(["purpose", "copies_count", "recipient"]);
    const result = getStudentRequestUiEligibility({
      requestTypeCode: "enrollment_certificate",
      typePickerState: eligiblePicker,
      studentContext: activeStudent,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: true,
    });
    expect(result.badge).toBe("available");
    expect(result.blockedReasons).toEqual([]);
  });
  it("shows only a real RPC/picker denial as blocking", () => {
    const result = getStudentRequestUiEligibility({
      requestTypeCode: "enrollment_certificate",
      typePickerState: { ...eligiblePicker, is_eligible: false, disabled_reason: "قرار منع موثوق" },
      studentContext: activeStudent,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: false,
    });
    expect(result.badge).toBe("blocked");
    expect(result.blockedReasons).toEqual(["قرار منع موثوق"]);
  });
  it("classifies service description as information, never a blocking reason", () => {
    const result = getStudentRequestUiEligibility({
      requestTypeCode: "enrollment_certificate",
      typePickerState: eligiblePicker,
      studentContext: activeStudent,
      formSupported: true,
    });
    expect(result.notices.some((n) => n.includes("خدمة داخلية"))).toBe(true);
    expect(result.blockedReasons.some((n) => n.includes("خدمة داخلية"))).toBe(false);
  });
  it("does not flash blocked while eligibility context is unresolved", () => {
    const result = getStudentRequestUiEligibility({
      requestTypeCode: "enrollment_certificate",
      typePickerState: null,
      studentContext: null,
      formSupported: true,
      formValidation: emptyValidation,
      hasSubject: false,
    });
    expect(result.badge).toBe("needs_verification");
    expect(result.blockedReasons).toEqual([]);
    expect(result.canSubmit).toBe(false);
  });
  it("renders neutral information and inline errors without changing protected contracts", () => {
    const notice = readFileSync(
      join(process.cwd(), "src/components/student-requests/StudentRequestEligibilityNotice.tsx"),
      "utf8",
    );
    const form = readFileSync(
      join(process.cwd(), "src/components/student-requests/DynamicStudentRequestForm.tsx"),
      "utf8",
    );
    const route = readFileSync(join(process.cwd(), "src/components/student-requests/NewStudentRequestScreen.tsx"), "utf8");
    expect(notice).toContain("border-blue-200 bg-blue-50");
    expect(notice).not.toMatch(/eligibility\.notices\.map[\s\S]{0,500}أسباب المنع/);
    expect(form).toContain('role="alert" className="text-[11px] text-destructive"');
    expect(route).toContain("submitAttempted");
    expect(route).toContain("noValidate");
    expect(route).toContain('eligibilityDecision.badge === "available"');
    for (const source of [notice, form, route]) expect(source).not.toContain("student_visible");
  });
});
