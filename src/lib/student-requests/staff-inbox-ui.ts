/**
 * Staff inbox UI types, labels, and pure helpers (P6 foundation).
 * No DB queries — server functions map API/RPC rows into these shapes.
 */

import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";

export type StaffInboxStatusFilter =
  | "all"
  | "new"
  | "pending_action"
  | "returned"
  | "completed"
  | "rejected"
  | "cancelled";

export type StaffRequestInboxItem = {
  id: string;
  requestNumber: string | null;
  requestTypeCode: string;
  requestTypeNameAr: string;
  title: string;
  status: string;
  statusLabelAr: string;
  studentName: string | null;
  academicNumber: string | null;
  departmentId: string | null;
  departmentNameAr: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  currentStepKey: string | null;
  currentStepLabelAr: string | null;
  currentRoleKey: string | null;
  currentRoleLabelAr: string | null;
  waitingSince: string | null;
  isActionable: boolean;
  workflowStepRuntimeId: string | null;
  dataSource: "actor_inbox_rpc" | "legacy_overview";
};

export type StaffRequestStudentSummary = {
  id: string;
  fullNameAr: string | null;
  academicNumber: string | null;
  departmentNameAr: string | null;
  programNameAr: string | null;
  levelNameAr: string | null;
  studySystemLabelAr: string | null;
  enrollmentStatusLabelAr: string | null;
  status: string | null;
};

export type StaffRequestWorkflowStep = {
  id: string;
  stepKey: string;
  labelAr: string;
  roleKey: string | null;
  roleLabelAr: string | null;
  status: "completed" | "current" | "upcoming" | "expected" | "skipped";
  isParallel?: boolean;
  isCentralSignatory?: boolean;
  isPreview?: boolean;
  enteredAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

export type StaffRequestAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | null;
};

export type StaffRequestDetail = {
  id: string;
  requestNumber: string | null;
  requestTypeCode: string;
  requestTypeNameAr: string;
  title: string;
  description: string | null;
  status: string;
  statusLabelAr: string;
  formData: Record<string, unknown>;
  studentNotes: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  currentStepIndex: number | null;
  currentRoleKey: string | null;
  student: StaffRequestStudentSummary;
  workflowSteps: StaffRequestWorkflowStep[];
  workflowIsPreview: boolean;
  attachments: StaffRequestAttachment[];
  privacyNoticeAr: string | null;
};

export type StaffRequestActionDefinition = {
  key: string;
  labelAr: string;
  variant: "primary" | "danger" | "secondary";
  disabled: boolean;
  disabledReasonAr: string | null;
};

export type StaffInboxUnavailableReason =
  | "workflow_schema_unavailable"
  | "unauthorized"
  | "error";

export const STAFF_INBOX_UNAVAILABLE_MSG: Record<StaffInboxUnavailableReason, string> = {
  workflow_schema_unavailable:
    "صندوق معالجة الطلبات يحتاج تطبيق مخطط دورة الحياة قبل جلب الطلبات.",
  unauthorized: "ليس لديك صلاحية للوصول إلى صندوق معالجة الطلبات.",
  error: "تعذر تحميل صندوق المعالجة. يرجى المحاولة لاحقاً.",
};

export const STAFF_INBOX_EMPTY_MSG = "لا توجد طلبات تتطلب إجراءك حالياً.";

export const STAFF_ACTIONS_DISABLED_MSG =
  "تنفيذ الإجراء يحتاج تطبيق مخطط دورة حياة طلبات الطلاب.";

/** Staff / processing role labels (display only — no role grants). */
export const STAFF_ROLE_LABELS_AR: Readonly<Record<string, string>> = {
  student: "الطالب",
  department_head: "رئيس القسم",
  dean: "العميد",
  student_affairs: "شؤون الطلاب",
  student_affairs_manager: "مدير شؤون الطلاب",
  student_affairs_specialist: "مختص شؤون الطلاب",
  graduate_affairs_manager: "مدير شؤون الخريجين",
  graduate_affairs_specialist: "مختص شؤون الخريجين",
  registrar: "مسجل الكلية",
  registrar_general: "مسجل الكلية",
  revenue_finance_officer: "مسؤول الإيرادات والمالية",
  finance_officer: "الشؤون المالية",
  archive_officer: "مسؤول الأرشيف",
  library_officer: "مسؤول المكتبة",
  labs_manager: "مدير المعامل",
  lab_custodian: "أمين المعمل",
  system_admin: "مدير النظام",
  admin: "المدير",
};

