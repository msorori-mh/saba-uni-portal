import { describe, expect, it } from "bun:test";
import {
  B1_EXCUSE_REASON_TYPES,
  B1_VALIDATION_MESSAGES_AR,
  b1ValidationMessageAr,
  validateAbsenceDateOrder,
  validateB1FormValues,
  validateDepartmentTransferTarget,
} from "@/lib/student-requests/b1-ui/validation";
import { B1_SERVICE_ADAPTERS } from "@/lib/student-requests/request-service-adapter";

describe("validateB1FormValues — required fields per service", () => {
  it("requires all suspension fields", () => {
    const result = validateB1FormValues("enrollment_suspension", {});
    expect(result.valid).toBe(false);
    expect(result.errors.target_academic_year).toBe("required");
    expect(result.errors.target_semester).toBe("required");
    expect(result.errors.suspension_reason).toBe("required");
    expect(result.errors.terms_acknowledgment).toBe("required_true");
  });

  it("accepts a complete suspension form", () => {
    const result = validateB1FormValues("enrollment_suspension", {
      target_academic_year: "mock-year-1447",
      target_semester: "mock-sem-first",
      suspension_reason: "سبب تجريبي",
      suspension_duration_type: "one_semester",
      terms_acknowledgment: true,
    });
    expect(result).toEqual({ valid: true, errors: {} });
  });

  it("rejects an unknown suspension duration type", () => {
    const result = validateB1FormValues("enrollment_suspension", {
      target_academic_year: "y",
      target_semester: "s",
      suspension_reason: "r",
      suspension_duration_type: "two_years",
      terms_acknowledgment: true,
    });
    expect(result.errors.suspension_duration_type).toBe("unknown_duration_type");
  });

  it("requires absence fields plus a secure attachment reference", () => {
    const result = validateB1FormValues("excused_absence", {});
    expect(result.errors.course_section_id).toBe("required");
    expect(result.errors.absence_date).toBe("required");
    expect(result.errors.reason_type).toBe("required");
    expect(result.errors.absence_reason_detail).toBe("required");
    expect(result.errors.excuse_documents).toBe("secure_attachment_required");
  });

  it("requires transfer target fields", () => {
    const result = validateB1FormValues("department_transfer", {});
    expect(result.errors.target_department_id).toBe("required");
    expect(result.errors.target_program_id).toBe("required");
    expect(result.errors.transfer_reason).toBe("required");
  });

  it("enforces the final-chance requirements and chance type", () => {
    const missing = validateB1FormValues("final_chance", {});
    expect(missing.errors.target_academic_year).toBe("required");
    expect(missing.errors.target_semester).toBe("required");
    expect(missing.errors.reason).toBe("required");

    const wrongType = validateB1FormValues("final_chance", {
      target_academic_year: "y",
      target_semester: "s",
      reason: "r",
      chance_type: "additional_exam",
    });
    expect(wrongType.errors.chance_type).toBe("unknown_chance_type");
  });

  it("enforces withdrawal minimum length and acknowledgment", () => {
    const result = validateB1FormValues("file_withdrawal", { withdrawal_reason: "قصير" });
    expect(result.errors.withdrawal_reason).toBe("minimum_10");
    expect(result.errors.impact_acknowledgment).toBe("required_true");

    const valid = validateB1FormValues("file_withdrawal", {
      withdrawal_reason: "سبب طويل بما يكفي لسحب الملف",
      impact_acknowledgment: true,
    });
    expect(valid).toEqual({ valid: true, errors: {} });
  });

  it("fails closed on unknown service codes", () => {
    expect(() => validateB1FormValues("grade_appeal", {})).toThrow();
  });
});

describe("validateAbsenceDateOrder", () => {
  it("accepts an empty end date (optional field)", () => {
    expect(validateAbsenceDateOrder("2026-03-10", "").valid).toBe(true);
    expect(validateAbsenceDateOrder("2026-03-10", undefined).valid).toBe(true);
  });

  it("accepts end >= start and rejects end < start", () => {
    expect(validateAbsenceDateOrder("2026-03-10", "2026-03-10").valid).toBe(true);
    expect(validateAbsenceDateOrder("2026-03-10", "2026-03-12").valid).toBe(true);
    const result = validateAbsenceDateOrder("2026-03-10", "2026-03-09");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("date_order");
  });

  it("surfaces date_order through validateB1FormValues", () => {
    const result = validateB1FormValues("excused_absence", {
      course_section_id: "mock-course-cs101",
      absence_date: "2026-03-10",
      absence_end_date: "2026-03-09",
      reason_type: "medical",
      absence_reason_detail: "ظرف طبي",
      excuse_documents: { fileName: "a.pdf", storagePath: "mock://attachments/x" },
    });
    expect(result.errors.absence_end_date).toBe("date_order");
  });
});

describe("validateDepartmentTransferTarget", () => {
  it("blocks selecting the current department (same_department)", () => {
    const result = validateDepartmentTransferTarget("mock-dept-cs", "mock-dept-cs");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("same_department");
    expect(validateDepartmentTransferTarget("mock-dept-cs", "mock-dept-is").valid).toBe(true);
    expect(validateDepartmentTransferTarget(undefined, "mock-dept-is").valid).toBe(true);
  });

  it("surfaces same_department through validateB1FormValues", () => {
    const result = validateB1FormValues("department_transfer", {
      current_department_id: "mock-dept-cs",
      target_department_id: "mock-dept-cs",
      target_program_id: "mock-prog-cs-bsc",
      transfer_reason: "سبب تجريبي",
    });
    expect(result.errors.target_department_id).toBe("same_department");
  });
});

describe("excuse reason vocabulary", () => {
  it("matches the backend validator vocabulary", () => {
    expect([...B1_EXCUSE_REASON_TYPES]).toEqual([
      "medical",
      "family_emergency",
      "official",
      "other",
    ]);
  });

  it("rejects reason types outside the vocabulary", () => {
    const result = validateB1FormValues("excused_absence", {
      course_section_id: "mock-course-cs101",
      absence_date: "2026-03-10",
      reason_type: "vacation",
      absence_reason_detail: "ظرف",
      excuse_documents: { fileName: "a.pdf", storagePath: "mock://attachments/x" },
    });
    expect(result.errors.reason_type).toBe("unknown_reason_type");
  });
});

describe("B1_VALIDATION_MESSAGES_AR", () => {
  it("has an Arabic message for every error key the validators can emit", () => {
    const emittedKeys = new Set<string>();
    for (const adapter of Object.values(B1_SERVICE_ADAPTERS)) {
      const { errors } = adapter.validate({});
      Object.values(errors).forEach((key) => emittedKeys.add(key));
    }
    // UI-only keys and mock adapter keys on top of backend-emitted keys.
    [
      ...emittedKeys,
      "date_order",
      "same_department",
      "unknown_reason_type",
      "unknown_chance_type",
      "attachment_too_large",
      "unsupported_attachment_type",
      "attachment_not_found",
      "not_draft",
      "comment_required",
      "unknown_service",
    ].forEach((key) => {
      const message = B1_VALIDATION_MESSAGES_AR[key];
      expect(message, `missing Arabic message for "${key}"`).toBeTruthy();
      expect(message!.trim().length).toBeGreaterThan(0);
    });
  });

  it("falls back safely for unknown keys", () => {
    expect(b1ValidationMessageAr("nonexistent_key").length).toBeGreaterThan(0);
  });
});
