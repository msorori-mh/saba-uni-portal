import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STUDENT_REQUESTS_ADMIN_ROLES,
} from "@/lib/admin-student-requests.functions";
import {
  isWorkflowRpcUnavailable,
  rpcGetMyRequestActorInbox,
  rpcGetStudentRequestDetailForActor,
  type ActorInboxRow,
} from "@/lib/student-request-rpc";
import {
  getStudentRequestTypeDisplayName,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import {
  buildExpectedWorkflowPreview,
  getStaffRequestStatusLabel,
  getStaffRoleLabelAr,
  mergeWorkflowStepsWithPreview,
  normalizeStaffRequestInboxItem,
  sanitizeStaffErrorMessage,
  STAFF_INBOX_UNAVAILABLE_MSG,
  type StaffInboxStatusFilter,
  type StaffInboxUnavailableReason,
  type StaffRequestAttachment,
  type StaffRequestDetail,
  type StaffRequestInboxItem,
  type StaffRequestStudentSummary,
  type StaffRequestWorkflowStep,
} from "@/lib/student-requests/staff-inbox-ui";
import { getCanonicalWorkflowPreview } from "@/lib/student-requests/request-workflow-preview-registry";
import {
  mapAppRolesToProcessingRoleKeys,
  type StudentRequestActorContext,
  type StudentRequestStaffActionInput,
  type StudentRequestStaffActionResult,
  validateStaffActionInput,
} from "@/lib/student-requests/staff-action-contract";
import {
  normalizeRevenueReceiptConfirmationInput,
  normalizeStudentAffairsAmountInput,
  type FinanceClearanceDryRunResult,
  type FinanceClearanceActorContext,
  validateRevenueReceiptConfirmation,
  validateStudentAffairsAmountInput,
} from "@/lib/student-requests/request-finance-clearance-contract";
import {
  buildDefaultClearanceGroup,
  normalizeParallelClearanceGroup,
  type StudentRequestClearanceActorContext,
  type StudentRequestClearanceDryRunResult,
  type StudentRequestClearanceMemberActionInput,
  validateClearanceMemberAction,
  validateParallelClearanceGroup,
} from "@/lib/student-requests/parallel-clearance-contract";
import {
  normalizeArchiveHandoffInput,
  normalizeDocumentGenerationInput,
  type StudentRequestDocumentArchiveActorContext,
  type StudentRequestDocumentArchiveDryRunResult,
  type StudentRequestSignatoryKey,
  validateArchiveHandoff,
  validateDocumentGenerationInput,
  validateSignatureRequirement,
} from "@/lib/student-requests/request-document-archive-contract";

export type FetchStaffInboxResult = {
  available: boolean;
  items: StaffRequestInboxItem[];
  reason: StaffInboxUnavailableReason | null;
  messageAr: string | null;
  workflowRuntimeAvailable: boolean;
  dataSource: "actor_inbox_rpc" | "legacy_overview";
};

export type FetchStaffRequestDetailResult = {
  available: boolean;
  detail: StaffRequestDetail | null;
  reason: StaffInboxUnavailableReason | null;
  messageAr: string | null;
  workflowRuntimeAvailable: boolean;
  dataSource: "actor_detail_rpc" | "legacy_admin";
};

const inboxInputSchema = z.object({
  statusFilter: z
    .enum(["all", "new", "pending_action", "returned", "completed", "rejected", "cancelled"])
    .optional(),
  requestTypeCode: z.string().trim().optional(),
  departmentId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});

async function assertStaffInboxAccess(userId: string) {
  await assertAnyRole(
    userId,
    STUDENT_REQUESTS_ADMIN_ROLES,
    STAFF_INBOX_UNAVAILABLE_MSG.unauthorized,
  );
}

function rpcErrorReason(message: string): StaffInboxUnavailableReason {
  if (/permission denied|42501|RLS|violates row-level|غير مصرح/i.test(message)) {
    return "unauthorized";
  }
  if (/does not exist|42883|schema cache|relation .* does not exist/i.test(message)) {
    return "workflow_schema_unavailable";
  }
  return "error";
}

function mapActorInboxRow(row: ActorInboxRow): StaffRequestInboxItem {
  return normalizeStaffRequestInboxItem({
    id: row.student_request_id,
    requestNumber: null,
    requestTypeCode: row.request_type_code,
    requestTypeNameAr: row.request_type_name_ar
      ?? getStudentRequestTypeDisplayName(row.request_type_code),
    title: row.request_type_name_ar ?? row.request_type_code,
    status: row.step_status === "active" || row.step_status === "pending"
      ? "under_review"
      : row.step_status,
    studentName: row.student_name,
    academicNumber: null,
    departmentId: row.department_id,
    departmentNameAr: row.department_name_ar,
    submittedAt: row.submitted_at,
    createdAt: row.submitted_at,
    currentStepKey: row.step_key,
    currentStepLabelAr: row.step_name_ar ?? row.step_key,
    currentRoleKey: row.processing_role_name_ar ?? row.step_key,
    currentRoleLabelAr: row.processing_role_name_ar ?? row.processing_unit_name_ar,
    waitingSince: row.submitted_at,
    isActionable: row.is_actionable,
    workflowStepRuntimeId: row.workflow_step_runtime_id,
    dataSource: "actor_inbox_rpc",
  });
}

function mapRpcWorkflowStep(raw: Record<string, unknown>): StaffRequestWorkflowStep {
  const statusRaw = String(raw.status ?? "");
  let status: StaffRequestWorkflowStep["status"] = "upcoming";
  if (statusRaw === "completed") status = "completed";
  else if (statusRaw === "active") status = "current";
  else if (statusRaw === "skipped") status = "skipped";
  else if (statusRaw === "pending") status = "upcoming";

  const roleLabel = String(
    raw.processing_role_name_ar ?? raw.processing_unit_name_ar ?? "",
  ).trim();

  return {
    id: String(raw.id ?? `step:${raw.step_key}`),
    stepKey: String(raw.step_key ?? ""),
    labelAr: String(raw.step_name_ar ?? raw.step_key ?? "—"),
    roleKey: null,
    roleLabelAr: roleLabel || getStaffRoleLabelAr(String(raw.step_key ?? "")),
    status,
    enteredAt: (raw.entered_at as string | null) ?? null,
    completedAt: (raw.completed_at as string | null) ?? null,
    notes: (raw.comment as string | null) ?? null,
    actionType: (raw.action_type as string | null) ?? null,
    isActionable: raw.is_actionable === true,
  };
}

function mapRpcDetail(
  payload: Record<string, unknown>,
  attachments: StaffRequestAttachment[],
): StaffRequestDetail {
  const request = (payload.request ?? {}) as Record<string, unknown>;
  const student = (payload.student ?? {}) as Record<string, unknown>;
  const workflowRaw = Array.isArray(payload.workflow_steps)
    ? (payload.workflow_steps as Record<string, unknown>[])
    : [];

  const requestTypeCode = String(request.request_type ?? "");
  const workflowSteps = workflowRaw.map(mapRpcWorkflowStep);
  const { steps, isPreview } = mergeWorkflowStepsWithPreview(
    workflowSteps,
    requestTypeCode,
  );

  const studentSummary: StaffRequestStudentSummary = {
    id: String(student.id ?? ""),
    fullNameAr: (student.full_name_ar as string | null) ?? null,
    academicNumber: (student.academic_number as string | null) ?? null,
    departmentNameAr: (student.department_name_ar as string | null) ?? null,
    programNameAr: (student.program_name_ar as string | null) ?? null,
    levelNameAr: (student.level_name_ar as string | null) ?? null,
    studySystemLabelAr: (student.study_system_label_ar as string | null) ?? null,
    enrollmentStatusLabelAr: (student.enrollment_status_label_ar as string | null) ?? null,
    status: (student.status as string | null) ?? null,
  };

  const formData = (request.form_data ?? {}) as Record<string, unknown>;

  return {
    id: String(request.id ?? ""),
    requestNumber: (request.request_number as string | null) ?? null,
    requestTypeCode,
    requestTypeNameAr: String(
      request.request_type_name_ar
        ?? getStudentRequestTypeDisplayName(requestTypeCode),
    ),
    title: String(request.title ?? "—"),
    description: (request.description as string | null) ?? null,
    status: String(request.status ?? "unknown"),
    statusLabelAr: getStaffRequestStatusLabel(String(request.status ?? "")),
    formData,
    studentNotes: (request.student_notes as string | null) ?? null,
    submittedAt: (request.submitted_at as string | null) ?? null,
    createdAt: (request.created_at as string | null) ?? null,
    updatedAt: (request.updated_at as string | null) ?? null,
    currentStepIndex: (request.current_step_index as number | null) ?? null,
    currentRoleKey: (request.current_role_key as string | null) ?? null,
    student: studentSummary,
    workflowSteps: steps,
    workflowIsPreview: isPreview,
    attachments,
    privacyNoticeAr: null,
    activeStep: computeActiveStep(steps, isPreview),
  };
}

/** Pick the runtime active step (status='current' and not preview). */
export function computeActiveStep(
  steps: StaffRequestWorkflowStep[],
  isPreview: boolean,
): StaffRequestDetail["activeStep"] {
  if (isPreview) return null;
  const active = steps.find(
    (s) => s.status === "current" && !s.isPreview && !s.id.startsWith("step:"),
  );
  if (!active) return null;
  return {
    id: active.id,
    stepKey: active.stepKey,
    actionType: active.actionType ?? null,
    isActionable: active.isActionable === true,
  };
}

/**
 * Enrich workflow steps with action_type from request_type_workflow_steps.
 * The RPC returns runtime rows (student_request_workflow_steps) but does not
 * include the workflow-config action_type — we need it to gate UI panels
 * (review / assess_fee / confirm_payment / sign / issue_document / archive).
 */
async function enrichWorkflowStepsWithActionType(
  requestId: string,
  steps: StaffRequestWorkflowStep[],
): Promise<StaffRequestWorkflowStep[]> {
  const runtimeIds = steps
    .map((s) => s.id)
    .filter((id) => !id.startsWith("step:"));
  if (runtimeIds.length === 0) return steps;

  const { data: rows, error } = await supabaseAdmin
    .from("student_request_workflow_steps")
    .select("id, workflow_step_id, config:request_type_workflow_steps!inner(action_type)")
    .eq("student_request_id", requestId)
    .in("id", runtimeIds);
  if (error || !rows) return steps;

  const actionTypeById = new Map<string, string | null>();
  for (const row of rows as Array<{
    id: string;
    config?: { action_type?: string | null } | null;
  }>) {
    actionTypeById.set(row.id, row.config?.action_type ?? null);
  }

  return steps.map((s) =>
    actionTypeById.has(s.id) ? { ...s, actionType: actionTypeById.get(s.id) ?? null } : s,
  );
}

async function fetchLegacyInboxItems(): Promise<StaffRequestInboxItem[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("student_requests")
    .select(
      "id, request_number, title, status, submitted_at, created_at, request_type, student_profile_id",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const list = rows ?? [];
  if (list.length === 0) return [];

  const profileIds = [...new Set(list.map((r) => r.student_profile_id))];
  const { data: profiles, error: profileErr } = await supabaseAdmin
    .from("student_profiles")
    .select(
      "id, academic_number, full_name_ar, department_id, department:departments(name_ar)",
    )
    .in("id", profileIds);
  if (profileErr) throw new Error(profileErr.message);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return list.map((r) => {
    const profile = profileById.get(r.student_profile_id) as {
      academic_number?: string;
      full_name_ar?: string;
      department_id?: string;
      department?: { name_ar?: string } | null;
    } | undefined;
    const code = normalizeStudentRequestTypeCode(r.request_type) || r.request_type;
    return normalizeStaffRequestInboxItem({
      id: r.id,
      requestNumber: r.request_number ?? null,
      requestTypeCode: code,
      requestTypeNameAr: getStudentRequestTypeDisplayName(code),
      title: r.title ?? "—",
      status: r.status,
      studentName: profile?.full_name_ar ?? null,
      academicNumber: profile?.academic_number ?? null,
      departmentId: profile?.department_id ?? null,
      departmentNameAr: profile?.department?.name_ar ?? null,
      submittedAt: r.submitted_at,
      createdAt: r.created_at,
      currentStepKey: null,
      currentRoleKey: null,
      isActionable: false,
      workflowStepRuntimeId: null,
      dataSource: "legacy_overview",
    });
  });
}

async function fetchLegacyRequestDetail(requestId: string): Promise<StaffRequestDetail> {
  const { data: req, error: reqErr } = await supabaseAdmin
    .from("student_requests")
    .select(
      "id, request_number, title, description, status, form_data, student_notes, submitted_at, created_at, updated_at, request_type, student_profile_id, current_step_index, current_role_key",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!req) throw new Error("الطلب غير موجود");

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("student_profiles")
    .select(
      "id, full_name_ar, academic_number, status, study_system, department:departments(name_ar), program:programs(name_ar)",
    )
    .eq("id", req.student_profile_id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const { data: attachmentsRaw, error: attErr } = await supabaseAdmin
    .from("student_request_attachments")
    .select("id, file_name, file_url, uploaded_at")
    .eq("request_id", requestId);
  if (attErr) throw new Error(attErr.message);

  const attachments: StaffRequestAttachment[] = (attachmentsRaw ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    fileUrl: a.file_url,
    uploadedAt: a.uploaded_at ?? null,
  }));

  const code = normalizeStudentRequestTypeCode(req.request_type) || req.request_type;
  const previewSteps = buildExpectedWorkflowPreview(code);

  const studySystemLabels: Record<string, string> = {
    regular: "نظامي",
    private: "موازي",
  };

  return {
    id: req.id,
    requestNumber: req.request_number ?? null,
    requestTypeCode: code,
    requestTypeNameAr: getStudentRequestTypeDisplayName(code),
    title: req.title ?? "—",
    description: req.description ?? null,
    status: req.status,
    statusLabelAr: getStaffRequestStatusLabel(req.status),
    formData: (req.form_data ?? {}) as Record<string, unknown>,
    studentNotes: req.student_notes ?? null,
    submittedAt: req.submitted_at,
    createdAt: req.created_at,
    updatedAt: req.updated_at,
    currentStepIndex: req.current_step_index ?? null,
    currentRoleKey: req.current_role_key ?? null,
    student: {
      id: profile?.id ?? req.student_profile_id,
      fullNameAr: profile?.full_name_ar ?? null,
      academicNumber: profile?.academic_number ?? null,
      departmentNameAr: (profile?.department as { name_ar?: string } | null)?.name_ar ?? null,
      programNameAr: (profile?.program as { name_ar?: string } | null)?.name_ar ?? null,
      levelNameAr: null,
      studySystemLabelAr: profile?.study_system
        ? (studySystemLabels[profile.study_system] ?? profile.study_system)
        : null,
      enrollmentStatusLabelAr: null,
      status: profile?.status ?? null,
    },
    workflowSteps: previewSteps,
    workflowIsPreview: true,
    attachments,
    privacyNoticeAr: null,
    activeStep: null,
  };
}

export const fetchStaffInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inboxInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<FetchStaffInboxResult> => {
    try {
      await assertStaffInboxAccess(context.userId);
    } catch (e) {
      return {
        available: false,
        items: [],
        reason: "unauthorized",
        messageAr: sanitizeStaffErrorMessage((e as Error).message),
        workflowRuntimeAvailable: false,
        dataSource: "legacy_overview",
      };
    }

    // Show only steps currently awaiting action for THIS user.
    // Default RPC status filter is ['pending','active'] which surfaces
    // future/upcoming steps too — narrow to 'active' so the inbox reflects
    // only the runtime step the user is expected to act on now.
    const rpcFilters: Record<string, unknown> = { status: ["active"] };
    if (data.requestTypeCode) rpcFilters.request_type_code = data.requestTypeCode;
    if (data.departmentId) rpcFilters.department_id = data.departmentId;
    if (data.search) rpcFilters.search = data.search;

    const { rows, error } = await rpcGetMyRequestActorInbox(
      context.supabase,
      rpcFilters,
      200,
      0,
    );

    if (!error) {
      const items = rows.map(mapActorInboxRow);
      return {
        available: true,
        items,
        reason: null,
        messageAr: null,
        workflowRuntimeAvailable: true,
        dataSource: "actor_inbox_rpc",
      };
    }

    if (!isWorkflowRpcUnavailable(error)) {
      const reason = rpcErrorReason(error.message ?? "");
      return {
        available: reason !== "unauthorized",
        items: [],
        reason,
        messageAr: sanitizeStaffErrorMessage(error.message),
        workflowRuntimeAvailable: false,
        dataSource: "legacy_overview",
      };
    }

    try {
      const items = await fetchLegacyInboxItems();
      return {
        available: true,
        items,
        reason: "workflow_schema_unavailable",
        messageAr: STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable,
        workflowRuntimeAvailable: false,
        dataSource: "legacy_overview",
      };
    } catch (e) {
      return {
        available: false,
        items: [],
        reason: "error",
        messageAr: sanitizeStaffErrorMessage((e as Error).message),
        workflowRuntimeAvailable: false,
        dataSource: "legacy_overview",
      };
    }
  });

