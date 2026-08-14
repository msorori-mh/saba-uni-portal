/**
 * In-memory mock implementation of the B1 UI adapter contract.
 *
 * All data is clearly fake Arabic demo content ("طالب تجريبي", "B1-MOCK-…").
 * No production identifiers, no public URLs — attachment storage refs are
 * opaque `mock://` strings. React components consume this through
 * `getB1UiAdapter()` only; the live backend replaces it untouched.
 */

import {
  B1AdapterError,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1AttachmentMeta,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
  type B1ReferenceOption,
  type B1RequestDetails,
  type B1ServiceAvailability,
  type B1StaffAction,
  type B1StepActionResult,
  type B1StudentVisibleMessage,
  type B1SubmitResult,
  type B1UiAdapter,
  type B1WorkflowStepView,
} from "./adapter.types";
import { B1_WORKFLOWS } from "@/lib/student-requests/request-service-adapter";
import {
  B1_STEP_LABELS_AR,
  B1_UI_SERVICES,
  getB1ServiceConfig,
  isB1ServiceCode,
} from "./service-config";
import { validateB1FormValues } from "./validation";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { buildB1StudentFormSummaryItems } from "./form-summary";

export const B1_MOCK_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const B1_MOCK_ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

const MOCK_STUDENT_NAME_AR = "طالب تجريبي";
const MOCK_STUDENT_NUMBER = "B1-MOCK-STU-0001";

type MockOptions = { delayMs?: number };

type MockRequest = {
  requestId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  studentNameAr: string;
  studentNumber: string;
  formData: Record<string, unknown>;
  attachments: B1AttachmentMeta[];
  submittedAt?: string;
  steps: B1WorkflowStepView[];
  studentVisibleMessages: B1StudentVisibleMessage[];
  updatedAt: string;
};

// Monotonic timestamps: consecutive mutations in the same millisecond must
// still produce distinct updatedAt values (STALE_VERSION relies on this).
let lastTimestampMs = 0;
function nowIso(): string {
  const now = Date.now();
  lastTimestampMs = now <= lastTimestampMs ? lastTimestampMs + 1 : now;
  return new Date(lastTimestampMs).toISOString();
}

function buildSteps(serviceCode: B1CanonicalCode): B1WorkflowStepView[] {
  return B1_WORKFLOWS[serviceCode].map((step, index) => ({
    ...step,
    labelAr: B1_STEP_LABELS_AR[step.key] ?? step.key,
    status: index === 0 ? "active" : "pending",
  }));
}

function stepIdOf(requestId: string, stepKey: string): string {
  return `${requestId}#${stepKey}`;
}

function primaryActionForStep(step: B1WorkflowStepView): B1StaffAction {
  if (step.action === "review") return "review";
  if (step.action === "confirm_payment") return "confirm_payment";
  return "approve"; // approve | clear | apply_decision | archive
}

function allowedActionsForStep(step: B1WorkflowStepView): readonly B1StaffAction[] {
  return [primaryActionForStep(step), "return", "reject"];
}

function deriveStatus(request: MockRequest): B1RequestDetails["status"] {
  if (!request.submittedAt) return "draft";
  if (request.steps.some((step) => step.status === "rejected")) return "rejected";
  if (request.steps.some((step) => step.status === "returned")) return "returned";
  if (request.steps.every((step) => step.status === "completed")) return "completed";
  const active = request.steps.find((step) => step.status === "active");
  if (active?.action === "confirm_payment") return "waiting_payment_confirmation";
  if (request.steps.some((step) => step.status === "completed")) return "in_review";
  return "submitted";
}

// ---------------------------------------------------------------------------
// Fake reference data (clearly marked as demo content)
// ---------------------------------------------------------------------------

const MOCK_ACADEMIC_YEARS: readonly B1ReferenceOption[] = [
  { value: "mock-year-1446", labelAr: "العام الجامعي 1446هـ (بيانات تجريبية)" },
  { value: "mock-year-1447", labelAr: "العام الجامعي 1447هـ (بيانات تجريبية)" },
];

const MOCK_SEMESTERS: readonly B1ReferenceOption[] = [
  { value: "mock-sem-first", labelAr: "الفصل الأول (تجريبي)" },
  { value: "mock-sem-second", labelAr: "الفصل الثاني (تجريبي)" },
  { value: "mock-sem-summer", labelAr: "الفصل الصيفي (تجريبي)" },
];

