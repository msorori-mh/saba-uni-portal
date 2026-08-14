import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CouncilMeetingV2Item } from "@/lib/faculty-councils.functions";
import { CouncilMeetingCard } from "./CouncilMeetingCard";
import {
  CompactEmpty,
  ErrorBlock,
  LoadingBlock,
  MEETINGS_LOAD_FAILED_UI,
  SectionShell,
  formatDateTime,
  meetingStatusLabel,
  roleLabel,
} from "./shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CouncilMeetingsWorkspace({
  upcomingMeetings,
  previousMeetings,
  isLoading,
  isError,
  chairCouncilIds,
  agendaWriteCouncilIds,
  secretaryCouncilIds,
  onManageAgenda,
  onUpdated,
  focusMeetingId = null,
  agendaExpandMeetingId = null,
}: {
  upcomingMeetings: CouncilMeetingV2Item[];
  previousMeetings: CouncilMeetingV2Item[];
  isLoading: boolean;
  isError: boolean;
  chairCouncilIds: Set<string>;
  agendaWriteCouncilIds: Set<string>;
  secretaryCouncilIds: Set<string>;
  onManageAgenda: (meetingId: string) => void;
  onUpdated: () => void;
  /** Meeting the user explicitly asked to open (scroll + highlight). */
  focusMeetingId?: string | null;
  /** Meeting whose agenda should open inline right away. */
  agendaExpandMeetingId?: string | null;
}) {
  const [tab, setTab] = useState("upcoming");

  useEffect(() => {
    const target = focusMeetingId ?? agendaExpandMeetingId;
    if (!target) return;
    const inPrevious = previousMeetings.some((m) => m.meeting_id === target);
    setTab(inPrevious ? "previous" : "upcoming");
  }, [focusMeetingId, agendaExpandMeetingId, previousMeetings]);

  const renderCard = (m: CouncilMeetingV2Item, variant: "upcoming" | "previous") => (
    <CouncilMeetingCard
      key={m.meeting_id}
      meeting={m}
      variant={variant}
      canEdit={chairCouncilIds.has(m.council_id)}
      canManageAgenda={agendaWriteCouncilIds.has(m.council_id)}
      canRecordAttendance={secretaryCouncilIds.has(m.council_id)}
      onManageAgenda={onManageAgenda}
      onUpdated={onUpdated}
      focused={focusMeetingId === m.meeting_id || agendaExpandMeetingId === m.meeting_id}
      autoExpandAgenda={agendaExpandMeetingId === m.meeting_id}
    />
  );

  return (
    <div data-testid="councils-meetings-workspace" className="space-y-3">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full sm:w-auto h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="upcoming" className="min-h-9 text-xs sm:text-sm">
            القادمة ({upcomingMeetings.length})
          </TabsTrigger>
          <TabsTrigger value="previous" className="min-h-9 text-xs sm:text-sm">
            السابقة ({previousMeetings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-3">
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorBlock message={MEETINGS_LOAD_FAILED_UI} />
          ) : upcomingMeetings.length === 0 ? (
            <CompactEmpty
              text="لا توجد اجتماعات قادمة."
              testId="councils-meetings-upcoming-empty"
            />
          ) : (
            <ul className="space-y-3">
              {upcomingMeetings.map((m) => renderCard(m, "upcoming"))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="previous" className="mt-3">
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorBlock message={MEETINGS_LOAD_FAILED_UI} />
          ) : previousMeetings.length === 0 ? (
            <CompactEmpty
              text="لا توجد اجتماعات سابقة."
              testId="councils-meetings-previous-empty"
            />
          ) : (
            <ul className="space-y-3">
              {previousMeetings.map((m) => renderCard(m, "previous"))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function NextMeetingPriorityCard({
  meeting,
  canManageAgenda,
  onManageAgenda,
  onOpenMeeting,
  onViewAgenda,
  intakeNotice = null,
}: {
  meeting: CouncilMeetingV2Item;
  canManageAgenda: boolean;
  onManageAgenda: (meetingId: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  onViewAgenda: (meetingId: string) => void;
  /** Explains why topic submission is closed for this meeting, when applicable. */
  intakeNotice?: string | null;
}) {
  const displayTitle = meeting.meeting_title?.trim() || meeting.council_name;
  return (
    <SectionShell
      icon={CalendarClock}
      title="الاجتماع القادم"
      testId="councils-next-meeting-priority"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-xs">
          <p className="text-sm font-bold text-primary">{displayTitle}</p>
          <p className="text-muted-foreground">{meeting.council_name}</p>
          <p>
            <span className="text-muted-foreground">رقم الاجتماع: </span>
            <span className="font-medium">{meeting.meeting_number}</span>
          </p>
          <p>
            <span className="text-muted-foreground">التاريخ والوقت: </span>
            <span className="font-medium">{formatDateTime(meeting.scheduled_at)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">المكان: </span>
            <span className="font-medium">{meeting.location ?? "—"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">الحالة: </span>
            <span className="font-medium">{meetingStatusLabel(meeting.status)}</span>
          </p>
          {meeting.intake_closes_at ? (
            <p>
              <span className="text-muted-foreground">إغلاق استقبال الموضوعات: </span>
              <span className="font-medium">{formatDateTime(meeting.intake_closes_at)}</span>
            </p>
          ) : null}
          {meeting.user_membership_role ? (
            <p>
              <span className="text-muted-foreground">دورك: </span>
              <span className="font-medium">{roleLabel(meeting.user_membership_role)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            className="min-h-9 text-xs"
            data-testid="councils-next-meeting-open"
            onClick={() => onOpenMeeting(meeting.meeting_id)}
          >
            فتح الاجتماع
          </Button>
          {canManageAgenda ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 text-xs gap-1"
              onClick={() => onManageAgenda(meeting.meeting_id)}
            >
              جدول الأعمال
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 text-xs"
              data-testid="councils-next-meeting-view-agenda"
              onClick={() => onViewAgenda(meeting.meeting_id)}
            >
              عرض جدول الأعمال
            </Button>
          )}
        </div>
      </div>
      {intakeNotice ? (
        <p
          data-testid="councils-next-meeting-intake-notice"
          className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-900"
        >
          {intakeNotice}
        </p>
      ) : null}
    </SectionShell>
  );
}
