import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";

const FEE_ASSESS_ROLES = [
  "admin",
  "system_admin",
  "student_affairs",
  "student_affairs_manager",
] as const;

const FEE_CONFIRM_ROLES = [
  "admin",
  "system_admin",
  "revenue_finance_officer",
] as const;

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
    await assertAnyRole(
      context.userId,
      FEE_ASSESS_ROLES,
      "ليس لديك صلاحية تقييم رسوم الطلب",
    );

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
    return {
      ok: true as const,
      assessmentId: raw.assessment_id ?? null,
      amount: raw.amount ?? data.amount,
      paymentStatus: raw.payment_status ?? null,
      actionResult: raw.action_result ?? null,
      notifyStudent: Boolean(raw.notify_student),
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
    await assertAnyRole(
      context.userId,
      FEE_CONFIRM_ROLES,
      "ليس لديك صلاحية تأكيد دفع الرسوم",
    );

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
