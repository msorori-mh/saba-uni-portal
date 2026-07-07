import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { REQUEST_TYPES_ADMIN_ROLES } from "@/lib/admin-request-types.functions";
import {
  rpcAdminGetRequestWorkflowConfig,
  rpcAdminSaveRequestWorkflowConfig,
  type AdminRequestWorkflowConfig,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
  type ProcessingOptionsResult,
} from "@/lib/admin-request-workflow-rpc";
import {
  buildWorkflowSaveInputFromDraft,
  buildWorkflowSaveInputFromPreview,
  type StudentRequestWorkflowSaveInput,
  type StudentRequestWorkflowSaveResult,
  validateWorkflowSaveInput,
} from "@/lib/student-requests/request-workflow-save-contract";

async function assertRequestWorkflowAdmin(userId: string) {
  await assertAnyRole(
    userId,
    REQUEST_TYPES_ADMIN_ROLES,
    "ليس لديك صلاحية إعداد دورة حياة الطلبات",
  );
}

function isSchemaMissingError(message: string): boolean {
  return (
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message) ||
    /could not find the table/i.test(message)
  );
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
    return rpcAdminGetRequestWorkflowConfig(context.supabase, data.requestTypeId);
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
  steps: z.array(z.record(z.unknown())).optional(),
  transitions: z.array(z.record(z.unknown())).optional(),
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
    } else if (data.steps && data.steps.length > 0) {
      payload = {
        requestTypeId: data.requestTypeId,
        requestTypeCode: typeRow.code,
        workflowNameAr: data.workflow?.workflowNameAr,
        isActive: data.workflow?.isActive,
        configVersion: data.workflow?.configVersion,
        expectedUpdatedAt: data.workflow?.expectedUpdatedAt,
        steps: data.steps as StudentRequestWorkflowSaveInput["steps"],
        transitions: (data.transitions ?? []) as StudentRequestWorkflowSaveInput["transitions"],
        parallelGroups: [],
      };
    } else {
      const draftSteps = (data.draftSteps ?? []) as DraftWorkflowStep[];
      const draftTransitions = (data.draftTransitions ?? []) as DraftWorkflowTransition[];
      payload = buildWorkflowSaveInputFromDraft(
        data.requestTypeId,
        typeRow.code,
        draftSteps,
        draftTransitions,
      );
    }

    return validateWorkflowSaveInput(payload);
  });

export const saveAdminRequestWorkflowConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestTypeId: z.string().uuid(),
        workflow: z.record(z.unknown()),
        steps: z.array(z.record(z.unknown())),
        transitions: z.array(z.record(z.unknown())),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestWorkflowAdmin(context.userId);
    await rpcAdminSaveRequestWorkflowConfig(context.supabase, {
      requestTypeId: data.requestTypeId,
      workflow: data.workflow,
      steps: data.steps as DraftWorkflowStep[],
      transitions: data.transitions as DraftWorkflowTransition[],
    });
    return { ok: true as const };
  });
