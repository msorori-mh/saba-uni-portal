/**
 * P1 — server-side eligibility RPCs.
 *
 * These wrappers are thin: the DECISION always belongs to the SECURITY DEFINER
 * SQL functions (docs/migration-drafts/p1/P1-02-BACKEND-VALIDATION.sql), which
 * recompute the rule from the academic model of record. The client-supplied
 * values are never trusted.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { P1_RPC, p1ServerErrorMessageAr } from "./backend-contract";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function currentStudentProfileId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("لا يوجد ملف طالب");
  return data.id as string;
}

function rethrow(error: { message?: string } | null): never | void {
  if (error) throw new Error(p1ServerErrorMessageAr(error));
}

export const getOctoberRemainingRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const studentId = await currentStudentProfileId(supabase, userId);
    const { data, error } = await supabase.rpc(P1_RPC.octoberRemaining, {
      p_student: studentId,
    });
    rethrow(error);
    return (data ?? []) as Array<{
      requirement_id: string;
      course_id: string;
      course_code: string;
      course_name_ar: string;
    }>;
  });

export const assertOctoberEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z.object({ selectedRequirementIds: z.array(z.string().uuid()).optional() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    const studentId = await currentStudentProfileId(supabase, userId);
    const { data: result, error } = await supabase.rpc(P1_RPC.assertOctober, {
      p_student: studentId,
      p_selected: data.selectedRequirementIds ?? null,
    });
    rethrow(error);
    return result as {
      academic_level_order: number;
      remaining_courses_count: number;
      eligible_requirement_ids: string[];
    };
  });

export const assertReplacementCardEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const studentId = await currentStudentProfileId(supabase, userId);
    const { error } = await supabase.rpc(P1_RPC.assertReplacementCard, {
      p_student: studentId,
    });
    rethrow(error);
    return { eligible: true } as const;
  });

export const assertFinalResultAppealEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ enrollmentId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    const studentId = await currentStudentProfileId(supabase, userId);
    const { data: result, error } = await supabase.rpc(P1_RPC.assertFinalResultAppeal, {
      p_student: studentId,
      p_enrollment: data.enrollmentId,
    });
    rethrow(error);
    return result as {
      final_result_published_at: string;
      appeal_window_end: string;
    };
  });

export const assertDepartmentTransferLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const studentId = await currentStudentProfileId(supabase, userId);
    const { error } = await supabase.rpc(P1_RPC.assertTransferLevel, {
      p_student: studentId,
    });
    rethrow(error);
    return { eligible: true } as const;
  });

export const applyFinalResultDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        requestId: z.string().uuid(),
        finalResult: z.number().min(0),
        note: z.string().max(2000).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context as any;
    // Authorization + idempotency are enforced inside the RPC, not here.
    const { data: result, error } = await supabase.rpc(P1_RPC.applyFinalResult, {
      p_request: data.requestId,
      p_final_result: data.finalResult,
      p_note: data.note ?? null,
    });
    rethrow(error);
    return result as {
      applied: boolean;
      previous_final_result?: number;
      approved_final_result?: number;
      reason?: string;
    };
  });
