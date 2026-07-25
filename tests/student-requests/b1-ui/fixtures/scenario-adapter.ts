/**
 * Scripted in-memory B1UiAdapter for journey/regression tests.
 *
 * Lives under tests/ only — production code never imports it. Each scenario
 * can inject a failure per adapter method (failOn), reshape availability per
 * service, and seed the staff inbox. Call counts per method are recorded so
 * tests can assert guards (e.g. no duplicate submit calls).
 */

import {
  B1AdapterError,
  B1_UI_SERVICES,
  type B1AdapterErrorCode,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1AttachmentMeta,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
  type B1RequestDetails,
  type B1ServiceAvailability,
  type B1StaffAction,
  type B1StepActionResult,
  type B1SubmitResult,
  type B1UiAdapter,
} from "@/lib/student-requests/b1-ui";

export type ScenarioMethod = keyof B1UiAdapter;

export type ScenarioOptions = {
  /** Reshape one availability row (e.g. hide a service or block it at runtime). */
  availability?: (service: B1ServiceAvailability) => B1ServiceAvailability;
  /** Inject an adapter error for a method — every call to it rejects. */
  failOn?: Partial<Record<ScenarioMethod, B1AdapterErrorCode>>;
  /** Seed for the staff inbox. */
  assigned?: readonly B1AssignedRequestDetails[];
  /** Override parts of the reference form options. */
  formOptions?: Partial<B1FormOptions>;
};

