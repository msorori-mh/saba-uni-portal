import { Clock } from "lucide-react";
import type { StudentRequestTimelineEvent } from "@/lib/student-request-timeline";

function formatWhen(at: string) {
  return new Date(at).toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function kindColor(kind: StudentRequestTimelineEvent["kind"]) {
  switch (kind) {
    case "approved":
    case "effect_applied":
      return "bg-emerald-500 border-emerald-200";
    case "rejected":
      return "bg-rose-500 border-rose-200";
    case "returned":
      return "bg-orange-500 border-orange-200";
    case "cancelled":
      return "bg-zinc-400 border-zinc-200";
    case "under_review":
      return "bg-amber-500 border-amber-200";
    default:
      return "bg-primary border-primary/30";
  }
}

export function RequestTimelinePanel({
  events,
  loading = false,
  emptyMessage = "لا توجد أحداث مسجّلة بعد.",
  variant = "full",
}: {
  events: StudentRequestTimelineEvent[];
  loading?: boolean;
  emptyMessage?: string;
  variant?: "full" | "compact";
}) {
  if (loading) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center">
        جاري تحميل سجل الرحلة...
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded-lg">
        {emptyMessage}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="mt-2 rounded-lg border bg-muted/20 p-2">
        <div className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-1">
          <Clock className="h-3 w-3" /> مراحل الطلب
        </div>
        <div className="flex flex-wrap gap-1">
          {events.map((event) => (
            <span
              key={event.id}
              title={event.description ?? formatWhen(event.at)}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background border"
            >
              {event.title}
            </span>
          ))}
        </div>
        {events.length > 0 && (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            آخر تحديث: {formatWhen(events[events.length - 1].at)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/15 p-3">
      <div className="text-xs font-bold text-primary mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-gold" /> سجل رحلة الطلب
      </div>
      <ol className="relative border-r-2 border-border mr-2 space-y-4 pr-4">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span
              className={`absolute -right-[1.34rem] top-1 h-3 w-3 rounded-full border-2 border-background ${kindColor(event.kind)}`}
            />
            <div className="text-sm font-semibold text-foreground">{event.title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{formatWhen(event.at)}</div>
            {event.actorLabel && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                بواسطة: {event.actorLabel}
              </div>
            )}
            {event.description && (
              <div className="mt-1.5 text-xs text-foreground/90 bg-background/80 border rounded p-2">
                {event.description}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