export const CENTRAL_SIGNATORY_LABELS_AR: Readonly<Record<string, string>> = {
  university_registrar_general: "مسجل الجامعة العام (جهة مركزية)",
  vice_president_student_affairs: "نائب رئيس الجامعة لشؤون الطلاب (جهة مركزية)",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "جديد / مُرسَل",
  under_review: "بانتظار الإجراء",
  in_review: "بانتظار الإجراء",
  returned: "معاد للمراجعة",
  returned_for_completion: "معاد للاستكمال",
  approved: "مكتمل / مقبول",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const STATUS_FILTER_MAP: Record<StaffInboxStatusFilter, readonly string[] | null> = {
  all: null,
  new: ["draft", "submitted"],
  pending_action: ["submitted", "under_review", "in_review"],
  returned: ["returned", "returned_for_completion"],
  completed: ["approved", "completed"],
  rejected: ["rejected"],
  cancelled: ["cancelled"],
};

export const STAFF_INBOX_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: StaffInboxStatusFilter;
  labelAr: string;
}> = [
  { value: "all", labelAr: "الكل" },
  { value: "new", labelAr: "جديد" },
  { value: "pending_action", labelAr: "بانتظار الإجراء" },
  { value: "returned", labelAr: "معاد للمراجعة" },
  { value: "completed", labelAr: "مكتمل" },
  { value: "rejected", labelAr: "مرفوض" },
  { value: "cancelled", labelAr: "ملغي" },
];

type PreviewStepDef = {
  key: string;
  labelAr: string;
  roleKey?: string;
  isParallel?: boolean;
  isCentralSignatory?: boolean;
};

