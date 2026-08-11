import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { WORKFLOW_DRAFT_SAVE_ROLES } from "@/lib/workflow-activation-auth";
import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";
import type { AdminServiceDefinition } from "@/lib/admin-service-definition";

async function assertServiceDesigner(userId: string) {
  await assertAnyRole(
    userId,
    WORKFLOW_DRAFT_SAVE_ROLES,
    "ليس لديك صلاحية إعداد الخدمات الطلابية",
  );
}

export const getAdminServiceDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestTypeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminServiceDefinition> => {
    await assertServiceDesigner(context.userId);

    const { data: result, error } = await context.supabase.rpc(
      "admin_get_service_definition",
      { p_request_type_id: data.requestTypeId },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (result ?? {}) as Partial<AdminServiceDefinition>;
    return {
      request_type: raw.request_type ?? null,
      eligibility_rules: raw.eligibility_rules ?? [],
      rule_catalog: raw.rule_catalog ?? [],
      action_catalog: raw.action_catalog ?? [],
      workflow_versions: raw.workflow_versions ?? [],
      step_actions: raw.step_actions ?? [],
      change_log: raw.change_log ?? [],
    };
  });

export const saveServiceEligibilityRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestTypeId: z.string().uuid(),
        rules: z.array(
          z.object({
            rule_code: z.string().min(1).max(120),
            params: z.record(z.unknown()).default({}),
            message_ar: z.string().min(1).max(500),
            is_active: z.boolean().default(true),
            sort_order: z.number().int().min(0).default(0),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertServiceDesigner(context.userId);

    const { data: result, error } = await context.supabase.rpc(
      "admin_save_request_type_eligibility_rules",
      { p_request_type_id: data.requestTypeId, p_rules: data.rules },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (result ?? {}) as { rules_count?: number };
    return { ok: true as const, rulesCount: raw.rules_count ?? data.rules.length };
  });

export const saveServiceStepActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workflowId: z.string().uuid(),
        stepActions: z.array(
          z.object({
            step_key: z.string().min(1).max(120),
            action_code: z.string().max(120).nullable(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertServiceDesigner(context.userId);

    const { data: result, error } = await context.supabase.rpc(
      "admin_set_request_workflow_step_actions",
      { p_workflow_id: data.workflowId, p_step_actions: data.stepActions },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (result ?? {}) as { updated_steps?: number };
    return { ok: true as const, updatedSteps: raw.updated_steps ?? 0 };
  });
