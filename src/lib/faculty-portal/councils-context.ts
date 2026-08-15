/**
 * Pure helpers for the council-scoped faculty workspace (IA redesign 02).
 * Council is the primary context: every workspace surface is filtered by council_id.
 * No backend calls. No invented data.
 */
import type {
  CouncilMeetingV2Item,
  MyCouncilMembershipV2,
  MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";

export type MeetingLifecycleBucket =
  | "in_session"
  | "preparation"
  | "completed"
  | "archived";

const IN_SESSION_STATUSES = new Set(["in_session"]);
const PREPARATION_STATUSES = new Set([
  "scheduled",
  "intake_open",
  "intake_closed",
  "agenda_ready",
]);
const COMPLETED_STATUSES = new Set([
  "minutes_draft",
  "minutes_review",
  "minutes_locked",
  "cancelled",
]);

export const MEETING_LIFECYCLE_LABELS: Record<MeetingLifecycleBucket, string> = {
  in_session: "جارٍ الآن",
  preparation: "قادم / تحت التحضير",
  completed: "مكتمل",
  archived: "مؤرشف",
};

export function classifyMeetingLifecycle(status: string): MeetingLifecycleBucket {
  if (IN_SESSION_STATUSES.has(status)) return "in_session";
  if (PREPARATION_STATUSES.has(status)) return "preparation";
  if (status === "archived") return "archived";
  if (COMPLETED_STATUSES.has(status)) return "completed";
  return "preparation";
}

export function groupMeetingsByLifecycle(
  meetings: CouncilMeetingV2Item[],
): Record<MeetingLifecycleBucket, CouncilMeetingV2Item[]> {
  const grouped: Record<MeetingLifecycleBucket, CouncilMeetingV2Item[]> = {
    in_session: [],
    preparation: [],
    completed: [],
    archived: [],
  };
  for (const meeting of meetings) {
    grouped[classifyMeetingLifecycle(meeting.status)].push(meeting);
  }
  return grouped;
}

export function scopeMeetingsToCouncil(
  meetings: CouncilMeetingV2Item[],
  councilId: string | null,
): CouncilMeetingV2Item[] {
  if (!councilId) return [];
  return meetings.filter((m) => m.council_id === councilId);
}

export function scopeTopicsToCouncil(
  topics: MyCouncilTopicItem[],
  councilId: string | null,
): MyCouncilTopicItem[] {
  if (!councilId) return [];
  return topics.filter((t) => t.council_id === councilId);
}

/** Responsibility weight used only as a tie-break when no meeting is urgent. */
const ROLE_PRIORITY: Record<string, number> = {
  chair: 4,
  vice_chair: 3,
  secretary: 2,
  member: 1,
  viewer: 0,
};

function roleWeight(role: string): number {
  return ROLE_PRIORITY[role] ?? 0;
}

/**
 * Default council = the one with the most operational urgency:
 * live session > nearest upcoming meeting > highest responsibility role.
 */
export function pickDefaultCouncilId(
  memberships: MyCouncilMembershipV2[],
  meetings: CouncilMeetingV2Item[],
): string | null {
  if (memberships.length === 0) return null;
  const owned = new Set(memberships.map((m) => m.council_id));
  const live = meetings.find(
    (m) => owned.has(m.council_id) && classifyMeetingLifecycle(m.status) === "in_session",
  );
  if (live) return live.council_id;
  const upcoming = meetings
    .filter(
      (m) => owned.has(m.council_id) && classifyMeetingLifecycle(m.status) === "preparation",
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  if (upcoming) return upcoming.council_id;
  const byResponsibility = [...memberships].sort(
    (a, b) => roleWeight(b.role) - roleWeight(a.role),
  );
  return byResponsibility[0]!.council_id;
}

/** Operational priority for the council dashboard: live > action > next. */
export type CouncilPriorityKind = "live_session" | "action_required" | "next_meeting" | "idle";

export function deriveCouncilPriority(input: {
  councilMeetings: CouncilMeetingV2Item[];
  hasActionItems: boolean;
}): CouncilPriorityKind {
  const live = input.councilMeetings.some(
    (m) => classifyMeetingLifecycle(m.status) === "in_session",
  );
  if (live) return "live_session";
  if (input.hasActionItems) return "action_required";
  const next = input.councilMeetings.some(
    (m) => classifyMeetingLifecycle(m.status) === "preparation",
  );
  return next ? "next_meeting" : "idle";
}
