import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  mergeWorkflowStepPaymentDocumentFlags,
  rpcAdminGetRequestWorkflowConfig,
  rpcAdminSaveRequestWorkflowConfig,
  workflowMetaForSaveMode,
  type AdminRequestWorkflowConfig,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
  type ProcessingOptionsResult,
  type WorkflowStepPaymentDocumentRow,
} from "@/lib/admin-request-workflow-rpc";
import {
  WORKFLOW_ACTIVATE_ROLES,
  WORKFLOW_DRAFT_SAVE_ROLES,
} from "@/lib/workflow-activation-auth";
import {
  assertDraftProcessingResolution,
  buildDraftProcessingResolutionFromRows,
  buildWorkflowSaveInputFromDraft,
  buildWorkflowSaveInputFromPreview,
  draftTransitionsForSaveRpc,
  normalizeDraftWorkflowStepsFlags,
  type DraftWorkflowProcessingResolution,
  type StudentRequestWorkflowSaveInput,
  type StudentRequestWorkflowSaveResult,
  validateWorkflowSaveInput,
} from "@/lib/student-requests/request-workflow-save-contract";

async function assertRequestWorkflowAdmin(userId: string) {
  await assertAnyRole(
    userId,
    WORKFLOW_DRAFT_SAVE_ROLES,
    "ليس لديك صلاحية إعداد دورة حياة الطلبات",
  );
}

async function assertRequestWorkflowActivate(userId: string) {
  await assertAnyRole(
    userId,
    WORKFLOW_ACTIVATE_ROLES,
    "ليس لديك صلاحية تفعيل دورة حياة الطلبات",
  );
}