export const fetchStaffRequestDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FetchStaffRequestDetailResult> => {
    try {
      await assertStaffInboxAccess(context.userId);
    } catch (e) {
      return {
        available: false,
        detail: null,
        reason: "unauthorized",
        messageAr: sanitizeStaffErrorMessage((e as Error).message),
        workflowRuntimeAvailable: false,
        dataSource: "legacy_admin",
      };
    }

    const { detail: rpcDetail, error } = await rpcGetStudentRequestDetailForActor(
      context.supabase,
      data.requestId,
    );

    if (!error && rpcDetail) {
      const mapped = mapRpcDetail(rpcDetail, []);
      return {
        available: true,
        detail: mapped,
        reason: null,
        messageAr: null,
        workflowRuntimeAvailable: mapped.workflowSteps.some((s) => !s.isPreview),
        dataSource: "actor_detail_rpc",
      };
    }

    if (error && !isWorkflowRpcUnavailable(error)) {
      const reason = rpcErrorReason(error.message ?? "");
      if (reason === "unauthorized") {
        return {
          available: false,
          detail: null,
          reason,
          messageAr: sanitizeStaffErrorMessage(error.message),
          workflowRuntimeAvailable: false,
          dataSource: "legacy_admin",
        };
      }
    }

    try {
      const detail = await fetchLegacyRequestDetail(data.requestId);
      return {
        available: true,
        detail,
        reason: error && isWorkflowRpcUnavailable(error)
          ? "workflow_schema_unavailable"
          : null,
        messageAr: error && isWorkflowRpcUnavailable(error)
          ? STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable
          : null,
        workflowRuntimeAvailable: false,
        dataSource: "legacy_admin",
      };
    } catch (e) {
      return {
        available: false,
        detail: null,
        reason: "error",
        messageAr: sanitizeStaffErrorMessage((e as Error).message),
        workflowRuntimeAvailable: false,
        dataSource: "legacy_admin",
      };
    }
  });

