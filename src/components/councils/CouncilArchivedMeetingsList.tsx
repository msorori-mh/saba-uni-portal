import { Archive, CalendarDays, MapPin, FileCheck2, Gavel } from "lucide-react";
import type { ArchivedCouncilMeetingItem } from "@/lib/faculty-councils.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(iso: string, withTime = true) {
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "long",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      calendar: "gregory",
      numberingSystem: "latn",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CouncilArchivedMeetingsList({
  meetings,
}: {
  meetings: ArchivedCouncilMeetingItem[];
}) {
  return (
    <div className="space-y-3">
      {meetings.map((m) => (
        <Card key={m.meeting_id} className="border-border/70">
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Archive className="h-3 w-3" aria-hidden />
                مؤرشف
              </Badge>
              <span className="text-sm font-bold text-primary">
                {m.council_name} · الاجتماع رقم {m.meeting_number}
              </span>
            </div>

            <div className="text-sm font-semibold text-foreground">{m.meeting_title}</div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {formatDate(m.scheduled_at)}
              </span>
              {m.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {m.location}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
                اعتماد المحضر:{" "}
                {m.minutes_approved_at ? formatDate(m.minutes_approved_at, false) : "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Gavel className="h-3.5 w-3.5" aria-hidden />
                آخر قرار:{" "}
                {m.last_decision_at ? formatDate(m.last_decision_at, false) : "—"}
                {m.decisions_count > 0 ? ` (${m.decisions_count})` : ""}
              </span>
            </div>

            {m.agenda_summary ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">جدول الأعمال: </span>
                {m.agenda_summary}
              </p>
            ) : null}

            {m.minutes_summary ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">المحضر: </span>
                {m.minutes_summary}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
