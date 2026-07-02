import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, primaryActorRole, userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("request_types")
      .select("code, name_ar, description_ar, requires_attachment, required_documents, form_schema, workflow_schema, category")
      .eq("is_active", true)
      .eq("student_visible", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
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
    const type = await loadRequestType(data.requestType);
    if (!type.student_visible) throw new Error("نوع الطلب غير متاح للطالب");
    const requestNumber = `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    // Use the user-scoped client so auth.uid() is populated for RLS + trg_sr_protect.
    const { data: created, error } = await context.supabase
      .from("student_requests")
      .insert({
        request_number: requestNumber,
        student_profile_id: profile.id,
        request_type: type.code,
        title: data.title,
        description: data.studentNotes ?? null,
        status: "draft",
        form_data: data.formData,
        student_notes: data.studentNotes ?? null,
      } as any)
      .select("id, request_number")
      .single();
    if (error) throw new Error(error.message);
    await insertEvent({ requestId: created.id, actorId: context.userId, eventType: "created", toStatus: "draft", payload: { request_type: type.code } });
    await audit({ actorId: context.userId, requestId: created.id, action: "request_created", newValues: { request_type: type.code, status: "draft" } });
    return created;
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
      .select("id, status, student_profile_id, request_type")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.student_profile_id !== profile.id) throw new Error("غير مصرح");
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) throw new Error("لا يمكن إرسال هذا الطلب");
    const type = await loadRequestType(req.request_type);
    const steps = workflowSteps(type);
    const first = steps[0];
    await initializeSteps(req.id, steps);
    // User-scoped client so auth.uid() populates for trg_sr_protect + RLS.
    const { error } = await context.supabase
      .from("student_requests")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        current_step_index: 0,
        current_role_key: first?.role_key ?? null,
        rejection_reason: null,
      } as any)
      .eq("id", req.id);
    if (error) throw new Error(error.message);
    await insertEvent({ requestId: req.id, actorId: context.userId, eventType: "submitted", fromStatus: req.status, toStatus: "submitted", toStep: 0 });
    await audit({ actorId: context.userId, requestId: req.id, action: "request_submitted", oldValues: { status: req.status }, newValues: { status: "submitted" } });
    return { ok: true as const };
  });

export const getMyStudentServiceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await currentStudentProfile(context.userId);
    const { data, error } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_number, request_type, title, status, submitted_at, created_at, updated_at, current_role_key")
      .eq("student_profile_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
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
    const { error } = await supabaseAdmin.from("student_requests").update(patch as any).eq("id", input.requestId);
    if (error) throw new Error(error.message);
    await supabaseAdmin
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
    if ((input.action === "approve" || input.action === "forward") && next) {
      await supabaseAdmin
        .from("student_service_request_steps")
        .update({ status: "active" } as any)
        .eq("request_id", input.requestId)
        .eq("step_index", nextIndex);
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
    const { error } = await supabaseAdmin.from("student_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any).eq("id", data.requestId);
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
    const { data: req } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, current_step_index, current_role_key, student_profile_id, request_type, student_profile:student_profiles(user_id)")
      .eq("id", attachment.request_id)
      .maybeSingle();
    if (!req) throw new Error("الطلب غير موجود");
    const roles = await userRoles(context.userId);
    if (!canAccessRequest(context.userId, roles, req as RequestAccessRow)) throw new Error("غير مصرح");
    const signed = await supabaseAdmin.storage.from("student-request-attachments").createSignedUrl(data.path, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? "تعذر فتح المرفق");
    return { signedUrl: signed.data.signedUrl };
  });
