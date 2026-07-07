import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { prepareStudentRequestStaffAction } from "@/lib/student-requests/staff-inbox.functions";
import {
  getAllowedActionsForStepContext,
  STAFF_ACTION_DRY_RUN_SUCCESS_MSG,
  STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG,
  type StudentRequestActionType,
  type StudentRequestStaffActionResult,
} from "@/lib/student-requests/staff-action-contract";
import {
  getAvailableUiActionsForRole,
  STAFF_ACTIONS_DISABLED_MSG,
  type StaffRequestActionDefinition,
} from "@/lib/student-requests/staff-inbox-ui";

function actionButtonClass(variant: StaffRequestActionDefinition["variant"]): string {
  switch (variant) {
    case "primary":
      return "bg-primary text-primary-foreground hover:opacity-90";
    case "danger":
      return "bg-rose-600 text-white hover:opacity-90";
    default:
      return "border border-border bg-background hover:bg-muted";
  }
}

const ACTION_LABELS: Record<StudentRequestActionType, string> = {
  approve: "موافقة",
  reject: "رفض",
  return_to_student: "إعادة للطالب",
  request_completion: "طلب استكمال",
  forward_to_next_step: "إحالة للخطوة التالية",
  add_note: "إضافة ملاحظة",
};

export function StaffRequestActionPanel({
  requestId,
  requestTypeCode,
  currentStepKey,
  currentRoleKey,
  workflowStepRuntimeId,
  workflowRuntimeAvailable,
  requestUpdatedAt,
}: {
  requestId: string;
  requestTypeCode: string;
  currentStepKey: string | null;
  currentRoleKey: string | null;
  workflowStepRuntimeId: string | null;
  workflowRuntimeAvailable: boolean;
  requestUpdatedAt: string | null;
}) {
  const dryRunFn = useServerFn(prepareStudentRequestStaffAction);
  const [localNote, setLocalNote] = useState("");
  const [selectedAction, setSelectedAction] = useState<StudentRequestActionType | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<StudentRequestStaffActionResult | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const validateInFlightRef = useRef(false);

  const roleKeys = currentRoleKey ? [currentRoleKey] : [];
  const legacyActions = getAvailableUiActionsForRole(roleKeys, workflowRuntimeAvailable);

  const theoreticalActions = getAllowedActionsForStepContext({
    userId: "",
    appRoles: [],
    processingRoleKeys: roleKeys,
    departmentIds: [],
    isStaffInboxAuthorized: true,
    stepKey: currentStepKey,
    stepRoleKey: currentRoleKey,
    stepStatus: "active",
    isCentralSignatoryStep: false,
    isParallelStep: false,
    parallelGroupKey: null,
    parallelGroupComplete: null,
    requestTypeCode,
    requestStatus: null,
    requestUpdatedAt,
  });

  const actions: StaffRequestActionDefinition[] = theoreticalActions.length
    ? theoreticalActions.map((key) => ({
        key,
        labelAr: ACTION_LABELS[key],
        variant:
          key === "approve" || key === "forward_to_next_step"
            ? "primary"
            : key === "reject"
              ? "danger"
              : "secondary",
        disabled: false,
        disabledReasonAr: null,
      }))
    : legacyActions.map((a) => ({
        ...a,
        key: a.key === "forward" ? "forward_to_next_step" : a.key,
      }));

  const handleValidate = async () => {
    if (!selectedAction || validateInFlightRef.current || dryRunLoading) return;

    validateInFlightRef.current = true;
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRunResult(null);

    try {
      const result = await dryRunFn({
        data: {
          requestId,
          workflowStepId: workflowStepRuntimeId,
          action: selectedAction,
          note: localNote.trim() || null,
          stepKey: currentStepKey,
          stepRoleKey: currentRoleKey,
          expectedUpdatedAt: requestUpdatedAt,
          clientActionId: crypto.randomUUID(),
        },
      });
      setDryRunResult(result);
    } catch (e) {
      setDryRunError((e as Error).message);
    } finally {
      validateInFlightRef.current = false;
      setDryRunLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="text-xs font-bold text-primary">إجراءات المعالجة</div>

      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {!workflowRuntimeAvailable
            ? STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG
            : STAFF_ACTIONS_DISABLED_MSG}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => {
              setSelectedAction(action.key as StudentRequestActionType);
              setDryRunResult(null);
            }}
            className={`text-xs font-bold px-3 py-2 rounded ${
              selectedAction === action.key ? "ring-2 ring-primary ring-offset-1 " : ""
            }${actionButtonClass(action.variant)}`}
          >
            {action.labelAr}
          </button>
        ))}
      </div>

      <div>
        <label className="text-[11px] font-bold text-muted-foreground block mb-1">
          ملاحظة (محلية — لا تُحفظ في DB في هذه المرحلة)
        </label>
        <textarea
          value={localNote}
          onChange={(e) => setLocalNote(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظة للمراجعة..."
          className="w-full rounded border bg-background px-2 py-1.5 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <button
          type="button"
          disabled={!selectedAction || dryRunLoading}
          onClick={handleValidate}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
        >
          {dryRunLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          التحقق من الإجراء
        </button>
        <button
          type="button"
          disabled
          title={STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
        >
          تنفيذ الإجراء
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">{STAFF_ACTION_DRY_RUN_SUCCESS_MSG}</p>

      {dryRunError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{dryRunError}</p>
      )}

      {dryRunResult && (
        <div className="space-y-2 border rounded-lg p-2.5 bg-muted/20 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-bold">{dryRunResult.status}</span>
            <span className="text-muted-foreground">— {dryRunResult.summaryAr}</span>
          </div>
          {dryRunResult.issues.length > 0 && (
            <ul className="space-y-0.5 max-h-36 overflow-y-auto">
              {dryRunResult.issues.map((issue, idx) => (
                <li
                  key={`${issue.code}-${idx}`}
                  className={
                    issue.severity === "error"
                      ? "text-destructive"
                      : issue.severity === "warning"
                        ? "text-amber-800"
                        : "text-muted-foreground"
                  }
                >
                  {issue.messageAr}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
