import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, primaryActorRole, userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  rpcCreateStudentRequest,
  rpcGetAvailableRequestTypes,
  rpcGetMyStudentRequests,
  rpcSubmitStudentRequest,
  rpcSubmitStudentRequestWithDetails,
  isP1AtomicSubmitService,
  STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG,
  STUDENT_REQUEST_SERVICE_UPDATING_MSG,
} from "@/lib/student-request-rpc";
import {
  buildStudentRequestSubmitPayload,
  extractB1SecureAttachmentIds,
  type CanonicalStudentRequestSubmitInput,
  type CanonicalStudentRequestSubmitResult,
  validateStudentRequestSubmitInput,
} from "@/lib/student-requests/student-request-submit-contract";
import {
  getStoredWriteCodeForRequestType,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import {
  getRequestServiceAdapter,
  validateB1ServiceActivation,
} from "@/lib/student-requests/request-service-adapter";

const ADMIN_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
  "department_head",
  "faculty_member",
  "finance_officer",
] as const;

const ACTIONS = ["approve", "reject", "return_for_completion", "forward", "complete"] as const;

type WorkflowStep = {
  key: string;
  title_ar: string;
  role_key: string;
  allowed_actions?: string[];
  can_complete?: boolean;
};

type RequestAccessRow = {
  id: string;
  status: string;
  current_step_index: number | null;
  current_role_key: string | null;
  student_profile_id: string;
  request_type: string;
  student_profile?: { user_id: string | null } | null;
};

async function currentStudentProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id, academic_number, full_name_ar, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لا يوجد ملف طالب مرتبط بحسابك");
  return data;
}

async function loadRequestType(code: string) {
  const { data, error } = await supabaseAdmin
    .from("request_types")
    .select("code, name_ar, description_ar, requires_attachment, form_schema, workflow_schema, student_visible, is_active")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.is_active) throw new Error("نوع الطلب غير متاح");
  return data as typeof data & { workflow_schema: { steps?: WorkflowStep[] } | null };
}

function workflowSteps(type: { workflow_schema: { steps?: WorkflowStep[] } | null }): WorkflowStep[] {
  const steps = type.workflow_schema?.steps;
  return Array.isArray(steps) ? steps.filter((s) => s.key && s.role_key) : [];
}

function hasGlobalWorkflowAccess(roles: string[]) {
  return roles.includes("admin") || roles.includes("system_admin");
}

function roleMatchesCurrentStep(roles: string[], request: Pick<RequestAccessRow, "current_role_key">) {
  return Boolean(request.current_role_key && roles.includes(request.current_role_key));
}

function canAccessRequest(userId: string, roles: string[], request: RequestAccessRow) {
  const isOwner = request.student_profile?.user_id === userId;
  return isOwner || hasGlobalWorkflowAccess(roles) || roleMatchesCurrentStep(roles, request);
}

function allowedActionsForStep(step: WorkflowStep | undefined, currentIndex: number, steps: WorkflowStep[]) {
  const explicit = step?.allowed_actions?.filter((action) => ACTIONS.includes(action as any));
  if (explicit && explicit.length > 0) return explicit;
  const actions = ["approve", "reject", "return_for_completion"] as string[];
  if (currentIndex < steps.length - 1) actions.push("forward");
  if (step?.can_complete === true || currentIndex === steps.length - 1) actions.push("complete");
  return actions;
}

async function insertEvent(input: {
  requestId: string;
  actorId: string | null;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromStep?: number | null;
  toStep?: number | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("student_service_request_events").insert({
    request_id: input.requestId,
    actor_id: input.actorId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    from_step_index: input.fromStep ?? null,
    to_step_index: input.toStep ?? null,
    notes: input.notes ?? null,
    payload: input.payload ?? {},
  } as any);
}

async function audit(input: {
  actorId: string;
  requestId: string;
  action: string;
  notes?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}) {
  const role = await primaryActorRole(input.actorId);
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actorId,
    actor_role: role,
    entity_type: "student_request",
    entity_id: input.requestId,
    action_type: input.action,
    notes: input.notes ?? null,
    old_values: input.oldValues ?? null,
    new_values: input.newValues ?? null,
  } as any);
}

async function notify(userId: string | null | undefined, title: string, message: string, requestId: string) {
  if (!userId) return;
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title,
    message,
    notification_type: "student_affairs_request",
    reference_type: "student_request",
    reference_id: requestId,
  } as any);
}

