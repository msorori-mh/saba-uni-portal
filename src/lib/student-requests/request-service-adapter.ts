import type { RequestFormDefinition } from "./request-form-registry";

export const B1_CANONICAL_CODES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

export type B1CanonicalCode = (typeof B1_CANONICAL_CODES)[number];
export type B1FeePolicy = "FREE_NO_PAYMENT" | "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION";
export const SERVICE_ACTIVATION_BLOCKED = "SERVICE_ACTIVATION_BLOCKED" as const;
export const BLOCKED_PENDING_SECURE_ATTACHMENTS_RUNTIME = "BLOCKED_PENDING_SECURE_ATTACHMENTS_RUNTIME" as const;
export const BLOCKED_PENDING_EXTERNAL_PAYMENT_RUNTIME = "BLOCKED_PENDING_EXTERNAL_PAYMENT_RUNTIME" as const;
export const BLOCKED_PENDING_SECURE_ATTACHMENTS_AND_EXTERNAL_PAYMENT_RUNTIME = "BLOCKED_PENDING_SECURE_ATTACHMENTS_AND_EXTERNAL_PAYMENT_RUNTIME" as const;
export type B1Action = "review" | "approve" | "clear" | "apply_decision" | "archive" | "confirm_payment";
export type B1Outcome = "reviewed" | "approved" | "cleared" | "applied" | "archived" | "payment_confirmed";

export type ReferenceResolverKey =
  | "academic_years"
  | "semesters_for_year"
  | "current_student_enrollments"
  | "available_departments"
  | "available_programs"
  | "october_remaining_required_courses"
  | "published_final_results";

export type ReferenceOption = { value: string; labelAr: string };
export type ReferenceDataState =
  | { status: "loading"; options: readonly [] }
  | { status: "error"; options: readonly []; message: string }
  | { status: "ready"; options: readonly ReferenceOption[] };

export type ReferenceResolverDefinition = {
  key: ReferenceResolverKey;
  field: string;
  dependsOnField?: string;
  trustedServerValidationRequired: true;
};

export type DetailFieldBinding = {
  formField: string;
  detailField: string;
};

export type DetailBindingMetadata = {
  contractKey: string;
  cardinality: "one" | "many";
  fields: readonly DetailFieldBinding[];
  clientWriteAllowed: false;
};

export type SubmitExtensionMetadata = {
  validatorKey: string;
  transactionRequired: true;
  workflowStartsAfterValidation: true;
  supportsResubmit: true;
  runtimeAvailable: false;
};

export type RequestServiceAdapter = {
  canonicalCode: B1CanonicalCode;
  storedCodes: readonly string[];
  formDefinition?: RequestFormDefinition;
  referenceResolvers: readonly ReferenceResolverDefinition[];
  validate: (input: Record<string, unknown>) => { valid: boolean; errors: Record<string, string> };
  detailBinding: DetailBindingMetadata;
  submit: SubmitExtensionMetadata;
  detailLoaderKey: string;
  summaryRendererKey: string;
  feePolicy: B1FeePolicy;
  activationBlockedReason?: string;
};

export function validateB1ServiceActivation(input: {
  requestTypeCode: string;
}): { ok: true } | { ok: false; error: string; activationError: typeof SERVICE_ACTIVATION_BLOCKED } {
  const adapter = getRequestServiceAdapter(input.requestTypeCode);
  if (!adapter) throw new Error("UNKNOWN_STUDENT_REQUEST_TYPE_CODE");
  if (adapter.activationBlockedReason) {
    return { ok: false, error: adapter.activationBlockedReason, activationError: SERVICE_ACTIVATION_BLOCKED };
  }
  return { ok: true };
}

export function canSubmitWithReferenceData(
  requiredResolvers: readonly ReferenceResolverDefinition[],
  states: Readonly<Partial<Record<ReferenceResolverKey, ReferenceDataState>>>,
): boolean {
  return requiredResolvers.every((resolver) => states[resolver.key]?.status === "ready");
}

export function isResolvedReferenceValue(
  state: ReferenceDataState | undefined,
  value: unknown,
): boolean {
  return state?.status === "ready"
    && typeof value === "string"
    && state.options.some((option) => option.value === value && !option.value.includes("placeholder"));
}

export function isRealAttachmentReference(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.fileName === "string"
    && item.fileName.trim().length > 0
    && !item.fileName.toLowerCase().includes("placeholder")
    && typeof item.storagePath === "string"
    && item.storagePath.trim().length > 0
    && !item.storagePath.toLowerCase().includes("placeholder");
}

export const B1_ACTION_OUTCOME: Readonly<Record<B1Action, B1Outcome>> = {
  review: "reviewed",
  approve: "approved",
  clear: "cleared",
  apply_decision: "applied",
  archive: "archived",
  confirm_payment: "payment_confirmed",
};

