import type {
  EmploymentReportRow,
  EmploymentStatus,
  SpecializationRelationship,
} from "./foundation";

/**
 * Employment status tracking for graduates. Events are append-only and
 * correct by supersession, mirroring `graduate_employment_events` in the SQL
 * draft (no in-place rewrite of history).
 */

export const EMPLOYMENT_VERIFICATION_STATES = [
  "graduate_reported",
  "verified",
  "rejected",
] as const;

export type EmploymentVerificationState = (typeof EMPLOYMENT_VERIFICATION_STATES)[number];

export interface GraduateEmploymentEvent {
  eventId: string;
  graduateRecordId: string;
  status: EmploymentStatus;
  specializationRelationship: SpecializationRelationship;
  verificationState: EmploymentVerificationState;
  startedOn: string | null;
  endedOn: string | null;
  recordedAt: string;
  supersedesEventId: string | null;
}

export type EmploymentEventValidation = { ok: true } | { ok: false; reason: string };

const EMPLOYMENT_STATUSES: readonly string[] = [
  "employed",
  "self_employed",
  "seeking_work",
  "continuing_education",
  "not_seeking",
  "not_disclosed",
];

const SPECIALIZATION_RELATIONSHIPS: readonly string[] = [
  "directly_related",
  "partially_related",
  "not_related",
  "not_assessed",
];

/** Validates a draft event before it is appended (mirrors SQL CHECKs). */
export function validateEmploymentEventDraft(
  event: GraduateEmploymentEvent,
): EmploymentEventValidation {
  if (!event.graduateRecordId.trim() || !event.eventId.trim()) {
    return { ok: false, reason: "missing_event_identity" };
  }
  if (!EMPLOYMENT_STATUSES.includes(event.status)) {
    return { ok: false, reason: "unknown_employment_status" };
  }
  if (!SPECIALIZATION_RELATIONSHIPS.includes(event.specializationRelationship)) {
    return { ok: false, reason: "unknown_specialization_relationship" };
  }
  if (!EMPLOYMENT_VERIFICATION_STATES.includes(event.verificationState)) {
    return { ok: false, reason: "unknown_verification_state" };
  }
  if (!Number.isFinite(Date.parse(event.recordedAt))) {
    return { ok: false, reason: "invalid_recorded_at" };
  }
  if (event.startedOn !== null && !Number.isFinite(Date.parse(event.startedOn))) {
    return { ok: false, reason: "invalid_started_on" };
  }
  if (event.endedOn !== null && !Number.isFinite(Date.parse(event.endedOn))) {
    return { ok: false, reason: "invalid_ended_on" };
  }
  if (
    event.startedOn !== null &&
    event.endedOn !== null &&
    Date.parse(event.endedOn) < Date.parse(event.startedOn)
  ) {
    return { ok: false, reason: "ended_before_started" };
  }
  return { ok: true };
}

function supersededIds(events: readonly GraduateEmploymentEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.supersedesEventId !== null) {
      ids.add(event.supersedesEventId);
    }
  }
  return ids;
}

/**
 * Returns the current (non-superseded) events per graduate, latest record
 * first within each graduate. Superseded rows stay in history but never
 * describe the present.
 */
export function currentEmploymentEvents(
  events: readonly GraduateEmploymentEvent[],
): GraduateEmploymentEvent[] {
  const superseded = supersededIds(events);
  return events
    .filter((event) => !superseded.has(event.eventId))
    .toSorted((left, right) => {
      const byTime = Date.parse(right.recordedAt) - Date.parse(left.recordedAt);
      return byTime !== 0 ? byTime : right.eventId.localeCompare(left.eventId);
    });
}

/** Resolves the latest current status for one graduate, or null. */
export function resolveCurrentEmploymentStatus(
  graduateRecordId: string,
  events: readonly GraduateEmploymentEvent[],
): GraduateEmploymentEvent | null {
  return (
    currentEmploymentEvents(events.filter((event) => event.graduateRecordId === graduateRecordId))
      .at(0) ?? null
  );
}

export type EmploymentTimelineValidation =
  | { ok: true; ordered: GraduateEmploymentEvent[] }
  | { ok: false; reason: string };

/**
 * Validates the supersession chain of one graduate's history: every
 * supersedes reference must point at an existing event of the same graduate,
 * each event can be superseded at most once, and a correction must be recorded
 * after the event it replaces.
 */
export function buildEmploymentTimeline(
  graduateRecordId: string,
  events: readonly GraduateEmploymentEvent[],
): EmploymentTimelineValidation {
  const owned = events.filter((event) => event.graduateRecordId === graduateRecordId);
  const byId = new Map(owned.map((event) => [event.eventId, event]));
  const superseded = new Set<string>();
  for (const event of owned) {
    if (event.supersedesEventId === null) {
      continue;
    }
    const target = byId.get(event.supersedesEventId);
    if (!target) {
      return { ok: false, reason: "supersedes_unknown_event" };
    }
    if (superseded.has(event.supersedesEventId)) {
      return { ok: false, reason: "event_superseded_more_than_once" };
    }
    if (Date.parse(event.recordedAt) < Date.parse(target.recordedAt)) {
      return { ok: false, reason: "supersession_recorded_before_original" };
    }
    superseded.add(event.supersedesEventId);
  }
  const ordered = owned.toSorted((left, right) => {
    const byTime = Date.parse(left.recordedAt) - Date.parse(right.recordedAt);
    return byTime !== 0 ? byTime : left.eventId.localeCompare(right.eventId);
  });
  return { ok: true, ordered };
}

/**
 * Projects current events into aggregate-report input rows. Verified means
 * staff-verified; graduate-reported and rejected events stay unverified so
 * quality metrics never overstate evidence.
 */
export function toEmploymentReportRows(
  events: readonly GraduateEmploymentEvent[],
): EmploymentReportRow[] {
  return currentEmploymentEvents(events).map((event) => ({
    status: event.status,
    specializationRelationship: event.specializationRelationship,
    verified: event.verificationState === "verified",
  }));
}
