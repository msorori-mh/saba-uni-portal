import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getB1UiAdapter,
  type B1StaffAction,
} from "@/lib/student-requests/b1-ui";
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
};

/**
 * B1 five-services staff action section.
 *
 * Renders EXACTLY ONE action, literally equal to the configured `action_type`
 * of the active step, and executes it exclusively through the B1 adapter, which
 * calls `act_on_b1_student_request_step_atomic`. The generic executor
 * (`act_on_student_request_step`) is never reachable from this path.
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
}: Props) {
  const adapter = useMemo(() => getB1UiAdapter(), []);
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

  const handleAct = async (action: B1StaffAction, comment?: string) => {
    if (inFlightRef.current) return;
    if (action !== contract.action) {
      throw new Error("B1_ACTION_TYPE_MISMATCH");
    }
    inFlightRef.current = true;
    setActing(true);
    try {
      await adapter.actOnB1RequestStep(contract.stepId, action, comment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    } finally {
      inFlightRef.current = false;
      setActing(false);
    }
  };

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
