import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getB1UiAdapter,
  type B1StaffAction,
} from "@/lib/student-requests/b1-ui";
import type { B1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.types";
import { b1ActionRequiresDetails } from "@/lib/student-requests/b1-details-preflight";
import {
  resolveB1StaffActionContract,
  toB1CanonicalCode,
  type B1StaffActionContract,
} from "@/lib/student-requests/b1-staff-action-routing";
import { B1EmployeeActionPanel } from "./B1EmployeeActionPanel";
import { B1DetailsPreflightNotice } from "./B1DetailsPreflightNotice";
import { B1RevenueReceiptCard } from "./B1RevenueReceiptCard";

type Props = {
  requestId: string;
  requestTypeCode: string | null;
  stepId: string | null;
  stepKey: string | null;
  stepLabelAr: string;
  /** Literal configured action_type of the active step. */
  configuredActionType: string | null;
  allowedAction?: string | null;
  isActionable: boolean;
  /**
   * Explicit dependency-injection seam (production default = the real B1
   * adapter). Kept as a normal prop so tests can supply an isolated fake
   * without module mocking; there is NO test-environment branching here.
   */
  adapter?: B1StaffStepActionExecutor;
};

/** Minimal executor surface this section needs from the B1 adapter. */
export type B1StaffStepActionExecutor = Pick<B1UiAdapter, "actOnB1RequestStep"> &
  Partial<Pick<B1UiAdapter, "confirmB1RevenueReceipt">>;

/** Literal configured action_type that MUST be executed by the revenue card. */
export const B1_CONFIRM_PAYMENT_ACTION_TYPE = "confirm_payment";

export const B1_CONFIRM_PAYMENT_EXECUTOR_MISSING_ERROR =
  "B1_CONFIRM_PAYMENT_EXECUTOR_MISSING: مسار تأكيد الإيراد غير متاح.";

/**
 * Guarded confirm handler for `confirm_payment` steps. It NEVER routes through
 * `actOnB1RequestStep`, so approve/review/apply_decision can not be sent.
 */
export function createB1ConfirmPaymentHandler(params: {
  adapter: B1StaffStepActionExecutor;
  stepId: string;
  inFlightRef: { current: boolean };
  onActingChange?: (acting: boolean) => void;
  onSettled?: () => Promise<void> | void;
}) {
  return async (stepId: string, optionalNote?: string): Promise<void> => {
    if (params.inFlightRef.current) return;
    if (stepId !== params.stepId) throw new Error("B1_STEP_ID_MISMATCH");
    const confirmFn = params.adapter.confirmB1RevenueReceipt;
    if (typeof confirmFn !== "function") {
      throw new Error(B1_CONFIRM_PAYMENT_EXECUTOR_MISSING_ERROR);
    }
    params.inFlightRef.current = true;
    params.onActingChange?.(true);
    try {
      await confirmFn.call(params.adapter, params.stepId, optionalNote);
      await params.onSettled?.();
    } finally {
      params.inFlightRef.current = false;
      params.onActingChange?.(false);
    }
  };
}

/**
 * Builds the guarded act handler used by the section. Exported so the
 * double-submit (in-flight) guard is testable against the exact production
 * implementation without rendering interaction.
 */
export function createB1StaffActHandler(params: {
  adapter: B1StaffStepActionExecutor;
  stepId: string;
  contractAction: B1StaffAction;
  inFlightRef: { current: boolean };
  onActingChange?: (acting: boolean) => void;
  onSettled?: () => Promise<void> | void;
}) {
  return async (action: B1StaffAction, comment?: string): Promise<void> => {
    if (params.inFlightRef.current) return;
    if (action !== params.contractAction) {
      throw new Error("B1_ACTION_TYPE_MISMATCH");
    }
    params.inFlightRef.current = true;
    params.onActingChange?.(true);
    try {
      await params.adapter.actOnB1RequestStep(params.stepId, action, comment);
      await params.onSettled?.();
    } finally {
      params.inFlightRef.current = false;
      params.onActingChange?.(false);
    }
  };
}

/**
 * B1 five-services staff action section.
 *
 * Renders EXACTLY ONE action, literally equal to the configured `action_type`
 * of the active step, and executes it exclusively through the B1 adapter, which
 * calls `act_on_b1_student_request_step_atomic`. The generic staff executor is
 * never reachable from this path.
 */
export function B1StaffStepActionSection({
  requestId,
  requestTypeCode,
  stepId,
  stepKey,
  stepLabelAr,
  configuredActionType,
  allowedAction,
  isActionable,
  adapter: injectedAdapter,
}: Props) {
  const adapter = useMemo(
    () => injectedAdapter ?? getB1UiAdapter(),
    [injectedAdapter],
  );
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);
  const inFlightRef = useRef(false);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["student-request-fee-context", requestId] }),
    ]);
  };

  // ---------------------------------------------------------------------
  // Specialized literal action: confirm_payment -> revenue receipt card.
  // Routed exclusively through `confirmB1RevenueReceipt`.
  // ---------------------------------------------------------------------
  const configuredRaw = (configuredActionType ?? "").trim();
  if (
    toB1CanonicalCode(requestTypeCode) &&
    configuredRaw === B1_CONFIRM_PAYMENT_ACTION_TYPE
  ) {
    const paymentStepId = (stepId ?? "").trim();
    const allowedRaw = (allowedAction ?? "").trim();
    const failureCode = !paymentStepId
      ? "STEP_ID_MISSING"
      : allowedRaw && allowedRaw !== B1_CONFIRM_PAYMENT_ACTION_TYPE
        ? "ALLOWED_ACTION_MISMATCH"
        : !isActionable
          ? "NOT_ACTIONABLE"
          : null;

    if (failureCode) {
      const blocked = resolveB1StaffActionContract({
        requestTypeCode,
        stepId,
        configuredActionType: "review",
        allowedAction: null,
        isActionable: failureCode !== "NOT_ACTIONABLE",
      });
      const messageAr =
        failureCode === "NOT_ACTIONABLE"
          ? "لست الفاعل المُسنَد للخطوة النشطة — لا يمكن تنفيذ الإجراء."
          : !blocked.ok
            ? blocked.messageAr
            : "الإجراء المسموح لا يطابق الإجراء المُهيّأ للخطوة — تم إيقاف التنفيذ.";
      return (
        <section
          dir="rtl"
          data-testid="b1-staff-action-blocked"
          data-failure-code={failureCode}
          className="rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <div className="mb-1 text-xs font-bold text-primary">إجراء المرحلة</div>
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{messageAr}</span>
          </div>
        </section>
      );
    }

    const handleConfirm = createB1ConfirmPaymentHandler({
      adapter,
      stepId: paymentStepId,
      inFlightRef,
      onActingChange: setActing,
      onSettled: invalidate,
    });

    return (
      <div
        data-testid="b1-staff-action-section"
        data-b1-action={B1_CONFIRM_PAYMENT_ACTION_TYPE}
      >
        <B1RevenueReceiptCard stepId={paymentStepId} acting={acting} onConfirm={handleConfirm} />
      </div>
    );
  }

  const contract: B1StaffActionContract = resolveB1StaffActionContract({
    requestTypeCode,
    stepId,
    configuredActionType,
    allowedAction,
    isActionable,
  });

  if (!contract.ok) {
    return (
      <section
        dir="rtl"
        data-testid="b1-staff-action-blocked"
        data-failure-code={contract.code}
        className="rounded-lg border border-amber-200 bg-amber-50 p-3"
      >
        <div className="mb-1 text-xs font-bold text-primary">إجراء المرحلة</div>
        <div className="flex items-start gap-2 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{contract.messageAr}</span>
        </div>
      </section>
    );
  }

  const handleAct = createB1StaffActHandler({
    adapter,
    stepId: contract.stepId,
    contractAction: contract.action,
    inFlightRef,
    onActingChange: setActing,
    onSettled: invalidate,
  });

  // Exit actions (return/reject) offered by the preflight notice bypass the
  // single-action contract guard on purpose; the backend still authorizes them.
  const handleExitAct = async (action: B1StaffAction, comment?: string): Promise<void> => {
    if (inFlightRef.current) return;
    if (action !== "return" && action !== "reject") {
      throw new Error("B1_ACTION_TYPE_MISMATCH");
    }
    inFlightRef.current = true;
    setActing(true);
    try {
      await adapter.actOnB1RequestStep(contract.stepId, action, comment);
      await invalidate();
    } finally {
      inFlightRef.current = false;
      setActing(false);
    }
  };

  const panel = (
    <B1EmployeeActionPanel
      allowedAction={contract.action}
      stepLabelAr={stepLabelAr}
      stepKey={stepKey ?? undefined}
      acting={acting}
      onAct={handleAct}
    />
  );

  return (
    <div data-testid="b1-staff-action-section" data-b1-action={contract.action}>
      {b1ActionRequiresDetails(contract.action) ? (
        <B1DetailsPreflightNotice
          stepId={contract.stepId}
          stepLabelAr={stepLabelAr}
          acting={acting}
          onAct={handleExitAct}
        >
          {panel}
        </B1DetailsPreflightNotice>
      ) : (
        panel
      )}
    </div>
  );
}
