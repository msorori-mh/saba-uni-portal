import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  Constants,
  type Json,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
} from "@/integrations/supabase/types";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import {
  evaluateProcessingRoleUsageSafety,
  interpretRoleDeleteResult,
  normalizeProcessingRoleCode,
  validateProcessingRoleCode,
  attachAuditWarning,
  type ProcessingRoleMutationAction,
  type ProcessingRoleUsageSafetyInput,
} from "@/lib/admin-processing-roles.core";

type ProcessingRoleRow = Tables<"request_processing_roles">;
type ProcessingUnitRow = Tables<"request_processing_units">;
type WorkflowUsageRow = {
  id: string;
  workflow_id: string;
  step_key: string;
  step_name_ar: string;
  workflow:
    | { id: string; name_ar: string; status: string; is_active: boolean }
    | { id: string; name_ar: string; status: string; is_active: boolean }[]
    | null;
};
type AssignmentUsageRow = Pick<
  Tables<"request_processing_assignments">,
  | "id"
  | "assignment_type"
  | "is_active"
  | "unit_id"
  | "user_id"
  | "staff_profile_id"
  | "faculty_profile_id"
  | "department_id"
>;
type PositionMappingRow = Pick<
  Tables<"organizational_positions">,
  "code" | "name_ar" | "is_active"
>;

const PROCESSING_ROLE_ADMIN_ROLES = ["admin", "system_admin"] as const;
const APP_ROLE_VALUES = Constants.public.Enums.app_role;
const APP_ROLE_SET = new Set<string>(APP_ROLE_VALUES);

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const nullableTrimmedString = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const appRoleSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((value) => !value || APP_ROLE_SET.has(value), {
      message: "صلاحية النظام غير معروفة.",
    }),
);

const roleWritableFieldsSchema = z.object({
  name_ar: z.string().trim().min(1).max(160),
  name_en: nullableTrimmedString(160),
  description_ar: nullableTrimmedString(2000),
  unit_id: z.string().uuid(),
  is_managerial: z.boolean().default(false),
  app_role: appRoleSchema,
  position_code: nullableTrimmedString(80),
  sort_order: z.number().int().min(0).max(100000).default(0),
  is_active: z.boolean().default(true),
});

const createRoleSchema = roleWritableFieldsSchema.extend({
  code: z.string().trim().min(1).max(80),
});

const updateRoleSchema = roleWritableFieldsSchema
  .partial()
  .extend({
    id: z.string().uuid(),
    code: z.string().optional(),
  });

const idSchema = z.object({ id: z.string().uuid() });

const setActiveSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
  confirmationText: z.string(),
});

async function assertProcessingRoleAdmin(userId: string) {
  await assertAnyRole(userId, PROCESSING_ROLE_ADMIN_ROLES);
}

async function logProcessingRoleAudit(input: {
  actor_user_id: string;
  entity_id: string | null;
  action_type: string;
  notes?: string;
  old_values?: unknown;
  new_values?: unknown;
}): Promise<{ ok: true } | { ok: false; messageAr: string }> {
  const role = await primaryActorRole(input.actor_user_id);
  const auditRow: TablesInsert<"audit_logs"> = {
    actor_user_id: input.actor_user_id,
    actor_role: role,
    entity_type: "processing_role",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: {
      source: "admin_staff_management",
      actor_user_id: input.actor_user_id,
      snapshot: (input.old_values ?? null) as Json,
    } as Json,
    new_values: {
      source: "admin_staff_management",
      actor_user_id: input.actor_user_id,
      snapshot: (input.new_values ?? null) as Json,
    } as Json,
  };
  const { error } = await supabaseAdmin.from("audit_logs").insert(auditRow);
  if (error) {
    return {
      ok: false,
      messageAr: error.message || "تعذر تسجيل سجل التدقيق.",
    };
  }
  return { ok: true };
}

async function requireActiveUnit(unitId: string): Promise<ProcessingUnitRow> {
  const { data, error } = await supabaseAdmin
    .from("request_processing_units")
    .select("*")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw new Error(`تعذر التحقق من جهة المعالجة: ${error.message}`);
  if (!data) throw new Error("جهة المعالجة غير موجودة.");
  if (!data.is_active) throw new Error("جهة المعالجة غير مفعلة.");
  return data;
}

