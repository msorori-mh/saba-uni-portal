import { GitBranch, Info } from "lucide-react";
import type { StaffRequestWorkflowStep } from "@/lib/student-requests/staff-inbox-ui";

function stepStatusLabel(status: StaffRequestWorkflowStep["status"]): string {
  switch (status) {
    case "completed": return "مكتملة";
    case "current": return "الخطوة الحالية";
    case "upcoming": return "قادمة";
    case "expected": return "متوقعة";
    case "skipped": return "تم تخطيها";
    default: return status;
  }
}

function stepDotClass(status: StaffRequestWorkflowStep["status"]): string {
  switch (status) {
    case "completed": return "bg-emerald-500 border-emerald-200";
    case "current": return "bg-primary border-primary/30 ring-2 ring-primary/20";
    case "expected": return "bg-muted border-border border-dashed";
    case "skipped": return "bg-zinc-300 border-zinc-200";
    default: return "bg-muted-foreground/30 border-border";
  }
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export function StaffRequestWorkflowTimeline({
  steps,
  isPreview,
}: {
  steps: StaffRequestWorkflowStep[];
  isPreview: boolean;
}) {
  if (steps.length === 0) {
    return (
      <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center">
        لا توجد خطوات مسجّلة لهذا الطلب.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/15 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold text-primary flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-gold" />
          {isPreview ? "المسار المتوقع لدورة الحياة" : "مسار المعالجة الفعلي"}
        </div>
        {isPreview && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1">
            <Info className="h-3 w-3" />
            معاينة فقط
          </span>
        )}
      </div>

      <ol className="relative border-r-2 border-border mr-2 space-y-4 pr-4">
        {steps.map((step) => (
          <li key={step.id} className="relative">
            <span
              className={`absolute -right-[1.34rem] top-1 h-3 w-3 rounded-full border-2 border-background ${stepDotClass(step.status)}`}
            />
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="text-sm font-semibold text-foreground">{step.labelAr}</div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background border">
                {stepStatusLabel(step.status)}
              </span>
              {step.isParallel && (
                <span className="text-[10px] text-muted-foreground">(بالتوازي)</span>
              )}
              {step.isCentralSignatory && (
                <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                  جهة مركزية
                </span>
              )}
            </div>
            {step.roleLabelAr && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                الجهة / الدور: {step.roleLabelAr}
              </div>
            )}
            {(step.enteredAt || step.completedAt) && (
              <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                {step.enteredAt && <div>بدء: {formatWhen(step.enteredAt)}</div>}
                {step.completedAt && <div>انتهاء: {formatWhen(step.completedAt)}</div>}
              </div>
            )}
            {step.notes && (
              <div className="mt-1.5 text-xs text-foreground/90 bg-background/80 border rounded p-2 whitespace-pre-wrap">
                {step.notes}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