function isSchemaMissingError(message: string): boolean {
  return (
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

/**
 * Read-only resolution of draft processing UUIDs → trusted role/unit codes.
 * Throws Arabic errors when refs are missing, inactive, or mismatched.
 */
export async function resolveDraftWorkflowProcessingReferences(
  steps: DraftWorkflowStep[],
): Promise<DraftWorkflowProcessingResolution> {
  const unitIds = [
    ...new Set(
      steps
        .map((s) => s.processing_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roleIds = [
    ...new Set(
      steps
        .map((s) => s.processing_role_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let units: Array<{ id: string; code: string; is_active: boolean }> = [];
  let roles: Array<{ id: string; unit_id: string; code: string; is_active: boolean }> = [];

  if (unitIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("request_processing_units")
      .select("id, code, is_active")
      .in("id", unitIds);
    if (error) {
      throw new Error(`تعذر قراءة جهات المعالجة: ${error.message}`);
    }
    units = data ?? [];
  }

  if (roleIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("request_processing_roles")
      .select("id, unit_id, code, is_active")
      .in("id", roleIds);
    if (error) {
      throw new Error(`تعذر قراءة مسميات المعالجة: ${error.message}`);
    }
    roles = data ?? [];
  }

  const resolution = buildDraftProcessingResolutionFromRows(units, roles);
  assertDraftProcessingResolution(steps, resolution);
  return resolution;
}

export const getRequestTypeForWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestWorkflowAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("request_types")
      .select("id, code, name_ar, description_ar, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("نوع الطلب غير موجود");
    return row;
  });

export const getAdminRequestWorkflowConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestTypeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminRequestWorkflowConfig> => {
    await assertRequestWorkflowAdmin(context.userId);
    const config = await rpcAdminGetRequestWorkflowConfig(
      context.supabase,
      data.requestTypeId,
    );

    const workflowIds = config.workflows.map((w) => w.id);
    if (workflowIds.length === 0 || config.steps.length === 0) {
      return config;
    }

    // Server-side enrichment only — GET RPC may omit payment/document flags.
    // Read-only supabaseAdmin select; save path still uses the user-scoped RPC client.
    const { data: stepRows, error: enrichError } = await supabaseAdmin
      .from("request_type_workflow_steps")
      .select("id, workflow_id, requires_payment, produces_document")
      .in("workflow_id", workflowIds);

    if (enrichError) {
      throw new Error(
        `تعذر إكمال بيانات خطوات دورة الحياة من الخادم: ${enrichError.message}`,
      );
    }

    return mergeWorkflowStepPaymentDocumentFlags(
      config,
      (stepRows ?? []) as WorkflowStepPaymentDocumentRow[],
    );
  });

export const listRequestProcessingOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProcessingOptionsResult> => {
    await assertRequestWorkflowAdmin(context.userId);

    const unitsRes = await supabaseAdmin
      .from("request_processing_units")
      .select("id, code, name_ar, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (unitsRes.error) {
      if (isSchemaMissingError(unitsRes.error.message)) {
        return {
          schemaAvailable: false,
          units: [],
          roles: [],
          message: "يجب تطبيق مخطط وحدات المعالجة قبل تحميل الجهات والمسميات.",
        };
      }
      throw new Error(unitsRes.error.message);
    }

    const rolesRes = await supabaseAdmin
      .from("request_processing_roles")
      .select("id, unit_id, code, name_ar, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (rolesRes.error) {
      if (isSchemaMissingError(rolesRes.error.message)) {
        return {
          schemaAvailable: false,
          units: [],
          roles: [],
          message: "يجب تطبيق مخطط وحدات المعالجة قبل تحميل الجهات والمسميات.",
        };
      }
      throw new Error(rolesRes.error.message);
    }

    const units = unitsRes.data ?? [];
    const roles = rolesRes.data ?? [];

    if (units.length === 0 && roles.length === 0) {
      return {
        schemaAvailable: true,
        units: [],
        roles: [],
        message: "لا توجد جهات أو مسميات معالجة مُعرّفة بعد. أضفها بعد تطبيق المخطط والتهيئة.",
      };
    }

    return {
      schemaAvailable: true,
      units,
      roles,
      message: null,
    };
  });

const workflowSaveDryRunSchema = z.object({
  requestTypeId: z.string().uuid(),
  requestTypeCode: z.string().min(1).max(80),
  source: z.enum(["preview", "draft"]).default("draft"),
  workflow: z
    .object({
      workflowNameAr: z.string().max(200).optional(),
      isActive: z.boolean().optional(),
      configVersion: z.number().int().positive().optional(),
      expectedUpdatedAt: z.string().optional().nullable(),
    })
    .optional(),
  draftSteps: z.array(z.record(z.unknown())).optional(),
  draftTransitions: z.array(z.record(z.unknown())).optional(),
});

/** Dry-run only — validates workflow save payload; never writes to DB or calls save RPC. */
export const prepareStudentRequestWorkflowSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workflowSaveDryRunSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentRequestWorkflowSaveResult> => {
    await assertRequestWorkflowAdmin(context.userId);

    const { data: typeRow, error: typeErr } = await supabaseAdmin
      .from("request_types")
      .select("id, code")
      .eq("id", data.requestTypeId)
      .maybeSingle();
    if (typeErr) throw new Error("تعذر التحقق من نوع الطلب");
    if (!typeRow) throw new Error("نوع الطلب غير موجود");

    let payload: Partial<StudentRequestWorkflowSaveInput>;

    if (data.source === "preview") {
      const built = buildWorkflowSaveInputFromPreview(data.requestTypeId, typeRow.code);
      if (!built) throw new Error("لا يوجد مسار مرجعي لهذا النوع");
      payload = built;
    } else {
      const draftSteps = normalizeDraftWorkflowStepsFlags(
        (data.draftSteps ?? []) as DraftWorkflowStep[],
      );
      const draftTransitions = (data.draftTransitions ?? []) as DraftWorkflowTransition[];
      const resolution = await resolveDraftWorkflowProcessingReferences(draftSteps);
      payload = buildWorkflowSaveInputFromDraft(
        data.requestTypeId,
        typeRow.code,
        draftSteps,
        draftTransitions,
        resolution,
      );
      if (data.workflow?.workflowNameAr) {
        payload = { ...payload, workflowNameAr: data.workflow.workflowNameAr };
      }
      if (typeof data.workflow?.isActive === "boolean") {
        payload = { ...payload, isActive: data.workflow.isActive };
      }
    }

    return validateWorkflowSaveInput(payload);
  });

const workflowSaveSchema = z.object({
  requestTypeId: z.string().uuid(),
  saveMode: z.enum(["draft", "activate"]),
  workflowNameAr: z.string().max(200).optional(),
  draftSteps: z.array(z.record(z.unknown())),
  draftTransitions: z.array(z.record(z.unknown())),
});

export const saveAdminRequestWorkflowConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workflowSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.saveMode === "activate") {
      await assertRequestWorkflowActivate(context.userId);
    } else {
      await assertRequestWorkflowAdmin(context.userId);
    }

    const { data: typeRow, error: typeErr } = await supabaseAdmin
      .from("request_types")
      .select("code, name_ar")
      .eq("id", data.requestTypeId)
      .maybeSingle();
    if (typeErr) throw new Error("تعذر التحقق من نوع الطلب");
    if (!typeRow) throw new Error("نوع الطلب غير موجود");

    const draftSteps = normalizeDraftWorkflowStepsFlags(data.draftSteps as DraftWorkflowStep[]);
    const draftTransitions = draftTransitionsForSaveRpc(
      data.draftTransitions as DraftWorkflowTransition[],
    );

    // Re-resolve on the server — never trust a prior browser dry-run alone.
    const resolution = await resolveDraftWorkflowProcessingReferences(draftSteps);

    const built = buildWorkflowSaveInputFromDraft(
      data.requestTypeId,
      typeRow.code,
      draftSteps,
      draftTransitions,
      resolution,
    );
    const workflowNameAr =
      data.workflowNameAr?.trim() ||
      built.workflowNameAr ||
      `دورة حياة — ${typeRow.name_ar}`;

    const dryRun = validateWorkflowSaveInput({
      ...built,
      workflowNameAr,
      isActive: data.saveMode === "activate",
    });
    if (!dryRun.valid) {
      const firstError = dryRun.issues.find((i) => i.severity === "error");
      throw new Error(firstError?.messageAr ?? "التكوين غير صالح للحفظ");
    }

    if (data.saveMode === "activate" && !dryRun.valid) {
      throw new Error("لا يمكن التفعيل — التحقق من التكوين فشل");
    }

    const { status, is_active } = workflowMetaForSaveMode(data.saveMode);
    const result = await rpcAdminSaveRequestWorkflowConfig(context.supabase, {
      requestTypeId: data.requestTypeId,
      workflow: {
        code: `${typeRow.code}_workflow`,
        name_ar: workflowNameAr,
        status,
        is_active,
      },
      steps: draftSteps,
      transitions: draftTransitions,
    });
    return {
      ok: true as const,
      workflowId: result.workflow_id,
      saveMode: data.saveMode,
    };
  });
