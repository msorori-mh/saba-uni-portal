import { describe, expect, it } from "bun:test";
import { createMockB1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.mock";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";

const VALID_SUSPENSION_FORM: Record<string, unknown> = {
  target_academic_year: "mock-year-1447",
  target_semester: "mock-sem-first",
  suspension_reason: "ظرف صحي مؤقت (بيانات تجريبية).",
  suspension_duration_type: "one_semester",
  terms_acknowledgment: true,
};

const VALID_ABSENCE_FORM: Record<string, unknown> = {
  course_section_id: "mock-course-cs101",
  absence_date: "2026-03-01",
  reason_type: "medical",
  absence_reason_detail: "ظرف طبي (بيانات تجريبية).",
};

function smallPdf(): File {
  return new File([new Uint8Array(1024)], "mock-excuse.pdf", { type: "application/pdf" });
}

async function expectAdapterError(promise: Promise<unknown>, code: string): Promise<B1AdapterError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(B1AdapterError);
    expect((error as B1AdapterError).code).toBe(code);
    return error as B1AdapterError;
  }
  throw new Error(`Expected B1AdapterError(${code}) but the call succeeded`);
}

describe("mock B1 UI adapter — student lifecycle", () => {
  it("runs the full draft → save → upload → submit → details lifecycle", async () => {
    const adapter = createMockB1UiAdapter();

    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    expect(draft.status).toBe("draft");
    expect(Date.parse(draft.updatedAt)).not.toBeNaN();

    const saved = await adapter.saveB1RequestDraft(draft.requestId, VALID_SUSPENSION_FORM);
    expect(saved.formData.suspension_duration_type).toBe("one_semester");

    const attachment = await adapter.uploadB1RequestAttachment(
      draft.requestId,
      "supporting_document",
      smallPdf(),
    );
    expect(attachment.status).toBe("attached");

    // Upload bumps updatedAt — submit against the freshest version.
    const refreshed = await adapter.getB1RequestDraft(draft.requestId);
    const result = await adapter.submitB1Request(draft.requestId, refreshed!.updatedAt);
    expect(result.requestNumber).toMatch(/^B1-MOCK-\d{4}$/);

    const details = await adapter.getB1RequestDetails(draft.requestId);
    expect(details.status).toBe("submitted");
    expect(details.steps.length).toBe(3);
    expect(details.steps[0]!.status).toBe("active");
    expect(details.steps.slice(1).every((step) => step.status === "pending")).toBe(true);
    expect(details.steps.every((step) => step.labelAr.trim().length > 0)).toBe(true);
    expect(details.studentVisibleMessages.length).toBeGreaterThan(0);
    expect(details.attachments.length).toBe(1);
  });

  it("submits excused_absence when an excuse attachment is uploaded", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("excused_absence");
    const saved = await adapter.saveB1RequestDraft(draft.requestId, VALID_ABSENCE_FORM);
    await adapter.uploadB1RequestAttachment(draft.requestId, "excuse_documents", smallPdf());

    const refreshed = await adapter.getB1RequestDraft(draft.requestId);
    const result = await adapter.submitB1Request(draft.requestId, refreshed!.updatedAt);
    expect(result.requestId).toBe(draft.requestId);
    expect(saved.requestId).toBe(draft.requestId);
  });

  it("rejects submit with a stale expectedUpdatedAt (STALE_VERSION)", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    await adapter.saveB1RequestDraft(draft.requestId, VALID_SUSPENSION_FORM);

    await expectAdapterError(
      adapter.submitB1Request(draft.requestId, draft.updatedAt),
      "STALE_VERSION",
    );
  });

  it("rejects submit with missing fields (VALIDATION_ERROR + fieldErrors)", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const saved = await adapter.saveB1RequestDraft(draft.requestId, { suspension_reason: "فقط السبب" });

    const error = await expectAdapterError(
      adapter.submitB1Request(draft.requestId, saved.updatedAt),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors).toBeDefined();
    expect(error.fieldErrors!.target_academic_year).toBe("required");
    expect(error.fieldErrors!.target_semester).toBe("required");
    expect(error.fieldErrors!.terms_acknowledgment).toBe("required_true");
  });

  it("rejects attachments over 10MB and unsupported mime types", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("excused_absence");

    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", {
      type: "application/pdf",
    });
    const sizeError = await expectAdapterError(
      adapter.uploadB1RequestAttachment(draft.requestId, "excuse_documents", oversized),
      "VALIDATION_ERROR",
    );
    expect(sizeError.fieldErrors!.excuse_documents).toBe("attachment_too_large");

    const wrongType = new File([new Uint8Array(16)], "notes.txt", { type: "text/plain" });
    const typeError = await expectAdapterError(
      adapter.uploadB1RequestAttachment(draft.requestId, "excuse_documents", wrongType),
      "VALIDATION_ERROR",
    );
    expect(typeError.fieldErrors!.excuse_documents).toBe("unsupported_attachment_type");
  });

  it("removes an attachment before submission and refuses removal after it", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const attachment = await adapter.uploadB1RequestAttachment(
      draft.requestId,
      "supporting_document",
      smallPdf(),
    );

    await adapter.removeB1RequestAttachment(draft.requestId, attachment.attachmentId);
    const afterRemoval = await adapter.getB1RequestDraft(draft.requestId);
    expect(afterRemoval!.attachments.length).toBe(0);

    const again = await adapter.uploadB1RequestAttachment(
      draft.requestId,
      "supporting_document",
      smallPdf(),
    );
    const saved = await adapter.saveB1RequestDraft(draft.requestId, VALID_SUSPENSION_FORM);
    await adapter.submitB1Request(draft.requestId, saved.updatedAt);

    await expectAdapterError(
      adapter.removeB1RequestAttachment(draft.requestId, again.attachmentId),
      "VALIDATION_ERROR",
    );
  });

  it("never exposes a public URL in attachment metadata", async () => {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("excused_absence");
    const attachment = await adapter.uploadB1RequestAttachment(
      draft.requestId,
      "excuse_documents",
      smallPdf(),
    );
    expect(attachment.storageRef.startsWith("http")).toBe(false);
    expect(attachment.storageRef.startsWith("mock://")).toBe(true);

    const saved = await adapter.saveB1RequestDraft(draft.requestId, VALID_ABSENCE_FORM);
    await adapter.submitB1Request(draft.requestId, saved.updatedAt);
    const details = await adapter.getB1RequestDetails(draft.requestId);
    for (const item of details.attachments) {
      expect(item.storageRef.startsWith("http")).toBe(false);
    }
  });

  it("rejects unknown service codes and unknown requests", async () => {
    const adapter = createMockB1UiAdapter();
    await expectAdapterError(
      adapter.createB1RequestDraft("grade_appeal" as never),
      "VALIDATION_ERROR",
    );
    await expectAdapterError(adapter.getB1RequestDetails("missing-id"), "NOT_FOUND");
  });

  it("lists all five services with backend-driven availability flags", async () => {
    const adapter = createMockB1UiAdapter();
    const types = await adapter.getAvailableB1RequestTypes();
    expect(types.length).toBe(5);
    const byCode = new Map(types.map((item) => [item.code, item]));

    expect(byCode.get("enrollment_suspension")!.runtimeAvailable).toBe(true);
    expect(byCode.get("file_withdrawal")!.runtimeAvailable).toBe(true);
    for (const blocked of ["excused_absence", "department_transfer", "final_chance"] as const) {
      expect(byCode.get(blocked)!.studentVisible).toBe(true);
      expect(byCode.get(blocked)!.runtimeAvailable).toBe(false);
      expect(byCode.get(blocked)!.activationBlockedReason).toBeTruthy();
    }
  });

  it("returns fake form options per service", async () => {
    const adapter = createMockB1UiAdapter();
    const options = await adapter.getB1RequestFormOptions("department_transfer");
    expect(options.availableDepartments.length).toBeGreaterThan(1);
    expect(options.programsByDepartment["mock-dept-cs"]!.length).toBeGreaterThan(0);
    expect(options.currentDepartmentLabelAr).toContain("تجريبي");
    expect(options.excuseReasonTypes.map((item) => item.value)).toEqual([
      "medical",
      "family_emergency",
      "official",
      "other",
    ]);
    expect(options.finalChanceEligibility).toBeDefined();
  });
});