async function initializeSteps(requestId: string, steps: WorkflowStep[]) {
  const { count } = await supabaseAdmin
    .from("student_service_request_steps")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);
  if ((count ?? 0) > 0) return;
  if (steps.length === 0) return;
  await supabaseAdmin.from("student_service_request_steps").insert(steps.map((step, index) => ({
    request_id: requestId,
    step_index: index,
    step_key: step.key,
    step_title_ar: step.title_ar,
    role_key: step.role_key,
    status: index === 0 ? "active" : "pending",
  })) as any);
}

export const getStudentRequestTypesForStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await rpcGetAvailableRequestTypes(context.supabase);
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name_ar: row.name_ar,
      description_ar: row.description_ar,
      requires_attachment: row.requires_attachment,
      request_audience: row.request_audience,
      ineligible_display_mode: row.ineligible_display_mode,
      is_eligible: row.is_eligible,
      is_disabled: row.is_disabled,
      disabled_reason: row.disabled_reason,
      sort_order: row.sort_order,
    }));
  });

/** Lightweight UI context from existing student_profiles (no new tables). */
export const getStudentRequestUiContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("student_profiles")
      .select("status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const status = (data as { status?: string | null } | null)?.status ?? null;
    return {
      studentStatus: status,
      isGraduate: status === "graduated",
      isActiveStudent: status === "active",
    };
  });

/** Student-scoped reference data for dynamic request forms. Uses the authenticated client/RLS. */
export const getStudentRequestFormReferenceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ academicYearId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await currentStudentProfile(context.userId);
    const [yearsResult, semestersResult, enrollmentsResult] = await Promise.all([
      context.supabase.from("academic_years").select("id, name").order("start_date", { ascending: false }),
      data.academicYearId
        ? context.supabase.from("semesters").select("id, name, academic_year_id").eq("academic_year_id", data.academicYearId).order("start_date")
        : Promise.resolve({ data: [], error: null }),
      context.supabase.from("student_enrollments").select("course_section_id, course_section:course_sections(section_code)")
        .eq("student_profile_id", profile.id).eq("enrollment_status", "enrolled"),
    ]);
    const firstError = yearsResult.error ?? semestersResult.error ?? enrollmentsResult.error;
    if (firstError) throw new Error(firstError.message);
    return {
      academicYears: (yearsResult.data ?? []).map((row) => ({ value: row.id, labelAr: row.name })),
      semesters: (semestersResult.data ?? []).map((row) => ({ value: row.id, labelAr: row.name })),
      currentStudentEnrollments: (enrollmentsResult.data ?? []).map((row) => {
        const section = row.course_section as { section_code?: string | null } | null;
        return { value: row.course_section_id, labelAr: section?.section_code ?? row.course_section_id };
      }),
    };
  });

async function assertStudentEligibleForRequestType(
  client: { rpc: RpcClient["rpc"] },
  requestTypeCode: string,
): Promise<void> {
  let rows: Awaited<ReturnType<typeof rpcGetAvailableRequestTypes>>;
  try {
    rows = await rpcGetAvailableRequestTypes(client);
  } catch {
    throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
  }

  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  const match = rows.find((row) => normalizeStudentRequestTypeCode(row.code) === normalized);
  if (!match) {
    throw new Error("نوع الطلب غير متاح");
  }
  if (!match.is_eligible || match.is_disabled) {
    throw new Error(match.disabled_reason ?? STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG);
  }
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from: (table: string) => {
    update: (values: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }> };
  };
};

