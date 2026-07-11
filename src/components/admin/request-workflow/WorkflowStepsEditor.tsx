import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type {
  DraftWorkflowStep,
  ProcessingOptionsResult,
  WorkflowActionType,
} from "@/lib/admin-request-workflow-rpc";
import { ACTION_TYPE_OPTIONS } from "@/components/admin/request-workflow/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  steps: DraftWorkflowStep[];
  processing: ProcessingOptionsResult;
  onChange: (steps: DraftWorkflowStep[]) => void;
};

function newStep(order: number): DraftWorkflowStep {
  return {
    localId: crypto.randomUUID(),
    step_key: `step_${order}`,
    step_name_ar: "",
    step_order: order,
    processing_unit_id: null,
    processing_role_id: null,
    action_type: "review",
    visible_to_student: true,
    notify_on_enter: true,
    can_return_to_student: true,
    can_reject: true,
    can_skip: false,
  };
}

export function WorkflowStepsEditor({ steps, processing, onChange }: Props) {
  const rolesForUnit = (unitId: string | null) =>
    unitId
      ? processing.roles.filter((r) => r.unit_id === unitId)
      : processing.roles;

  const updateStep = (localId: string, patch: Partial<DraftWorkflowStep>) => {
    onChange(steps.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  };

  const removeStep = (localId: string) => {
    const next = steps
      .filter((s) => s.localId !== localId)
      .map((s, i) => ({ ...s, step_order: i + 1 }));
    onChange(next);
  };

  const addStep = () => {
    onChange([...steps, newStep(steps.length + 1)]);
  };

  const assessFeeWarnings = steps
    .filter((s) => s.action_type === "assess_fee")
    .map((s) => s.step_key);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-sm text-primary">خطوات المعالجة</h2>
        <Button type="button" size="sm" variant="outline" onClick={addStep} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> إضافة خطوة
        </Button>
      </div>

      {!processing.schemaAvailable && processing.message && (
        <div className="rounded border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100">
          {processing.message}
        </div>
      )}

      {processing.schemaAvailable && processing.message && (
        <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
          {processing.message}
        </div>
      )}

      {assessFeeWarnings.length > 0 && (
        <div className="rounded border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            خطوة assess_fee ({assessFeeWarnings.join("، ")}) تحتاج انتقالين في المحرر:
            fee_not_required و payment_required.
          </span>
        </div>
      )}

      {steps.length === 0 ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد خطوات بعد. أضف خطوة لبدء تصميم دورة الحياة.
        </div>
      ) : (
        <div className="space-y-3">
          {steps
            .slice()
            .sort((a, b) => a.step_order - b.step_order)
            .map((step) => (
              <div key={step.localId} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    الخطوة {step.step_order}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStep(step.localId)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-destructive/10 text-destructive"
                    title="حذف الخطوة"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">مفتاح الخطوة</Label>
                    <Input
                      dir="ltr"
                      className="font-mono text-xs"
                      value={step.step_key}
                      onChange={(e) =>
                        updateStep(step.localId, { step_key: e.target.value })
                      }
                      placeholder="review_by_registrar"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ترتيب الخطوة</Label>
                    <Input
                      type="number"
                      min={1}
                      value={step.step_order}
                      onChange={(e) =>
                        updateStep(step.localId, {
                          step_order: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">اسم الخطوة بالعربية</Label>
                    <Input
                      value={step.step_name_ar}
                      onChange={(e) =>
                        updateStep(step.localId, { step_name_ar: e.target.value })
                      }
                      placeholder="مراجعة شؤون الطلاب"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">الجهة المسؤولة</Label>
                    <Select
                      value={step.processing_unit_id ?? "__none__"}
                      onValueChange={(v) =>
                        updateStep(step.localId, {
                          processing_unit_id: v === "__none__" ? null : v,
                          processing_role_id: null,
                        })
                      }
                      disabled={!processing.schemaAvailable || processing.units.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الجهة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— غير محدد —</SelectItem>
                        {processing.units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name_ar}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">المسمى المسؤول</Label>
                    <Select
                      value={step.processing_role_id ?? "__none__"}
                      onValueChange={(v) =>
                        updateStep(step.localId, {
                          processing_role_id: v === "__none__" ? null : v,
                        })
                      }
                      disabled={
                        !processing.schemaAvailable ||
                        rolesForUnit(step.processing_unit_id).length === 0
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المسمى" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— غير محدد —</SelectItem>
                        {rolesForUnit(step.processing_unit_id).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name_ar}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">نوع الإجراء</Label>
                    <Select
                      value={step.action_type}
                      onValueChange={(v) =>
                        updateStep(step.localId, {
                          action_type: v as WorkflowActionType,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {(
                    [
                      ["visible_to_student", "تظهر للطالب"],
                      ["notify_on_enter", "إشعار عند الدخول"],
                      ["can_return_to_student", "يمكن الإرجاع"],
                      ["can_reject", "يمكن الرفض"],
                      ["can_skip", "يمكن التخطي"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1.5">
                      <Label className="text-[11px]">{label}</Label>
                      <Switch
                        checked={step[key]}
                        onCheckedChange={(v) => updateStep(step.localId, { [key]: v })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