const MOCK_ENROLLMENTS: readonly B1ReferenceOption[] = [
  { value: "mock-course-cs101", labelAr: "CS101 — مقدمة في البرمجة (مقرر تجريبي)" },
  { value: "mock-course-math101", labelAr: "MATH101 — رياضيات عامة (مقرر تجريبي)" },
];

const MOCK_DEPARTMENTS: readonly B1ReferenceOption[] = [
  { value: "mock-dept-cs", labelAr: "قسم علوم الحاسب (تجريبي)" },
  { value: "mock-dept-is", labelAr: "قسم نظم المعلومات (تجريبي)" },
  { value: "mock-dept-ba", labelAr: "قسم إدارة الأعمال (تجريبي)" },
];

const MOCK_PROGRAMS_BY_DEPARTMENT: Readonly<Record<string, readonly B1ReferenceOption[]>> = {
  "mock-dept-cs": [
    { value: "mock-prog-cs-bsc", labelAr: "بكالوريوس علوم الحاسب (تجريبي)" },
    { value: "mock-prog-cs-se", labelAr: "بكالوريوس هندسة البرمجيات (تجريبي)" },
  ],
  "mock-dept-is": [{ value: "mock-prog-is-bsc", labelAr: "بكالوريوس نظم المعلومات (تجريبي)" }],
  "mock-dept-ba": [{ value: "mock-prog-ba-bsc", labelAr: "بكالوريوس إدارة الأعمال (تجريبي)" }],
};

const MOCK_EXCUSE_REASON_TYPES: readonly B1ReferenceOption[] = [
  { value: "medical", labelAr: "طبي" },
  { value: "family_emergency", labelAr: "طارئ عائلي" },
  { value: "official", labelAr: "رسمي" },
  { value: "other", labelAr: "أخرى" },
];

