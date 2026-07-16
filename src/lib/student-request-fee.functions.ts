import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";
import type { FeePaymentStatus } from "@/lib/student-requests/request-fee-workflow-contract";

/**
 * Idempotency key for the fee-assessment notification:
 * one notification per (student user, request). Prevents duplicates from
 * page refreshes, network retries, or double-clicks. Re-assessments on the
 * same request are intentionally silent (the workflow already has a
 * dedicated payment_requested workflow event visible to the student).
 */
const FEE_NOTIFICATION_TYPE = "fee_assessment";
const FEE_NOTIFICATION_REF_TYPE = "student_request";

function formatFeeAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("ar-EG")} ${currency}`;
}

async function insertFeeAssessmentNotificationIfMissing(params: {
  requestId: string;
  amount: number;
  currency: string;
}): Promise<{ inserted: boolean; skippedReason: null | "amount_zero" | "no_owner" | "already_notified" }> {
  if (!(params.amount > 0)) {
    return { inserted: false, skippedReason: "amount_zero" };
  }

  // Resolve the student user_id (notification recipient) via the request → profile link.
  const { data: reqRow, error: reqErr } = await supabaseAdmin
    .from("student_requests")
    .select(
      "id, request_number, student_profile:student_profiles!inner(user_id)",
    )
    .eq("id", params.requestId)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);

  const ownerUserId =
    (reqRow as { student_profile?: { user_id?: string | null } } | null)?.student_profile
      ?.user_id ?? null;
  const requestNumber =
    (reqRow as { request_number?: string | null } | null)?.request_number ?? null;
  if (!ownerUserId) return { inserted: false, skippedReason: "no_owner" };

  // Idempotency pre-check.
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", ownerUserId)
    .eq("notification_type", FEE_NOTIFICATION_TYPE)
    .eq("reference_type", FEE_NOTIFICATION_REF_TYPE)
    .eq("reference_id", params.requestId)
    .limit(1);
  if (existErr) throw new Error(existErr.message);
  if (existing && existing.length > 0) {
    return { inserted: false, skippedReason: "already_notified" };
  }

  const amountLabel = formatFeeAmount(params.amount, params.currency);
  const requestLabel = requestNumber ?? params.requestId;

  await supabaseAdmin.from("notifications").insert({
    user_id: ownerUserId,
    title: "مطلوب سداد رسوم طلبك",
    message: `الطلب ${requestLabel}: مطلوب سداد مبلغ ${amountLabel} خارج البوابة. اضغط لعرض تفاصيل الطلب.`,
    notification_type: FEE_NOTIFICATION_TYPE,
    reference_type: FEE_NOTIFICATION_REF_TYPE,
    reference_id: params.requestId,
  } as never);

  return { inserted: true, skippedReason: null };
}



/**
 * Fee mutations: requireSupabaseAuth only.
 * Final authorization is enforced by SECURITY DEFINER RPCs
 * (assert_can_* + can_current_user_access_request + active step checks).
 * Do not reintroduce app-role prechecks here — they false-deny processing assignments.
 */

export type StudentRequestFeeProcessingContext = {
  requestId: string;
  runtimeStepId: string | null;
  stepKey: string | null;
  stepStatus: string | null;
  actionType: string | null;
  processingUnitId: string | null;
  processingRoleId: string | null;
  canExecuteCurrentStep: boolean;
  feeAssessment: {
    id: string;
    amount: number;
    currency: string;
    paymentStatus: FeePaymentStatus;
    paymentReference: string | null;
    assessedAt: string | null;
    paymentConfirmedAt: string | null;
  } | null;
};

export const getStudentRequestFeeProcessingContext = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StudentRequestFeeProcessingContext> => {
    const { data: rpcData, error } = await context.supabase.rpc(
      "get_student_request_fee_processing_context",
      { p_request_id: data.requestId },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (rpcData ?? {}) as Record<string, unknown>;
    if (raw.success === false) {
      throw new Error(String(raw.message_ar ?? "تعذر تحميل سياق الرسوم"));
    }

    const fee = (raw.fee_assessment ?? null) as Record<string, unknown> | null;

    return {
      requestId: String(raw.request_id ?? data.requestId),
      runtimeStepId: (raw.runtime_step_id as string | null) ?? null,
      stepKey: (raw.step_key as string | null) ?? null,
      stepStatus: (raw.step_status as string | null) ?? null,
      actionType: (raw.action_type as string | null) ?? null,
      processingUnitId: (raw.processing_unit_id as string | null) ?? null,
      processingRoleId: (raw.processing_role_id as string | null) ?? null,
      canExecuteCurrentStep: Boolean(raw.can_execute_current_step),
      feeAssessment: fee
        ? {
            id: String(fee.id ?? ""),
            amount: Number(fee.amount ?? 0),
            currency: String(fee.currency ?? "YER"),
            paymentStatus: String(fee.payment_status ?? "pending_payment") as FeePaymentStatus,
            paymentReference: (fee.payment_reference as string | null) ?? null,
            assessedAt: (fee.assessed_at as string | null) ?? null,
            paymentConfirmedAt: (fee.payment_confirmed_at as string | null) ?? null,
          }
        : null,
    };
  });

export const assessStudentRequestFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        amount: z.number().min(0),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rpcData, error } = await context.supabase.rpc(
      "assess_student_request_fee",
      {
        p_request_id: data.requestId,
        p_amount: data.amount,
        p_notes: data.notes ?? null,
      },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (rpcData ?? {}) as {
      success?: boolean;
      assessment_id?: string;
      amount?: number;
      payment_status?: string;
      action_result?: string;
      notify_student?: boolean;
    };
    if (!raw.success) {
      throw new Error("تعذر تقييم الرسوم");
    }

    const finalAmount = Number(raw.amount ?? data.amount ?? 0);
    // Fire-and-record notification. Only when amount > 0 AND no prior
    // notification exists for this (student, request). Failure to insert
    // must NOT fail the fee assessment itself (the workflow is already
    // committed by the SECURITY DEFINER RPC above).
    let notificationInserted = false;
    try {
      const notif = await insertFeeAssessmentNotificationIfMissing({
        requestId: data.requestId,
        amount: finalAmount,
        currency: "YER",
      });
      notificationInserted = notif.inserted;
    } catch {
      notificationInserted = false;
    }

    return {
      ok: true as const,
      assessmentId: raw.assessment_id ?? null,
      amount: raw.amount ?? data.amount,
      paymentStatus: raw.payment_status ?? null,
      actionResult: raw.action_result ?? null,
      notifyStudent: Boolean(raw.notify_student),
      notificationInserted,
    };
  });

export const confirmStudentRequestFeePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        paymentReference: z.string().min(1).max(200),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rpcData, error } = await context.supabase.rpc(
      "confirm_student_request_fee_payment",
      {
        p_request_id: data.requestId,
        p_payment_reference: data.paymentReference,
        p_notes: data.notes ?? null,
      },
    );
    if (error) throw new Error(mapStudentRequestRpcError(error));

    const raw = (rpcData ?? {}) as {
      success?: boolean;
      assessment_id?: string;
      payment_status?: string;
      payment_reference?: string;
      notify_student?: boolean;
    };
    if (!raw.success) {
      throw new Error("تعذر تأكيد الدفع");
    }
    return {
      ok: true as const,
      assessmentId: raw.assessment_id ?? null,
      paymentStatus: raw.payment_status ?? "paid",
      paymentReference: raw.payment_reference ?? data.paymentReference,
      notifyStudent: Boolean(raw.notify_student),
    };
  });