export function actionMatchesStep(expected: B1Action, attempted: string): boolean {
  return expected === attempted;
}

export type B1WorkflowStep = {
  key: string;
  unit: string;
  role: string;
  action: B1Action;
};

const suspension: readonly B1WorkflowStep[] = [
  { key: "initial_review", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "manager_approval", unit: "student_affairs", role: "student_affairs_manager", action: "approve" },
  { key: "registrar_apply", unit: "registrar", role: "registrar_general", action: "apply_decision" },
];
const absence: readonly B1WorkflowStep[] = [
  { key: "student_affairs_intake", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "manager_review", unit: "student_affairs", role: "student_affairs_manager", action: "approve" },
  { key: "record_apply", unit: "student_affairs", role: "student_affairs_specialist", action: "apply_decision" },
];
const withdrawal: readonly B1WorkflowStep[] = [
  { key: "student_affairs_intake", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "library_clearance", unit: "library", role: "library_officer", action: "clear" },
  { key: "labs_clearance", unit: "labs", role: "labs_manager", action: "clear" },
  { key: "activities_clearance", unit: "student_affairs", role: "student_affairs_manager", action: "clear" },
  { key: "finance_clearance", unit: "finance", role: "revenue_finance_officer", action: "clear" },
  { key: "registrar_apply", unit: "registrar", role: "registrar_general", action: "apply_decision" },
  { key: "archive", unit: "archive", role: "archive_officer", action: "archive" },
];
const transfer: readonly B1WorkflowStep[] = [
  { key: "student_affairs_intake", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "source_department_head_approval", unit: "department", role: "department_head", action: "approve" },
  { key: "target_department_head_approval", unit: "department", role: "department_head", action: "approve" },
  { key: "dean_approval", unit: "dean", role: "dean", action: "approve" },
  { key: "payment_confirmation", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" },
  { key: "registrar_apply", unit: "registrar", role: "registrar_general", action: "apply_decision" },
];
const finalChance: readonly B1WorkflowStep[] = [
  { key: "student_affairs_intake", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "manager_review", unit: "student_affairs", role: "student_affairs_manager", action: "approve" },
  { key: "dean_decision", unit: "dean", role: "dean", action: "approve" },
  { key: "payment_confirmation", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" },
  { key: "registrar_apply", unit: "registrar", role: "registrar_general", action: "apply_decision" },
];

export const B1_WORKFLOWS: Readonly<Record<B1CanonicalCode, readonly B1WorkflowStep[]>> = {
  enrollment_suspension: suspension,
  excused_absence: absence,
  file_withdrawal: withdrawal,
  department_transfer: transfer,
  final_chance: finalChance,
};

export const B1_FEE_POLICIES: Readonly<Record<B1CanonicalCode, B1FeePolicy>> = {
  enrollment_suspension: "FREE_NO_PAYMENT",
  excused_absence: "FREE_NO_PAYMENT",
  file_withdrawal: "FREE_NO_PAYMENT",
  department_transfer: "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
  final_chance: "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
};

export type StepActor = {
  facultyProfileId: string;
  unit: string;
  role: string;
  departmentId?: string | null;
};

export type StepAuthorizationContext = {
  step: B1WorkflowStep;
  assignedFacultyProfileId: string | null;
  actor: StepActor;
  action: string;
  predecessorComplete: boolean;
};

export function canActOnB1Step(context: StepAuthorizationContext): boolean {
  return context.predecessorComplete
    && context.assignedFacultyProfileId !== null
    && context.actor.facultyProfileId === context.assignedFacultyProfileId
    && context.actor.unit === context.step.unit
    && context.actor.role === context.step.role
    && actionMatchesStep(context.step.action, context.action);
}

export function canActOnDepartmentHeadStep(context: StepAuthorizationContext & {
  requiredDepartmentId: string | null | undefined;
}): boolean {
  return Boolean(context.requiredDepartmentId)
    && context.step.role === "department_head"
    && context.actor.departmentId === context.requiredDepartmentId
    && canActOnB1Step(context);
}

export type B1RuntimeAuthorizationContext = {
  step: B1WorkflowStep;
  authenticatedUserId: string | null;
  assignedUserId: string | null;
  actorUnit: string;
  actorRole: string;
  attemptedAction: string;
  stepStatus: string;
  stepRequestId: string;
  actionRequestId: string;
  predecessorComplete: boolean;
  actorDepartmentId?: string | null;
  requiredDepartmentId?: string | null;
};

/** Source contract mirrored by the B1-specific branch in the database gate. */
export function canActOnB1RuntimeStep(context: B1RuntimeAuthorizationContext): boolean {
  if (!context.authenticatedUserId || !context.assignedUserId) return false;
  if (context.authenticatedUserId !== context.assignedUserId) return false;
  if (context.stepStatus !== "active") return false;
  if (context.stepRequestId !== context.actionRequestId) return false;
  if (!context.predecessorComplete) return false;
  if (context.actorUnit !== context.step.unit || context.actorRole !== context.step.role) return false;
  if (!actionMatchesStep(context.step.action, context.attemptedAction)) return false;
  if (context.step.role === "department_head") {
    return Boolean(context.requiredDepartmentId)
      && context.actorDepartmentId === context.requiredDepartmentId;
  }
  return true;
}

export type DepartmentHeadCandidate = {
  departmentId: string;
  facultyProfileId: string | null;
  unit: string;
  role: string;
  active: boolean;
};

export function resolveDirectDepartmentHead(
  departmentId: string | null | undefined,
  candidates: readonly DepartmentHeadCandidate[],
): { ok: true; facultyProfileId: string } | { ok: false; reason: string } {
  if (!departmentId) return { ok: false, reason: "missing_department_id" };
  const matches = candidates.filter((candidate) =>
    candidate.active
    && candidate.departmentId === departmentId
    && candidate.unit === "department"
    && candidate.role === "department_head"
    && candidate.facultyProfileId,
  );
  if (matches.length === 0) return { ok: false, reason: "department_head_not_found" };
  if (matches.length !== 1) return { ok: false, reason: "ambiguous_department_head" };
  return { ok: true, facultyProfileId: matches[0].facultyProfileId as string };
}

export const FINAL_CHANCE_TYPE = "final_chance" as const;
const LEGACY_CHANCE_TYPE_VALUES = ["additional_exam", "grade_recovery", "additional_chance"] as const;

export function normalizeChanceTypeForRead(value: unknown): typeof FINAL_CHANCE_TYPE | null {
  if (value === FINAL_CHANCE_TYPE) return FINAL_CHANCE_TYPE;
  return typeof value === "string" && (LEGACY_CHANCE_TYPE_VALUES as readonly string[]).includes(value)
    ? FINAL_CHANCE_TYPE
    : null;
}

export function isFinalChanceTypeForWrite(value: unknown): value is typeof FINAL_CHANCE_TYPE {
  return value === FINAL_CHANCE_TYPE;
}

export const SHARED_SUBMIT_EXTENSION = {
  detailBindingOptionalForLegacyServices: true,
  validatorRunsBeforeWorkflow: true,
  transactionAndRollbackRequired: true,
  supportsSubmitAndResubmit: true,
  changesExistingRpcSignature: false,
  runtimeAvailable: false,
} as const;

function requiredText(fields: readonly string[]) {
  return (input: Record<string, unknown>) => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (typeof input[field] !== "string" || !String(input[field]).trim()) errors[field] = "required";
    }
    return { valid: Object.keys(errors).length === 0, errors };
  };
}

