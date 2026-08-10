import { useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getB1DetailsReadinessFn } from "@/lib/student-requests/b1-details-readiness.functions";
import type { B1StaffAction } from "@/lib/student-requests/b1-ui/adapter.types";
import { B1EmployeeActionPanel } from "./B1EmployeeActionPanel";

type Props = {
  stepId: string;
  /** Rendered when the details row exists (normal forward action panel). */
  children?: ReactNode;
  stepLabelAr: string;
  acting?: boolean;
  onAct: (action: B1StaffAction, comment?: string) => Promise<void> | void;
};

const SUGGESTED: { action: Extract<B1StaffAction, "return" | "reject">; labelAr: string }[] = [
  { action: "return", labelAr: "إرجاع للاستكمال" },
  { action: "reject", labelAr: "رفض الطلب" },
];

/**
 * Pre-action (STEP4 and every forward step) readiness banner.
 *
 * Summarizes the missing service details table in the UI and offers the
 * suggested exit actions, instead of letting the staff member click the
 * forward action and only then read the backend rejection.
 */
export function B1DetailsPreflightNotice({ stepId, stepLabelAr, acting, onAct, children }: Props) {
  const probe = useServerFn(getB1DetailsReadinessFn);
  const [chosen, setChosen] = useState<"return" | "reject" | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["b1-details-readiness", stepId],
    queryFn: () => probe({ data: { stepId } }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div
        dir="rtl"
        data-testid="b1-details-preflight-loading"
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        جارٍ التحقق من اكتمال بيانات الخدمة قبل إتاحة الإجراء…
      </div>
    );
  }

  // Probe failure must not hide the action: fall back to the backend guard.
  if (isError || !data || data.ready) return <>{children}</>;

  return (
    <section
      dir="rtl"
      data-testid="b1-details-preflight-blocked"
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-1">
          <h3 className="font-display text-sm font-extrabold text-amber-900">
            بيانات الخدمة ناقصة — لا يمكن تنفيذ «{stepLabelAr}»
          </h3>
          <p className="text-xs leading-relaxed text-amber-900">
            لا يوجد سجل تفاصيل لخدمة «{data.serviceLabelAr}»
            {data.requestNumber ? ` في الطلب ${data.requestNumber}` : ""}. الجدول الناقص:{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">{data.table}</code>.
            تُنشأ هذه البيانات عند إرسال الطلب من الطالب، ووجودها شرط لتطبيق القرار — تكرار المحاولة
            سيفشل.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-amber-900">الخطوة المقترحة:</div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((item) => (
            <button
              key={item.action}
              type="button"
              data-testid={`b1-details-preflight-suggest-${item.action}`}
              onClick={() => setChosen(chosen === item.action ? null : item.action)}
              className={`inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-bold ${
                chosen === item.action
                  ? "bg-primary text-primary-foreground"
                  : "border border-amber-300 bg-background text-amber-900 hover:bg-amber-100"
              }`}
            >
              {item.labelAr}
            </button>
          ))}
        </div>
      </div>

      {chosen && (
        <B1EmployeeActionPanel
          allowedAction={chosen}
          stepLabelAr={stepLabelAr}
          acting={acting}
          onAct={onAct}
        />
      )}
    </section>
  );
}
