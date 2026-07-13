/**
 * Document, signatory, and archive handoff contract foundation (P13).
 * Pure normalization/validation — no DB writes, no PDF, no upload, no signing, no archive.
 */

import {
  getStudentRequestTypeDefinition,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import { getCanonicalWorkflowPreview } from "@/lib/student-requests/request-workflow-preview-registry";
import {
  buildDefaultClearanceGroup,
  type StudentRequestParallelClearanceGroup,
} from "@/lib/student-requests/parallel-clearance-contract";
import { APPROVED_WORKFLOW_ROLE_KEYS } from "@/lib/student-requests/request-workflow-save-contract";

export const DOCUMENT_FOUNDATION_STATUSES = [
  "not_required",
  "pending_generation",
  "generation_ready",
  "pending_local_signatures",
  "pending_central_signature",
  "ready_for_issue",
  "ready_for_archive",
  "archived",
] as const;

export type StudentRequestDocumentFoundationStatus =
  (typeof DOCUMENT_FOUNDATION_STATUSES)[number];

export const STUDENT_REQUEST_DOCUMENT_TYPES = [
  "grade_statement_non_graduate_document",
  "enrollment_certificate_document",
  "file_withdrawal_grade_statement",
  "file_withdrawal_clearance_summary",
  "october_exam_entry_form_document",
  "request_decision_document",
  "request_archive_package",
] as const;

export type StudentRequestDocumentType = (typeof STUDENT_REQUEST_DOCUMENT_TYPES)[number];

export type StudentRequestSignatoryScope = "local" | "central";

export type StudentRequestSignatoryKey =
  | "dean"
  | "registrar_general"
  | "graduate_affairs_manager"
  | "student_affairs_manager"
  | "department_head"
  | "university_registrar_general"
  | "vice_president_student_affairs";

export type StudentRequestDocumentSignatoryRequirement = {
  signatoryKey: StudentRequestSignatoryKey;
  labelAr: string;
  scope: StudentRequestSignatoryScope;
  required: boolean;
  /** Client must NOT supply signatory user id. */
  signatoryUserId?: never;
};

export type StudentRequestDocumentSignatoryStatus = {
  signatoryKey: StudentRequestSignatoryKey;
  scope: StudentRequestSignatoryScope;
  status: "not_required" | "pending" | "signed";
  /** No client-trusted actorRole. */
  actorRole?: never;
};

export type StudentRequestDocumentDefinition = {
  documentType: StudentRequestDocumentType;
  labelAr: string;
  requestTypeCodes: readonly string[];
  signatories: readonly StudentRequestDocumentSignatoryRequirement[];
  requiresParallelClearance: boolean;
  requiresFinalApproval: boolean;
  producesIssuableDocument: boolean;
  /** Conceptual foundation status for preview only. */
  foundationStatus: StudentRequestDocumentFoundationStatus;
};

export type StudentRequestDocumentGenerationInput = {
  requestId: string;
  requestTypeCode: string;
  documentType: string;
  note?: string | null;
  /** Rejected client fields. */
  documentNumber?: never;
  signatoryUserId?: never;
  publicUrl?: never;
  file?: never;
  fileBase64?: never;
  blob?: never;
  actorUserId?: never;
  actorRole?: never;
};

export type StudentRequestDocumentGenerationResult = {
  status: DocumentArchiveDryRunStatus;
  valid: boolean;
  capability: StudentRequestDocumentArchiveCapability;
  issues: StudentRequestDocumentArchiveValidationIssue[];
  summaryAr: string;
  documentType: StudentRequestDocumentType | null;
  foundationStatus: StudentRequestDocumentFoundationStatus;
  signatories: StudentRequestDocumentSignatoryStatus[];
  executed: false;
};

export type StudentRequestArchiveHandoffInput = {
  requestId: string;
  requestTypeCode: string;
  /** Parallel clearance group status for file_withdrawal preview. */
  parallelClearanceComplete?: boolean | null;
  finalApprovalComplete?: boolean | null;
  documentsReady?: boolean | null;
  signaturesComplete?: boolean | null;
  /** Rejected client fields. */
  archiveRecordId?: never;
  documentNumber?: never;
  publicUrl?: never;
  actorUserId?: never;
  actorRole?: never;
};

export type StudentRequestArchiveHandoffResult = {
  status: DocumentArchiveDryRunStatus;
  valid: boolean;
  capability: StudentRequestDocumentArchiveCapability;
  issues: StudentRequestDocumentArchiveValidationIssue[];
  summaryAr: string;
  archiveReady: boolean;
  expectedDocuments: StudentRequestDocumentType[];
  executed: false;
};

export type StudentRequestDocumentArchiveCapabilityReason =
  "document_archive_runtime_unavailable";

export type StudentRequestDocumentArchiveCapability = {
  canValidate: boolean;
  canGenerateDocument: boolean;
  canRecordSignature: boolean;
  canIssueDocument: boolean;
  canArchiveRequest: boolean;
  reason: StudentRequestDocumentArchiveCapabilityReason;
  messageAr: string;
};

export type DocumentArchiveValidationSeverity = "error" | "warning" | "info";

export type StudentRequestDocumentArchiveValidationIssue = {
  severity: DocumentArchiveValidationSeverity;
  code: string;
  messageAr: string;
  field?: string;
  documentType?: StudentRequestDocumentType;
};

export type DocumentArchiveDryRunStatus =
  | "VALID"
  | "VALID_WITH_WARNINGS"
  | "INVALID"
  | "UNAUTHORIZED"
  | "EXECUTION_UNAVAILABLE"
  | "UNSUPPORTED_ACTION";

export type StudentRequestDocumentArchiveActorContext = {
  userId: string;
  appRoles: readonly string[];
  processingRoleKeys: readonly string[];
  isStaffInboxAuthorized: boolean;
  requestTypeCode: string | null;
  /** Signatory key the actor attempts to sign as — from server context only. */
  targetSignatoryKey: StudentRequestSignatoryKey | null;
};

export type StudentRequestDocumentArchiveDryRunResult =
  | StudentRequestDocumentGenerationResult
  | StudentRequestArchiveHandoffResult;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOCAL_SIGNATORY_KEYS = new Set<StudentRequestSignatoryKey>([
  "dean",
  "registrar_general",
  "graduate_affairs_manager",
  "student_affairs_manager",
  "department_head",
]);

const CENTRAL_SIGNATORY_KEYS = new Set<StudentRequestSignatoryKey>([
  "university_registrar_general",
  "vice_president_student_affairs",
]);

const SIGNATORY_LABELS_AR: Readonly<Record<StudentRequestSignatoryKey, string>> = {
  dean: "العميد",
  registrar_general: "مسجل الكلية",
  graduate_affairs_manager: "مدير شؤون الخريجين",
  student_affairs_manager: "مدير شؤون الطلاب",
  department_head: "رئيس القسم",
  university_registrar_general: "مسجل الجامعة العام (جهة مركزية)",
  vice_president_student_affairs: "نائب رئيس الجامعة لشؤون الطلاب (جهة مركزية)",
};

const LOCAL_SIGNATORY_TO_PROCESSING_ROLE: Readonly<
  Partial<Record<StudentRequestSignatoryKey, string>>
> = {
  dean: "dean",
  registrar_general: "registrar_general",
  graduate_affairs_manager: "graduate_affairs_manager",
  student_affairs_manager: "student_affairs_manager",
  department_head: "department_head",
};

export const DOCUMENT_ARCHIVE_EXECUTION_UNAVAILABLE_MSG =
  "إنشاء المستندات والتوقيع والأرشفة يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً. شهادة القيد متوقفة أيضاً بسبب غياب مولّد PDF/Storage خادم قابل لإعادة الاستخدام.";

export const DOCUMENT_ARCHIVE_DRY_RUN_SUCCESS_MSG =
  "تم التحقق فقط. لم يتم إنشاء أو توقيع أو أرشفة أي مستند.";

export const DOCUMENT_ARCHIVE_FOUNDATION_PREVIEW_MSG =
  "هذه معاينة تأسيسية للمستندات والتوقيعات والأرشفة. لم يتم إنشاء أو توقيع أو أرشفة أي مستند.";

/** Enrollment certificate G8: keep execute buttons fail-closed until PDF generator exists. */
export const ENROLLMENT_CERTIFICATE_ISSUE_EXECUTE_DISABLED_MSG =
  "إصدار/أرشفة شهادة القيد مجمّدان: مولّد PDF/Storage غير متوفر (HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING).";

function pushIssue(
  issues: StudentRequestDocumentArchiveValidationIssue[],
  issue: StudentRequestDocumentArchiveValidationIssue,
): void {
  issues.push(issue);
}

function signatory(
  key: StudentRequestSignatoryKey,
  required = true,
): StudentRequestDocumentSignatoryRequirement {
  return {
    signatoryKey: key,
    labelAr: SIGNATORY_LABELS_AR[key],
    scope: CENTRAL_SIGNATORY_KEYS.has(key) ? "central" : "local",
    required,
  };
}

const DOCUMENT_DEFINITIONS: readonly StudentRequestDocumentDefinition[] = [
  {
    documentType: "grade_statement_non_graduate_document",
    labelAr: "شهادة تقديرات لغير الخريجين",
    requestTypeCodes: ["grade_statement_non_graduate"],
    signatories: [
      signatory("graduate_affairs_manager"),
      signatory("university_registrar_general"),
      signatory("dean"),
      signatory("registrar_general"),
    ],
    requiresParallelClearance: false,
    requiresFinalApproval: true,
    producesIssuableDocument: true,
    foundationStatus: "pending_local_signatures",
  },
  {
    documentType: "enrollment_certificate_document",
    labelAr: "شهادة قيد",
    requestTypeCodes: ["enrollment_certificate"],
    signatories: [signatory("dean"), signatory("registrar_general")],
    requiresParallelClearance: false,
    requiresFinalApproval: true,
    producesIssuableDocument: true,
    foundationStatus: "pending_local_signatures",
  },
  {
    documentType: "file_withdrawal_grade_statement",
    labelAr: "بيان تقديرات (سحب ملف)",
    requestTypeCodes: ["file_withdrawal"],
    signatories: [signatory("registrar_general")],
    requiresParallelClearance: true,
    requiresFinalApproval: true,
    producesIssuableDocument: true,
    foundationStatus: "pending_generation",
  },
  {
    documentType: "file_withdrawal_clearance_summary",
    labelAr: "ملخص إخلاء طرف (سحب ملف)",
    requestTypeCodes: ["file_withdrawal"],
    signatories: [],
    requiresParallelClearance: true,
    requiresFinalApproval: true,
    producesIssuableDocument: false,
    foundationStatus: "pending_generation",
  },
  {
    documentType: "october_exam_entry_form_document",
    labelAr: "استمارة دخول دور أكتوبر",
    requestTypeCodes: ["october_exam_entry_form"],
    signatories: [signatory("registrar_general")],
    requiresParallelClearance: false,
    requiresFinalApproval: true,
    producesIssuableDocument: true,
    foundationStatus: "pending_generation",
  },
  {
    documentType: "request_decision_document",
    labelAr: "مستند قرار الطلب",
    requestTypeCodes: [
      "enrollment_suspension",
      "excused_absence",
      "grade_appeal",
      "department_transfer",
    ],
    signatories: [signatory("registrar_general")],
    requiresParallelClearance: false,
    requiresFinalApproval: true,
    producesIssuableDocument: true,
    foundationStatus: "pending_generation",
  },
  {
    documentType: "request_archive_package",
    labelAr: "حزمة أرشفة الطلب",
    requestTypeCodes: [
      "grade_statement_non_graduate",
      "enrollment_certificate",
      "file_withdrawal",
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "october_exam_entry_form",
    ],
    signatories: [],
    requiresParallelClearance: false,
    requiresFinalApproval: true,
    producesIssuableDocument: false,
    foundationStatus: "ready_for_archive",
  },
] as const;

const DOCUMENT_TYPE_SET = new Set<string>(STUDENT_REQUEST_DOCUMENT_TYPES);

export function validateDocumentArchiveCapability(): StudentRequestDocumentArchiveCapability {
  return {
    canValidate: true,
    canGenerateDocument: false,
    canRecordSignature: false,
    canIssueDocument: false,
    canArchiveRequest: false,
    reason: "document_archive_runtime_unavailable",
    messageAr: DOCUMENT_ARCHIVE_EXECUTION_UNAVAILABLE_MSG,
  };
}

export function getDocumentDefinition(
  documentType: string,
): StudentRequestDocumentDefinition | undefined {
  const normalized = normalizeDocumentType(documentType);
  if (!normalized) return undefined;
  return DOCUMENT_DEFINITIONS.find((d) => d.documentType === normalized);
}

export function getDocumentDefinitionsForRequestType(
  requestTypeCode: string | null | undefined,
): StudentRequestDocumentDefinition[] {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (!normalized) return [];
  return DOCUMENT_DEFINITIONS.filter((d) => d.requestTypeCodes.includes(normalized));
}

export function normalizeDocumentType(
  value: string | null | undefined,
): StudentRequestDocumentType | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || !DOCUMENT_TYPE_SET.has(trimmed)) return null;
  return trimmed as StudentRequestDocumentType;
}

