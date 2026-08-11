import { Archive, CalendarDays, MapPin } from "lucide-react";
import type { CouncilMeetingV2Item } from "@/lib/faculty-councils.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "long",
      timeStyle: "short",
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
  meetings: CouncilMeetingV2Item[];
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
