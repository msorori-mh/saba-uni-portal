import { useState } from "react";
import { AlertCircle } from "lucide-react";
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

export function StaffRequestActionPanel({
  currentRoleKey,
  workflowRuntimeAvailable,
}: {
  currentRoleKey: string | null;
  workflowRuntimeAvailable: boolean;
}) {
  const [localNote, setLocalNote] = useState("");
  const roleKeys = currentRoleKey ? [currentRoleKey] : [];
  const actions = getAvailableUiActionsForRole(roleKeys, workflowRuntimeAvailable);

  const handleActionClick = (action: StaffRequestActionDefinition) => {
    if (action.key === "add_note") return;
    if (action.disabled) return;
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="text-xs font-bold text-primary">إجراءات المعالجة</div>

      {!workflowRuntimeAvailable && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{STAFF_ACTIONS_DISABLED_MSG}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled && action.key !== "add_note"}
            title={action.disabledReasonAr ?? undefined}
            onClick={() => handleActionClick(action)}
            className={`text-xs font-bold px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed ${actionButtonClass(action.variant)}`}
          >
            {action.labelAr}
          </button>
        ))}
      </div>

      <div>
        <label className="text-[11px] font-bold text-muted-foreground block mb-1">
          ملاحظة (محلية — لا تُحفظ في هذه المرحلة)
        </label>
        <textarea
          value={localNote}
          onChange={(e) => setLocalNote(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظة للمراجعة..."
          className="w-full rounded border bg-background px-2 py-1.5 text-xs"
        />
      </div>
    </div>
  );
}