const staffActionDryRunSchema = z.object({
  requestId: z.string().uuid(),
  workflowStepId: z.string().uuid().optional().nullable(),
  action: z.string().min(1).max(80),
  note: z.string().trim().max(4000).optional().nullable(),
  completionRequirements: z.array(z.string().trim().max(500)).optional().nullable(),
  expectedRequestStatus: z.string().trim().max(80).optional().nullable(),
  expectedStepStatus: z.string().trim().max(80).optional().nullable(),
  expectedUpdatedAt: z.string().optional().nullable(),
  clientActionId: z.string().trim().max(120).optional().nullable(),
  stepKey: z.string().trim().max(120).optional().nullable(),
  stepRoleKey: z.string().trim().max(120).optional().nullable(),
});

/** Dry-run only — validates staff action; never calls act_on or writes to DB. */
export const prepareStudentRequestStaffAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffActionDryRunSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentRequestStaffActionResult> => {
    await assertStaffInboxAccess(context.userId);

    const appRoles = await userRoles(context.userId);
    const processingRoleKeys = mapAppRolesToProcessingRoleKeys(appRoles);

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, updated_at, current_role_key")
      .eq("id", data.requestId)
      .maybeSingle();

    if (reqErr) throw new Error(sanitizeStaffErrorMessage(reqErr.message));
    if (!reqRow) throw new Error("الطلب غير موجود");

    const requestTypeCode = normalizeStudentRequestTypeCode(String(reqRow.request_type ?? ""));
    const currentStep = data.stepKey ?? null;
    const stepRoleKey =
      data.stepRoleKey ?? (reqRow as { current_role_key?: string | null }).current_role_key ?? null;

    const preview = requestTypeCode ? getCanonicalWorkflowPreview(requestTypeCode) : undefined;
    const previewStep = preview?.steps.find((s) => s.key === currentStep) ?? null;

    const actor: StudentRequestActorContext = {
      userId: context.userId,
      appRoles,
      processingRoleKeys,
      departmentIds: [],
      isStaffInboxAuthorized: true,
      stepKey: currentStep,
      stepRoleKey: previewStep?.roleKey ?? stepRoleKey,
      stepStatus: data.expectedStepStatus ?? "active",
      isCentralSignatoryStep: Boolean(previewStep?.isCentralSignatory),
      isParallelStep: Boolean(previewStep?.isParallel),
      parallelGroupKey: previewStep?.parallelGroupId ?? null,
      parallelGroupComplete: previewStep?.isParallel ? false : null,
      requestTypeCode,
      requestStatus: String(reqRow.status ?? ""),
      requestUpdatedAt: (reqRow as { updated_at?: string | null }).updated_at ?? null,
    };

    const payload: Partial<StudentRequestStaffActionInput> & { action: string } = {
      requestId: data.requestId,
      workflowStepId: data.workflowStepId,
      action: data.action,
      note: data.note,
      completionRequirements: data.completionRequirements ?? undefined,
      expectedRequestStatus: data.expectedRequestStatus,
      expectedStepStatus: data.expectedStepStatus,
      expectedUpdatedAt: data.expectedUpdatedAt,
      clientActionId: data.clientActionId,
    };

    return validateStaffActionInput(payload, actor, {
      expectedUpdatedAt: data.expectedUpdatedAt ?? null,
      expectedStepStatus: data.expectedStepStatus ?? null,
      expectedRequestStatus: data.expectedRequestStatus ?? null,
      clientActionId: data.clientActionId ?? null,
      seenClientActionIds: [],
    });
  });

