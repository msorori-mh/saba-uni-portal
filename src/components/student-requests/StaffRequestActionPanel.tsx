import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  executeStudentRequestStaffAction,
  prepareStudentRequestStaffAction,
  type ReviewStepExecutableAction,
} from "@/lib/student-requests/staff-inbox.functions";
import {
  getAllowedActionsForStepContext,
  STAFF_ACTION_DRY_RUN_SUCCESS_MSG,
  STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG,
  type StudentRequestActionType,
  type StudentRequestStaffActionResult,
} from "@/lib/student-requests/staff-action-contract";
import {
  assertGenericStaffExecutorAllowed,
  isB1StaffRoutedRequestType,
} from "@/lib/student-requests/b1-staff-action-routing";
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

/** Map staff-action-contract UI action → RPC review-executor action. */
function mapToReviewRpcAction(
  action: StudentRequestActionType,
): ReviewStepExecutableAction | null {
  if (action === "approve") return "approve";
  if (action === "reject") return "reject";
  if (action === "return_to_student" || action === "request_completion") return "return";
  if (action === "add_note") return "comment";
  return null; // forward_to_next_step not applicable to a review step.
}

/** Label shown on the primary "execute" button per selected action. */
function executeLabelFor(action: StudentRequestActionType): string {
  if (action === "approve") return "اعتماد المراجعة الأولية";
  if (action === "reject") return "تنفيذ الرفض";
  if (action === "return_to_student" || action === "request_completion") return "إعادة للطالب";
  if (action === "add_note") return "إضافة الملاحظة";
  return "تنفيذ الإجراء";
}

export function StaffRequestActionPanel({
  requestId,
  requestTypeCode,
  currentStepKey,
  currentRoleKey,
  workflowStepRuntimeId,
  activeStepActionType,
  activeStepIsActionable,
  workflowRuntimeAvailable,
  requestUpdatedAt,
  canExecuteReview,
}: {
  requestId: string;
  requestTypeCode: string;
  currentStepKey: string | null;
  currentRoleKey: string | null;
  workflowStepRuntimeId: string | null;
  activeStepActionType: string | null;
  activeStepIsActionable: boolean;
  workflowRuntimeAvailable: boolean;
  requestUpdatedAt: string | null;
  /** True only when active step is action_type='review' AND user is assigned actor. */
  canExecuteReview: boolean;
}) {
  const dryRunFn = useServerFn(prepareStudentRequestStaffAction);
  const executeFn = useServerFn(executeStudentRequestStaffAction);
  const queryClient = useQueryClient();
  const [localNote, setLocalNote] = useState("");
  const [selectedAction, setSelectedAction] = useState<StudentRequestActionType | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<StudentRequestStaffActionResult | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const validateInFlightRef = useRef(false);
  const executeInFlightRef = useRef(false);

  // Fail-closed separation: the five B1 services must never reach the generic
  // action panel or the generic executor — they use the atomic B1 RPC path.
  if (isB1StaffRoutedRequestType(requestTypeCode)) {
    return (
      <div
        dir="rtl"
        data-testid="generic-panel-b1-blocked"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
      >
        إجراءات هذه الخدمة تُنفَّذ من لوحة B1 المخصصة عبر المسار الذري، وليس من لوحة الإجراءات
        العامة.
      </div>
    );
  }

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

  const rpcAction = selectedAction ? mapToReviewRpcAction(selectedAction) : null;
  const executeEnabled =
    canExecuteReview &&
    !!workflowStepRuntimeId &&
    !!rpcAction &&
    !executing &&
    !((selectedAction === "reject" ||
      selectedAction === "return_to_student" ||
      selectedAction === "request_completion") &&
      !localNote.trim());

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

  const handleExecute = async () => {
    if (!executeEnabled || !selectedAction || !workflowStepRuntimeId || !rpcAction) return;
    if (executeInFlightRef.current) return;

    executeInFlightRef.current = true;
    setExecuting(true);
    setExecuteError(null);

    try {
      assertGenericStaffExecutorAllowed(requestTypeCode);
      const result = await executeFn({
        data: {
          requestId,
          requestTypeCode,
          workflowStepRuntimeId,
          action: rpcAction,
          comment: localNote.trim() || null,
        },
      });
      toast.success(
        result.terminal
          ? "تم إنهاء دورة حياة الطلب"
          : result.nextStepId
            ? "تم اعتماد الخطوة وتفعيل الخطوة التالية"
            : "تم تنفيذ الإجراء",
      );
      setLocalNote("");
      setSelectedAction(null);
      setDryRunResult(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setExecuteError(msg);
      toast.error(msg);
    } finally {
      executeInFlightRef.current = false;
      setExecuting(false);
    }
  };

  const stepGateLabel = !workflowRuntimeAvailable
    ? STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG
    : !canExecuteReview
      ? activeStepActionType && activeStepActionType !== "review"
        ? `الإجراء هنا متاح فقط لخطوة action_type='review' — الخطوة النشطة نوعها: ${activeStepActionType}.`
        : !activeStepIsActionable
          ? "لست الفاعل المُسنَد للخطوة النشطة."
          : STAFF_ACTIONS_DISABLED_MSG
      : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="text-xs font-bold text-primary">إجراءات المعالجة</div>

      {stepGateLabel && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{stepGateLabel}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => {
              setSelectedAction(action.key as StudentRequestActionType);
              setDryRunResult(null);
              setExecuteError(null);
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
          ملاحظة (تُحفظ كتعليق للإجراء عند التنفيذ)
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
          data-testid="execute-review-action"
          disabled={!executeEnabled}
          title={
            !canExecuteReview
              ? STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG
              : !selectedAction
                ? "اختر الإجراء أولاً"
                : ""
          }
          onClick={handleExecute}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {executing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {selectedAction ? executeLabelFor(selectedAction) : "تنفيذ الإجراء"}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {canExecuteReview
          ? "التنفيذ يستدعي RPC act_on_student_request_step على DB (SECURITY DEFINER). الخطوة الحالية ستُكتمل والخطوة التالية ستُفعَّل تلقائياً حسب دورة الحياة."
          : STAFF_ACTION_DRY_RUN_SUCCESS_MSG}
      </p>

      {dryRunError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{dryRunError}</p>
      )}
      {executeError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{executeError}</p>
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