function buildFormOptions(serviceCode: B1CanonicalCode): B1FormOptions {
  const semestersByYear: Record<string, readonly B1ReferenceOption[]> = {};
  for (const year of MOCK_ACADEMIC_YEARS) semestersByYear[year.value] = MOCK_SEMESTERS;
  return {
    serviceCode,
    academicYears: MOCK_ACADEMIC_YEARS,
    semestersByYear,
    currentEnrollments: MOCK_ENROLLMENTS,
    availableDepartments: MOCK_DEPARTMENTS,
    programsByDepartment: MOCK_PROGRAMS_BY_DEPARTMENT,
    currentDepartmentLabelAr: "قسم علوم الحاسب (تجريبي)",
    currentProgramLabelAr: "بكالوريوس علوم الحاسب (تجريبي)",
    finalChanceEligibility: {
      eligible: true,
      reasonAr: "أهلية تجريبية للعرض فقط — القرار النهائي يُتخذ على الخادم.",
    },
    excuseReasonTypes: MOCK_EXCUSE_REASON_TYPES,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockB1UiAdapter(options: MockOptions = {}): B1UiAdapter {
  const delayMs = options.delayMs ?? 0;
  const requests = new Map<string, MockRequest>();
  let requestCounter = 0;
  /** Smoke-only deny surface; survives full reloads via sessionStorage. */
  const staffCanActNow = (): boolean => {
    try {
      if (typeof sessionStorage !== "undefined") {
        const flag = sessionStorage.getItem("B1_SMOKE_STAFF_CAN_ACT");
        if (flag === "0") return false;
        if (flag === "1") return true;
      }
    } catch {
      /* ignore */
    }
    return true;
  };
  if (typeof globalThis !== "undefined") {
    (globalThis as { __B1_SMOKE_SET_STAFF_CAN_ACT__?: (v: boolean) => void }).__B1_SMOKE_SET_STAFF_CAN_ACT__ =
      (value: boolean) => {
        try {
          sessionStorage.setItem("B1_SMOKE_STAFF_CAN_ACT", value ? "1" : "0");
        } catch {
          /* ignore */
        }
      };
  }

  async function sleep(): Promise<void> {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  function requireServiceCode(code: string): B1CanonicalCode {
    const normalized = normalizeStudentRequestTypeCode(code);
    if (!isB1ServiceCode(normalized)) {
      throw new B1AdapterError("VALIDATION_ERROR", `Unknown B1 service code: ${code}`, {
        serviceCode: "unknown_service",
      });
    }
    return normalized;
  }

  function requireRequest(requestId: string): MockRequest {
    const request = requests.get(requestId);
    if (!request) {
      throw new B1AdapterError("NOT_FOUND", `Request not found: ${requestId}`);
    }
    return request;
  }

  function findStep(stepId: string): {
    request: MockRequest;
    step: B1WorkflowStepView;
    index: number;
  } {
    for (const request of requests.values()) {
      const index = request.steps.findIndex(
        (step) => stepIdOf(request.requestId, step.key) === stepId,
      );
      if (index >= 0) return { request, step: request.steps[index]!, index };
    }
    throw new B1AdapterError("NOT_FOUND", `Workflow step not found: ${stepId}`);
  }

  function pushStudentMessage(request: MockRequest, fromLabelAr: string, bodyAr: string): void {
    request.studentVisibleMessages.push({ at: nowIso(), fromLabelAr, bodyAr });
  }

  function toAssignedRequest(request: MockRequest): B1AssignedRequest | null {
    if (!request.submittedAt) return null;
    const status = deriveStatus(request);
    if (status === "completed" || status === "rejected" || status === "returned") return null;
    const active = request.steps.find((step) => step.status === "active");
    if (!active) return null;
    const config = getB1ServiceConfig(request.serviceCode);
    return {
      requestId: request.requestId,
      stepId: stepIdOf(request.requestId, active.key),
      requestNumber: request.requestNumber,
      serviceCode: request.serviceCode,
      serviceTitleAr: config?.titleAr ?? request.serviceCode,
      studentNameAr: request.studentNameAr,
      studentNumber: request.studentNumber,
      stepKey: active.key,
      stepLabelAr: active.labelAr,
      allowedAction: primaryActionForStep(active),
      submittedAt: request.submittedAt,
    };
  }

  function applyProgression(
    request: MockRequest,
    step: B1WorkflowStepView,
    index: number,
    action: B1StaffAction,
    comment?: string,
  ): B1StepActionResult {
    const actedAt = nowIso();
    const trimmedComment = comment?.trim();

    if (action === "return" || action === "reject") {
      step.status = action === "return" ? "returned" : "rejected";
      step.actedAt = actedAt;
      step.commentAr = trimmedComment;
      pushStudentMessage(
        request,
        "جهة المعالجة (تجريبي)",
        action === "return"
          ? `أُعيد طلبك لاستكماله. الملاحظة: ${trimmedComment}`
          : `تم رفض طلبك. الملاحظة: ${trimmedComment}`,
      );
    } else {
      step.status = "completed";
      step.actedAt = actedAt;
      if (trimmedComment) step.commentAr = trimmedComment;
      const next = request.steps[index + 1];
      if (next && next.status === "pending") {
        next.status = "active";
      } else if (!next) {
        pushStudentMessage(request, "النظام (تجريبي)", "تم اكتمال جميع خطوات طلبك بنجاح.");
      }
    }

    request.updatedAt = actedAt;
    return {
      accepted: true,
      stepId: stepIdOf(request.requestId, step.key),
      requestId: request.requestId,
      action,
    };
  }

  function seedStaffFixtures(): void {
    // Fixture 1: suspension request waiting at the first review step.
    const suspensionId = "b1mock-seed-suspension";
    const suspensionNumber = `B1-MOCK-${String(++requestCounter).padStart(4, "0")}`;
    requests.set(suspensionId, {
      requestId: suspensionId,
      requestNumber: suspensionNumber,
      serviceCode: "enrollment_suspension",
      studentNameAr: MOCK_STUDENT_NAME_AR,
      studentNumber: MOCK_STUDENT_NUMBER,
      formData: {
        target_academic_year: "mock-year-1447",
        target_semester: "mock-sem-first",
        suspension_reason: "ظرف صحي مؤقت (بيانات تجريبية للعرض فقط).",
        suspension_duration_type: "one_semester",
        terms_acknowledgment: true,
      },
      attachments: [],
      submittedAt: nowIso(),
      steps: buildSteps("enrollment_suspension"),
      studentVisibleMessages: [
        {
          at: nowIso(),
          fromLabelAr: "النظام (تجريبي)",
          bodyAr: "تم استلام طلب وقف القيد (بيانات تجريبية).",
        },
      ],
      updatedAt: nowIso(),
    });

    // Fixture 2: transfer request advanced to the payment confirmation step.
    const transferId = "b1mock-seed-transfer";
    const transferNumber = `B1-MOCK-${String(++requestCounter).padStart(4, "0")}`;
    const transferSteps = buildSteps("department_transfer");
    for (let index = 0; index < 4; index += 1) {
      transferSteps[index]!.status = "completed";
      transferSteps[index]!.actedAt = nowIso();
    }
    transferSteps[4]!.status = "active"; // payment_confirmation
    requests.set(transferId, {
      requestId: transferId,
      requestNumber: transferNumber,
      serviceCode: "department_transfer",
      studentNameAr: MOCK_STUDENT_NAME_AR,
      studentNumber: MOCK_STUDENT_NUMBER,
      formData: {
        target_department_id: "mock-dept-is",
        target_program_id: "mock-prog-is-bsc",
        transfer_reason: "رغبة في التخصص بمجال نظم المعلومات (بيانات تجريبية).",
      },
      attachments: [
        {
          attachmentId: "b1mock-att-seed-transfer",
          attachmentType: "secondary_certificate",
          fileName: "mock-secondary-certificate.pdf",
          fileSizeBytes: 128 * 1024,
          mimeType: "application/pdf",
          status: "attached",
          storageRef: "mock://attachments/b1mock-seed-transfer/secondary_certificate",
        },
      ],
      submittedAt: nowIso(),
      steps: transferSteps,
      studentVisibleMessages: [
        {
          at: nowIso(),
          fromLabelAr: "النظام (تجريبي)",
          bodyAr: "طلبك بانتظار تأكيد استلام الرسوم من موظف الإيرادات.",
        },
      ],
      updatedAt: nowIso(),
    });
  }

  seedStaffFixtures();

  return {
    async getB1RuntimeCapability() {
      await sleep();
      return {
        available: true,
        services: B1_UI_SERVICES.map((s) => s.code),
        reads: [
          "form_options",
          "draft",
          "student_details",
          "student_list",
          "assigned_inbox",
          "assigned_details",
          "step_actions",
          "attachments",
        ],
        writesAvailable: ["create_draft", "save_draft"],
        writesFailClosed: [],
        draftMutationsContract: "B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01",
      };
    },

    async getAvailableB1RequestTypes(): Promise<readonly B1ServiceAvailability[]> {
      await sleep();
      let forceAvailable = false;
      try {
        forceAvailable =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem("B1_SMOKE_FORCE_AVAILABLE") === "1";
      } catch {
        forceAvailable = false;
      }
      return B1_UI_SERVICES.map((service) => {
        const runtimeAvailable = forceAvailable || !service.activationBlockedReason;
        return {
          code: service.code,
          titleAr: service.titleAr,
          descriptionAr: service.descriptionAr,
          feePolicy: service.feePolicy,
          studentVisible: true,
          runtimeAvailable,
          ...(!runtimeAvailable && service.activationBlockedReason
            ? { activationBlockedReason: service.activationBlockedReason }
            : {}),
        };
      });
    },

    async getB1RequestFormOptions(serviceCode: B1CanonicalCode): Promise<B1FormOptions> {
      await sleep();
      return buildFormOptions(requireServiceCode(serviceCode));
    },

    async createB1RequestDraft(serviceCode: B1CanonicalCode): Promise<B1Draft> {
      await sleep();
      const code = requireServiceCode(serviceCode);
      // Deterministic non-UUID ids — avoids leaking UUID-shaped strings into the UI.
      const seq = String(++requestCounter).padStart(4, "0");
      const requestId = `b1mock-req-${seq}`;
      const request: MockRequest = {
        requestId,
        requestNumber: `B1-MOCK-${seq}`,
        serviceCode: code,
        studentNameAr: MOCK_STUDENT_NAME_AR,
        studentNumber: MOCK_STUDENT_NUMBER,
        formData: {},
        attachments: [],
        steps: [],
        studentVisibleMessages: [],
        updatedAt: nowIso(),
      };
      requests.set(requestId, request);
      return {
        requestId,
        serviceCode: code,
        formData: request.formData,
        attachments: request.attachments,
        status: "draft",
        updatedAt: request.updatedAt,
      };
    },

    async getB1RequestDraft(requestId: string): Promise<B1Draft | null> {
      await sleep();
      const request = requests.get(requestId);
      if (!request || request.submittedAt) return null;
      return {
        requestId: request.requestId,
        serviceCode: request.serviceCode,
        formData: request.formData,
        attachments: request.attachments,
        status: "draft",
        updatedAt: request.updatedAt,
      };
    },

    async saveB1RequestDraft(
      requestId: string,
      formData: Record<string, unknown>,
      expectedUpdatedAt: string,
    ): Promise<B1Draft> {
      await sleep();
      const request = requireRequest(requestId);
      if (request.submittedAt) {
        throw new B1AdapterError("VALIDATION_ERROR", "Request is no longer a draft.", {
          requestId: "not_draft",
        });
      }
      if (!expectedUpdatedAt || request.updatedAt !== expectedUpdatedAt) {
        throw new B1AdapterError("STALE_VERSION", "B1_STALE_REQUEST_VERSION");
      }
      request.formData = { ...formData };
      request.updatedAt = nowIso();
      return {
        requestId: request.requestId,
        serviceCode: request.serviceCode,
        formData: request.formData,
        attachments: request.attachments,
        status: "draft",
        updatedAt: request.updatedAt,
      };
    },

    async uploadB1RequestAttachment(
      requestId: string,
      attachmentType: string,
      file: File,
    ): Promise<B1AttachmentMeta> {
      await sleep();
      const request = requireRequest(requestId);
      if (request.submittedAt) {
        throw new B1AdapterError("VALIDATION_ERROR", "Cannot attach files after submission.", {
          attachment: "not_draft",
        });
      }
      if (file.size > B1_MOCK_MAX_ATTACHMENT_BYTES) {
        throw new B1AdapterError("VALIDATION_ERROR", "Attachment exceeds the 10MB limit.", {
          [attachmentType]: "attachment_too_large",
        });
      }
      if (!(B1_MOCK_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new B1AdapterError(
          "VALIDATION_ERROR",
          "Unsupported attachment type (pdf/png/jpeg only).",
          {
            [attachmentType]: "unsupported_attachment_type",
          },
        );
      }
      const meta: B1AttachmentMeta = {
        attachmentId: `b1mock-att-${request.attachments.length + 1}-${requestId}`,
        attachmentType,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        status: "attached",
        storageRef: `mock://attachments/${requestId}/${attachmentType}`,
      };
      request.attachments.push(meta);
      request.updatedAt = nowIso();
      return meta;
    },

    async removeB1RequestAttachment(requestId: string, attachmentId: string): Promise<void> {
      await sleep();
      const request = requireRequest(requestId);
      if (request.submittedAt) {
        throw new B1AdapterError(
          "VALIDATION_ERROR",
          "Cannot remove attachments after submission.",
          {
            attachment: "not_draft",
          },
        );
      }
      const index = request.attachments.findIndex((item) => item.attachmentId === attachmentId);
      if (index < 0) {
        throw new B1AdapterError("VALIDATION_ERROR", "Attachment not found on this request.", {
          attachment: "attachment_not_found",
        });
      }
      request.attachments.splice(index, 1);
      request.updatedAt = nowIso();
    },

    async submitB1Request(
      requestId: string,
      expectedUpdatedAt: string,
      _stepUpProof?: string | null,
    ): Promise<B1SubmitResult> {
      await sleep();
      const request = requireRequest(requestId);
      if (request.submittedAt) {
        throw new B1AdapterError("VALIDATION_ERROR", "Request is no longer a draft.", {
          requestId: "not_draft",
        });
      }
      if (request.updatedAt !== expectedUpdatedAt) {
        throw new B1AdapterError(
          "STALE_VERSION",
          "Draft changed since it was loaded. Reload before submitting.",
        );
      }
      // Map uploaded attachments onto their form field so backend-contract
      // attachment validators (e.g. excuse_documents) see a real reference.
      const validationPayload: Record<string, unknown> = { ...request.formData };
      for (const attachment of request.attachments) {
        validationPayload[attachment.attachmentType] = {
          fileName: attachment.fileName,
          storagePath: attachment.storageRef,
        };
      }
      const validation = validateB1FormValues(request.serviceCode, validationPayload);
      if (!validation.valid) {
        throw new B1AdapterError("VALIDATION_ERROR", "Form validation failed.", validation.errors);
      }
      const submittedAt = nowIso();
      request.submittedAt = submittedAt;
      request.steps = buildSteps(request.serviceCode);
      request.updatedAt = submittedAt;
      const config = getB1ServiceConfig(request.serviceCode);
      pushStudentMessage(
        request,
        "النظام (تجريبي)",
        `تم استلام طلبك (${config?.titleAr ?? request.serviceCode}) ورقمه ${request.requestNumber}.`,
      );
      return {
        requestId: request.requestId,
        requestNumber: request.requestNumber,
        submittedAt,
        updatedAt: request.updatedAt,
      };
    },

    async downloadB1RequestAttachment(attachmentId: string) {
      await sleep();
      for (const request of requests.values()) {
        const hit = request.attachments.find((a) => a.attachmentId === attachmentId);
        if (hit) {
          return {
            url: `https://mock.example.test/download/${attachmentId}`,
            expiresInSeconds: 120,
            filename: hit.fileName,
            mimeType: hit.mimeType,
          };
        }
      }
      throw new B1AdapterError("PERMISSION_DENIED", "ATTACHMENT_ACCESS_DENIED");
    },

    async listB1StudentRequests() {
      await sleep();
      return [...requests.values()].map((request) => {
        const config = getB1ServiceConfig(request.serviceCode);
        return {
          requestId: request.requestId,
          requestNumber: request.requestNumber,
          serviceCode: request.serviceCode,
          serviceTitleAr: config?.titleAr ?? request.serviceCode,
          status: deriveStatus(request),
          submittedAt: request.submittedAt,
          updatedAt: request.updatedAt,
        };
      });
    },

    async getB1RequestDetails(requestId: string): Promise<B1RequestDetails> {
      await sleep();
      const request = requireRequest(requestId);
      const config = getB1ServiceConfig(request.serviceCode);
      return {
        requestId: request.requestId,
        requestNumber: request.requestNumber,
        serviceCode: request.serviceCode,
        serviceTitleAr: config?.titleAr ?? request.serviceCode,
        status: deriveStatus(request),
        formData: request.formData,
        attachments: request.attachments,
        steps: request.steps.map((step) => ({ ...step })),
        studentVisibleMessages: request.studentVisibleMessages,
        updatedAt: request.updatedAt,
      };
    },

    async getAssignedB1Requests(): Promise<readonly B1AssignedRequest[]> {
      await sleep();
      if (!staffCanActNow()) return [];
      return [...requests.values()]
        .map(toAssignedRequest)
        .filter((item): item is B1AssignedRequest => item !== null)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    },

    async getAssignedB1RequestDetails(requestId: string): Promise<B1AssignedRequestDetails> {
      await sleep();
      if (!staffCanActNow()) {
        throw new B1AdapterError("PERMISSION_DENIED", "Not assigned to this request.");
      }
      const request = requireRequest(requestId);
      const assigned = toAssignedRequest(request);
      if (!assigned) {
        throw new B1AdapterError("NOT_FOUND", `No active assigned step for request: ${requestId}`);
      }
      const formDataSummary = buildB1StudentFormSummaryItems({
        serviceCode: request.serviceCode,
        formData: request.formData,
      });
      return {
        ...assigned,
        formDataSummary,
        attachments: request.attachments,
        steps: request.steps.map((step) => ({ ...step })),
        updatedAt: request.updatedAt,
      };
    },

    async actOnB1RequestStep(
      stepId: string,
      action: B1StaffAction,
      comment?: string,
    ): Promise<B1StepActionResult> {
      await sleep();
      const { request, step, index } = findStep(stepId);
      if (step.status !== "active") {
        throw new B1AdapterError("PERMISSION_DENIED", "Step is not active for this request.");
      }
      if ((action === "return" || action === "reject") && !comment?.trim()) {
        throw new B1AdapterError("VALIDATION_ERROR", "Comment is required for return/reject.", {
          comment: "comment_required",
        });
      }
      if (!allowedActionsForStep(step).includes(action)) {
        throw new B1AdapterError(
          "PERMISSION_DENIED",
          `Action ${action} is not allowed on step ${step.key} (expected ${primaryActionForStep(step)}).`,
        );
      }
      return applyProgression(request, step, index, action, comment);
    },

    async confirmB1RevenueReceipt(
      stepId: string,
      optionalNote?: string,
    ): Promise<B1StepActionResult> {
      await sleep();
      const { request, step, index } = findStep(stepId);
      // Simplified receipt: no amount/currency/invoice is ever recorded here.
      if (step.action !== "confirm_payment" || step.status !== "active") {
        throw new B1AdapterError(
          "PERMISSION_DENIED",
          "Revenue receipt can only be confirmed on the active payment confirmation step.",
        );
      }
      return applyProgression(request, step, index, "confirm_payment", optionalNote);
    },
  };
}
