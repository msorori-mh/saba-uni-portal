/**
 * COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
 * Single source of truth for meeting date chronology, shared by the faculty
 * dialog, the admin screen and the server functions.
 *
 * Contract: intake_opens_at < intake_closes_at <= scheduled_at
 * The intake window is either fully set (both ends) or fully empty.
 */

export type MeetingDateInput = {
  scheduledAt?: string | null;
  intakeOpensAt?: string | null;
  intakeClosesAt?: string | null;
};

export const MEETING_DATE_ERRORS = {
  intakeWindowPartial:
    "يجب تحديد تاريخي فتح وإغلاق استقبال الموضوعات معاً أو تركهما فارغين معاً",
  intakeWindowInvalid: "تاريخ فتح الاستقبال يجب أن يسبق تاريخ إغلاقه",
  intakeAfterSession: "إغلاق الاستقبال يجب ألا يتجاوز موعد انعقاد الجلسة",
} as const;

export type MeetingDateField = "intakeOpensAt" | "intakeClosesAt" | "scheduledAt";

export type MeetingDateIssue = { field: MeetingDateField; message: string };

const ts = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Returns every chronology issue for a fully merged set of meeting dates. */
export function validateMeetingDates(input: MeetingDateInput): MeetingDateIssue[] {
  const issues: MeetingDateIssue[] = [];
  const opens = input.intakeOpensAt ?? null;
  const closes = input.intakeClosesAt ?? null;

  if (Boolean(opens) !== Boolean(closes)) {
    issues.push({
      field: opens ? "intakeClosesAt" : "intakeOpensAt",
      message: MEETING_DATE_ERRORS.intakeWindowPartial,
    });
    return issues;
  }

  const o = ts(opens);
  const c = ts(closes);
  const s = ts(input.scheduledAt);

  if (o !== null && c !== null && o >= c) {
    issues.push({
      field: "intakeClosesAt",
      message: MEETING_DATE_ERRORS.intakeWindowInvalid,
    });
  }
  if (c !== null && s !== null && c > s) {
    issues.push({
      field: "intakeClosesAt",
      message: MEETING_DATE_ERRORS.intakeAfterSession,
    });
  }
  return issues;
}

/** First issue message, or null when the dates are consistent. */
export function firstMeetingDateError(input: MeetingDateInput): string | null {
  return validateMeetingDates(input)[0]?.message ?? null;
}

/**
 * Legacy detection for rows created before the invariant existed.
 * Used to warn operators; it never blocks reading or archiving.
 */
export function hasLegacyMeetingDateViolation(input: MeetingDateInput): boolean {
  return validateMeetingDates(input).length > 0;
}

export const LEGACY_MEETING_DATES_WARNING =
  "تواريخ هذا الاجتماع غير متسقة (ترتيب الاستقبال/الانعقاد). صحّح التواريخ قبل بدء الجلسة.";

/**
 * Pre-session transitions must not run on a record with broken chronology;
 * later lifecycle stages (minutes, archiving) stay reachable so legacy
 * meetings are never stranded.
 */
const PRE_SESSION_TRANSITIONS = new Set([
  "intake_open",
  "intake_closed",
  "agenda_ready",
  "in_session",
]);

export function isPreSessionTransitionBlocked(
  toStatus: string,
  dates: MeetingDateInput,
): boolean {
  return PRE_SESSION_TRANSITIONS.has(toStatus) && hasLegacyMeetingDateViolation(dates);
}