export function normalizeDocumentGenerationInput(
  raw: Partial<StudentRequestDocumentGenerationInput> & {
    requestId: string;
    requestTypeCode: string;
    documentType: string;
  },
): StudentRequestDocumentGenerationInput {
  return {
    requestId: String(raw.requestId ?? "").trim(),
    requestTypeCode: normalizeStudentRequestTypeCode(raw.requestTypeCode),
    documentType: String(raw.documentType ?? "").trim(),
    note: raw.note?.trim() || null,
  };
}

export function normalizeArchiveHandoffInput(
  raw: Partial<StudentRequestArchiveHandoffInput> & {
    requestId: string;
    requestTypeCode: string;
  },
): StudentRequestArchiveHandoffInput {
  return {
    requestId: String(raw.requestId ?? "").trim(),
    requestTypeCode: normalizeStudentRequestTypeCode(raw.requestTypeCode),
    parallelClearanceComplete: raw.parallelClearanceComplete ?? null,
    finalApprovalComplete: raw.finalApprovalComplete ?? null,
    documentsReady: raw.documentsReady ?? null,
    signaturesComplete: raw.signaturesComplete ?? null,
  };
}

function rejectClientTrustedFields(
  rawExtras: Record<string, unknown> | undefined,
  issues: StudentRequestDocumentArchiveValidationIssue[],
): void {
  if (!rawExtras) return;

  const rejected: Array<{ key: string; code: string; messageAr: string }> = [
    {
      key: "documentNumber",
      code: "document_number_rejected",
      messageAr: "رقم المستند لا يُقبل من العميل — يُولَّد على الخادم عند التنفيذ.",
    },
    {
      key: "signatoryUserId",
      code: "signatory_user_id_rejected",
      messageAr: "معرّف الموقّع لا يُقبل من العميل — يُستمد من سياق الجلسة.",
    },
    {
      key: "publicUrl",
      code: "public_url_rejected",
      messageAr: "رابط عام للملف مرفوض — لا روابط عامة في هذه المرحلة.",
    },
    {
      key: "file",
      code: "file_rejected",
      messageAr: "رفع ملف مرفوض في هذه المرحلة.",
    },
    {
      key: "fileBase64",
      code: "base64_rejected",
      messageAr: "محتوى base64 مرفوض في هذه المرحلة.",
    },
    {
      key: "blob",
      code: "blob_rejected",
      messageAr: "Blob مرفوض في هذه المرحلة.",
    },
    {
      key: "actorUserId",
      code: "actor_user_id_rejected",
      messageAr: "معرّف المُنفّذ لا يُقبل من العميل.",
    },
    {
      key: "actorRole",
      code: "actor_role_rejected",
      messageAr: "دور المُنفّذ لا يُقبل من العميل — central ليس app_role.",
    },
    {
      key: "archiveRecordId",
      code: "archive_record_id_rejected",
      messageAr: "معرّف سجل الأرشفة لا يُقبل من العميل.",
    },
    {
      key: "manualSignatoryKey",
      code: "manual_signatory_rejected",
      messageAr: "اختيار الموقّع يدوياً مرفوض — يُستمد من سجل المستند.",
    },
  ];

  for (const rule of rejected) {
    if (rawExtras[rule.key] !== undefined && rawExtras[rule.key] !== null) {
      pushIssue(issues, {
        severity: "error",
        code: rule.code,
        messageAr: rule.messageAr,
        field: rule.key,
      });
    }
  }
}