async function assertPositionCodeUsable(positionCode: string | null | undefined) {
  if (!positionCode) return;
  const { data, error } = await supabaseAdmin
    .from("organizational_positions")
    .select("code, is_active")
    .eq("code", positionCode)
    .maybeSingle();
  if (error) throw new Error(`تعذر التحقق من المنصب التنظيمي: ${error.message}`);
  if (!data) throw new Error("رمز المنصب التنظيمي غير موجود.");
  if (!data.is_active) throw new Error("المنصب التنظيمي غير مفعل.");
}

async function requireProcessingRole(roleId: string): Promise<ProcessingRoleRow> {
  const { data, error } = await supabaseAdmin
    .from("request_processing_roles")
    .select("*")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw new Error(`تعذر قراءة مسمى المعالجة: ${error.message}`);
  if (!data) throw new Error("مسمى المعالجة غير موجود.");
  return data;
}

async function countRoleUsage(role: ProcessingRoleRow): Promise<{
  usage: ProcessingRoleUsageSafetyInput;
  workflowSteps: WorkflowUsageRow[];
  assignments: AssignmentUsageRow[];
  positionMapping: PositionMappingRow | null;
}> {
  const queryFailures: string[] = [];
  let workflowSteps: WorkflowUsageRow[] = [];
  let assignments: AssignmentUsageRow[] = [];
  let positionMapping: PositionMappingRow | null = null;

  const stepsRes = await supabaseAdmin
    .from("request_type_workflow_steps")
    .select(
      [
        "id",
        "workflow_id",
        "step_key",
        "step_name_ar",
        "workflow:request_type_workflows!request_type_workflow_steps_workflow_id_fkey(id, name_ar, status, is_active)",
      ].join(", "),
    )
    .eq("processing_role_id", role.id);
  if (stepsRes.error) {
    queryFailures.push("request_type_workflow_steps");
  } else {
    workflowSteps = (stepsRes.data ?? []) as WorkflowUsageRow[];
  }

  const assignmentsRes = await supabaseAdmin
    .from("request_processing_assignments")
    .select(
      [
        "id",
        "assignment_type",
        "is_active",
        "unit_id",
        "user_id",
        "staff_profile_id",
        "faculty_profile_id",
        "department_id",
      ].join(", "),
    )
    .eq("role_id", role.id);
  if (assignmentsRes.error) {
    queryFailures.push("request_processing_assignments");
  } else {
    assignments = (assignmentsRes.data ?? []) as AssignmentUsageRow[];
  }

  if (role.position_code) {
    const positionRes = await supabaseAdmin
      .from("organizational_positions")
      .select("code, name_ar, is_active")
      .eq("code", role.position_code)
      .maybeSingle();
    if (positionRes.error) {
      queryFailures.push("organizational_positions");
    } else {
      positionMapping = positionRes.data;
    }
  }

  const activeWorkflowStepsCount = workflowSteps.filter((step) => {
    const workflow = Array.isArray(step.workflow) ? step.workflow[0] : step.workflow;
    return Boolean(workflow?.is_active) && workflow?.status !== "draft";
  }).length;
  const draftWorkflowStepsCount = workflowSteps.filter((step) => {
    const workflow = Array.isArray(step.workflow) ? step.workflow[0] : step.workflow;
    return workflow?.status === "draft";
  }).length;

  return {
    usage: {
      workflowStepsCount: stepsRes.error ? null : workflowSteps.length,
      assignmentsCount: assignmentsRes.error ? null : assignments.length,
      // Role owns position_code FK → organizational_positions; no reverse refs block delete.
      positionMappingsCount: 0,
      activeWorkflowStepsCount: stepsRes.error ? null : activeWorkflowStepsCount,
      draftWorkflowStepsCount: stepsRes.error ? null : draftWorkflowStepsCount,
      queryFailures,
    },
    workflowSteps,
    assignments,
    positionMapping,
  };
}

async function assertUsageAllows(role: ProcessingRoleRow, action: ProcessingRoleMutationAction) {
  const { usage } = await countRoleUsage(role);
  const safety = evaluateProcessingRoleUsageSafety(usage, action, role.code);
  if (!safety.allowed) {
    throw new Error(safety.reasons[0] ?? "لا يمكن تنفيذ الإجراء بسبب استخدامات مرتبطة.");
  }
}

