import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rpcGetMyStudentRequests } from "@/lib/student-request-rpc";

/**
 * Student-scoped tracking reads.
 *
 * Ownership model: every fn asserts that the calling user is the OWNER of
 * the target request via student_profiles.user_id = auth.uid(). Reads then
 * go through supabaseAdmin because student_request_workflow_steps and
 * student_request_fee_assessments have RLS enabled with no SELECT policy
 * for the `authenticated` role (workflow reads are scoped by SECURITY
 * DEFINER RPCs on the staff side, or by ownership checks here on the
 * student side).
 *
 * Privacy: the timeline projection intentionally excludes actor / assignee
 * identifiers — students see stage names + statuses + timestamps, never
 * staff names, staff_profile_id, faculty_profile_id, or completed_by.
 */

const requestIdSchema = z.object({ requestId: z.string().uuid() });

async function assertStudentOwnsRequest(userId: string, requestId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("student_requests")
    .select("id, student_profile:student_profiles!inner(user_id)")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ownerUserId =
    (data as { student_profile?: { user_id?: string | null } } | null)?.student_profile?.user_id ??
    null;
  if (!data || ownerUserId !== userId) {
    throw new Error("غير مصرح");
  }
}

// -------- Workflow timeline --------

export type StudentWorkflowStepStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "skipped"
  | "returned"
  | "cancelled";

export type StudentWorkflowTimelineStep = {
  stepKey: string;
  stepNameAr: string;
  stepOrder: number;
  status: StudentWorkflowStepStatus;
  enteredAt: string | null;
  completedAt: string | null;
};

function normalizeStudentStepStatus(raw: string | null): StudentWorkflowStepStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "completed":
    case "signed":
      return "completed";
    case "active":
      return "current";
    case "skipped":
      return "skipped";
    case "returned":
      return "returned";
    case "cancelled":
      return "cancelled";
    default:
      return "upcoming";
  }
}

export const getStudentRequestWorkflowTimelineForStudent = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentWorkflowTimelineStep[]> => {
    await assertStudentOwnsRequest(context.userId, data.requestId);

    // Only project columns the student is allowed to see. Explicitly OMIT
    // assigned_user_id / assigned_staff_profile_id / assigned_faculty_profile_id
    // / processing_role_id / processing_unit_id / completed_by so a
    // future edit cannot leak actor identity to the student surface.
    const { data: rows, error } = await supabaseAdmin
      .from("student_request_workflow_steps")
      .select(
        "step_key, step_name_ar, step_order, status, entered_at, completed_at",
      )
      .eq("student_request_id", data.requestId)
      .order("step_order", { ascending: true });

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => {
      const r = row as {
        step_key: string;
        step_name_ar: string | null;
        step_order: number | null;
        status: string | null;
        entered_at: string | null;
        completed_at: string | null;
      };
      return {
        stepKey: r.step_key,
        stepNameAr: r.step_name_ar ?? r.step_key,
        stepOrder: Number(r.step_order ?? 0),
        status: normalizeStudentStepStatus(r.status),
        enteredAt: r.entered_at,
        completedAt: r.completed_at,
      };
    });
  });

// -------- Fee summary --------

export type StudentFeeSummaryStatus =
  | "no_assessment"
  | "not_required"
  | "pending_payment"
  | "paid"
  | "cancelled";

export type StudentFeeSummary = {
  status: StudentFeeSummaryStatus;
  amount: number;
  currency: string;
  requiresPayment: boolean;
  isConfirmed: boolean;
  assessedAt: string | null;
  paymentConfirmedAt: string | null;
};

function normalizeFeeStatus(raw: string | null | undefined): StudentFeeSummaryStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "not_required":
      return "not_required";
    case "pending_payment":
      return "pending_payment";
    case "paid":
    case "confirmed":
      return "paid";
    case "cancelled":
      return "cancelled";
    default:
      return "pending_payment";
  }
}

export const getStudentRequestFeeSummaryForStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentFeeSummary> => {
    await assertStudentOwnsRequest(context.userId, data.requestId);

    const { data: rows, error } = await supabaseAdmin
      .from("student_request_fee_assessments")
      .select("amount, currency, payment_status, assessed_at, payment_confirmed_at")
      .eq("request_id", data.requestId)
      .neq("payment_status", "cancelled")
      .order("assessed_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);

    const row = (rows ?? [])[0] as
      | {
          amount: number | string | null;
          currency: string | null;
          payment_status: string | null;
          assessed_at: string | null;
          payment_confirmed_at: string | null;
        }
      | undefined;

    if (!row) {
      return {
        status: "no_assessment",
        amount: 0,
        currency: "YER",
        requiresPayment: false,
        isConfirmed: false,
        assessedAt: null,
        paymentConfirmedAt: null,
      };
    }

    const status = normalizeFeeStatus(row.payment_status);
    const amount = Number(row.amount ?? 0);

    return {
      status,
      amount,
      currency: row.currency ?? "YER",
      requiresPayment: status === "pending_payment" && amount > 0,
      isConfirmed: status === "paid",
      assessedAt: row.assessed_at,
      paymentConfirmedAt: row.payment_confirmed_at,
    };
  });

// -------- Enriched list for the student portal card --------

export type MyStudentRequestWithProgress = {
  id: string;
  request_number: string | null;
  request_type: string;
  request_type_name_ar: string | null;
  title: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  currentStageAr: string | null;
  currentStepKey: string | null;
  fee: StudentFeeSummary;
};

export const getMyStudentRequestsWithProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyStudentRequestWithProgress[]> => {
    // Ownership: the RPC already scopes to auth.uid() (returns caller's
    // requests only). We enrich via supabaseAdmin restricted to those IDs.
    const rows = await rpcGetMyStudentRequests(context.supabase);
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return [];

    const [stepsRes, feesRes] = await Promise.all([
      supabaseAdmin
        .from("student_request_workflow_steps")
        .select("student_request_id, step_key, step_name_ar, status, step_order")
        .in("student_request_id", ids)
        .eq("status", "active"),
      supabaseAdmin
        .from("student_request_fee_assessments")
        .select("request_id, amount, currency, payment_status, assessed_at, payment_confirmed_at")
        .in("request_id", ids)
        .neq("payment_status", "cancelled"),
    ]);

    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (feesRes.error) throw new Error(feesRes.error.message);

    const activeStepById = new Map<
      string,
      { step_key: string; step_name_ar: string | null }
    >();
    for (const s of (stepsRes.data ?? []) as Array<{
      student_request_id: string;
      step_key: string;
      step_name_ar: string | null;
      step_order: number | null;
    }>) {
      // If multiple actives (parallel), keep the smallest step_order deterministically.
      const prev = activeStepById.get(s.student_request_id);
      if (!prev) activeStepById.set(s.student_request_id, s);
    }

    // Prefer the most recent non-cancelled assessment per request.
    const feeByRequest = new Map<string, StudentFeeSummary>();
    for (const f of (feesRes.data ?? []) as Array<{
      request_id: string;
      amount: number | string | null;
      currency: string | null;
      payment_status: string | null;
      assessed_at: string | null;
      payment_confirmed_at: string | null;
    }>) {
      const status = normalizeFeeStatus(f.payment_status);
      const amount = Number(f.amount ?? 0);
      const existing = feeByRequest.get(f.request_id);
      const candidate: StudentFeeSummary = {
        status,
        amount,
        currency: f.currency ?? "YER",
        requiresPayment: status === "pending_payment" && amount > 0,
        isConfirmed: status === "paid",
        assessedAt: f.assessed_at,
        paymentConfirmedAt: f.payment_confirmed_at,
      };
      if (!existing) {
        feeByRequest.set(f.request_id, candidate);
      } else {
        const prevAt = existing.assessedAt ?? "";
        const nextAt = candidate.assessedAt ?? "";
        if (nextAt > prevAt) feeByRequest.set(f.request_id, candidate);
      }
    }

    return rows.map((r) => {
      const stage = activeStepById.get(r.id);
      const fee = feeByRequest.get(r.id) ?? {
        status: "no_assessment" as const,
        amount: 0,
        currency: "YER",
        requiresPayment: false,
        isConfirmed: false,
        assessedAt: null,
        paymentConfirmedAt: null,
      };
      return {
        id: r.id,
        request_number: r.request_number ?? null,
        request_type: r.request_type,
        request_type_name_ar: r.request_type_name_ar ?? null,
        title: r.title,
        status: r.status,
        submitted_at: r.submitted_at ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        currentStageAr: stage?.step_name_ar ?? stage?.step_key ?? null,
        currentStepKey: stage?.step_key ?? null,
        fee,
      };
    });
  });