function buildSignatoryStatuses(
  definition: StudentRequestDocumentDefinition,
): StudentRequestDocumentSignatoryStatus[] {
  return definition.signatories.map((s) => ({
    signatoryKey: s.signatoryKey,
    scope: s.scope,
    status: s.required ? "pending" : "not_required",
  }));
}

function resolveFoundationStatus(
  definition: StudentRequestDocumentDefinition,
): StudentRequestDocumentFoundationStatus {
  const hasCentral = definition.signatories.some((s) => s.scope === "central" && s.required);
  const hasLocal = definition.signatories.some((s) => s.scope === "local" && s.required);
  if (!definition.producesIssuableDocument && definition.documentType === "request_archive_package") {
    return "ready_for_archive";
  }
  if (hasCentral && hasLocal) return "pending_local_signatures";
  if (hasCentral) return "pending_central_signature";
  if (hasLocal) return "pending_local_signatures";
  if (definition.requiresParallelClearance) return "pending_generation";
  return definition.foundationStatus;
}

export function validateDocumentGenerationInput(
  input: StudentRequestDocumentGenerationInput,
  actor: StudentRequestDocumentArchiveActorContext,
  rawExtras?: Record<string, unknown>,
): StudentRequestDocumentGenerationResult {
  const capability = validateDocumentArchiveCapability();
  const issues: StudentRequestDocumentArchiveValidationIssue[] = [];

  rejectClientTrustedFields(rawExtras, issues);

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول للوصول إلى صندوق المعالجة.",
    });
  }

  if (!UUID_RE.test(input.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "معرّف الطلب غير صالح.",
      field: "requestId",
    });
  }

  const typeDef = getStudentRequestTypeDefinition(input.requestTypeCode);
  if (!typeDef) {
    pushIssue(issues, {
      severity: "error",
      code: "unknown_request_type",
      messageAr: `نوع الطلب غير معروف: ${input.requestTypeCode}`,
      field: "requestTypeCode",
    });
  }

  const documentType = normalizeDocumentType(input.documentType);
  if (!documentType) {
    pushIssue(issues, {
      severity: "error",
      code: "unknown_document_type",
      messageAr: `نوع المستند غير معروف: ${input.documentType}`,
      field: "documentType",
    });
  }

  const definition = documentType ? getDocumentDefinition(documentType) : undefined;
  if (documentType && !definition) {
    pushIssue(issues, {
      severity: "error",
      code: "document_definition_missing",
      messageAr: "تعريف المستند غير موجود في السجل.",
      documentType,
    });
  }

  if (definition && !definition.requestTypeCodes.includes(input.requestTypeCode)) {
    pushIssue(issues, {
      severity: "error",
      code: "document_type_request_mismatch",
      messageAr: `نوع المستند «${definition.labelAr}» غير متوافق مع نوع الطلب.`,
      documentType: definition.documentType,
    });
  }

  if (definition?.documentType === "october_exam_entry_form_document") {
    pushIssue(issues, {
      severity: "warning",
      code: "october_exam_qualified_courses_future",
      messageAr:
        "استمارة أكتوبر — المقررات المؤهلة فقط (مستقبلاً). لا استمارة فعلية في هذه المرحلة.",
      documentType: definition.documentType,
    });
  }

  if (definition?.requiresParallelClearance) {
    pushIssue(issues, {
      severity: "warning",
      code: "parallel_clearance_prerequisite",
      messageAr: "يتطلب اكتمال إخلاء الطرف المتوازي قبل إنشاء هذا المستند (مستقبلاً).",
      documentType: definition.documentType,
    });
  }

  if (typeDef && !typeDef.producesDocument && definition?.producesIssuableDocument) {
    pushIssue(issues, {
      severity: "warning",
      code: "request_type_no_document_flag",
      messageAr: "نوع الطلب لا يُعلَّم producesDocument — راجع السجل.",
    });
  }

  return buildDocumentGenerationDryRunResult(
    capability,
    issues,
    definition ?? null,
  );
}

