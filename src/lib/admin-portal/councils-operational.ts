/**
 * Pure helpers for the admin academic councils operational workspace.
 * Derives action-required items ONLY from already-loaded page data.
 * No invented counts. No backend calls. No admin academic bypass.
 */

export const AGENDA_INCOMPLETE_STATUSES = new Set([
  "scheduled",
  "intake_open",
  "intake_closed",
]);

export type AdminActionKind =
  | "upcoming_meeting"
  | "topics_pending"
  | "agenda_incomplete"
  | "minutes_review"
  | "overdue_decision";

export type AdminActionItem = {
  id: string;
  kind: AdminActionKind;
  title: string;
  description: string;
  meetingId?: string;
  tab?:
    | "overview"
    | "members"
    | "meetings"
    | "topics"
    | "agenda"
    | "minutes-decisions"
    | "follow-up"
    | "archive"
    | "reports";
};

type MeetingLike = {
  meeting_id: string;
  title: string;
  status: string;
  scheduled_at: string;
};

type TopicLike = {
  topic_id: string;
  title: string;
  status: string;
};

/**
 * Cap at 5 priority items. Order: overdue → minutes_review → topics → agenda → upcoming.
 */
export function deriveAdminActionRequiredItems(input: {
  selectedCouncilName: string;
  overdueDecisions: number;
  upcomingMeeting: MeetingLike | null;
  meetings: MeetingLike[];
  topics: TopicLike[];
}): AdminActionItem[] {
  const items: AdminActionItem[] = [];
  const { selectedCouncilName, overdueDecisions, upcomingMeeting, meetings, topics } =
    input;

  if (overdueDecisions > 0) {
    items.push({
      id: "overdue-decisions",
      kind: "overdue_decision",
      title: "قرارات متأخرة",
      description: `${overdueDecisions} قرار متأخر يحتاج متابعة في نطاق المجالس.`,
      tab: "follow-up",
    });
  }

  const minutesReview = meetings.filter((m) => m.status === "minutes_review");
  for (const m of minutesReview.slice(0, 2)) {
    items.push({
      id: `minutes-review-${m.meeting_id}`,
      kind: "minutes_review",
      title: "محضر بانتظار الاعتماد",
      description: `${m.title} — ${selectedCouncilName}`,
      meetingId: m.meeting_id,
      tab: "minutes-decisions",
    });
  }

  const pendingTopics = topics.filter(
    (t) => t.status === "submitted" || t.status === "under_review",
  );
  if (pendingTopics.length > 0) {
    items.push({
      id: "topics-pending",
      kind: "topics_pending",
      title: "موضوعات تحتاج متابعة",
      description:
        pendingTopics.length === 1
          ? pendingTopics[0]!.title
          : `${pendingTopics.length} موضوعات مقدّمة أو قيد المراجعة`,
      tab: "topics",
    });
  }

  const agendaIncomplete = meetings.filter((m) =>
    AGENDA_INCOMPLETE_STATUSES.has(m.status),
  );
  for (const m of agendaIncomplete.slice(0, 1)) {
    items.push({
      id: `agenda-${m.meeting_id}`,
      kind: "agenda_incomplete",
      title: "جدول أعمال غير مكتمل",
      description: m.title,
      meetingId: m.meeting_id,
      tab: "agenda",
    });
  }

  if (upcomingMeeting && items.length < 5) {
    const already =
      items.some((i) => i.meetingId === upcomingMeeting.meeting_id) ||
      agendaIncomplete.some((m) => m.meeting_id === upcomingMeeting.meeting_id);
    if (!already) {
      items.push({
        id: `upcoming-${upcomingMeeting.meeting_id}`,
        kind: "upcoming_meeting",
        title: "اجتماع قادم",
        description: upcomingMeeting.title,
        meetingId: upcomingMeeting.meeting_id,
        tab: "meetings",
      });
    }
  }

  return items.slice(0, 5);
}

export function countMinutesReview(meetings: Array<{ status: string }>): number {
  return meetings.filter((m) => m.status === "minutes_review").length;
}