const financeClearanceDryRunSchema = z.object({
  requestId: z.string().uuid(),
  requestTypeCode: z.string().trim().min(1).max(120),
  action: z.enum(["set_student_affairs_amount", "confirm_revenue_received"]),
  amount: z.number().optional().nullable(),
  note: z.string().trim().max(4000).optional().nullable(),
  expectedUpdatedAt: z.string().trim().max(120).optional().nullable(),
  expectedStepStatus: z.string().trim().max(120).optional().nullable(),
  clientActionId: z.string().trim().max(120).optional().nullable(),
});

/** Dry-run only — validates student affairs amount / revenue receipt confirmation; no DB writes. */
export const prepareStudentRequestFinanceClearanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => financeClearanceDryRunSchema.parse(input))
  .handler(async ({ data, context }): Promise<FinanceClearanceDryRunResult> => {
    await assertStaffInboxAccess(context.userId);

    const appRoles = await userRoles(context.userId);
    const processingRoleKeys = mapAppRolesToProcessingRoleKeys(appRoles);

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_type")
      .eq("id", data.requestId)
      .maybeSingle();

    if (reqErr) throw new Error(sanitizeStaffErrorMessage(reqErr.message));
    if (!reqRow) throw new Error("الطلب غير موجود");

    const requestTypeCode =
      normalizeStudentRequestTypeCode(String(reqRow.request_type ?? "")) ||
      data.requestTypeCode;

    const actor: FinanceClearanceActorContext = {
      userId: context.userId,
      appRoles,
      processingRoleKeys,
      isStaffInboxAuthorized: true,
      requestTypeCode,
    };

    const rawExtras: Record<string, unknown> = {};

    if (data.action === "set_student_affairs_amount") {
      return validateStudentAffairsAmountInput(
        normalizeStudentAffairsAmountInput({
          requestId: data.requestId,
          requestTypeCode,
          amount: data.amount ?? Number.NaN,
          note: data.note,
          expectedUpdatedAt: data.expectedUpdatedAt,
          expectedStepStatus: data.expectedStepStatus,
          clientActionId: data.clientActionId,
        }),
        actor,
        rawExtras,
      );
    }

    return validateRevenueReceiptConfirmation(
      normalizeRevenueReceiptConfirmationInput({
        requestId: data.requestId,
        requestTypeCode,
        note: data.note,
        expectedUpdatedAt: data.expectedUpdatedAt,
        expectedStepStatus: data.expectedStepStatus,
        clientActionId: data.clientActionId,
      }),
      actor,
      rawExtras,
    );
  });