export const SCENARIO_FORM_OPTIONS: B1FormOptions = {
  serviceCode: "enrollment_suspension",
  academicYears: [{ value: "year-2026", labelAr: "2025-2026" }],
  semestersByYear: {
    "year-2026": [
      { value: "sem-1", labelAr: "الفصل الأول" },
      { value: "sem-2", labelAr: "الفصل الثاني" },
    ],
  },
  currentEnrollments: [{ value: "enr-1", labelAr: "مقرر تجريبي — شعبة 1" }],
  availableDepartments: [
    { value: "dept-cs", labelAr: "قسم علوم الحاسب (تجريبي)" },
    { value: "dept-is", labelAr: "قسم نظم المعلومات (تجريبي)" },
  ],
  programsByDepartment: {
    "dept-cs": [{ value: "prog-cs", labelAr: "بكالوريوس علوم الحاسب (تجريبي)" }],
    "dept-is": [{ value: "prog-is", labelAr: "بكالوريوس نظم المعلومات (تجريبي)" }],
  },
  currentDepartmentLabelAr: "قسم علوم الحاسب (تجريبي)",
  currentProgramLabelAr: "بكالوريوس علوم الحاسب (تجريبي)",
  finalChanceEligibility: { eligible: true, reasonAr: "أهلية تجريبية — القرار النهائي خادمي." },
  excuseReasonTypes: [
    { value: "medical", labelAr: "طبي" },
    { value: "family_emergency", labelAr: "طارئ عائلي" },
    { value: "official", labelAr: "رسمي" },
    { value: "other", labelAr: "أخرى" },
  ],
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;
const nowIso = () => new Date().toISOString();

/** Builds a fully-typed assigned request for staff scenarios. */
export function makeAssigned(
  overrides: Partial<B1AssignedRequestDetails> = {},
): B1AssignedRequestDetails {
  return {
    requestId: nextId("req"),
    stepId: nextId("step"),
    requestNumber: "B1-2026-0001",
    serviceCode: "enrollment_suspension",
    serviceTitleAr: "وقف القيد",
    studentNameAr: "طالب تجريبي",
    studentNumber: "20260001",
    stepKey: "initial_review",
    stepLabelAr: "المراجعة الأولية",
    allowedAction: "approve",
    submittedAt: nowIso(),
    formDataSummary: [{ labelAr: "سبب وقف القيد", valueAr: "ظرف صحي" }],
    attachments: [
      {
        attachmentId: nextId("att"),
        attachmentType: "excuse_documents",
        fileName: "وثيقة-داعمة.pdf",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
        status: "attached",
        storageRef: "opaque-server-ref-1",
      },
    ],
    steps: [
      {
        key: "initial_review",
        labelAr: "المراجعة الأولية",
        status: "active",
      },
    ],
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function createScenarioAdapter(options: ScenarioOptions = {}) {
  const calls: Partial<Record<ScenarioMethod, number>> = {};
  const drafts = new Map<string, B1Draft & { submitted: boolean; requestNumber: string }>();
  const assigned = options.assigned ?? [];

  const track = (method: ScenarioMethod) => {
    calls[method] = (calls[method] ?? 0) + 1;
    const failure = options.failOn?.[method];
    if (failure) {
      throw new B1AdapterError(failure, `Scenario-injected failure for ${method}`);
    }
  };

  const availability: readonly B1ServiceAvailability[] = B1_UI_SERVICES.map((service) => {
    const row: B1ServiceAvailability = {
      code: service.code,
      titleAr: service.titleAr,
      descriptionAr: service.descriptionAr,
      feePolicy: service.feePolicy,
      studentVisible: true,
      runtimeAvailable: true,
      ...(service.activationBlockedReason
        ? { activationBlockedReason: service.activationBlockedReason }
        : {}),
    };
    return options.availability ? options.availability(row) : row;
  });

  const adapter: B1UiAdapter = {
    async getAvailableB1RequestTypes() {
      track("getAvailableB1RequestTypes");
      return availability;
    },

    async getB1RequestFormOptions(serviceCode) {
      track("getB1RequestFormOptions");
      return { ...SCENARIO_FORM_OPTIONS, ...options.formOptions, serviceCode };
    },

    async createB1RequestDraft(serviceCode) {
      track("createB1RequestDraft");
      const draft = {
        requestId: nextId("req"),
        requestNumber: `B1-SCN-${String(counter).padStart(4, "0")}`,
        serviceCode,
        formData: {},
        attachments: [],
        status: "draft" as const,
        submitted: false,
        updatedAt: nowIso(),
      };
      drafts.set(draft.requestId, draft);
      const { submitted: _submitted, requestNumber: _requestNumber, ...publicDraft } = draft;
      return publicDraft;
    },

    async getB1RequestDraft(requestId) {
      track("getB1RequestDraft");
      const draft = drafts.get(requestId);
      if (!draft) return null;
      const { submitted: _submitted, requestNumber: _requestNumber, ...publicDraft } = draft;
      return publicDraft;
    },

    async saveB1RequestDraft(requestId, formData) {
      track("saveB1RequestDraft");
      const draft = drafts.get(requestId);
      if (!draft) throw new B1AdapterError("NOT_FOUND", `Unknown draft: ${requestId}`);
      if (draft.submitted) {
        throw new B1AdapterError("VALIDATION_ERROR", "Request is no longer a draft", {
          status: "not_draft",
        });
      }
      draft.formData = { ...formData };
      draft.updatedAt = nowIso();
      const { submitted: _submitted, requestNumber: _requestNumber, ...publicDraft } = draft;
      return publicDraft;
    },

    async uploadB1RequestAttachment(requestId, attachmentType, file) {
      track("uploadB1RequestAttachment");
      const draft = drafts.get(requestId);
      if (!draft) throw new B1AdapterError("NOT_FOUND", `Unknown draft: ${requestId}`);
      const meta: B1AttachmentMeta = {
        attachmentId: nextId("att"),
        attachmentType,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        status: "attached",
        storageRef: `opaque-server-ref-${counter}`,
      };
      draft.attachments = [...draft.attachments, meta];
      draft.updatedAt = nowIso();
      return meta;
    },

    async removeB1RequestAttachment(requestId, attachmentId) {
      track("removeB1RequestAttachment");
      const draft = drafts.get(requestId);
      if (!draft) throw new B1AdapterError("NOT_FOUND", `Unknown draft: ${requestId}`);
      draft.attachments = draft.attachments.filter((item) => item.attachmentId !== attachmentId);
    },

    async submitB1Request(requestId, expectedUpdatedAt) {
      track("submitB1Request");
      const draft = drafts.get(requestId);
      if (!draft) throw new B1AdapterError("NOT_FOUND", `Unknown draft: ${requestId}`);
      if (expectedUpdatedAt !== draft.updatedAt) {
        throw new B1AdapterError("STALE_VERSION", "Draft changed since last read");
      }
      if (draft.submitted) {
        throw new B1AdapterError("VALIDATION_ERROR", "Request already submitted", {
          status: "not_draft",
        });
      }
      draft.submitted = true;
      draft.updatedAt = nowIso();
      const result: B1SubmitResult = {
        requestId,
        requestNumber: draft.requestNumber,
        submittedAt: nowIso(),
        updatedAt: draft.updatedAt,
      };
      return result;
    },

    async getB1RequestDetails(requestId) {
      track("getB1RequestDetails");
      const draft = drafts.get(requestId);
      if (!draft) throw new B1AdapterError("NOT_FOUND", `Unknown request: ${requestId}`);
      const service = B1_UI_SERVICES.find((item) => item.code === draft.serviceCode);
      const details: B1RequestDetails = {
        requestId,
        requestNumber: draft.requestNumber,
        serviceCode: draft.serviceCode,
        serviceTitleAr: service?.titleAr ?? draft.serviceCode,
        status: draft.submitted ? "in_review" : "draft",
        formData: draft.formData,
        attachments: draft.attachments,
        steps: (service?.workflowSteps ?? []).map((step, index) => ({
          ...step,
          status: !draft.submitted ? "pending" : index === 0 ? "active" : "pending",
        })),
        studentVisibleMessages: [],
        updatedAt: draft.updatedAt,
      };
      return details;
    },

    async getAssignedB1Requests() {
      track("getAssignedB1Requests");
      return assigned.map(
        ({ formDataSummary: _f, attachments: _a, steps: _s, ...row }): B1AssignedRequest => row,
      );
    },

    async getAssignedB1RequestDetails(requestId) {
      track("getAssignedB1RequestDetails");
      const found = assigned.find((item) => item.requestId === requestId);
      if (!found) {
        throw new B1AdapterError("NOT_FOUND", `No active assigned step for request: ${requestId}`);
      }
      return found;
    },

    async actOnB1RequestStep(stepId, action, comment) {
      track("actOnB1RequestStep");
      const found = assigned.find((item) => item.stepId === stepId);
      if (!found) throw new B1AdapterError("NOT_FOUND", `Unknown step: ${stepId}`);
      if (found.allowedAction !== action) {
        throw new B1AdapterError("PERMISSION_DENIED", `Action ${action} is not legal here`);
      }
      const result: B1StepActionResult = {
        stepId,
        requestId: found.requestId,
        outcomeAr: "تم تنفيذ الإجراء.",
        actedAt: nowIso(),
      };
      return result;
    },

    async confirmB1RevenueReceipt(stepId, optionalNote) {
      track("confirmB1RevenueReceipt");
      const found = assigned.find((item) => item.stepId === stepId);
      if (!found) throw new B1AdapterError("NOT_FOUND", `Unknown step: ${stepId}`);
      if (found.allowedAction !== "confirm_payment") {
        throw new B1AdapterError("PERMISSION_DENIED", "Not a payment confirmation step");
      }
      const result: B1StepActionResult = {
        stepId,
        requestId: found.requestId,
        outcomeAr: "تم تأكيد استلام الرسوم.",
        actedAt: nowIso(),
      };
      return result;
    },
  };

  return { adapter, calls, drafts };
}