export function validateSignatureRequirement(
  documentType: StudentRequestDocumentType,
  actor: StudentRequestDocumentArchiveActorContext,
  rawExtras?: Record<string, unknown>,
): StudentRequestDocumentGenerationResult {
  const capability = validateDocumentArchiveCapability();
  const issues: StudentRequestDocumentArchiveValidationIssue[] = [];
  const definition = getDocumentDefinition(documentType);

  rejectClientTrustedFields(rawExtras, issues);

  if (!definition) {
    pushIssue(issues, {
      severity: "error",
      code: "document_definition_missing",
      messageAr: "تعريف المستند غير موجود.",
      documentType,
    });
    return buildDocumentGenerationDryRunResult(capability, issues, null);
  }

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  }

  const targetKey = actor.targetSignatoryKey;
  if (!targetKey) {
    pushIssue(issues, {
      severity: "error",
      code: "signatory_key_required",
      messageAr: "مفتاح الموقّع مطلوب — لا اختيار يدوي من العميل.",
    });
    return buildDocumentGenerationDryRunResult(capability, issues, definition);
  }

  const required = definition.signatories.find((s) => s.signatoryKey === targetKey);
  if (!required) {
    pushIssue(issues, {
      severity: "error",
      code: "signatory_not_in_registry",
      messageAr: `الموقّع «${SIGNATORY_LABELS_AR[targetKey]}» غير مطلوب لهذا المستند.`,
      documentType,
    });
  }

  if (CENTRAL_SIGNATORY_KEYS.has(targetKey)) {
    const isCollegeStaff = actor.processingRoleKeys.some((k) =>
      (APPROVED_WORKFLOW_ROLE_KEYS as readonly string[]).includes(k),
    );
    if (
      isCollegeStaff &&
      !actor.appRoles.includes("admin") &&
      !actor.appRoles.includes("system_admin")
    ) {
      pushIssue(issues, {
        severity: "error",
        code: "college_cannot_execute_central_signature",
        messageAr: "موظفو الكلية لا يمكنهم تنفيذ التوقيع المركزي.",
        documentType,
      });
    }
    pushIssue(issues, {
      severity: "info",
      code: "central_signatory_spec_only",
      messageAr: "التوقيع المركزي موثّق فقط — لا app_role ولا تنفيذ من الكلية.",
      documentType,
    });
  } else if (LOCAL_SIGNATORY_KEYS.has(targetKey)) {
    const processingRole = LOCAL_SIGNATORY_TO_PROCESSING_ROLE[targetKey];
    if (
      processingRole &&
      !actor.processingRoleKeys.includes(processingRole) &&
      !actor.appRoles.includes("admin") &&
      !actor.appRoles.includes("system_admin")
    ) {
      pushIssue(issues, {
        severity: "error",
        code: "local_signatory_role_mismatch",
        messageAr: `الموظف غير مخول للتوقيع بصفة «${SIGNATORY_LABELS_AR[targetKey]}».`,
        documentType,
      });
    }
  }

  const localRequired = definition.signatories.filter((s) => s.scope === "local" && s.required);
  const centralRequired = definition.signatories.filter((s) => s.scope === "central" && s.required);
  if (localRequired.length > 0 && centralRequired.length > 0) {
    pushIssue(issues, {
      severity: "info",
      code: "local_does_not_replace_central",
      messageAr: "التوقيعات المحلية لا تُغني عن التوقيع المركزي.",
      documentType,
    });
  }

  return buildDocumentGenerationDryRunResult(capability, issues, definition);
}

