/**
 * Read-only capability probe for the fee-processing UI.
 *
 * WHY: the generic step gate `can_current_user_act_on_step(step, action)` only
 * accepts actor actions listed in `is_valid_actor_request_action`, which does
 * NOT include `assess_fee` / `confirm_payment`. That makes
 * `can_execute_current_step` always false for fee steps and hides the fee
 * forms even from the correctly assigned actor.
 *
 * This probe is presentation-only. Authorization remains fully enforced
 * server-side by `assert_can_assess_student_request_fee` and
 * `assert_can_confirm_student_request_fee_payment` inside the fee RPCs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASSESS_ROLES = new Set(["student_affairs_manager"]);
const CONFIRM_ROLES = new Set(["revenue_finance_officer", "finance_officer"]);

export type FeeProcessingCapability = {
  canAssessFee: boolean;
  canConfirmPayment: boolean;
  processingRoleCodes: string[];
};

export const getFeeProcessingCapability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeeProcessingCapability> => {
    const { data, error } = await context.supabase.rpc(
      "current_user_processing_assignments",
    );
    if (error) {
      return { canAssessFee: false, canConfirmPayment: false, processingRoleCodes: [] };
    }
    const codes = ((data ?? []) as Array<{ role_code: string | null }>)
      .map((row) => row.role_code)
      .filter((code): code is string => Boolean(code));

    return {
      canAssessFee: codes.some((c) => ASSESS_ROLES.has(c)),
      canConfirmPayment: codes.some((c) => CONFIRM_ROLES.has(c)),
      processingRoleCodes: codes,
    };
  });
