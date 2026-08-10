/**
 * Pure helpers for the admin academic councils operational workspace.
 * Derives action-required items ONLY from already-loaded page data.
 * No invented counts. No backend calls. No admin academic bypass.
 * Never ingest portal-wide getCouncilsSummary() decision/agenda aggregates
 * into selected-council action derivation.
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
  | "minutes_review";

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
 * Cap at 5 priority items. Order: minutes_review → topics → agenda → upcoming.
 * Global overdue/open decision KPIs are intentionally excluded — no council-scoped
 * decision source is loaded on this page, and portal-wide totals must not be
 * attributed to the selected council.
 */
export function deriveAdminActionRequiredItems(input: {
  selectedCouncilName: string;
  upcomingMeeting: MeetingLike | null;
  meetings: MeetingLike[];
  topics: TopicLike[];
}): AdminActionItem[] {
  const items: AdminActionItem[] = [];
  const { selectedCouncilName, upcomingMeeting, meetings, topics } = input;

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