async function fallbackCreateStudentRequestDraft(input: {
  profileId: string;
  requestType: string;
  title: string;
  formData: Record<string, unknown>;
  studentNotes: string | null;
  description: string | null;
}): Promise<string> {
  const { data: typeRow, error: typeErr } = await supabaseAdmin
    .from("request_types")
    .select("code, is_active, student_visible")
    .eq("code", input.requestType)
    .maybeSingle();
  if (typeErr) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
  if (!typeRow?.is_active || !typeRow.student_visible) {
    throw new Error("نوع الطلب غير متاح");
  }

  const requestNumber = `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: created, error } = await supabaseAdmin
    .from("student_requests")
    .insert({
      request_number: requestNumber,
      student_profile_id: input.profileId,
      request_type: input.requestType,
      title: input.title,
      description: input.description ?? input.studentNotes,
      status: "draft",
      form_data: input.formData,
      student_notes: input.studentNotes,
    } as any)
    .select("id")
    .single();
  if (error) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
  return created.id as string;
}

async function fallbackSubmitStudentRequest(input: {
  requestId: string;
  profileId: string;
}): Promise<void> {
  const { data: req, error: reqErr } = await supabaseAdmin
    .from("student_requests")
    .select("id, status, student_profile_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (reqErr || !req) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
  if (req.student_profile_id !== input.profileId) throw new Error("غير مصرح");
  if (!["draft", "returned", "returned_for_completion"].includes(req.status)) {
    throw new Error("لا يمكن إرسال هذا الطلب في حالته الحالية");
  }

  const { error } = await supabaseAdmin
    .from("student_requests")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", input.requestId);
  if (error) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
}

async function createDraftViaRpcOrFallback(input: {
  sessionClient: RpcClient;
  profileId: string;
  requestType: string;
  title: string;
  formData: Record<string, unknown>;
  studentNotes: string | null;
  description: string | null;
}): Promise<string> {
  const rpcResult = await rpcCreateStudentRequest(input.sessionClient, {
    requestType: input.requestType,
    title: input.title,
    formData: input.formData,
    studentNotes: input.studentNotes,
  });
  if (!rpcResult.rpcUnavailable) return rpcResult.id;

  return fallbackCreateStudentRequestDraft({
    profileId: input.profileId,
    requestType: input.requestType,
    title: input.title,
    formData: input.formData,
    studentNotes: input.studentNotes,
    description: input.description,
  });
}

async function submitViaRpcOrFallback(input: {
  sessionClient: RpcClient;
  requestId: string;
  profileId: string;
}): Promise<void> {
  const rpcResult = await rpcSubmitStudentRequest(input.sessionClient, input.requestId);
  if (!rpcResult.rpcUnavailable) return;

  await fallbackSubmitStudentRequest({
    requestId: input.requestId,
    profileId: input.profileId,
  });
}

async function createB1DraftFailClosed(input: {
  sessionClient: RpcClient;
  requestType: string;
  title: string;
  formData: Record<string, unknown>;
  studentNotes: string | null;
}): Promise<string> {
  const result = await rpcCreateStudentRequest(input.sessionClient, {
    requestType: input.requestType,
    title: input.title,
    formData: input.formData,
    studentNotes: input.studentNotes,
  });
  if (result.rpcUnavailable) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
  return result.id;
}

async function submitB1RequestAtomically(input: {
  sessionClient: RpcClient;
  requestId: string;
  canonicalCode: string;
  formData: Record<string, unknown>;
  expectedUpdatedAt?: string;
}): Promise<void> {
  let expectedUpdatedAt = input.expectedUpdatedAt;
  if (!expectedUpdatedAt) {
    const { data: request, error: requestError } = await supabaseAdmin
      .from("student_requests").select("updated_at").eq("id", input.requestId).maybeSingle();
    if (requestError || !request?.updated_at) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);
    expectedUpdatedAt = request.updated_at;
  }

  const attachmentIds = extractB1SecureAttachmentIds(input.canonicalCode, input.formData);
  const { error } = await input.sessionClient.rpc("submit_b1_student_request_atomic", {
    p_request_id: input.requestId,
    p_canonical_code: input.canonicalCode,
    p_form_data: input.formData,
    p_expected_updated_at: expectedUpdatedAt,
    p_attachment_ids: attachmentIds,
  });
  if (error) throw new Error(error.message ?? STUDENT_REQUEST_SERVICE_UPDATING_MSG);
}

async function loadCreatedRequestMeta(requestId: string) {
  const { data: created, error } = await supabaseAdmin
    .from("student_requests")
    .select("id, request_number, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!created) throw new Error("تعذر تحميل الطلب بعد الإنشاء");
  return created;
}

async function assertTrustedB1FormReferences(input: {
  sessionClient: RpcClient;
  profileId: string;
  requestTypeCode: string;
  formData: Record<string, unknown>;
}): Promise<void> {
  const adapter = getRequestServiceAdapter(input.requestTypeCode);
  if (!adapter) throw new Error("UNKNOWN_STUDENT_REQUEST_TYPE_CODE");

  for (const resolver of adapter.referenceResolvers) {
    const value = input.formData[resolver.field];
    if (typeof value !== "string" || !value.trim()) throw new Error(`INVALID_REFERENCE:${resolver.field}`);

    if (resolver.key === "academic_years") {
      const result = await input.sessionClient.from("academic_years").select("id").eq("id", value).maybeSingle();
      if (result.error || !result.data) throw new Error(`INVALID_REFERENCE:${resolver.field}`);
    } else if (resolver.key === "semesters_for_year") {
      const academicYear = resolver.dependsOnField ? input.formData[resolver.dependsOnField] : null;
      if (typeof academicYear !== "string" || !academicYear.trim()) throw new Error(`INVALID_REFERENCE:${resolver.field}`);
      const result = await input.sessionClient.from("semesters").select("id").eq("id", value).eq("academic_year_id", academicYear).maybeSingle();
      if (result.error || !result.data) throw new Error(`INVALID_REFERENCE:${resolver.field}`);
    } else if (resolver.key === "current_student_enrollments") {
      const result = await input.sessionClient.from("student_enrollments").select("course_section_id")
        .eq("student_profile_id", input.profileId).eq("course_section_id", value).eq("enrollment_status", "enrolled").maybeSingle();
      if (result.error || !result.data) throw new Error(`INVALID_REFERENCE:${resolver.field}`);
    } else {
      throw new Error(`UNSUPPORTED_REFERENCE_RESOLVER:${resolver.key}`);
    }
  }
}

export async function submitCanonicalStudentRequestCore(input: {
  userId: string;
  sessionClient: RpcClient;
  raw: CanonicalStudentRequestSubmitInput;
}): Promise<CanonicalStudentRequestSubmitResult> {
  const validation = validateStudentRequestSubmitInput(input.raw);
  if (!validation.ok) throw new Error(validation.message);

  const profile = await currentStudentProfile(input.userId);

  // P1 atomic path: the live RPC owns eligibility + create + details + strict
  // workflow init + submit inside ONE transaction. No generic create/submit,
  // no fallback, no client-side duplication of that logic.
  if (isP1AtomicSubmitService(validation.normalized.requestTypeCode)) {
    if (validation.normalized.existingRequestId) {
      // The live atomic RPC has no canonical resubmit contract — fail closed.
      throw new Error("P1_RESUBMIT_NOT_SUPPORTED");
    }
    const p1Payload = buildStudentRequestSubmitPayload(validation.normalized);
    const atomic = await rpcSubmitStudentRequestWithDetails(input.sessionClient, {
      requestType: validation.normalized.requestTypeCode,
      title: p1Payload.title,
      formData: p1Payload.formData,
      studentNotes: p1Payload.studentNotes,
      testRunId: null,
    });
    if (atomic.rpcUnavailable) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);

    const p1Created = await loadCreatedRequestMeta(atomic.id);
    await insertEvent({
      requestId: atomic.id,
      actorId: input.userId,
      eventType: "submitted",
      fromStatus: "draft",
      toStatus: "submitted",
      payload: {
        request_type: validation.normalized.requestTypeCode,
        client_request_id: validation.normalized.clientRequestId,
      },
    });
    await audit({
      actorId: input.userId,
      requestId: atomic.id,
      action: "request_submitted",
      oldValues: { status: "draft" },
      newValues: { status: "submitted", request_type: validation.normalized.requestTypeCode },
    });
    return {
      id: p1Created.id,
      requestNumber: (p1Created as { request_number?: string | null }).request_number ?? null,
      status: (p1Created as { status?: string | null }).status ?? "submitted",
      submitted: true,
      workflowInitialized: false,
      clientRequestId: validation.normalized.clientRequestId,
    };
  }

  await assertStudentEligibleForRequestType(input.sessionClient, validation.normalized.requestTypeCode);
  const b1Adapter = getRequestServiceAdapter(validation.normalized.requestTypeCode);
  if (b1Adapter) {
    const activation = validateB1ServiceActivation({ requestTypeCode: validation.normalized.requestTypeCode });
    if (!activation.ok) throw new Error(activation.activationError);
    await assertTrustedB1FormReferences({
      sessionClient: input.sessionClient,
      profileId: profile.id,
      requestTypeCode: validation.normalized.requestTypeCode,
      formData: validation.normalized.formData,
    });
  }

  const payload = buildStudentRequestSubmitPayload(validation.normalized);
  if (b1Adapter) payload.requestType = getStoredWriteCodeForRequestType(validation.normalized.requestTypeCode);
  let requestId = validation.normalized.existingRequestId;
  let priorStatus = "draft";
  let b1ExpectedUpdatedAt: string | undefined;

  if (requestId) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, student_profile_id, request_type, updated_at")
      .eq("id", requestId)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (!existing || existing.student_profile_id !== profile.id) throw new Error("غير مصرح");
    if (
      !["draft", "returned", "returned_for_completion"].includes(existing.status)
    ) {
      throw new Error("لا يمكن إرسال هذا الطلب في حالته الحالية");
    }
    priorStatus = existing.status;
    const storedType = normalizeStudentRequestTypeCode(existing.request_type);
    if (storedType !== validation.normalized.requestTypeCode) {
      throw new Error("نوع الطلب لا يطابق الطلب المحفوظ");
    }

    const updateValues = {
        title: payload.title,
        description: payload.description ?? payload.studentNotes,
        form_data: payload.formData,
        student_notes: payload.studentNotes,
      } as any;
    if (b1Adapter) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("student_requests").update(updateValues).eq("id", requestId)
        .eq("updated_at", existing.updated_at).select("updated_at").maybeSingle();
      if (updateErr) throw new Error(updateErr.message);
      if (!updated?.updated_at) throw new Error("B1_STALE_REQUEST_VERSION");
      b1ExpectedUpdatedAt = updated.updated_at;
    } else {
      const { error: updateErr } = await input.sessionClient
        .from("student_requests").update(updateValues).eq("id", requestId);
      if (updateErr) throw new Error(updateErr.message);
    }
  } else {
    requestId = b1Adapter
      ? await createB1DraftFailClosed({
          sessionClient: input.sessionClient, requestType: payload.requestType,
          title: payload.title, formData: payload.formData, studentNotes: payload.studentNotes,
        })
      : await createDraftViaRpcOrFallback({
          sessionClient: input.sessionClient, profileId: profile.id, requestType: payload.requestType,
          title: payload.title, formData: payload.formData, studentNotes: payload.studentNotes,
          description: payload.description,
        });
  }

  if (b1Adapter) {
    await submitB1RequestAtomically({
      sessionClient: input.sessionClient,
      requestId,
      canonicalCode: b1Adapter.canonicalCode,
      formData: payload.formData,
      expectedUpdatedAt: b1ExpectedUpdatedAt,
    });
  } else {
    await submitViaRpcOrFallback({
      sessionClient: input.sessionClient,
      requestId,
      profileId: profile.id,
    });
  }

  const created = await loadCreatedRequestMeta(requestId);

  const isResubmit = validation.normalized.existingRequestId != null;

  await insertEvent({
    requestId,
    actorId: input.userId,
    eventType: isResubmit ? "resubmitted" : "submitted",
    fromStatus: priorStatus,
    toStatus: "submitted",
    payload: {
      request_type: payload.requestType,
      client_request_id: validation.normalized.clientRequestId,
    },
  });
  await audit({
    actorId: input.userId,
    requestId,
    action: isResubmit ? "request_resubmitted" : "request_submitted",
    oldValues: { status: priorStatus },
    newValues: { status: "submitted", request_type: payload.requestType },
  });

  return {
    id: created.id,
    requestNumber: (created as { request_number?: string | null }).request_number ?? null,
    status: "submitted",
    submitted: true,
    workflowInitialized: false,
    clientRequestId: validation.normalized.clientRequestId,
  };
}

const canonicalSubmitSchema = z.object({
  requestTypeId: z.string().uuid().optional().nullable(),
  requestTypeCode: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  studentNotes: z.string().trim().max(4000).optional().nullable(),
  formData: z.record(z.string(), z.unknown()).optional().nullable(),
  attachments: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        fileName: z.string().max(255).optional().nullable(),
        mimeType: z.string().max(120).optional().nullable(),
        sizeBytes: z.number().int().nonnegative().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  clientRequestId: z.string().trim().max(120).optional().nullable(),
  existingRequestId: z.string().uuid().optional().nullable(),
});

export const submitCanonicalStudentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => canonicalSubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    return submitCanonicalStudentRequestCore({
      userId: context.userId,
      sessionClient: context.supabase,
      raw: data,
    });
  });

const draftSchema = z.object({
  requestType: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  formData: z.record(z.string(), z.unknown()).default({}),
  studentNotes: z.string().trim().max(4000).optional().nullable(),
});

export const createStudentServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const profile = await currentStudentProfile(context.userId);
    const requestType = normalizeStudentRequestTypeCode(data.requestType);
    await assertStudentEligibleForRequestType(context.supabase, requestType);
    const adapter = getRequestServiceAdapter(requestType);
    if (adapter) {
      const activation = validateB1ServiceActivation({ requestTypeCode: requestType });
      if (!activation.ok) throw new Error(activation.activationError);
    }

    const requestId = adapter
      ? await createB1DraftFailClosed({
          sessionClient: context.supabase,
          requestType: getStoredWriteCodeForRequestType(requestType),
          title: data.title,
          formData: data.formData,
          studentNotes: data.studentNotes ?? null,
        })
      : await createDraftViaRpcOrFallback({
          sessionClient: context.supabase, profileId: profile.id, requestType,
          title: data.title, formData: data.formData, studentNotes: data.studentNotes ?? null,
          description: data.studentNotes ?? null,
        });
    const created = await loadCreatedRequestMeta(requestId);
    await insertEvent({
      requestId: created.id,
      actorId: context.userId,
      eventType: "created",
      toStatus: "draft",
      payload: { request_type: requestType },
    });
    await audit({
      actorId: context.userId,
      requestId: created.id,
      action: "request_created",
      newValues: { request_type: requestType, status: "draft" },
    });
    return { id: created.id, request_number: (created as { request_number?: string | null }).request_number ?? null };
  });

export const saveStudentServiceRequestDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    requestId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    formData: z.record(z.string(), z.unknown()).default({}),
    studentNotes: z.string().trim().max(4000).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await currentStudentProfile(context.userId);
    const { data: req, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, student_profile_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.student_profile_id !== profile.id) throw new Error("غير مصرح");
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) throw new Error("لا يمكن تعديل الطلب بعد إرساله");
    // User-scoped client so auth.uid() populates for trg_sr_protect + RLS.
    const { error } = await context.supabase
      .from("student_requests")
      .update({
        title: data.title,
        description: data.studentNotes ?? null,
        form_data: data.formData,
        student_notes: data.studentNotes ?? null,
      } as any)
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    await insertEvent({ requestId: data.requestId, actorId: context.userId, eventType: "draft_saved", notes: "حفظ مسودة" });
    return { ok: true as const };
  });

export const submitStudentServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await currentStudentProfile(context.userId);
    const { data: req, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, student_profile_id, request_type, title, description, form_data, student_notes")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.student_profile_id !== profile.id) throw new Error("غير مصرح");

    return submitCanonicalStudentRequestCore({
      userId: context.userId,
      sessionClient: context.supabase,
      raw: {
        requestTypeCode: req.request_type,
        title: req.title,
        description: req.description,
        studentNotes: req.student_notes ?? req.description,
        formData: (req.form_data as Record<string, unknown> | null) ?? {},
        existingRequestId: req.id,
      },
    });
  });

export const getMyStudentServiceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return rpcGetMyStudentRequests(context.supabase);
  });

export const getStudentServiceRequestDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reqRow, error } = await supabaseAdmin
      .from("student_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!reqRow) throw new Error("الطلب غير موجود");
    const { data: profile } = await supabaseAdmin
      .from("student_profiles")
      .select("id, user_id, academic_number, full_name_ar")
      .eq("id", (reqRow as any).student_profile_id)
      .maybeSingle();
    const req = { ...(reqRow as any), student_profile: profile ?? null };
    const roles = await userRoles(context.userId);
    if (!canAccessRequest(context.userId, roles, req as RequestAccessRow)) throw new Error("غير مصرح");
    const [steps, events, attachments] = await Promise.all([
      supabaseAdmin.from("student_service_request_steps").select("*").eq("request_id", data.requestId).order("step_index"),
      supabaseAdmin.from("student_service_request_events").select("*").eq("request_id", data.requestId).order("created_at"),
      supabaseAdmin.from("student_request_attachments").select("id, file_name, file_url, file_type, uploaded_at").eq("request_id", data.requestId),
    ]);
    if (steps.error) throw new Error(steps.error.message);
    if (events.error) throw new Error(events.error.message);
    if (attachments.error) throw new Error(attachments.error.message);
    return { request: req, steps: steps.data ?? [], events: events.data ?? [], attachments: attachments.data ?? [] };
  });

export const getPendingStudentRequestsForRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await userRoles(context.userId);
    if (!roles.some((r) => ADMIN_ROLES.includes(r as any))) throw new Error("ليس لديك صلاحية");
    let query = supabaseAdmin
      .from("student_requests")
      .select("id, request_number, request_type, title, status, current_step_index, current_role_key, submitted_at, created_at, student_profile_id")
      .in("status", ["submitted", "in_review", "under_review"])
      .order("created_at", { ascending: false });
    if (!roles.includes("admin") && !roles.includes("system_admin")) {
      query = query.in("current_role_key", roles);
    }
    const { data, error } = await query.limit(200);
    if (error) throw new Error(error.message);
    const profileIds = Array.from(new Set((data ?? []).map((r: any) => r.student_profile_id).filter(Boolean)));
    const profilesById = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("student_profiles")
        .select("id, academic_number, full_name_ar, department_id, program_id")
        .in("id", profileIds);
      for (const p of profs ?? []) profilesById.set((p as any).id, p);
    }
    const typeCache = new Map<string, Awaited<ReturnType<typeof loadRequestType>>>();
    return Promise.all((data ?? []).map(async (request: any) => {
      let type = typeCache.get(request.request_type);
      if (!type) {
        type = await loadRequestType(request.request_type);
        typeCache.set(request.request_type, type);
      }
      const steps = workflowSteps(type);
      const currentIndex = request.current_step_index ?? 0;
      return {
        ...request,
        student_profile: profilesById.get(request.student_profile_id) ?? null,
        allowed_actions: allowedActionsForStep(steps[currentIndex], currentIndex, steps),
      };
    }));
  });

async function assertCanAct(userId: string, requestId: string) {
  const roles = await userRoles(userId);
  const { data: req, error } = await supabaseAdmin
    .from("student_requests")
    .select("id, status, current_step_index, current_role_key, student_profile_id, request_type")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req) throw new Error("الطلب غير موجود");
  const allowed = hasGlobalWorkflowAccess(roles) || roleMatchesCurrentStep(roles, req);
  if (!allowed) throw new Error("لا تملك صلاحية تنفيذ هذه الخطوة");
  if (!["submitted", "in_review", "under_review"].includes(req.status)) throw new Error("الطلب ليس في حالة قابلة للإجراء");
  return { req, roles };
}

async function performRequestAction(input: {
  userId: string;
  requestId: string;
  action: (typeof ACTIONS)[number];
  notes?: string | null;
  // Session-scoped Supabase client so the DB trigger `trg_sr_protect`
  // sees the real `auth.uid()` for the acting admin/dean/officer.
  sessionClient: { from: (table: string) => any };
}) {
    const { req } = await assertCanAct(input.userId, input.requestId);
    if ((input.action === "reject" || input.action === "return_for_completion") && !input.notes) {
      throw new Error("الملاحظة مطلوبة عند الرفض أو الإرجاع للاستكمال");
    }
    const type = await loadRequestType(req.request_type);
    const steps = workflowSteps(type);
    const currentIndex = req.current_step_index ?? 0;
    const nextIndex = currentIndex + 1;
    const currentStep = steps[currentIndex];
    const next = steps[nextIndex];
    const allowedActions = allowedActionsForStep(currentStep, currentIndex, steps);
    if (!allowedActions.includes(input.action)) {
      throw new Error("الإجراء غير مسموح لهذه الخطوة");
    }
    if ((input.action === "forward" || input.action === "approve") && !next && input.action === "forward") {
      throw new Error("لا توجد خطوة تالية للإحالة");
    }
    if (input.action === "complete" && !(currentStep?.can_complete === true || currentIndex === steps.length - 1)) {
      throw new Error("إكمال التنفيذ مسموح فقط في الخطوة النهائية");
    }
    let newStatus = req.status === "submitted" ? "in_review" : req.status;
    let patch: Record<string, unknown> = {
      reviewed_by: input.userId,
      reviewed_at: new Date().toISOString(),
      internal_notes: input.notes ?? null,
      status: newStatus,
    };
    if (input.action === "reject") {
      patch = { ...patch, status: "rejected", rejection_reason: input.notes ?? null };
    } else if (input.action === "return_for_completion") {
      patch = { ...patch, status: "returned_for_completion", rejection_reason: input.notes ?? null };
    } else if (input.action === "complete") {
      patch = { ...patch, status: "completed", completed_at: new Date().toISOString() };
    } else if (next) {
      patch = { ...patch, current_step_index: nextIndex, current_role_key: next.role_key, status: "in_review" };
    } else {
      patch = { ...patch, status: "approved" };
    }
    // Use the session client so `trg_sr_protect` receives auth.uid() = actor.
    const { error } = await input.sessionClient.from("student_requests").update(patch as any).eq("id", input.requestId);
    if (error) throw new Error(error.message);
    const { error: stepErr } = await input.sessionClient
      .from("student_service_request_steps")
      .update({
        status: input.action === "approve" || input.action === "forward" ? "approved" : input.action === "complete" ? "completed" : input.action === "reject" ? "rejected" : "returned",
        action: input.action,
        notes: input.notes ?? null,
        acted_by: input.userId,
        acted_at: new Date().toISOString(),
      } as any)
      .eq("request_id", input.requestId)
      .eq("step_index", currentIndex);
    if (stepErr) throw new Error(stepErr.message);
    if ((input.action === "approve" || input.action === "forward") && next) {
      const { error: nextErr } = await input.sessionClient
        .from("student_service_request_steps")
        .update({ status: "active" } as any)
        .eq("request_id", input.requestId)
        .eq("step_index", nextIndex);
      if (nextErr) throw new Error(nextErr.message);
    }
    await insertEvent({
      requestId: input.requestId,
      actorId: input.userId,
      eventType: input.action,
      fromStatus: req.status,
      toStatus: String(patch.status),
      fromStep: currentIndex,
      toStep: next ? nextIndex : currentIndex,
      notes: input.notes ?? null,
    });
    await audit({ actorId: input.userId, requestId: input.requestId, action: `workflow_${input.action}`, oldValues: { status: req.status }, newValues: { status: patch.status } });
    const { data: owner } = await supabaseAdmin.from("student_profiles").select("user_id").eq("id", req.student_profile_id).maybeSingle();
    await notify(owner?.user_id, "تحديث على طلب شؤون الطلاب", `تم تنفيذ إجراء: ${input.action}`, input.requestId);
    return { ok: true as const };
}

export const actOnStudentServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    requestId: z.string().uuid(),
    action: z.enum(ACTIONS),
    notes: z.string().trim().max(4000).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    return performRequestAction({
      userId: context.userId,
      requestId: data.requestId,
      action: data.action,
      notes: data.notes ?? null,
      sessionClient: context.supabase,
    });
  });

export const returnStudentServiceRequestForCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid(), notes: z.string().trim().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => performRequestAction({
    userId: context.userId,
    requestId: data.requestId,
    action: "return_for_completion",
    notes: data.notes,
    sessionClient: context.supabase,
  }));

export const cancelStudentServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const profile = await currentStudentProfile(context.userId);
    const { data: req, error: reqErr } = await supabaseAdmin.from("student_requests").select("id, status, student_profile_id").eq("id", data.requestId).maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.student_profile_id !== profile.id) throw new Error("غير مصرح");
    if (["approved", "completed"].includes(req.status)) throw new Error("لا يمكن إلغاء طلب مكتمل أو معتمد");
    const { error } = await context.supabase.from("student_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any).eq("id", data.requestId);
    if (error) throw new Error(error.message);
    await insertEvent({ requestId: data.requestId, actorId: context.userId, eventType: "cancelled", fromStatus: req.status, toStatus: "cancelled" });
    return { ok: true as const };
  });

export const getStudentRequestAttachmentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: attachment, error } = await supabaseAdmin
      .from("student_request_attachments")
      .select("request_id")
      .eq("file_url", data.path)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!attachment) throw new Error("المرفق غير موجود");
    const { data: reqBase } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, current_step_index, current_role_key, student_profile_id, request_type")
      .eq("id", attachment.request_id)
      .maybeSingle();
    if (!reqBase) throw new Error("الطلب غير موجود");
    const { data: sp } = await supabaseAdmin
      .from("student_profiles")
      .select("user_id")
      .eq("id", (reqBase as any).student_profile_id)
      .maybeSingle();
    const req = { ...(reqBase as any), student_profile: sp ?? null };
    const roles = await userRoles(context.userId);
    if (!canAccessRequest(context.userId, roles, req as RequestAccessRow)) throw new Error("غير مصرح");
    const signed = await supabaseAdmin.storage.from("student-request-attachments").createSignedUrl(data.path, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? "تعذر فتح المرفق");
    return { signedUrl: signed.data.signedUrl };
  });
