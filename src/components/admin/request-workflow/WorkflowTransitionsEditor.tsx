import { Plus, Trash2 } from "lucide-react";
import type { DraftWorkflowStep, DraftWorkflowTransition } from "@/lib/admin-request-workflow-rpc";
import { ACTION_RESULT_LABEL } from "@/components/admin/request-workflow/constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTION_RESULTS = Object.keys(ACTION_RESULT_LABEL);

type Props = {
  steps: DraftWorkflowStep[];
  transitions: DraftWorkflowTransition[];
  onChange: (transitions: DraftWorkflowTransition[]) => void;
};

function newTransition(): DraftWorkflowTransition {
  return {
    localId: crypto.randomUUID(),
    from_step_key: null,
    to_step_key: null,
    action_result: "approve",
    is_default: false,
  };
}

export function WorkflowTransitionsEditor({ steps, transitions, onChange }: Props) {
  const stepKeys = steps.map((s) => s.step_key).filter(Boolean);

  const update = (localId: string, patch: Partial<DraftWorkflowTransition>) => {
    onChange(transitions.map((t) => (t.localId === localId ? { ...t, ...patch } : t)));
  };

  const remove = (localId: string) => {
    onChange(transitions.filter((t) => t.localId !== localId));
  };

  const add = () => onChange([...transitions, newTransition()]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-sm text-primary">الانتقالات</h2>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> إضافة انتقال
        </Button>
      </div>

      {transitions.length === 0 ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد انتقالات معرّفة. أضف انتقالات لربط نتائج الإجراءات بالخطوات التالية.
        </div>
      ) : (
        <div className="space-y-2">
          {transitions.map((t) => (
            <div
              key={t.localId}
              className="rounded-lg border bg-card p-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] items-end"
            >
              <div>
                <Label className="text-xs">من خطوة</Label>
                <Select
                  value={t.from_step_key ?? "__start__"}
                  onValueChange={(v) =>
                    update(t.localId, {
                      from_step_key: v === "__start__" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__start__">بداية الدورة (إرسال)</SelectItem>
                    {stepKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">نتيجة الإجراء</Label>
                <Select
                  value={t.action_result}
                  onValueChange={(v) => update(t.localId, { action_result: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_RESULTS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {ACTION_RESULT_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">إلى خطوة</Label>
                <Select
                  value={t.to_step_key ?? "__end__"}
                  onValueChange={(v) =>
                    update(t.localId, {
                      to_step_key: v === "__end__" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__end__">نهاية / حالة نهائية</SelectItem>
                    {stepKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  checked={t.is_default}
                  onCheckedChange={(v) => update(t.localId, { is_default: v })}
                />
                <Label className="text-[11px] whitespace-nowrap">افتراضي</Label>
              </div>
              <button
                type="button"
                onClick={() => remove(t.localId)}
                className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-destructive/10 text-destructive mb-0.5"
                title="حذف الانتقال"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
