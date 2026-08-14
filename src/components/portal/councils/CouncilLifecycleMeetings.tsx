import { useState } from "react";
import { CalendarClock, ArrowLeft, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CouncilMeetingV2Item } from "@/lib/faculty-councils.functions";
import {
  MEETING_LIFECYCLE_LABELS,
  groupMeetingsByLifecycle,
  type MeetingLifecycleBucket,
} from "@/lib/faculty-portal/councils-context";
import {
  CompactEmpty,
  ErrorBlock,
  LoadingBlock,
  MEETINGS_LOAD_FAILED_UI,
  formatDateTime,
  meetingStatusLabel,
} from "./shared";

const BUCKET_ORDER: MeetingLifecycleBucket[] = [
  "in_session",
  "preparation",
  "completed",
  "archived",
];

const EMPTY_TEXT: Record<MeetingLifecycleBucket, string> = {
  in_session: "لا توجد جلسة منعقدة حالياً في هذا المجلس.",
  preparation: "لا توجد اجتماعات قادمة في هذا المجلس.",
  completed: "لا توجد اجتماعات مكتملة في هذا المجلس.",
  archived: "لا توجد اجتماعات مؤرشفة في هذا المجلس.",
};

export function CouncilLifecycleMeetings({
  meetings,
  isLoading,
  isError,
  activeMeetingId,
  onOpenMeeting,
  canManageAgenda,
  onManageAgenda,
}: {
  meetings: CouncilMeetingV2Item[];
  isLoading: boolean;
  isError: boolean;
  activeMeetingId: string | null;
  onOpenMeeting: (meetingId: string) => void;
  canManageAgenda: boolean;
  onManageAgenda: (meetingId: string) => void;
}) {
  const grouped = groupMeetingsByLifecycle(meetings);
  const firstNonEmpty =
    BUCKET_ORDER.find((b) => grouped[b].length > 0) ?? "preparation";
  const [tab, setTab] = useState<string>(firstNonEmpty);

  return (
    <div data-testid="councils-lifecycle-meetings" className="space-y-3">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1">
          {BUCKET_ORDER.map((bucket) => (
            <TabsTrigger
              key={bucket}
              value={bucket}
              data-testid={`councils-meetings-bucket-${bucket}`}
              className="min-h-9 text-xs sm:text-sm"
            >
              {MEETING_LIFECYCLE_LABELS[bucket]} ({grouped[bucket].length})
            </TabsTrigger>
          ))}
        </TabsList>

        {BUCKET_ORDER.map((bucket) => (
          <TabsContent key={bucket} value={bucket} className="mt-3">
            {isLoading ? (
              <LoadingBlock />
            ) : isError ? (
              <ErrorBlock message={MEETINGS_LOAD_FAILED_UI} />
            ) : grouped[bucket].length === 0 ? (
              <CompactEmpty
                text={EMPTY_TEXT[bucket]}
                testId={`councils-meetings-${bucket}-empty`}
              />
            ) : (
              <ul className="space-y-2">
                {grouped[bucket].map((m) => (
                  <MeetingRow
                    key={m.meeting_id}
                    meeting={m}
                    isActive={activeMeetingId === m.meeting_id}
                    onOpenMeeting={onOpenMeeting}
                    canManageAgenda={canManageAgenda}
                    onManageAgenda={onManageAgenda}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MeetingRow({
  meeting,
  isActive,
  onOpenMeeting,
  canManageAgenda,
  onManageAgenda,
}: {
  meeting: CouncilMeetingV2Item;
  isActive: boolean;
  onOpenMeeting: (meetingId: string) => void;
  canManageAgenda: boolean;
  onManageAgenda: (meetingId: string) => void;
}) {
  const live = meeting.status === "in_session";
  return (
    <li
      data-testid="councils-meeting-row"
      className={`rounded-lg border px-3 py-2.5 flex flex-wrap items-start justify-between gap-2 ${
        isActive ? "border-gold/60 bg-gold/5" : "border-border bg-card"
      }`}
    >
      <div className="min-w-0 space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          {live ? <Radio className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
          <p className="text-sm font-bold text-primary truncate">
            {meeting.meeting_title?.trim() || `اجتماع رقم ${meeting.meeting_number}`}
          </p>
        </div>
        <p className="text-muted-foreground flex items-center gap-1">
          <CalendarClock className="h-3 w-3" aria-hidden />
          {formatDateTime(meeting.scheduled_at)}
        </p>
        <Badge variant={live ? "default" : "secondary"} className="text-[10px]">
          {meetingStatusLabel(meeting.status)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {canManageAgenda ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 text-xs"
            onClick={() => onManageAgenda(meeting.meeting_id)}
          >
            جدول الأعمال
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="min-h-9 text-xs gap-1"
          data-testid="councils-open-meeting-workspace"
          onClick={() => onOpenMeeting(meeting.meeting_id)}
        >
          {isActive ? "مفتوح" : "فتح مساحة الاجتماع"}
          <ArrowLeft className="h-3 w-3" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