const parallelClearanceDryRunSchema = z.object({
  requestId: z.string().uuid(),
  requestTypeCode: z.string().trim().min(1).max(120),
  mode: z.enum(["validate_group", "member_action"]),
  memberKey: z.string().trim().max(120).optional().nullable(),
  action: z.enum(["clear", "waive", "reject", "block"]).optional().nullable(),
  note: z.string().trim().max(4000).optional().nullable(),
});

/** Dry-run only — validates parallel clearance group/member action; no DB writes. */
export const prepareStudentRequestParallelClearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parallelClearanceDryRunSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentRequestClearanceDryRunResult> => {
    await assertStaffInboxAccess(context.userId);

    const appRoles = await userRoles(context.userId);
    const processingRoleKeys = mapAppRolesToProcessingRoleKeys(appRoles);

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_type")
      .eq("id", data.requestId)
      .maybeSingle();

    if (reqErr) throw new Error(sanitizeStaffErrorMessage(reqErr.message));
    if (!reqRow) throw new Error("الطلب غير موجود");

    const requestTypeCode =
      normalizeStudentRequestTypeCode(String(reqRow.request_type ?? "")) ||
      data.requestTypeCode;

    const defaultGroup = buildDefaultClearanceGroup(data.requestId, requestTypeCode);
    const group = defaultGroup
      ? normalizeParallelClearanceGroup(defaultGroup)
      : normalizeParallelClearanceGroup({
          requestId: data.requestId,
          requestTypeCode,
          groupKey: "clearance",
          status: "pending",
          members: [],
        });

    const actor: StudentRequestClearanceActorContext = {
      userId: context.userId,
      appRoles,
      processingRoleKeys,
      isStaffInboxAuthorized: true,
      requestTypeCode,
      targetMemberKey: data.memberKey ?? null,
      targetRoleKey:
        group.members.find((m) => m.memberKey === data.memberKey)?.roleKey ?? null,
    };

    if (data.mode === "member_action" && data.memberKey && data.action) {
      const actionInput: Partial<StudentRequestClearanceMemberActionInput> & {
        requestId: string;
        action: string;
      } = {
        requestId: data.requestId,
        requestTypeCode,
        groupKey: group.groupKey,
        memberKey: data.memberKey,
        action: data.action,
        note: data.note,
      };
      return validateClearanceMemberAction(actionInput, group, actor);
    }

    return validateParallelClearanceGroup(group, actor);
  });