export function validateArchiveHandoff(
  input: StudentRequestArchiveHandoffInput,
  actor: StudentRequestDocumentArchiveActorContext,
  rawExtras?: Record<string, unknown>,
): StudentRequestArchiveHandoffResult {
  const capability = validateDocumentArchiveCapability();
  const issues: StudentRequestDocumentArchiveValidationIssue[] = [];

  rejectClientTrustedFields(rawExtras, issues);

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  }

  if (!UUID_RE.test(input.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "معرّف الطلب غير صالح.",
      field: "requestId",
    });
  }

  const typeDef = getStudentRequestTypeDefinition(input.requestTypeCode);
  const expectedDocuments = getDocumentDefinitionsForRequestType(input.requestTypeCode).map(
    (d) => d.documentType,
  );

  if (!typeDef) {
    pushIssue(issues, {
      severity: "error",
      code: "unknown_request_type",
      messageAr: `نوع الطلب غير معروف: ${input.requestTypeCode}`,
    });
  }

  if (input.finalApprovalComplete === false) {
    pushIssue(issues, {
      severity: "error",
      code: "archive_before_final_approval",
      messageAr: "لا تُسلَّم حزمة الأرشفة قبل الاعتماد النهائي.",
    });
  }

  if (input.documentsReady === false) {
    pushIssue(issues, {
      severity: "error",
      code: "archive_documents_not_ready",
      messageAr: "المستندات غير جاهزة للأرشفة.",
    });
  }

  if (input.signaturesComplete === false) {
    pushIssue(issues, {
      severity: "error",
      code: "archive_signatures_incomplete",
      messageAr: "التوقيعات غير مكتملة — لا أرشفة.",
    });
  }

  const normalizedType = normalizeStudentRequestTypeCode(input.requestTypeCode);
  if (normalizedType === "file_withdrawal" && input.parallelClearanceComplete !== true) {
    pushIssue(issues, {
      severity: "error",
      code: "file_withdrawal_clearance_incomplete",
      messageAr: "سحب الملف — يتطلب اكتمال إخلاء الطرف المتوازي قبل الأرشفة.",
    });
  }

  if (typeDef?.requiresArchive && expectedDocuments.length === 0) {
    pushIssue(issues, {
      severity: "warning",
      code: "archive_package_expected",
      messageAr: "نوع الطلب يتطلب أرشفة — حزمة الأرشفة متوقعة.",
    });
  }

  const preview = getCanonicalWorkflowPreview(normalizedType);
  const hasArchiveStep = preview?.steps.some((s) => s.isArchiveStep) ?? false;
  if (typeDef?.requiresArchive && !hasArchiveStep) {
    pushIssue(issues, {
      severity: "warning",
      code: "workflow_archive_step_missing",
      messageAr: "خطوة الأرشيف غير موجودة في معاينة سير العمل.",
    });
  }

  return buildArchiveHandoffDryRunResult(
    capability,
    issues,
    expectedDocuments,
    input,
    typeDef?.requiresArchive ?? false,
  );
}

