import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildB1StudentFormSummaryItems } from "@/lib/student-requests/b1-ui/form-summary";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import type { B1CanonicalCode } from "@/lib/student-requests/request-service-adapter";

const FIVE: readonly B1CanonicalCode[] = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
];

const SNAKE_CASE_KEY = /^[a-z]+(?:_[a-z0-9]+)+$/;

describe("buildB1StudentFormSummaryItems — Arabic student tracking", () => {
  test("absence_date uses Arabic field title (not the snake_case key)", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "excused_absence",
      formData: {
        absence_date: "2026-07-01",
        reason_type: "medical",
        absence_reason_detail: "ظرف طبي",
      },
    });
    const dateRow = items.find((item) => item.labelAr === "تاريخ بداية الغياب");
    expect(dateRow).toBeTruthy();
    expect(items.some((item) => item.labelAr === "absence_date")).toBe(false);
    expect(dateRow?.valueAr).not.toBe("absence_date");
  });

  test("one_semester renders as Arabic option label", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "enrollment_suspension",
      formData: {
        suspension_duration_type: "one_semester",
        suspension_reason: "ظرف عائلي",
        terms_acknowledgment: true,
      },
    });
    const duration = items.find((item) => item.labelAr === "مدة وقف القيد");
    expect(duration?.valueAr).toBe("فصل دراسي واحد");
    expect(items.some((item) => item.valueAr === "one_semester")).toBe(false);
    expect(items.some((item) => item.labelAr === "one_semester")).toBe(false);
  });

  test("target_program_id and target_department_id show Arabic names from options", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "department_transfer",
      formData: {
        target_department_id: "d1",
        target_program_id: "p1",
        transfer_reason: "سبب",
      },
      options: {
        serviceCode: "department_transfer",
        academicYears: [],
        semestersByYear: {},
        currentEnrollments: [],
        availableDepartments: [{ value: "d1", labelAr: "قسم علوم الحاسوب" }],
        programsByDepartment: {
          d1: [{ value: "p1", labelAr: "برنامج هندسة البرمجيات" }],
        },
        currentDepartmentLabelAr: "قسم الرياضيات",
        currentProgramLabelAr: "برنامج الرياضيات التطبيقية",
        excuseReasonTypes: [],
      },
    });
    expect(items.find((i) => i.labelAr === "القسم المطلوب")?.valueAr).toBe("قسم علوم الحاسوب");
    expect(items.find((i) => i.labelAr === "البرنامج المطلوب")?.valueAr).toBe(
      "برنامج هندسة البرمجيات",
    );
    expect(items.some((i) => i.labelAr === "target_program_id")).toBe(false);
    expect(items.some((i) => i.labelAr === "target_department_id")).toBe(false);
  });

  test("year / semester / course labels resolve from safe form options", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "enrollment_suspension",
      formData: {
        target_academic_year: "y2026",
        target_semester: "sem1",
        suspension_duration_type: "full_year",
        suspension_reason: "سبب",
        terms_acknowledgment: true,
      },
      options: {
        serviceCode: "enrollment_suspension",
        academicYears: [{ value: "y2026", labelAr: "العام الجامعي 2026/2027" }],
        semestersByYear: {
          y2026: [{ value: "sem1", labelAr: "الفصل الأول" }],
        },
        currentEnrollments: [],
        availableDepartments: [],
        programsByDepartment: {},
        excuseReasonTypes: [],
      },
    });
    expect(items.find((i) => i.labelAr === "العام الجامعي المطلوب")?.valueAr).toBe(
      "العام الجامعي 2026/2027",
    );
    expect(items.find((i) => i.labelAr === "الفصل المطلوب وقف القيد له")?.valueAr).toBe(
      "الفصل الأول",
    );
  });

  test("course/section enrollment option resolves Arabic label for excused absence", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "excused_absence",
      formData: {
        absence_date: "2026-07-01",
        reason_type: "medical",
        absence_reason_detail: "مرض",
        course_section_id: "sec-9",
      },
      options: {
        serviceCode: "excused_absence",
        academicYears: [],
        semestersByYear: {},
        currentEnrollments: [{ value: "sec-9", labelAr: "رياضيات 101 — شعبة أ" }],
        availableDepartments: [],
        programsByDepartment: {},
        excuseReasonTypes: [],
      },
    });
    expect(items.find((i) => i.labelAr === "المقررات المتأثرة")?.valueAr).toBe(
      "رياضيات 101 — شعبة أ",
    );
    expect(items.some((i) => i.labelAr === "course_section_id")).toBe(false);
  });

  test("no snake_case keys appear as labels for the five services", () => {
    const samples: Record<B1CanonicalCode, Record<string, unknown>> = {
      enrollment_suspension: {
        suspension_duration_type: "one_semester",
        suspension_reason: "سبب",
        terms_acknowledgment: true,
      },
      excused_absence: {
        absence_date: "2026-07-01",
        reason_type: "medical",
        absence_reason_detail: "مرض",
        course_section_id: "sec-1",
      },
      department_transfer: {
        target_department_id: "dept-1",
        target_program_id: "prog-1",
        transfer_reason: "رغبة أكاديمية",
      },
      final_chance: {
        reason: "استكمال التخرج",
        chance_type: "final_chance",
        target_academic_year: "y1",
        target_semester: "s1",
      },
      file_withdrawal: {
        withdrawal_reason: "ظروف خاصة",
        impact_acknowledgment: true,
      },
    };

    for (const code of FIVE) {
      const definition = getStudentRequestFormDefinition(code);
      expect(definition).toBeTruthy();
      const items = buildB1StudentFormSummaryItems({
        serviceCode: code,
        formData: samples[code],
      });
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.labelAr.trim().length).toBeGreaterThan(0);
        expect(item.labelAr).not.toMatch(SNAKE_CASE_KEY);
        expect(item.labelAr).not.toContain("_");
      }
    }
  });

  test("five services reuse current form-field definitions (no parallel dictionary)", () => {
    for (const code of FIVE) {
      const definition = getStudentRequestFormDefinition(code);
      expect(definition).toBeTruthy();
      const expectedLabels = definition!.sections.flatMap((section) =>
        section.fields
          .filter((field) => field.type !== "info" && field.type !== "file")
          .map((field) => field.labelAr),
      );
      const items = buildB1StudentFormSummaryItems({
        serviceCode: code,
        formData: Object.fromEntries(
          definition!.sections.flatMap((section) =>
            section.fields
              .filter((field) => field.type !== "info" && field.type !== "file")
              .map((field) => [
                field.name,
                field.type === "checkbox"
                  ? true
                  : field.options?.[0]?.value ?? field.defaultValue ?? "قيمة",
              ]),
          ),
        ),
      });
      for (const item of items) {
        expect(expectedLabels).toContain(item.labelAr);
      }
    }
  });

  test("unknown values render safely without crashing or using the field key as the label", () => {
    const items = buildB1StudentFormSummaryItems({
      serviceCode: "excused_absence",
      formData: {
        absence_date: "not-a-date",
        reason_type: "totally_unknown_slug",
        absence_reason_detail: "نص حر",
        course_section_id: "00000000-0000-4000-8000-000000000099",
      },
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.labelAr !== "reason_type")).toBe(true);
    expect(items.every((item) => item.labelAr !== "course_section_id")).toBe(true);
    const excuse = items.find((item) => item.labelAr === "نوع العذر");
    expect(excuse?.valueAr).toBe("totally_unknown_slug");
    const date = items.find((item) => item.labelAr === "تاريخ بداية الغياب");
    expect(date?.valueAr).toBe("not-a-date");
    const course = items.find((item) => item.labelAr === "المقررات المتأثرة");
    expect(course?.valueAr).toBe("قيمة محفوظة");
    expect(course?.valueAr).not.toMatch(/[0-9a-f-]{36}/i);
  });

  test("enrollment_certificate regression = NONE (detail/summary helpers untouched)", () => {
    const detailSrc = readFileSync(
      join(
        import.meta.dir,
        "../../src/components/student-requests/b1/B1StudentRequestDetail.tsx",
      ),
      "utf8",
    );
    const summarySrc = readFileSync(
      join(import.meta.dir, "../../src/lib/student-requests/b1-ui/form-summary.ts"),
      "utf8",
    );
    expect(detailSrc).not.toContain("enrollment_certificate");
    expect(summarySrc).not.toContain("enrollment_certificate");
    expect(getStudentRequestFormDefinition("enrollment_certificate")?.titleAr).toContain(
      "شهادة",
    );
  });
});