function adapter(
  canonicalCode: B1CanonicalCode,
  storedCodes: readonly string[],
  feePolicy: B1FeePolicy,
  referenceResolvers: readonly ReferenceResolverDefinition[],
  detailBinding: DetailBindingMetadata,
  validate: RequestServiceAdapter["validate"],
  activationBlockedReason?: string,
): RequestServiceAdapter {
  return {
    canonicalCode,
    storedCodes,
    referenceResolvers,
    detailBinding,
    validate,
    submit: {
      validatorKey: `validate_${canonicalCode}`,
      transactionRequired: true,
      workflowStartsAfterValidation: true,
      supportsResubmit: true,
      runtimeAvailable: false,
    },
    detailLoaderKey: `load_${canonicalCode}_details`,
    summaryRendererKey: `${canonicalCode}_summary`,
    feePolicy,
    activationBlockedReason,
  };
}

const noClientWrite = (contractKey: string, cardinality: "one" | "many", fields: readonly DetailFieldBinding[]): DetailBindingMetadata => ({
  contractKey, cardinality, fields, clientWriteAllowed: false,
});

export const B1_SERVICE_ADAPTERS: Readonly<Record<B1CanonicalCode, RequestServiceAdapter>> = {
  enrollment_suspension: adapter(
    "enrollment_suspension", ["enrollment_suspension"], "FREE_NO_PAYMENT",
    [
      { key: "academic_years", field: "target_academic_year", trustedServerValidationRequired: true },
      { key: "semesters_for_year", field: "target_semester", dependsOnField: "target_academic_year", trustedServerValidationRequired: true },
    ],
    noClientWrite("enrollment_suspension_details", "one", [
      { formField: "target_academic_year", detailField: "requested_from_academic_year_id" },
      { formField: "target_semester", detailField: "requested_from_semester_id" },
      { formField: "suspension_reason", detailField: "suspension_reason" },
      { formField: "suspension_duration_type", detailField: "suspension_duration_type" },
      { formField: "notes", detailField: "notes" },
    ]),
    (input) => {
      const base = requiredText(["target_academic_year", "target_semester", "suspension_reason", "suspension_duration_type"])(input);
      if (!["one_semester", "full_year"].includes(String(input.suspension_duration_type ?? ""))) {
        base.errors.suspension_duration_type = "unknown_duration_type";
      }
      if (input.terms_acknowledgment !== true) base.errors.terms_acknowledgment = "required_true";
      return { valid: Object.keys(base.errors).length === 0, errors: base.errors };
    },
  ),
  excused_absence: adapter(
    "excused_absence", ["excused_absence", "absence_excuse"], "FREE_NO_PAYMENT",
    [{ key: "current_student_enrollments", field: "course_section_id", trustedServerValidationRequired: true }],
    noClientWrite("absence_excuse_details", "many", [
      { formField: "course_section_id", detailField: "course_section_id" },
      { formField: "absence_date", detailField: "absence_date" },
      { formField: "reason_type", detailField: "reason_type" },
      { formField: "absence_reason_detail", detailField: "absence_reason_detail" },
      { formField: "excuse_documents", detailField: "excuse_documents" },
    ]),
    (input) => {
      const base = requiredText(["course_section_id", "absence_date", "reason_type", "absence_reason_detail"])(input);
      const allowedReasons = ["medical", "family_emergency", "official", "other"];
      if (typeof input.reason_type === "string" && !allowedReasons.includes(input.reason_type)) base.errors.reason_type = "unknown_reason_type";
      if (!isRealAttachmentReference(input.excuse_documents)) base.errors.excuse_documents = "secure_attachment_required";
      return { valid: Object.keys(base.errors).length === 0, errors: base.errors };
    },
  ),
  department_transfer: adapter(
    "department_transfer", ["department_transfer", "transfer"], "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
    [
      { key: "available_departments", field: "target_department_id", trustedServerValidationRequired: true },
      { key: "available_programs", field: "target_program_id", dependsOnField: "target_department_id", trustedServerValidationRequired: true },
    ],
    noClientWrite("transfer_request_details", "one", [
      { formField: "target_department_id", detailField: "requested_department_id" },
      { formField: "target_program_id", detailField: "requested_program_id" },
      { formField: "transfer_reason", detailField: "transfer_reason" },
    ]),
    requiredText(["target_department_id", "target_program_id", "transfer_reason"]),
  ),
  final_chance: adapter(
    "final_chance", ["extra_chance"], "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION", [
      { key: "academic_years", field: "target_academic_year", trustedServerValidationRequired: true },
      { key: "semesters_for_year", field: "target_semester", dependsOnField: "target_academic_year", trustedServerValidationRequired: true },
    ],
    noClientWrite("extra_chance_details", "one", [
      { formField: "target_academic_year", detailField: "academic_year_id" },
      { formField: "target_semester", detailField: "semester_id" },
      { formField: "reason", detailField: "reason" },
      { formField: "chance_type", detailField: "chance_type" },
    ]),
    (input) => {
      const base = requiredText(["target_academic_year", "target_semester", "reason"])(input);
      const value = input.chance_type ?? FINAL_CHANCE_TYPE;
      if (!isFinalChanceTypeForWrite(value)) base.errors.chance_type = "unknown_chance_type";
      return { valid: Object.keys(base.errors).length === 0, errors: base.errors };
    },
  ),
  file_withdrawal: adapter(
    "file_withdrawal", ["file_withdrawal"], "FREE_NO_PAYMENT", [],
    noClientWrite("file_withdrawal_details", "one", [
      { formField: "withdrawal_reason", detailField: "withdrawal_reason" },
      { formField: "impact_acknowledgment", detailField: "impact_ack" },
    ]),
    (input) => {
      const errors: Record<string, string> = {};
      if (typeof input.withdrawal_reason !== "string" || input.withdrawal_reason.trim().length < 10) errors.withdrawal_reason = "minimum_10";
      if (input.impact_acknowledgment !== true) errors.impact_acknowledgment = "required_true";
      return { valid: Object.keys(errors).length === 0, errors };
    },
  ),
};

export function getRequestServiceAdapter(code: string): RequestServiceAdapter | undefined {
  const canonical = code === "transfer" ? "department_transfer"
    : code === "absence_excuse" ? "excused_absence"
      : code === "extra_chance" ? "final_chance"
        : code;
  return B1_SERVICE_ADAPTERS[canonical as B1CanonicalCode];
}
