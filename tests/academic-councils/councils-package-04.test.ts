/**
 * COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
 * Pure helper tests + source guards over the migration drafts. No DB access.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEETING_DATE_ERRORS,
  firstMeetingDateError,
  hasLegacyMeetingDateViolation,
  isPreSessionTransitionBlocked,
  validateMeetingDates,
} from "@/lib/councils-meeting-dates";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const GUARD_SQL = read("docs/migration-drafts/COUNCILS-VOTE-COMPLETION-GUARD-04.sql");
const NOTIF_SQL = read("docs/migration-drafts/COUNCILS-VOTE-NOTIFICATIONS-04.sql");
const DATES_SQL = read("docs/migration-drafts/COUNCILS-MEETING-DATE-INVARIANTS-04.sql");
const ADMIN_FN = read("src/lib/admin-councils.functions.ts");
const ADMIN_ROUTE = read("src/routes/admin/academic-councils.tsx");
const DIALOG = read("src/components/portal/councils/ScheduleMeetingDialog.tsx");

describe("meeting date invariants — helper", () => {
  it("accepts opens < closes <= scheduled", () => {
    expect(
      validateMeetingDates({
        intakeOpensAt: "2026-09-01T08:00:00.000Z",
        intakeClosesAt: "2026-09-05T08:00:00.000Z",
        scheduledAt: "2026-09-05T08:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("rejects an inverted intake window", () => {
    expect(
      firstMeetingDateError({
        intakeOpensAt: "2026-09-06T08:00:00.000Z",
        intakeClosesAt: "2026-09-05T08:00:00.000Z",
        scheduledAt: "2026-09-10T08:00:00.000Z",
      }),
    ).toBe(MEETING_DATE_ERRORS.intakeWindowInvalid);
  });

  it("rejects intake closing after the session", () => {
    expect(
      firstMeetingDateError({
        intakeOpensAt: "2026-09-01T08:00:00.000Z",
        intakeClosesAt: "2026-09-20T08:00:00.000Z",
        scheduledAt: "2026-09-10T08:00:00.000Z",
      }),
    ).toBe(MEETING_DATE_ERRORS.intakeAfterSession);
  });

  it("rejects a half-open intake window", () => {
    expect(
      firstMeetingDateError({
        intakeOpensAt: "2026-09-01T08:00:00.000Z",
        intakeClosesAt: null,
        scheduledAt: "2026-09-10T08:00:00.000Z",
      }),
    ).toBe(MEETING_DATE_ERRORS.intakeWindowPartial);
  });

  it("treats a fully empty intake window as valid", () => {
    expect(
      firstMeetingDateError({ scheduledAt: "2026-09-10T08:00:00.000Z" }),
    ).toBeNull();
  });

  it("flags legacy rows and blocks pre-session transitions only", () => {
    const bad = {
      intakeOpensAt: "2026-09-20T08:00:00.000Z",
      intakeClosesAt: "2026-09-25T08:00:00.000Z",
      scheduledAt: "2026-09-10T08:00:00.000Z",
    };
    expect(hasLegacyMeetingDateViolation(bad)).toBe(true);
    expect(isPreSessionTransitionBlocked("in_session", bad)).toBe(true);
    expect(isPreSessionTransitionBlocked("agenda_ready", bad)).toBe(true);
    expect(isPreSessionTransitionBlocked("archived", bad)).toBe(false);
    expect(isPreSessionTransitionBlocked("minutes_locked", bad)).toBe(false);
    expect(isPreSessionTransitionBlocked("in_session", { scheduledAt: null })).toBe(false);
  });
});

describe("package 04 — source guards", () => {
  it("enforces exact CAST = ELIGIBLE parity in SQL", () => {
    expect(GUARD_SQL).toContain("council_agenda_item_cast_count");
    expect(GUARD_SQL).toContain("'can_close', (v_eligible > 0 AND v_cast = v_eligible)");
    expect(GUARD_SQL).toContain("COUNCIL_VOTING_CAST_ELIGIBLE_MISMATCH");
    expect(GUARD_SQL).not.toContain("v_cast >= v_eligible");
  });

  it("excludes viewers from the eligible set and from casting", () => {
    expect(GUARD_SQL).toContain("academic_council_members mm");
    expect(GUARD_SQL).not.toContain("'viewer'::public.academic_council_member_role\n   )");
    expect(GUARD_SQL).toContain("council role is not entitled to vote");
  });

  it("schedules the 5-minute reminder automatically", () => {
    expect(NOTIF_SQL).toContain("cron.schedule");
    expect(NOTIF_SQL).toContain("councils_vote_reminder_5m");
  });

  it("uses a trigger for date chronology and defers the table CHECK", () => {
    expect(DATES_SQL).toContain("trg_ac_meetings_date_chronology");
    expect(DATES_SQL).toContain("COUNCIL_MEETING_INTAKE_WINDOW_PARTIAL");
    expect(DATES_SQL).toContain("DEFERRED STEP");
    expect(DATES_SQL).not.toMatch(/^\s*ADD CONSTRAINT ck_ac_meetings_date_chronology/m);
  });

  it("validates dates in the UI and on the server", () => {
    expect(DIALOG).toContain("firstMeetingDateError");
    expect(ADMIN_ROUTE).toContain("firstMeetingDateError");
    expect(ADMIN_ROUTE).toContain("admin-meeting-legacy-dates-warning");
    expect(ADMIN_FN).toContain("superRefine");
    expect(ADMIN_FN).toContain("validateMeetingDates(mergedDates)");
    expect(ADMIN_FN).toContain("isPreSessionTransitionBlocked");
  });
});
