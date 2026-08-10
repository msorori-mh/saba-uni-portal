import { CalendarClock, ListChecks, FileWarning, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CouncilsActionItem } from "@/lib/faculty-portal/councils-operational";
import { CompactEmpty } from "./shared";

export function CouncilsActionRequired({
  items,
  onSchedule,
  onOpenAgenda,
  onOpenTopics,
}: {
  items: CouncilsActionItem[];
  onSchedule?: () => void;
  onOpenAgenda?: (meetingId: string) => void;
  onOpenTopics?: () => void;
}) {
  return (
    <section data-testid="councils-action-required" className="space-y-2">
      <h2 className="font-display text-sm font-bold text-primary">يحتاج إجراء منك</h2>
      {items.length === 0 ? (
        <CompactEmpty text="لا توجد إجراءات حالية" testId="councils-action-required-empty" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`councils-action-${item.kind}`}
              className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5 flex items-start gap-2 min-w-0"
            >
              <ActionIcon kind={item.kind} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-primary">{item.title}</div>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
                <div className="mt-2">
                  {item.kind === "schedule_needed" && onSchedule ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={onSchedule}
                    >
                      جدولة اجتماع
                      <ArrowLeft className="h-3 w-3" aria-hidden />
                    </Button>
                  ) : null}
                  {item.kind === "agenda_incomplete" && item.meetingId && onOpenAgenda ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs gap-1"
                      onClick={() => onOpenAgenda(item.meetingId!)}
                    >
                      جدول الأعمال
                      <ArrowLeft className="h-3 w-3" aria-hidden />
                    </Button>
                  ) : null}
                  {item.kind === "topic_needs_completion" && onOpenTopics ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs gap-1"
                      onClick={onOpenTopics}
                    >
                      عرض الموضوعات
                      <ArrowLeft className="h-3 w-3" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionIcon({ kind }: { kind: CouncilsActionItem["kind"] }) {
  const className = "h-4 w-4 text-primary shrink-0 mt-0.5";
  if (kind === "schedule_needed") return <CalendarClock className={className} aria-hidden />;
  if (kind === "agenda_incomplete") return <ListChecks className={className} aria-hidden />;
  return <FileWarning className={className} aria-hidden />;
}