function buildDocumentGenerationDryRunResult(
  capability: StudentRequestDocumentArchiveCapability,
  issues: StudentRequestDocumentArchiveValidationIssue[],
  definition: StudentRequestDocumentDefinition | null,
): StudentRequestDocumentGenerationResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some((i) => i.code === "inbox_unauthorized");

  let status: DocumentArchiveDryRunStatus;
  if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canGenerateDocument) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  let summaryAr: string;
  if (status === "UNAUTHORIZED") {
    summaryAr = "غير مصرح — لا يمكن التحقق من إنشاء المستند.";
  } else if (status === "INVALID") {
    summaryAr = "المدخلات غير صالحة — راجع الأخطاء.";
  } else {
    summaryAr = `${DOCUMENT_ARCHIVE_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  }

  const foundationStatus = definition
    ? resolveFoundationStatus(definition)
    : "not_required";

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED",
    capability,
    issues,
    summaryAr,
    documentType: definition?.documentType ?? null,
    foundationStatus,
    signatories: definition ? buildSignatoryStatuses(definition) : [],
    executed: false,
  };
}

function buildArchiveHandoffDryRunResult(
  capability: StudentRequestDocumentArchiveCapability,
  issues: StudentRequestDocumentArchiveValidationIssue[],
  expectedDocuments: StudentRequestDocumentType[],
  input: StudentRequestArchiveHandoffInput,
  requiresArchive: boolean,
): StudentRequestArchiveHandoffResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some((i) => i.code === "inbox_unauthorized");

  let status: DocumentArchiveDryRunStatus;
  if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canArchiveRequest) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  const archiveReady =
    !hasErrors &&
    requiresArchive &&
    input.finalApprovalComplete !== false &&
    input.documentsReady !== false &&
    input.signaturesComplete !== false &&
    (input.requestTypeCode !== "file_withdrawal" || input.parallelClearanceComplete === true);

  let summaryAr: string;
  if (status === "UNAUTHORIZED") {
    summaryAr = "غير مصرح — لا يمكن التحقق من تسليم الأرشفة.";
  } else if (status === "INVALID") {
    summaryAr = "تسليم الأرشفة غير صالح — راجع الأخطاء.";
  } else {
    summaryAr = `${DOCUMENT_ARCHIVE_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  }

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED",
    capability,
    issues,
    summaryAr,
    archiveReady,
    expectedDocuments,
    executed: false,
  };
}