const EXPECTED_WORKFLOW_BY_TYPE: Readonly<Record<string, readonly PreviewStepDef[]>> = {
  enrollment_suspension: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "dept_head", labelAr: "رئيس القسم", roleKey: "department_head" },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "sa_mgr", labelAr: "مدير شؤون الطلاب", roleKey: "student_affairs_manager" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  grade_statement_non_graduate: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "sa_mgr", labelAr: "مدير شؤون الطلاب", roleKey: "student_affairs_manager" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "grad_mgr", labelAr: "مدير شؤون الخريجين", roleKey: "graduate_affairs_manager" },
    {
      key: "uni_registrar",
      labelAr: "مسجل الجامعة العام",
      isCentralSignatory: true,
    },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  enrollment_certificate: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  file_withdrawal: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "dept_head", labelAr: "رئيس القسم", roleKey: "department_head" },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    {
      key: "parallel_clearance",
      labelAr: "المالية والمكتبة والمعامل والأنشطة (بالتوازي)",
      isParallel: true,
    },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  excused_absence: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  grade_appeal: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
  ],
  department_transfer: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "target_dept", labelAr: "رئيس القسم المطلوب", roleKey: "department_head" },
    { key: "dean", labelAr: "العميد", roleKey: "dean" },
    { key: "equiv_dept", labelAr: "رئيس القسم المطلوب (معادلة)", roleKey: "department_head" },
    { key: "current_dept", labelAr: "رئيس القسم الحالي", roleKey: "department_head" },
    { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
  october_exam_entry_form: [
    { key: "student", labelAr: "الطالب", roleKey: "student" },
    { key: "sa_1", labelAr: "شؤون الطلاب", roleKey: "student_affairs" },
    { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
    { key: "sa_2", labelAr: "شؤون الطلاب (مراجعة)", roleKey: "student_affairs" },
    { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general" },
    { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer" },
  ],
};

export function getStaffRequestStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}

export function getStaffRequestStepLabel(stepKey: string | null | undefined): string {
  const k = (stepKey ?? "").trim();
  if (!k) return "—";
  return STAFF_ROLE_LABELS_AR[k] ?? k;
}

export function getStaffRoleLabelAr(roleKey: string | null | undefined): string {
  const k = (roleKey ?? "").trim();
  if (!k) return "—";
  return STAFF_ROLE_LABELS_AR[k] ?? CENTRAL_SIGNATORY_LABELS_AR[k] ?? k;
}

export function normalizeStaffRequestInboxItem(
  raw: Partial<StaffRequestInboxItem> & { id: string; requestTypeCode: string },
): StaffRequestInboxItem {
  const code = normalizeStudentRequestTypeCode(raw.requestTypeCode);
  return {
    id: raw.id,
    requestNumber: raw.requestNumber ?? null,
    requestTypeCode: code || raw.requestTypeCode,
    requestTypeNameAr: raw.requestTypeNameAr ?? raw.requestTypeCode,
    title: raw.title ?? "—",
    status: raw.status ?? "unknown",
    statusLabelAr: getStaffRequestStatusLabel(raw.status),
    studentName: raw.studentName ?? null,
    academicNumber: raw.academicNumber ?? null,
    departmentId: raw.departmentId ?? null,
    departmentNameAr: raw.departmentNameAr ?? null,
    submittedAt: raw.submittedAt ?? null,
    createdAt: raw.createdAt ?? null,
    currentStepKey: raw.currentStepKey ?? null,
    currentStepLabelAr: raw.currentStepLabelAr ?? getStaffRequestStepLabel(raw.currentStepKey),
    currentRoleKey: raw.currentRoleKey ?? null,
    currentRoleLabelAr: raw.currentRoleLabelAr ?? getStaffRoleLabelAr(raw.currentRoleKey),
    waitingSince: raw.waitingSince ?? raw.submittedAt ?? raw.createdAt ?? null,
    isActionable: raw.isActionable ?? false,
    workflowStepRuntimeId: raw.workflowStepRuntimeId ?? null,
    dataSource: raw.dataSource ?? "legacy_overview",
  };
}

export function filterInboxByStatusFilter(
  items: StaffRequestInboxItem[],
  filter: StaffInboxStatusFilter,
): StaffRequestInboxItem[] {
  const allowed = STATUS_FILTER_MAP[filter];
  if (!allowed) return items;
  return items.filter((i) => allowed.includes(i.status));
}

export function buildExpectedWorkflowPreview(
  requestTypeCode: string,
): StaffRequestWorkflowStep[] {
  const code = normalizeStudentRequestTypeCode(requestTypeCode);
  const defs = EXPECTED_WORKFLOW_BY_TYPE[code] ?? [];
  return defs.map((d, idx) => ({
    id: `preview:${code}:${d.key}`,
    stepKey: d.key,
    labelAr: d.labelAr,
    roleKey: d.roleKey ?? null,
    roleLabelAr: d.roleKey ? getStaffRoleLabelAr(d.roleKey) : d.labelAr,
    status: idx === 0 ? "current" : "expected",
    isParallel: d.isParallel,
    isCentralSignatory: d.isCentralSignatory,
    isPreview: true,
    enteredAt: null,
    completedAt: null,
    notes: null,
  }));
}

export function mergeWorkflowStepsWithPreview(
  actual: StaffRequestWorkflowStep[],
  requestTypeCode: string,
): { steps: StaffRequestWorkflowStep[]; isPreview: boolean } {
  if (actual.length > 0) {
    return { steps: actual, isPreview: false };
  }
  return {
    steps: buildExpectedWorkflowPreview(requestTypeCode),
    isPreview: true,
  };
}

export function getAvailableUiActionsForRole(
  roleKeys: readonly string[],
  workflowRuntimeAvailable: boolean,
): StaffRequestActionDefinition[] {
  const baseDisabled = !workflowRuntimeAvailable;
  const reason = baseDisabled ? STAFF_ACTIONS_DISABLED_MSG : null;
  const defs: StaffRequestActionDefinition[] = [
    { key: "approve", labelAr: "موافقة", variant: "primary", disabled: baseDisabled, disabledReasonAr: reason },
    { key: "reject", labelAr: "رفض", variant: "danger", disabled: baseDisabled, disabledReasonAr: reason },
    { key: "return_to_student", labelAr: "إعادة للطالب", variant: "secondary", disabled: baseDisabled, disabledReasonAr: reason },
    { key: "request_completion", labelAr: "طلب استكمال", variant: "secondary", disabled: baseDisabled, disabledReasonAr: reason },
    { key: "forward", labelAr: "إحالة للخطوة التالية", variant: "primary", disabled: baseDisabled, disabledReasonAr: reason },
    { key: "add_note", labelAr: "إضافة ملاحظة", variant: "secondary", disabled: false, disabledReasonAr: null },
  ];
  void roleKeys;
  return defs;
}

export function formatWaitingDuration(sinceIso: string | null | undefined): string | null {
  if (!sinceIso) return null;
  const ms = Date.now() - new Date(sinceIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days} يوم`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return `${hours} ساعة`;
  return "أقل من ساعة";
}

export function sanitizeStaffErrorMessage(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim();
  if (!msg) return STAFF_INBOX_UNAVAILABLE_MSG.error;
  if (/permission denied|42501|RLS|violates row-level/i.test(msg)) {
    return STAFF_INBOX_UNAVAILABLE_MSG.unauthorized;
  }
  if (/does not exist|42883|schema cache|relation .* does not exist/i.test(msg)) {
    return STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable;
  }
  if (/SQL|syntax error|PostgREST|PGRST/i.test(msg)) {
    return STAFF_INBOX_UNAVAILABLE_MSG.error;
  }
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
