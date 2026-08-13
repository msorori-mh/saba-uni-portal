/**
 * Student journey coverage for the five B1 services (20 cases).
 *
 * Contract-level journeys run against the scripted scenario adapter (never a
 * real backend); component-only behaviors (locks, labels, disabled states)
 * are pinned via source contracts and static renders, consistent with the
 * existing b1-ui test style — no browser/DOM is available in this repo.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B1_CANONICAL_CODES } from "@/lib/student-requests/request-service-adapter";
import {
  getEmptyFormValues,
  getStudentRequestFormDefinition,
} from "@/lib/student-requests/request-form-registry";
import {
  B1_ADAPTER_ERROR_CODES,
  B1AdapterError,
  b1AdapterErrorMessageAr,
  b1ValidationMessageAr,
  getB1ServiceConfig,
  validateB1FormValues,
  type B1CanonicalCode,
} from "@/lib/student-requests/b1-ui";
import { B1RequestStatusCard } from "@/components/student-requests/b1/B1RequestStatusCard";
import { B1RequestSummary } from "@/components/student-requests/b1/B1RequestSummary";
import { createScenarioAdapter } from "./fixtures/scenario-adapter";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const formSource = read("src/components/student-requests/b1/B1StudentRequestForm.tsx");
const listSource = read("src/components/student-requests/b1/B1StudentServiceList.tsx");
const confirmationSource = read("src/components/student-requests/b1/B1SubmissionConfirmation.tsx");

const expectRejects = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    throw new Error(`expected rejection with ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(B1AdapterError);
    expect((error as B1AdapterError).code).toBe(code);
  }
};

describe("student journey — availability and activation (cases 1-2)", () => {
  it("blocks the direct form route when the service is runtime-unavailable", async () => {
    for (const code of B1_CANONICAL_CODES) {
      const { adapter } = createScenarioAdapter({
        availability: (row) => (row.code === code ? { ...row, runtimeAvailable: false } : row),
      });
      const availability = await adapter.getAvailableB1RequestTypes();
      // Mirrors the gate inside B1StudentRequestForm.load().
      const available = availability.some(
        (item) => item.code === code && item.studentVisible && item.runtimeAvailable,
      );
      expect(available, `${code} must be gated`).toBe(false);
      if (!available) {
        const error = new B1AdapterError("ACTIVATION_BLOCKED", "Service inactive");
        expect(b1AdapterErrorMessageAr(error)).toBe("هذه الخدمة غير مفعّلة حالياً.");
      }
    }
    expect(formSource).toContain("item.studentVisible && item.runtimeAvailable");
    expect(formSource).toContain('new B1AdapterError("ACTIVATION_BLOCKED"');
  });

  it("hides runtime-unavailable or invisible services from the student list", async () => {
    const { adapter } = createScenarioAdapter({
      availability: (row) =>
        row.code === "final_chance"
          ? { ...row, runtimeAvailable: false }
          : row.code === "file_withdrawal"
            ? { ...row, studentVisible: false }
            : row,
    });
    const rows = await adapter.getAvailableB1RequestTypes();
    // Mirrors the filter inside B1StudentServiceList.load().
    const visible = rows.filter((row) => row.studentVisible && row.runtimeAvailable);
    expect(visible.map((row) => row.code)).toEqual([
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
    ]);
    expect(listSource).toContain("row.studentVisible && row.runtimeAvailable");
  });
});

describe("student journey — definition, empty form, field/attachment/acknowledgment errors (cases 3-7)", () => {
  it("loads the definition and form options for every service (case 3)", async () => {
    for (const code of B1_CANONICAL_CODES) {
      const { adapter } = createScenarioAdapter();
      const definition = getStudentRequestFormDefinition(code);
      expect(definition, code).toBeDefined();
      const options = await adapter.getB1RequestFormOptions(code);
      expect(options.serviceCode).toBe(code);
      expect(options.academicYears.length).toBeGreaterThan(0);
      expect(getB1ServiceConfig(code)?.titleAr).toBe(definition!.titleAr);
    }
  });

  it("starts from an empty draft that fails validation until filled (cases 4-5)", async () => {
    for (const code of B1_CANONICAL_CODES) {
      const definition = getStudentRequestFormDefinition(code)!;
      const empty = getEmptyFormValues(definition);
      const result = validateB1FormValues(code, { ...empty });
      expect(result.valid, `${code} empty form must be invalid`).toBe(false);
      const requiredFields = definition.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.required && field.type !== "file" && field.type !== "info");
      for (const field of requiredFields) {
        const key = result.errors[field.name];
        expect(key, `${code}.${field.name} must have an error key`).toBeTruthy();
        expect(/[؀-ۿ]/.test(b1ValidationMessageAr(key))).toBe(true);
      }
    }
  });

  it("flags missing required attachments with a non-technical Arabic message (case 6)", () => {
    expect(b1ValidationMessageAr("secure_attachment_required")).toBe(
      "يجب إرفاق وثيقة داعمة صالحة.",
    );
    // The form surfaces it for every required attachment without an upload.
    expect(formSource).toContain('"secure_attachment_required"');
    for (const code of ["excused_absence", "department_transfer"] as const) {
      const definition = getStudentRequestFormDefinition(code)!;
      expect((definition.requiredAttachments ?? []).length).toBeGreaterThan(0);
    }
  });

  it("blocks submission while a required acknowledgment is unchecked (case 7)", () => {
    const withdrawal = validateB1FormValues("file_withdrawal", {
      withdrawal_reason: "ظرف عائلي طارئ يستدعي سحب الملف",
      impact_acknowledgment: false,
    });
    expect(withdrawal.valid).toBe(false);
    expect(withdrawal.errors.impact_acknowledgment).toBeTruthy();
    expect(b1ValidationMessageAr(withdrawal.errors.impact_acknowledgment)).toBe(
      "يجب تأكيد الإقرار للمتابعة.",
    );

    const suspension = validateB1FormValues("enrollment_suspension", {
      target_academic_year: "year-2026",
      target_semester: "sem-1",
      suspension_reason: "ظرف صحي موثق",
      suspension_duration_type: "one_semester",
      terms_acknowledgment: false,
    });
    expect(suspension.valid).toBe(false);
    expect(suspension.errors.terms_acknowledgment).toBeTruthy();
  });
});

describe("student journey — draft save and edit cycle (cases 8-10)", () => {
  it("saves a draft successfully and refreshes updatedAt (case 8)", async () => {
    const { adapter } = createScenarioAdapter();
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const saved = await adapter.saveB1RequestDraft(
      draft.requestId,
      {
        suspension_reason: "ظرف صحي",
      },
      draft.updatedAt,
    );
    expect(saved.formData.suspension_reason).toBe("ظرف صحي");
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(Date.parse(draft.updatedAt));
  });

  it("surfaces a failed draft save without losing the draft (case 9)", async () => {
    const { adapter } = createScenarioAdapter({
      failOn: { saveB1RequestDraft: "NETWORK_ERROR" },
    });
    const draft = await adapter.createB1RequestDraft("excused_absence");
    await expectRejects(
      adapter.saveB1RequestDraft(draft.requestId, {}, draft.updatedAt),
      "NETWORK_ERROR",
    );
    // The UI maps this to the save_failed badge vocabulary.
    expect(formSource).toContain('setSaveState("save_failed")');
    expect(b1AdapterErrorMessageAr(new B1AdapterError("NETWORK_ERROR", "boom"))).toContain(
      "تعذر الاتصال بالخادم",
    );
  });

  it("allows going back and editing the draft before submit (case 10)", async () => {
    const { adapter } = createScenarioAdapter();
    const draft = await adapter.createB1RequestDraft("department_transfer");
    const first = await adapter.saveB1RequestDraft(
      draft.requestId,
      { transfer_reason: "سبب أول" },
      draft.updatedAt,
    );
    const edited = await adapter.saveB1RequestDraft(
      draft.requestId,
      { transfer_reason: "سبب معدل" },
      first.updatedAt,
    );
    expect(edited.formData.transfer_reason).toBe("سبب معدل");
    // The review step has an explicit edit-back button.
    expect(formSource).toContain("تعديل البيانات");
    expect(formSource).toContain("setReviewing(false)");
  });
});

describe("student journey — review summary, double-submit, submitting, acknowledgment (cases 11-14)", () => {
  it("renders the pre-submit summary with Arabic labels, attachments and acknowledgments (case 11)", () => {
    const html = renderToStaticMarkup(
      createElement(B1RequestSummary, {
        serviceTitleAr: "سحب ملف",
        items: [
          { labelAr: "سبب سحب الملف", valueAr: "ظرف عائلي طارئ" },
          { labelAr: "تاريخ بداية الغياب", valueAr: "١٠ يناير ٢٠٢٦" },
        ],
        attachments: [
          {
            attachmentId: "att-1",
            attachmentType: "excuse_documents",
            fileName: "وثيقة.pdf",
            fileSizeBytes: 2048,
            mimeType: "application/pdf",
            status: "attached",
            storageRef: "opaque-ref",
          },
        ],
        acknowledgmentsAr: ["أفهم أن سحب الملف له أثر أكاديمي وإداري وفق لوائح الكلية"],
      }),
    );
    expect(html).toContain("ملخص الطلب — سحب ملف");
    expect(html).toContain("ظرف عائلي طارئ");
    expect(html).toContain("وثيقة.pdf");
    expect(html).toContain("الإقرارات");
    expect(html).not.toMatch(/(?:href|src)="https?:/);
    expect(html).not.toContain("opaque-ref");
    // The form feeds resolved labels, checked acknowledgments and the title.
    expect(formSource).toContain("acknowledgmentsAr={acknowledgmentsAr}");
    expect(formSource).toContain("serviceTitleAr={config.titleAr}");
    expect(formSource).toContain("resolveOptions(field, values, options)");
  });

  it("rejects a second submit of an already-submitted request (case 12)", async () => {
    const { adapter, calls } = createScenarioAdapter();
    const draft = await adapter.createB1RequestDraft("final_chance");
    const saved = await adapter.saveB1RequestDraft(
      draft.requestId,
      { reason: "سبب" },
      draft.updatedAt,
    );
    const result = await adapter.submitB1Request(saved.requestId, saved.updatedAt);
    expect(result.requestNumber).toBeTruthy();
    await expectRejects(
      adapter.submitB1Request(saved.requestId, result.updatedAt),
      "VALIDATION_ERROR",
    );
    expect(calls.submitB1Request).toBe(2);
    // Component-level lock and stale-safe submit stay in place.
    expect(formSource).toContain("submitLock.current");
    expect(formSource).toContain("submitB1Request(saved.requestId, saved.updatedAt)");
  });

  it("shows a submitting state that blocks interaction (case 13)", () => {
    expect(confirmationSource).toContain("جارٍ الإرسال…");
    expect(confirmationSource).toContain("confirmDisabled = submitting");
    expect(confirmationSource).toContain("disabled={submitting}");
    expect(formSource).toContain("submitting={submitting || attachmentSyncing}");
  });

  it("gates confirmation behind the acknowledgment checkbox when required (case 14)", () => {
    expect(confirmationSource).toContain("requireAcknowledgment && !acknowledged");
    expect(formSource).toContain("requireAcknowledgment={Boolean(requiredAcknowledgment)}");
    expect(formSource).toContain("acknowledgmentLabelAr={requiredAcknowledgment?.labelAr}");
  });
});

describe("student journey — submit failure modes (cases 15-18)", () => {
  it.each([
    ["NETWORK_ERROR", "تعذر الاتصال بالخادم"],
    ["PERMISSION_DENIED", "لا تملك صلاحية"],
    ["BACKEND_CONTRACT_PENDING", "بانتظار اكتمال الربط الخلفي"],
    ["STALE_VERSION", "تغيّرت حالة الطلب"],
  ] as const)("maps %s to a safe Arabic message", async (code, fragment) => {
    const { adapter } = createScenarioAdapter({ failOn: { submitB1Request: code } });
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const saved = await adapter.saveB1RequestDraft(draft.requestId, {}, draft.updatedAt);
    await expectRejects(adapter.submitB1Request(saved.requestId, saved.updatedAt), code);
    const message = b1AdapterErrorMessageAr(new B1AdapterError(code, "raw detail"));
    expect(message).toContain(fragment);
    expect(message).not.toContain("raw detail");
    expect(formSource).toContain("b1AdapterErrorMessageAr(error)");
  });
});

describe("student journey — pre-existing and in-processing requests (cases 19-20)", () => {
  it("fails closed on duplicate submission — the contract has no duplicate bypass (case 19)", async () => {
    // No "already exists" happy path exists in the contract; re-submitting a
    // non-draft is rejected (not_draft), and the UI navigates away on success.
    expect(B1_ADAPTER_ERROR_CODES).not.toContain("DUPLICATE_REQUEST");
    const { adapter } = createScenarioAdapter();
    const draft = await adapter.createB1RequestDraft("excused_absence");
    const saved = await adapter.saveB1RequestDraft(draft.requestId, {}, draft.updatedAt);
    await adapter.submitB1Request(saved.requestId, saved.updatedAt);
    await expectRejects(
      adapter.saveB1RequestDraft(saved.requestId, {}, saved.updatedAt),
      "VALIDATION_ERROR",
    );
    // Surface-aware navigation: the web surface still resolves to the frozen
    // /student/requests/b1/view/$requestId target via the shared route map.
    expect(formSource).toContain("routes.b1View");
    const surfaceSource = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "surface.tsx"),
      "utf8",
    );
    expect(surfaceSource).toContain('b1View: "/student/requests/b1/view/$requestId"');
  });

  it("shows an in-processing status with the current step after submit (case 20)", async () => {
    const { adapter } = createScenarioAdapter();
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const saved = await adapter.saveB1RequestDraft(draft.requestId, {}, draft.updatedAt);
    await adapter.submitB1Request(saved.requestId, saved.updatedAt);
    const details = await adapter.getB1RequestDetails(saved.requestId);
    expect(details.status).toBe("in_review");
    expect(details.steps.some((step) => step.status === "active")).toBe(true);

    const html = renderToStaticMarkup(
      createElement(B1RequestStatusCard, {
        requestNumber: details.requestNumber,
        serviceTitleAr: details.serviceTitleAr,
        statusAr: "قيد المعالجة",
        currentStepLabelAr: "المراجعة الأولية",
        updatedAt: details.updatedAt,
      }),
    );
    expect(html).toContain("قيد المعالجة");
    expect(html).toContain("المراجعة الأولية");
    expect(html).toContain('dir="rtl"');
  });
});

describe("student journey — service-specific content checks", () => {
  it("suspension: reason, target year/semester, duration and eligibility note are clear", () => {
    const definition = getStudentRequestFormDefinition("enrollment_suspension")!;
    const fields = definition.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.name === "suspension_reason")?.type).toBe("textarea");
    expect(
      fields.find((field) => field.name === "target_academic_year")?.referenceResolverKey,
    ).toBe("academic_years");
    expect(fields.find((field) => field.name === "target_semester")?.referenceDependsOnField).toBe(
      "target_academic_year",
    );
    expect(fields.find((field) => field.name === "suspension_duration_type")?.options?.length).toBe(
      2,
    );
    // Submission ≠ approval is conveyed via the eligibility info note + warning.
    expect(
      fields.some(
        (field) => field.type === "info" && /تُتحقق لاحقاً/.test(String(field.defaultValue)),
      ),
    ).toBe(true);
    expect(definition.warnings?.some((warning) => warning.includes("الأهلية"))).toBe(true);
    expect(definition.requiredAttachments ?? []).toHaveLength(0);
  });

  it("absence: date order guard, reason vocabulary, enrollments-only courses", () => {
    const reversed = validateB1FormValues("excused_absence", {
      absence_date: "2026-02-10",
      absence_end_date: "2026-02-01",
      reason_type: "medical",
      absence_reason_detail: "ظرف طبي موثق",
      course_section_id: "enr-1",
    });
    expect(reversed.errors.absence_end_date).toBe("date_order");

    const ordered = validateB1FormValues("excused_absence", {
      absence_date: "2026-02-01",
      absence_end_date: "2026-02-10",
      reason_type: "medical",
      absence_reason_detail: "ظرف طبي موثق",
      course_section_id: "enr-1",
    });
    expect(ordered.errors.absence_end_date).toBeUndefined();

    const badReason = validateB1FormValues("excused_absence", {
      absence_date: "2026-02-01",
      reason_type: "invented_reason",
      absence_reason_detail: "ظرف طبي موثق",
      course_section_id: "enr-1",
    });
    expect(badReason.errors.reason_type).toBe("unknown_reason_type");

    // Courses come only from the enrollments resolver — nothing is guessed.
    const definition = getStudentRequestFormDefinition("excused_absence")!;
    const courseField = definition.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "course_section_id");
    expect(courseField?.referenceResolverKey).toBe("current_student_enrollments");
  });

  it("transfer: readonly current department, target guard, and label resolution", () => {
    const definition = getStudentRequestFormDefinition("department_transfer")!;
    const fields = definition.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.name === "current_department")?.type).toBe("readonly");
    expect(fields.find((field) => field.name === "target_department_id")?.required).toBe(true);

    const same = validateB1FormValues("department_transfer", {
      current_department_id: "dept-cs",
      target_department_id: "dept-cs",
      target_program_id: "prog-cs",
      transfer_reason: "سبب التحويل موثق",
    });
    expect(same.errors.target_department_id).toBe("same_department");
    expect(b1ValidationMessageAr("same_department")).toContain("القسم الحالي");

    // The UI resolves department/program ids to Arabic names, never raw ids.
    expect(formSource).toContain("resolveOptions(field, values, options)");
    expect(formSource).toContain("currentDepartmentLabelAr");
  });

  it("final chance: academic reason, external fee note, no amounts, no student payment UI", () => {
    const config = getB1ServiceConfig("final_chance")!;
    expect(config.feePolicy).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(config.feePolicyLabelAr).toContain("النظام الجامعي الرئيسي");
    const definition = getStudentRequestFormDefinition("final_chance")!;
    const fields = definition.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.name === "reason")?.required).toBe(true);
    expect(formSource).not.toMatch(/confirm_payment|confirmB1RevenueReceipt/);
    expect(formSource).not.toMatch(/\b(amount|currency|invoice|wallet|balance)\b/i);
  });

  it("withdrawal: mandatory acknowledgment blocks submit and appears in the review summary", () => {
    const definition = getStudentRequestFormDefinition("file_withdrawal")!;
    const acknowledgment = definition.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "impact_acknowledgment");
    expect(acknowledgment?.type).toBe("checkbox");
    expect(acknowledgment?.required).toBe(true);

    const withoutAck = validateB1FormValues("file_withdrawal", {
      withdrawal_reason: "سبب موثق لسحب الملف",
    });
    expect(withoutAck.valid).toBe(false);

    // The confirmation dialog re-asserts the same acknowledgment text.
    expect(formSource).toContain("requiredAcknowledgment");
    // Nothing in the UI frames withdrawal as undoable.
    expect(formSource).not.toMatch(/تراجع عن|استرجاع|undo/i);
  });
});