const documentArchiveDryRunSchema = z.object({
  requestId: z.string().uuid(),
  requestTypeCode: z.string().trim().min(1).max(120),
  mode: z.enum(["generation", "signature", "archive"]),
  documentType: z.string().trim().max(120).optional().nullable(),
  signatoryKey: z.string().trim().max(120).optional().nullable(),
  parallelClearanceComplete: z.boolean().optional().nullable(),
  finalApprovalComplete: z.boolean().optional().nullable(),
  documentsReady: z.boolean().optional().nullable(),
  signaturesComplete: z.boolean().optional().nullable(),
});

/** Dry-run only — validates document generation/signature/archive handoff; no DB writes, no PDF, no upload. */
export const prepareStudentRequestDocumentArchiveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentArchiveDryRunSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentRequestDocumentArchiveDryRunResult> => {
    await assertStaffInboxAccess(context.userId);

    const appRoles = await userRoles(context.userId);
    const processingRoleKeys = mapAppRolesToProcessingRoleKeys(appRoles);

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_type")
      .eq("id", data.requestId)
      .maybeSingle();

    if (reqErr) throw new Error(sanitizeStaffErrorMessage(reqErr.message));
    if (!reqRow) throw new Error("الطلب غير موجود");

    const requestTypeCode =
      normalizeStudentRequestTypeCode(String(reqRow.request_type ?? "")) ||
      data.requestTypeCode;

    const signatoryKey = (data.signatoryKey?.trim() || null) as StudentRequestSignatoryKey | null;

    const actor: StudentRequestDocumentArchiveActorContext = {
      userId: context.userId,
      appRoles,
      processingRoleKeys,
      isStaffInboxAuthorized: true,
      requestTypeCode,
      targetSignatoryKey: signatoryKey,
    };

    if (data.mode === "archive") {
      return validateArchiveHandoff(
        normalizeArchiveHandoffInput({
          requestId: data.requestId,
          requestTypeCode,
          parallelClearanceComplete: data.parallelClearanceComplete,
          finalApprovalComplete: data.finalApprovalComplete,
          documentsReady: data.documentsReady,
          signaturesComplete: data.signaturesComplete,
        }),
        actor,
      );
    }

    if (data.mode === "signature") {
      const docType = data.documentType?.trim();
      if (!docType) throw new Error("نوع المستند مطلوب للتحقق من التوقيع.");
      const normalized = normalizeDocumentGenerationInput({
        requestId: data.requestId,
        requestTypeCode,
        documentType: docType,
      });
      const genCheck = validateDocumentGenerationInput(normalized, actor);
      if (!genCheck.documentType) return genCheck;
      return validateSignatureRequirement(genCheck.documentType, actor);
    }

    const docType = data.documentType?.trim();
    if (!docType) throw new Error("نوع المستند مطلوب.");
    return validateDocumentGenerationInput(
      normalizeDocumentGenerationInput({
        requestId: data.requestId,
        requestTypeCode,
        documentType: docType,
      }),
      actor,
    );
  });

export type { StaffInboxStatusFilter };
