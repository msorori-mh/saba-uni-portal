/**
 * Pure helpers for the faculty academic councils operational dashboard.
 * Derives summary / action-required state ONLY from already-loaded page data.
 * No invented counts. No backend calls.
 */
import type {
  CouncilMeetingV2Item,
  MyCouncilMembershipV2,
  MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";

export const SUBMIT_ELIGIBLE_ROLES = new Set<string>([
  "chair",
  "secretary",
  "member",
  "vice_chair",
]);

/** Meeting statuses that still need agenda completion work (deterministic). */
const AGENDA_INCOMPLETE_STATUSES = new Set([
  "scheduled",
  "intake_open",
  "intake_closed",
]);

export type CouncilsActionKind =
  | "schedule_needed"
  | "agenda_incomplete"
  | "topic_needs_completion"
  | "chair_duties"
  | "secretary_duties";

export type CouncilsActionItem = {
  id: string;
  kind: CouncilsActionKind;
  title: string;
  description: string;
  /** Optional meeting to deep-link into agenda/meeting UI */
  meetingId?: string;
  councilId?: string;
};

export type CouncilsOperationalSummary = {
  currentCouncilsCount: number;
  nextMeetingLabel: string;
  mySubmittedTopicsCount: number;
  /** Truthful label — never a fabricated numeric action count */
  actionRequiredLabel: string;
  hasChairDuties: boolean;
  hasAgendaWriteDuties: boolean;
};

export function isSubmitEligibleRole(role: string): boolean {
  return SUBMIT_ELIGIBLE_ROLES.has(role);
}

export function filterSubmitEligible(
  memberships: MyCouncilMembershipV2[],
): MyCouncilMembershipV2[] {
  return memberships.filter((m) => isSubmitEligibleRole(m.role));
}

export function filterChairMemberships(
  memberships: MyCouncilMembershipV2[],
): MyCouncilMembershipV2[] {
  return memberships.filter((m) => m.role === "chair");
}

export function filterAgendaWriteMemberships(
  memberships: MyCouncilMembershipV2[],
): MyCouncilMembershipV2[] {
  return memberships.filter((m) => m.role === "chair" || m.role === "secretary");
}

export function isViewerOnly(memberships: MyCouncilMembershipV2[]): boolean {
  return memberships.length > 0 && memberships.every((m) => m.role === "viewer");
}

export function meetingNeedsAgendaCompletion(status: string): boolean {
  return AGENDA_INCOMPLETE_STATUSES.has(status);
}

export function formatNextMeetingSummary(
  next: CouncilMeetingV2Item | undefined,
  formatDateTime: (iso: string) => string,
): string {
  if (!next) return "لا يوجد";
  const when = formatDateTime(next.scheduled_at);
  return `${next.council_name} · ${when}`;
}

export function deriveActionRequiredLabel(input: {
  chairMemberships: MyCouncilMembershipV2[];
  agendaWriteMemberships: MyCouncilMembershipV2[];
  upcomingMeetings: CouncilMeetingV2Item[];
  mySubmittedTopics: MyCouncilTopicItem[];
}): string {
  const actions = deriveActionRequiredItems(input);
  if (actions.length === 0) return "لا توجد إجراءات حالية";

  const needsCompletion = actions.filter((a) => a.kind === "topic_needs_completion").length;
  if (needsCompletion > 0 && actions.every((a) => a.kind === "topic_needs_completion")) {
    return needsCompletion === 1
      ? "موضوع واحد يحتاج استكمال"
      : `${needsCompletion} موضوعات تحتاج استكمال`;
  }

  if (input.chairMemberships.length > 0) return "لديك مهام كرئيس مجلس";
  if (input.agendaWriteMemberships.some((m) => m.role === "secretary")) {
    return "لديك مهام كأمين سر";
  }
  if (needsCompletion > 0) {
    return needsCompletion === 1
      ? "موضوع واحد يحتاج استكمال"
      : `${needsCompletion} موضوعات تحتاج استكمال`;
  }
  return "توجد إجراءات مطلوبة";
}

export function deriveActionRequiredItems(input: {
  chairMemberships: MyCouncilMembershipV2[];
  agendaWriteMemberships: MyCouncilMembershipV2[];
  upcomingMeetings: CouncilMeetingV2Item[];
  mySubmittedTopics: MyCouncilTopicItem[];
}): CouncilsActionItem[] {
  const {
    chairMemberships,
    agendaWriteMemberships,
    upcomingMeetings,
    mySubmittedTopics,
  } = input;
  const items: CouncilsActionItem[] = [];

  const chairCouncilIds = new Set(chairMemberships.map((m) => m.council_id));
  const writeCouncilIds = new Set(agendaWriteMemberships.map((m) => m.council_id));

  // Chair with zero upcoming meetings across chaired councils → schedule prompt
  if (chairMemberships.length > 0) {
    const chairUpcoming = upcomingMeetings.filter((m) => chairCouncilIds.has(m.council_id));
    if (chairUpcoming.length === 0) {
      items.push({
        id: "schedule-needed",
        kind: "schedule_needed",
        title: "اجتماع يحتاج جدولة",
        description: "لا توجد اجتماعات قادمة في مجالسك التي ترأسها.",
        councilId: chairMemberships[0]?.council_id,
      });
    }
  }

  // Agenda incomplete for write-authorized upcoming meetings
  for (const meeting of upcomingMeetings) {
    if (!writeCouncilIds.has(meeting.council_id)) continue;
    if (!meetingNeedsAgendaCompletion(meeting.status)) continue;
    const isChair = chairCouncilIds.has(meeting.council_id);
    items.push({
      id: `agenda-${meeting.meeting_id}`,
      kind: "agenda_incomplete",
      title: "اجتماع قادم يحتاج استكمال جدول الأعمال",
      description: `${meeting.council_name} — اجتماع رقم ${meeting.meeting_number}`,
      meetingId: meeting.meeting_id,
      councilId: meeting.council_id,
    });
    // Only surface the earliest incomplete meeting as a card; avoid flooding
    if (isChair || true) {
      // keep collecting but we'll cap below
    }
  }

  // Cap agenda cards to first 2
  const agendaItems = items.filter((i) => i.kind === "agenda_incomplete");
  if (agendaItems.length > 2) {
    const keep = new Set(agendaItems.slice(0, 2).map((i) => i.id));
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]!.kind === "agenda_incomplete" && !keep.has(items[i]!.id)) {
        items.splice(i, 1);
      }
    }
  }

  // Member topics needing completion — truthful count from loaded data
  for (const topic of mySubmittedTopics) {
    if (topic.status !== "needs_completion") continue;
    items.push({
      id: `topic-${topic.topic_id}`,
      kind: "topic_needs_completion",
      title: "موضوع يحتاج استكمال",
      description: topic.title,
      councilId: topic.council_id,
    });
  }

  return items;
}

export function buildOperationalSummary(input: {
  currentMemberships: MyCouncilMembershipV2[];
  chairMemberships: MyCouncilMembershipV2[];
  agendaWriteMemberships: MyCouncilMembershipV2[];
  upcomingMeetings: CouncilMeetingV2Item[];
  mySubmittedTopics: MyCouncilTopicItem[];
  formatDateTime: (iso: string) => string;
}): CouncilsOperationalSummary {
  const next = input.upcomingMeetings[0];
  return {
    currentCouncilsCount: input.currentMemberships.length,
    nextMeetingLabel: formatNextMeetingSummary(next, input.formatDateTime),
    mySubmittedTopicsCount: input.mySubmittedTopics.length,
    actionRequiredLabel: deriveActionRequiredLabel({
      chairMemberships: input.chairMemberships,
      agendaWriteMemberships: input.agendaWriteMemberships,
      upcomingMeetings: input.upcomingMeetings,
      mySubmittedTopics: input.mySubmittedTopics,
    }),
    hasChairDuties: input.chairMemberships.length > 0,
    hasAgendaWriteDuties: input.agendaWriteMemberships.length > 0,
  };
}
