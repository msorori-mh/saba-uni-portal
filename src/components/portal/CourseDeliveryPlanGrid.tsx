import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSectionDeliveryPlan,
  LECTURE_STATUS_LABELS,
  type DeliveryPlanSession,
  type LectureSessionStatus,
} from "@/lib/lecture-execution.functions";

const STATUS_STYLES: Record<LectureSessionStatus, string> = {
  not_recorded: "border-border bg-muted/40 text-muted-foreground",
  executed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700",
  compensated: "border-sky-500/50 bg-sky-500/10 text-sky-700",
  postponed: "border-amber-500/50 bg-amber-500/10 text-amber-700",
  hindered: "border-destructive/50 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/40 bg-destructive/5 text-destructive",
};

/**
 * Read-only numbered delivery plan for one course section.
 * Students see the planned title, status and dates only — never the internal
 * reason/notes fields, which the RPC redacts for non-managers.
 */
export function CourseDeliveryPlanGrid({ sectionId }: { sectionId: string }) {
  const [selected, setSelected] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery-plan", sectionId],
    queryFn: () => getSectionDeliveryPlan({ data: { sectionId } }),
    staleTime: 60_000,
  });

  const sessions = useMemo<DeliveryPlanSession[]>(() => data?.sessions ?? [], [data]);
  const current = sessions.find((s) => s.session_number === selected) ?? null;
  const executed = sessions.filter(
    (s) => s.status === "executed" || s.status === "compensated",
  ).length;

  if (isLoading) {
    return (
      <div className="grid place-items-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-destructive">
        تعذر تحميل خطة المحاضرات.
      </div>
    );
  }
  if (!data?.plan || data.plan.status !== "published" || sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        لم تُعتمد خطة محاضرات لهذا المقرر بعد.
      </div>
    );
  }

  return (
    <section className="rounded-xl border-2 border-gold/30 bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-extrabold text-primary flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-gold" aria-hidden /> خطة المحاضرات
        </h2>
        <span className="text-xs text-muted-foreground">
          المنفذ {executed} من {data.plan.planned_session_count}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {sessions.map((s) => (
          <button
            key={s.plan_session_id}
            type="button"
            onClick={() => setSelected(s.session_number === selected ? null : s.session_number)}
            aria-label={`المحاضرة ${s.session_number} — ${LECTURE_STATUS_LABELS[s.status]}`}
            className={cn(
              "h-10 w-10 rounded-lg border-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              STATUS_STYLES[s.status],
              selected === s.session_number && "ring-2 ring-gold",
            )}
          >
            {s.session_number}
          </button>
        ))}
      </div>

      {current && (
        <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="font-bold text-primary">المحاضرة {current.session_number}</div>
          <dl className="mt-2 grid gap-1">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">العنوان المخطط:</dt>
              <dd className="font-medium">{current.planned_title}</dd>
            </div>
            {current.planned_topics && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">المواضيع:</dt>
                <dd>{current.planned_topics}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-muted-foreground">الحالة:</dt>
              <dd className="font-medium">{LECTURE_STATUS_LABELS[current.status]}</dd>
            </div>
            {current.execution_date && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">تاريخ التنفيذ:</dt>
                <dd>{current.execution_date}</dd>
              </div>
            )}
            {current.compensation_date && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">تاريخ التعويض:</dt>
                <dd>{current.compensation_date}</dd>
              </div>
            )}
            {data.course?.faculty_name && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">عضو هيئة التدريس:</dt>
                <dd>{data.course.faculty_name}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
