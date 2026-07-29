import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getB1UiAdapter,
  type B1StaffAction,
} from "@/lib/student-requests/b1-ui";
import type { B1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.types";
import {
  resolveB1StaffActionContract,
  type B1StaffActionContract,
} from "@/lib/student-requests/b1-staff-action-routing";
import { B1EmployeeActionPanel } from "./B1EmployeeActionPanel";

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
export type B1StaffStepActionExecutor = Pick<B1UiAdapter, "actOnB1RequestStep">;

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
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  return (
    <div data-testid="b1-staff-action-section" data-b1-action={contract.action}>
      <B1EmployeeActionPanel
        allowedAction={contract.action}
        stepLabelAr={stepLabelAr}
        stepKey={stepKey ?? undefined}
        acting={acting}
        onAct={handleAct}
      />
    </div>
  );
}
