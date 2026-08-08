import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_TOPIC_TRANSITIONS,
  getIntakeValidationError,
  getReviewAuthorityError,
  isAllowedTopicTransition,
  isFinalReviewStatus,
  isPrepareReviewStatus,
} from "@/lib/council-topic-lifecycle";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../supabase/migrations/20260808000000_council_topic_intake_review_lifecycle.sql",
  ),
  "utf8",
);

describe("C2 topic intake & review lifecycle migration", () => {
  it("defines the intake helper", () => {
    expect(migration).toInclude("can_submit_to_council_meeting_intake(_user uuid, _meeting uuid)");
    expect(migration).toInclude("status = 'intake_open'");
    expect(migration).toInclude("m.intake_opens_at <= now()");
    expect(migration).toInclude("m.intake_closes_at >= now()");
  });

  it("excludes viewers from intake submission", () => {
    expect(migration).toInclude("'chair'");
    expect(migration).toInclude("'secretary'");
    expect(migration).toInclude("'member'");
    expect(migration).not.toInclude("'viewer'::public.academic_council_member_role");
  });

  it("splits review authority between prepare and final helpers", () => {
    expect(migration).toInclude("can_review_council_topic_prepare(_user uuid, _topic uuid)");
    expect(migration).toInclude("can_review_council_topic_final(_user uuid, _topic uuid)");
    expect(migration).toInclude("mb.member_role = 'chair'");
  });

  it("installs a lifecycle trigger on academic_council_topics", () => {
    expect(migration).toInclude("tg_enforce_council_topic_lifecycle");
    expect(migration).toInclude("BEFORE UPDATE ON public.academic_council_topics");
    expect(migration).toInclude("invalid topic status transition");
  });

  it("enforces submitted status and meeting_id on insert policy", () => {
    expect(migration).toInclude("status = 'submitted'");
    expect(migration).toInclude("meeting_id IS NOT NULL");
    expect(migration).toInclude("can_submit_to_council_meeting_intake(auth.uid(), meeting_id)");
  });

  it("does not grant final approval to admins or generic writers", () => {
    expect(migration).not.toInclude("is_council_admin");
    expect(migration).not.toInclude("can_write_council_agenda");
  });
});

describe("Canonical topic status transitions", () => {
  it("allows the full positive lifecycle", () => {
    expect(isAllowedTopicTransition("draft", "submitted")).toBe(true);
    expect(isAllowedTopicTransition("submitted", "under_review")).toBe(true);
    expect(isAllowedTopicTransition("under_review", "accepted_for_agenda")).toBe(true);
    expect(isAllowedTopicTransition("submitted", "needs_completion")).toBe(true);
    expect(isAllowedTopicTransition("needs_completion", "submitted")).toBe(true);
    expect(isAllowedTopicTransition("under_review", "rejected")).toBe(true);
  });

  it("denies arbitrary status skips", () => {
    expect(isAllowedTopicTransition("draft", "under_review")).toBe(false);
    expect(isAllowedTopicTransition("draft", "accepted_for_agenda")).toBe(false);
    expect(isAllowedTopicTransition("submitted", "accepted_for_agenda")).toBe(false);
    expect(isAllowedTopicTransition("needs_completion", "accepted_for_agenda")).toBe(false);
    expect(isAllowedTopicTransition("rejected", "submitted")).toBe(false);
  });

  it("classifies prepare vs final review statuses", () => {
    expect(isPrepareReviewStatus("under_review")).toBe(true);
    expect(isPrepareReviewStatus("needs_completion")).toBe(true);
    expect(isPrepareReviewStatus("accepted_for_agenda")).toBe(false);

    expect(isFinalReviewStatus("accepted_for_agenda")).toBe(true);
    expect(isFinalReviewStatus("rejected")).toBe(true);
    expect(isFinalReviewStatus("under_review")).toBe(false);
  });
});

describe("Intake validation", () => {
  const base = {
    meetingStatus: "intake_open",
    intakeOpensAt: null,
    intakeClosesAt: null,
    nowIso: "2026-08-08T10:00:00.000Z",
    memberRole: "member",
    isActiveMember: true,
  };

  it("passes for open intake with no window boundaries", () => {
    expect(getIntakeValidationError(base)).toBeNull();
  });

  it("denies inactive members", () => {
    expect(getIntakeValidationError({ ...base, isActiveMember: false })).toBeString();
  });

  it("denies viewers", () => {
    expect(getIntakeValidationError({ ...base, memberRole: "viewer" })).toBeString();
  });

  it("denies closed intake", () => {
    expect(
      getIntakeValidationError({ ...base, meetingStatus: "intake_closed" }),
    ).toBeString();
  });

  it("denies future intake window", () => {
    expect(
      getIntakeValidationError({
        ...base,
        intakeOpensAt: "2026-08-08T12:00:00.000Z",
      }),
    ).toBeString();
  });

  it("denies expired intake window", () => {
    expect(
      getIntakeValidationError({
        ...base,
        intakeClosesAt: "2026-08-08T08:00:00.000Z",
      }),
    ).toBeString();
  });
});

describe("Review authority", () => {
  const base = {
    isActiveMember: true,
    targetStatus: "under_review",
  };

  it("allows chair to perform final approval", () => {
    expect(
      getReviewAuthorityError({ ...base, role: "chair", targetStatus: "accepted_for_agenda" }),
    ).toBeNull();
    expect(
      getReviewAuthorityError({ ...base, role: "chair", targetStatus: "rejected" }),
    ).toBeNull();
  });

  it("allows secretary to prepare only", () => {
    expect(
      getReviewAuthorityError({ ...base, role: "secretary", targetStatus: "under_review" }),
    ).toBeNull();
    expect(
      getReviewAuthorityError({ ...base, role: "secretary", targetStatus: "needs_completion" }),
    ).toBeNull();
    expect(
      getReviewAuthorityError({ ...base, role: "secretary", targetStatus: "accepted_for_agenda" }),
    ).toBeString();
    expect(
      getReviewAuthorityError({ ...base, role: "secretary", targetStatus: "rejected" }),
    ).toBeString();
  });

  it("denies plain members final or prepare actions", () => {
    expect(
      getReviewAuthorityError({ ...base, role: "member", targetStatus: "under_review" }),
    ).toBeString();
    expect(
      getReviewAuthorityError({ ...base, role: "member", targetStatus: "accepted_for_agenda" }),
    ).toBeString();
  });

  it("denies viewers and inactive users", () => {
    expect(
      getReviewAuthorityError({ ...base, role: "viewer", targetStatus: "under_review" }),
    ).toBeString();
    expect(
      getReviewAuthorityError({ ...base, role: "chair", isActiveMember: false, targetStatus: "accepted_for_agenda" }),
    ).toBeString();
  });
});
