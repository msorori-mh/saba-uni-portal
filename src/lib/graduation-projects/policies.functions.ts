/**
 * Graduation Projects — policy configuration server adapters.
 *
 * Authorization is enforced by the backend RPCs (gp_can_manage_policies);
 * these wrappers never widen it.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GraduationProjectPolicy } from "@/lib/graduation-projects/policies";

const policyDraftSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable(),
  academic_year_id: z.string().uuid().nullable(),
  min_team_size: z.number().int().nullable(),
  max_team_size: z.number().int().nullable(),
  allow_co_supervisor: z.boolean(),
  max_supervisors: z.number().int(),
  required_progress_reports: z.number().int().nullable(),
  min_committee_members: z.number().int().nullable(),
  max_committee_members: z.number().int().nullable(),
  passing_score: z.number().nullable(),
  max_revision_rounds: z.number().int().nullable(),
  enforce_proposal_window: z.boolean().nullable(),
  enforce_defense_window: z.boolean().nullable(),


  proposal_window_start: z.string().nullable(),
  proposal_window_end: z.string().nullable(),
  defense_window_start: z.string().nullable(),
  defense_window_end: z.string().nullable(),
  notes: z.string().nullable(),
});

export type GraduationProjectPolicyDraftInput = z.infer<typeof policyDraftSchema>;

export const listGraduationProjectPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [policies, departments, years] = await Promise.all([
      supabase.rpc("gp_admin_list_policies"),
      supabase.from("departments").select("id, name_ar").order("name_ar"),
      supabase.from("academic_years").select("id, name_ar").order("name_ar"),
    ]);

    if (policies.error) throw new Error(policies.error.message);

    return {
      policies: (policies.data ?? []) as unknown as GraduationProjectPolicy[],
      departments: (departments.data ?? []) as Array<{ id: string; name_ar: string }>,
      academicYears: (years.data ?? []) as Array<{ id: string; name_ar: string }>,
    };
  });

export const saveGraduationProjectPolicyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GraduationProjectPolicyDraftInput) => policyDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("gp_admin_save_policy_draft", {
      p_payload: data as unknown as Record<string, unknown>,
    });
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const publishGraduationProjectPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { policyId: string }) =>
    z.object({ policyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("gp_admin_publish_policy", {
      p_policy_id: data.policyId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