/** Preview parallel clearance requirement for file_withdrawal documents. */
export function getParallelClearancePreviewForDocuments(
  requestId: string,
  requestTypeCode: string,
): StudentRequestParallelClearanceGroup | null {
  return buildDefaultClearanceGroup(requestId, requestTypeCode);
}

export type DocumentArchiveScenarioResult = {
  id: number;
  name: string;
  expected: string;
  actual: DocumentArchiveDryRunStatus;
  valid: boolean;
};

export function runDocumentArchiveScenarioMatrix(): DocumentArchiveScenarioResult[] {
  const requestId = "00000000-0000-4000-8000-000000000001";

  const staffActor: StudentRequestDocumentArchiveActorContext = {
    userId: "server-user",
    appRoles: [],
    processingRoleKeys: ["registrar_general", "graduate_affairs_manager"],
    isStaffInboxAuthorized: true,
    requestTypeCode: "grade_statement_non_graduate",
    targetSignatoryKey: null,
  };

  const centralAttemptActor: StudentRequestDocumentArchiveActorContext = {
    ...staffActor,
    processingRoleKeys: ["registrar_general"],
    targetSignatoryKey: "university_registrar_general",
  };

  const unauthorizedActor: StudentRequestDocumentArchiveActorContext = {
    ...staffActor,
    isStaffInboxAuthorized: false,
  };

  const scenarios: Array<{
    id: number;
    name: string;
    expected: string;
    fn: () => { status: DocumentArchiveDryRunStatus };
  }> = [
    {
      id: 1,
      name: "grade_statement — generation صالح",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "grade_statement_non_graduate",
            documentType: "grade_statement_non_graduate_document",
          },
          staffActor,
        ),
    },
    {
      id: 2,
      name: "requestId غير UUID — INVALID",
      expected: "INVALID",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId: "bad-id",
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          staffActor,
        ),
    },
    {
      id: 3,
      name: "documentType غير متوافق مع requestType — INVALID",
      expected: "INVALID",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "grade_statement_non_graduate_document",
          },
          staffActor,
        ),
    },
    {
      id: 4,
      name: "documentNumber من العميل — INVALID",
      expected: "INVALID",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          staffActor,
          { documentNumber: "DOC-999" },
        ),
    },
    {
      id: 5,
      name: "signatoryUserId من العميل — INVALID",
      expected: "INVALID",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          staffActor,
          { signatoryUserId: "00000000-0000-4000-8000-000000000099" },
        ),
    },
    {
      id: 6,
      name: "File/base64 في payload — INVALID",
      expected: "INVALID",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          staffActor,
          { fileBase64: "data:application/pdf;base64,abc" },
        ),
    },
    {
      id: 7,
      name: "enrollment_certificate — local فقط بدون central",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () => {
        const result = validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          staffActor,
        );
        const hasCentral = result.signatories.some((s) => s.scope === "central");
        return { status: (hasCentral ? "INVALID" : result.status) as DocumentArchiveDryRunStatus };
      },
    },
    {
      id: 8,
      name: "college staff يحاول central signature — INVALID",
      expected: "INVALID",
      fn: () =>
        validateSignatureRequirement(
          "grade_statement_non_graduate_document",
          centralAttemptActor,
        ),
    },
    {
      id: 9,
      name: "manual signatory selection — INVALID",
      expected: "INVALID",
      fn: () =>
        validateSignatureRequirement(
          "enrollment_certificate_document",
          { ...staffActor, targetSignatoryKey: null },
          { manualSignatoryKey: "dean" },
        ),
    },
    {
      id: 10,
      name: "file_withdrawal archive — clearance incomplete",
      expected: "INVALID",
      fn: () =>
        validateArchiveHandoff(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            parallelClearanceComplete: false,
            finalApprovalComplete: true,
            documentsReady: true,
            signaturesComplete: true,
          },
          staffActor,
        ),
    },
    {
      id: 11,
      name: "file_withdrawal archive — clearance complete",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateArchiveHandoff(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            parallelClearanceComplete: true,
            finalApprovalComplete: true,
            documentsReady: true,
            signaturesComplete: true,
          },
          staffActor,
        ),
    },
    {
      id: 12,
      name: "archive قبل final approval — INVALID",
      expected: "INVALID",
      fn: () =>
        validateArchiveHandoff(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            finalApprovalComplete: false,
            documentsReady: true,
            signaturesComplete: true,
          },
          staffActor,
        ),
    },
    {
      id: 13,
      name: "october_exam — qualified courses warning",
      expected: "VALID_WITH_WARNINGS",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "october_exam_entry_form",
            documentType: "october_exam_entry_form_document",
          },
          staffActor,
        ),
    },
    {
      id: 14,
      name: "generic request_decision_document — enrollment_suspension",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_suspension",
            documentType: "request_decision_document",
          },
          staffActor,
        ),
    },
    {
      id: 15,
      name: "actor غير مخول — UNAUTHORIZED",
      expected: "UNAUTHORIZED",
      fn: () =>
        validateDocumentGenerationInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            documentType: "enrollment_certificate_document",
          },
          unauthorizedActor,
        ),
    },
    {
      id: 16,
      name: "publicUrl من العميل — INVALID",
      expected: "INVALID",
      fn: () =>
        validateArchiveHandoff(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            finalApprovalComplete: true,
            documentsReady: true,
            signaturesComplete: true,
          },
          staffActor,
          { publicUrl: "https://example.com/doc.pdf" },
        ),
    },
  ];

  return scenarios.map((s) => {
    const result = s.fn();
    return {
      id: s.id,
      name: s.name,
      expected: s.expected,
      actual: result.status,
      valid: result.status === s.expected,
    };
  });
}

/** Read-only integration note: official_transcript uses separate official_documents path. */
export const OFFICIAL_TRANSCRIPT_INTEGRATION_NOTE =
  "السجل الأكاديمي الرسمي (official_transcript) خارج نطاق P13 — مسار منفصل عبر official_documents و /document-view و /verify-document.";

/** Read-only integration note: existing storage policies unchanged. */
export const STORAGE_INTEGRATION_NOTE =
  "سياسات التخزين الحالية (student-request-attachments) لم تُعدَّل — P13 لا ينفّذ upload ولا createSignedUrl.";