export const listRequestProcessingRolesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertProcessingRoleAdmin(context.userId);

    const [rolesRes, unitsRes, stepsRes, assignmentsRes] = await Promise.all([
      supabaseAdmin
        .from("request_processing_roles")
        .select("*")
        .order("unit_id", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabaseAdmin.from("request_processing_units").select("id, code, name_ar, is_active"),
      supabaseAdmin.from("request_type_workflow_steps").select("processing_role_id"),
      supabaseAdmin.from("request_processing_assignments").select("role_id"),
    ]);

    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (unitsRes.error) throw new Error(unitsRes.error.message);
    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

    const unitsById = new Map((unitsRes.data ?? []).map((unit) => [unit.id, unit]));
    const workflowCounts = new Map<string, number>();
    for (const step of stepsRes.data ?? []) {
      if (!step.processing_role_id) continue;
      workflowCounts.set(step.processing_role_id, (workflowCounts.get(step.processing_role_id) ?? 0) + 1);
    }
    const assignmentCounts = new Map<string, number>();
    for (const assignment of assignmentsRes.data ?? []) {
      if (!assignment.role_id) continue;
      assignmentCounts.set(assignment.role_id, (assignmentCounts.get(assignment.role_id) ?? 0) + 1);
    }

    return {
      units: (unitsRes.data ?? []).map((unit) => ({
        id: unit.id,
        code: unit.code,
        name_ar: unit.name_ar,
        is_active: unit.is_active,
      })),
      roles: (rolesRes.data ?? []).map((role) => {
        const unit = unitsById.get(role.unit_id) ?? null;
        return {
          ...role,
          unit_code: unit?.code ?? null,
          unit_name_ar: unit?.name_ar ?? null,
          unit_is_active: unit?.is_active ?? null,
          workflowStepsCount: workflowCounts.get(role.id) ?? 0,
          assignmentsCount: assignmentCounts.get(role.id) ?? 0,
        };
      }),
    };
  });

export const getRequestProcessingRoleUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingRoleAdmin(context.userId);
    const role = await requireProcessingRole(data.id);
    const usage = await countRoleUsage(role);
    return {
      role,
      ...usage,
      deleteSafety: evaluateProcessingRoleUsageSafety(usage.usage, "delete", role.code),
      deactivateSafety: evaluateProcessingRoleUsageSafety(usage.usage, "deactivate", role.code),
      changeUnitSafety: evaluateProcessingRoleUsageSafety(usage.usage, "change_unit", role.code),
    };
  });

export const createRequestProcessingRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingRoleAdmin(context.userId);

    const code = normalizeProcessingRoleCode(data.code);
    const codeValidation = validateProcessingRoleCode(code);
    if (!codeValidation.ok) throw new Error(codeValidation.messageAr);

    await requireActiveUnit(data.unit_id);
    await assertPositionCodeUsable(data.position_code);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("request_processing_roles")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error("رمز مسمى المعالجة مستخدم مسبقاً.");

    const insertRow: TablesInsert<"request_processing_roles"> = {
      code,
      unit_id: data.unit_id,
      name_ar: data.name_ar,
      name_en: data.name_en ?? null,
      description_ar: data.description_ar ?? null,
      app_role: data.app_role ?? null,
      position_code: data.position_code ?? null,
      is_managerial: data.is_managerial,
      is_active: data.is_active,
      sort_order: data.sort_order,
    };

    const { data: created, error } = await supabaseAdmin
      .from("request_processing_roles")
      .insert(insertRow)
      .select("*")
      .single();
    if (error || !created) {
      throw new Error(`تعذر إنشاء مسمى المعالجة: ${error?.message ?? ""}`);
    }

    const audit = await logProcessingRoleAudit({
      actor_user_id: context.userId,
      entity_id: created.id,
      action_type: "processing_role_created",
      notes: `إضافة مسمى معالجة: ${created.code}`,
      new_values: created,
    });

    return attachAuditWarning(
      { ok: true as const, role: created },
      audit.ok ? null : audit.messageAr,
      "تم إنشاء الدور الوظيفي",
    );
  });

