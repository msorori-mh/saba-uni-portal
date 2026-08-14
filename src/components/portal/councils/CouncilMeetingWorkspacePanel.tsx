import { ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CouncilMeetingV2Item } from "@/lib/faculty-councils.functions";
import { CouncilSessionAndGovernanceWorkspace } from "@/components/councils/CouncilSessionAndGovernanceWorkspace";
import { MeetingAgendaExpandable } from "./MeetingAgendaExpandable";
import { SectionShell, formatDateTime, meetingStatusLabel, roleLabel } from "./shared";

export function CouncilMeetingWorkspacePanel({
  meeting,
  userRole,
  userId,
  canManageAgenda,
  onManageAgenda,
  onClose,
  onStateChanged,
}: {
  meeting: CouncilMeetingV2Item;
  userRole: string;
  userId: string | null;
  canManageAgenda: boolean;
  onManageAgenda: (meetingId: string) => void;
  onClose: () => void;
  onStateChanged: () => void;
}) {
  const title =
    meeting.meeting_title?.trim() || `اجتماع رقم ${meeting.meeting_number}`;

  return (
    <SectionShell
      icon={ShieldCheck}
      title={`مساحة الاجتماع — ${title}`}
      testId="councils-meeting-workspace"
      actions={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-8 text-xs gap-1"
          data-testid="councils-meeting-workspace-close"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          إغلاق
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {meetingStatusLabel(meeting.status)}
          </Badge>
          <span>{formatDateTime(meeting.scheduled_at)}</span>
          {meeting.location ? <span>المكان: {meeting.location}</span> : null}
          <span>دورك: {roleLabel(userRole)}</span>
        </div>

        <Tabs defaultValue="agenda" dir="rtl" data-testid="councils-meeting-workspace-tabs">
          <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1">
            <TabsTrigger value="agenda" className="min-h-9 text-xs sm:text-sm">
              جدول الأعمال
            </TabsTrigger>
            <TabsTrigger value="session" className="min-h-9 text-xs sm:text-sm">
              الجلسة الحية والحوكمة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="mt-3 space-y-2">
            <MeetingAgendaExpandable meetingId={meeting.meeting_id} autoExpand />
            {canManageAgenda ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 text-xs"
                onClick={() => onManageAgenda(meeting.meeting_id)}
              >
                إدارة جدول الأعمال
              </Button>
            ) : null}
          </TabsContent>

          <TabsContent value="session" className="mt-3">
            <CouncilSessionAndGovernanceWorkspace
              meetingId={meeting.meeting_id}
              councilId={meeting.council_id}
              meetingStatus={meeting.status}
              userRole={userRole}
              userId={userId ?? undefined}
              onStateChanged={onStateChanged}
            />
          </TabsContent>
        </Tabs>
      </div>
    </SectionShell>
  );
}