export const updateRequestProcessingRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingRoleAdmin(context.userId);
    if (data.code !== undefined) throw new Error("لا يمكن تغيير رمز مسمى المعالجة.");

    const old = await requireProcessingRole(data.id);
    if (data.unit_id && data.unit_id !== old.unit_id) {
      await requireActiveUnit(data.unit_id);
      await assertUsageAllows(old, "change_unit");
    }
    if (data.is_active !== undefined && data.is_active !== old.is_active) {
      if (data.is_active) {
        await requireActiveUnit(data.unit_id ?? old.unit_id);
      } else {
        await assertUsageAllows(old, "deactivate");
      }
    }
    if (data.position_code !== undefined) {
      await assertPositionCodeUsable(data.position_code);
    }

    const patch: TablesUpdate<"request_processing_roles"> = {
      updated_at: new Date().toISOString(),
    };
    if (data.name_ar !== undefined) patch.name_ar = data.name_ar;
    if (data.name_en !== undefined) patch.name_en = data.name_en ?? null;
    if (data.description_ar !== undefined) {
      patch.description_ar = data.description_ar ?? null;
    }
    if (data.unit_id !== undefined) patch.unit_id = data.unit_id;
    if (data.is_managerial !== undefined) patch.is_managerial = data.is_managerial;
    if (data.app_role !== undefined) patch.app_role = data.app_role ?? null;
    if (data.position_code !== undefined) patch.position_code = data.position_code ?? null;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    const { data: updated, error } = await supabaseAdmin
      .from("request_processing_roles")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !updated) {
      throw new Error(`تعذر تحديث مسمى المعالجة: ${error?.message ?? ""}`);
    }

    const audit = await logProcessingRoleAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: "processing_role_updated",
      notes: `تعديل مسمى معالجة: ${old.code}`,
      old_values: old,
      new_values: updated,
    });

    return attachAuditWarning(
      { ok: true as const, role: updated },
      audit.ok ? null : audit.messageAr,
      "تم تحديث الدور الوظيفي",
    );
  });

export const setRequestProcessingRoleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingRoleAdmin(context.userId);
    const old = await requireProcessingRole(data.id);

    if (data.is_active) {
      await requireActiveUnit(old.unit_id);
    } else {
      await assertUsageAllows(old, "deactivate");
    }

    if (old.is_active === data.is_active) {
      return { ok: true as const, role: old, warning: null };
    }

    const { data: updated, error } = await supabaseAdmin
      .from("request_processing_roles")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !updated) {
      throw new Error(`تعذر تغيير حالة مسمى المعالجة: ${error?.message ?? ""}`);
    }

    const audit = await logProcessingRoleAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: data.is_active ? "processing_role_activated" : "processing_role_deactivated",
      notes: `${data.is_active ? "تفعيل" : "تعطيل"} مسمى معالجة: ${old.code}`,
      old_values: old,
      new_values: updated,
    });

    return attachAuditWarning(
      { ok: true as const, role: updated },
      audit.ok ? null : audit.messageAr,
      data.is_active ? "تم تفعيل الدور الوظيفي" : "تم تعطيل الدور الوظيفي",
    );
  });

export const deleteRequestProcessingRoleSafely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingRoleAdmin(context.userId);
    const old = await requireProcessingRole(data.id);
    if (data.confirmationText !== old.code) {
      throw new Error("يجب كتابة رمز مسمى المعالجة تماماً لتأكيد الحذف.");
    }

    await assertUsageAllows(old, "delete");

    const { data: deletedRows, error } = await supabaseAdmin
      .from("request_processing_roles")
      .delete()
      .eq("id", data.id)
      .eq("code", old.code)
      .select("id");
    if (error) throw new Error(`تعذر حذف مسمى المعالجة: ${error.message}`);

    const deletedCount = (deletedRows ?? []).length;
    if (deletedCount === 0) {
      const stillThere = await supabaseAdmin
        .from("request_processing_roles")
        .select("id")
        .eq("id", data.id)
        .maybeSingle();
      const interpreted = interpretRoleDeleteResult({
        deletedCount: 0,
        roleId: data.id,
        alreadyMissing: !stillThere.data && !stillThere.error,
      });
      if (!interpreted.ok) throw new Error(interpreted.messageAr);
      // Idempotent: role already gone — do not write a fresh deleted audit.
      return {
        ok: true as const,
        deleted_id: data.id,
        warning: null,
        idempotent: true as const,
        messageAr: interpreted.messageAr,
      };
    }
    if (deletedCount !== 1) {
      throw new Error("نتيجة حذف غير متوقعة؛ لم يُسجّل حذف جديد.");
    }

    const audit = await logProcessingRoleAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: "processing_role_deleted",
      notes: `حذف مسمى معالجة: ${old.code}`,
      old_values: old,
    });

    return attachAuditWarning(
      {
        ok: true as const,
        deleted_id: data.id,
        idempotent: false as const,
      },
      audit.ok ? null : audit.messageAr,
      "تم حذف الدور الوظيفي",
    );
  });
