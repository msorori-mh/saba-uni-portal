import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OfficialGraduationDecision } from "../../src/lib/graduates-affairs/foundation";
import {
  ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE,
  ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
  evaluateAccountContinuityAccess,
  type AccountContinuityPolicy,
} from "../../src/lib/graduates-affairs/account-continuity";
import {
  buildConsentTransition,
  listActiveConsentPurposes,
  resolveConsentState,
} from "../../src/lib/graduates-affairs/consents";
import {
  buildEmploymentTimeline,
  currentEmploymentEvents,
  resolveCurrentEmploymentStatus,
  toEmploymentReportRows,
  validateEmploymentEventDraft,
  type GraduateEmploymentEvent,
} from "../../src/lib/graduates-affairs/employment";
import {
  assertSingleActiveFollowUp,
  canTransitionFollowUp,
  evaluateCommunicationEligibility,
  type GraduateContactPointView,
} from "../../src/lib/graduates-affairs/communications";
import { canTransitionFollowup } from "../../src/lib/graduates-affairs/authorization";
import {
  aggregateSurveyResponses,
  evaluateSurveyResponseEligibility,
  resolveActiveSurveyVersion,
  validateSurveyAnswers,
  type GraduateSurveyVersionView,
  type GraduateSurveyView,
} from "../../src/lib/graduates-affairs/surveys";
import {
  assertAggregateReportSafe,
  buildCohortEmploymentReports,
} from "../../src/lib/graduates-affairs/reports";
import {
  buildGraduateFile,
  summarizeGraduateFile,
  type GraduateRecordView,
} from "../../src/lib/graduates-affairs/graduate-file";

const decision: OfficialGraduationDecision = {
  decisionId: "11111111-1111-4111-8111-111111111111",
  studentProfileId: "22222222-2222-4222-8222-222222222222",
  sourceKind: "registrar_approved_decision",
  sourceReference: "REG-DECISION-2026-001",
  state: "approved",
  approvedAt: "2026-07-20T00:00:00Z",
  approvedBy: "33333333-3333-4333-8333-333333333333",
  effectiveGraduationDate: "2026-07-01",
  programId: "44444444-4444-4444-8444-444444444444",
  departmentId: "55555555-5555-4555-8555-555555555555",
  academicSnapshot: { degree: "source-owned", finalResultFreeze: "approved" },
};

const record: GraduateRecordView = {
  recordId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  officialDecisionId: decision.decisionId,
  studentProfileId: decision.studentProfileId,
  effectiveGraduationDate: "2026-07-01",
  programId: decision.programId!,
  departmentId: decision.departmentId!,
  recordState: "approved",
  version: 1,
};

const grantedCareer = {
  purposeCode: "career_followup",
  noticeVersion: "v1",
  state: "granted" as const,
  grantedAt: "2026-08-01T00:00:00Z",
  withdrawnAt: null,
};

const verifiedEmailPoint: GraduateContactPointView = {
  contactPointId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  graduateRecordId: record.recordId,
  channelType: "email",
  purposeCode: "career_followup",
  verified: true,
  revoked: false,
};

function employmentEvent(overrides: Partial<GraduateEmploymentEvent>): GraduateEmploymentEvent {
  return {
    eventId: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
    graduateRecordId: record.recordId,
    status: "employed",
    specializationRelationship: "directly_related",
    verificationState: "graduate_reported",
    startedOn: "2026-08-01",
    endedOn: null,
    recordedAt: "2026-08-10T00:00:00Z",
    supersedesEventId: null,
    ...overrides,
  };
}

describe("D-13 account continuity policy (configurable, fail-closed)", () => {
  const approvedPolicy: AccountContinuityPolicy = {
    policyCode: "graduate-account-continuity",
    state: "approved",
    allowPortalSignIn: true,
    allowUniversityEmailReuse: false,
    allowedCapabilities: ["portal_sign_in", "survey_participation"],
    validFrom: "2026-09-01T00:00:00Z",
    expiresAt: "2027-09-01T00:00:00Z",
    decidedBy: "33333333-3333-4333-8333-333333333333",
    decidedAt: "2026-08-15T00:00:00Z",
  };

  test("default policy is undecided and denies everything", () => {
    expect(ACCOUNT_CONTINUITY_POLICY_UNDECIDED.state).toBe("undecided");
    expect(
      evaluateAccountContinuityAccess(
        ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "account_continuity_policy_undecided" });
  });

  test("approved product baseline encodes closed D-AUTH content without silent grant", () => {
    expect(ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE.state).toBe("approved");
    expect(ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE.allowPortalSignIn).toBe(true);
    expect(ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE.allowUniversityEmailReuse).toBe(false);
    expect(ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE.allowedCapabilities).toEqual(
      expect.arrayContaining([
        "portal_sign_in",
        "password_recovery",
        "profile_self_service_non_academic",
        "request_audience_graduate",
        "official_document_download_issued_archived",
        "graduate_survey_participation",
        "notification_receive_non_sensitive",
      ]),
    );
    expect(ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE.allowedCapabilities).not.toContain(
      "university_email_reuse",
    );
    // Baseline encodes product content only — evaluator still requires provenance.
    expect(
      evaluateAccountContinuityAccess(
        ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE,
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "missing_policy_decision_provenance" });
    expect(
      evaluateAccountContinuityAccess(
        {
          ...ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE,
          decidedBy: "33333333-3333-4333-8333-333333333333",
          decidedAt: "2026-08-15T00:00:00Z",
          validFrom: "2026-09-01T00:00:00Z",
        },
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: true });
  });

  test("rejected policy and missing provenance fail closed", () => {
    expect(
      evaluateAccountContinuityAccess(
        { ...approvedPolicy, state: "rejected" },
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "account_continuity_policy_rejected" });
    expect(
      evaluateAccountContinuityAccess(
        { ...approvedPolicy, decidedAt: null },
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "missing_policy_decision_provenance" });
  });

  test("unrecognized policy state fails closed before window checks", () => {
    expect(
      evaluateAccountContinuityAccess(
        {
          ...approvedPolicy,
          state: "pending" as AccountContinuityPolicy["state"],
          validFrom: null,
          expiresAt: null,
        },
        "portal_sign_in",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "account_continuity_policy_unknown_state" });
  });

  test("policy outside its validity window is not in force", () => {
    expect(
      evaluateAccountContinuityAccess(approvedPolicy, "portal_sign_in", "2026-08-01T00:00:00Z"),
    ).toEqual({ ok: false, reason: "account_continuity_policy_not_in_force" });
    expect(
      evaluateAccountContinuityAccess(approvedPolicy, "portal_sign_in", "2027-09-01T00:00:00Z"),
    ).toEqual({ ok: false, reason: "account_continuity_policy_not_in_force" });
  });

  test("sensitive capabilities need both listing and dedicated flags", () => {
    expect(
      evaluateAccountContinuityAccess(approvedPolicy, "portal_sign_in", "2026-10-01T00:00:00Z"),
    ).toEqual({ ok: true });
    expect(
      evaluateAccountContinuityAccess(
        { ...approvedPolicy, allowedCapabilities: ["portal_sign_in", "university_email_reuse"] },
        "university_email_reuse",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "account_continuity_capability_not_allowed" });
    expect(
      evaluateAccountContinuityAccess(
        approvedPolicy,
        "university_email_reuse",
        "2026-10-01T00:00:00Z",
      ),
    ).toEqual({ ok: false, reason: "account_continuity_capability_not_allowed" });
  });
});

describe("consent lifecycle helpers", () => {
  test("grant then withdraw resolves state prospectively", () => {
    const granted = buildConsentTransition([], {
      action: "grant",
      purposeCode: "career_followup",
      noticeVersion: "v1",
      at: "2026-08-01T00:00:00Z",
    });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(resolveConsentState([granted.event], "career_followup", "v1")).toBe("active");
    const withdrawn = buildConsentTransition([granted.event], {
      action: "withdraw",
      purposeCode: "career_followup",
      noticeVersion: "v1",
      at: "2026-09-01T00:00:00Z",
    });
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(
      resolveConsentState([granted.event, withdrawn.event], "career_followup", "v1"),
    ).toBe("withdrawn");
  });

  test("rejects unknown purposes, duplicates, and phantom withdrawals", () => {
    expect(
      buildConsentTransition([], {
        action: "grant",
        purposeCode: "marketing",
        noticeVersion: "v1",
        at: "2026-08-01T00:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "unknown_consent_purpose" });
    expect(
      buildConsentTransition([grantedCareer], {
        action: "grant",
        purposeCode: "career_followup",
        noticeVersion: "v1",
        at: "2026-08-02T00:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "consent_already_active" });
    expect(
      buildConsentTransition([], {
        action: "withdraw",
        purposeCode: "career_followup",
        noticeVersion: "v1",
        at: "2026-08-02T00:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "no_active_consent_to_withdraw" });
    expect(listActiveConsentPurposes([grantedCareer])).toEqual(["career_followup"]);
  });
});

describe("employment status timeline", () => {
  const original = employmentEvent({});
  const correction = employmentEvent({
    eventId: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
    status: "seeking_work",
    specializationRelationship: "not_assessed",
    verificationState: "verified",
    recordedAt: "2026-09-01T00:00:00Z",
    supersedesEventId: original.eventId,
  });

  test("draft validation mirrors SQL checks", () => {
    expect(validateEmploymentEventDraft(original)).toEqual({ ok: true });
    expect(
      validateEmploymentEventDraft({ ...original, startedOn: "2026-08-01", endedOn: "2026-07-01" }),
    ).toEqual({ ok: false, reason: "ended_before_started" });
    expect(validateEmploymentEventDraft({ ...original, recordedAt: "nope" })).toEqual({
      ok: false,
      reason: "invalid_recorded_at",
    });
  });

  test("supersession keeps history but resolves current status", () => {
    const events = [original, correction];
    expect(currentEmploymentEvents(events).map((event) => event.eventId)).toEqual([
      correction.eventId,
    ]);
    expect(resolveCurrentEmploymentStatus(record.recordId, events)?.status).toBe("seeking_work");
    expect(buildEmploymentTimeline(record.recordId, events).ok).toBe(true);
  });

  test("chain integrity fails closed on unknown or repeated supersession", () => {
    expect(
      buildEmploymentTimeline(record.recordId, [
        original,
        { ...correction, supersedesEventId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      ]),
    ).toEqual({ ok: false, reason: "supersedes_unknown_event" });
    const duplicate = employmentEvent({
      eventId: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
      recordedAt: "2026-09-02T00:00:00Z",
      supersedesEventId: original.eventId,
    });
    expect(buildEmploymentTimeline(record.recordId, [original, correction, duplicate])).toEqual({
      ok: false,
      reason: "event_superseded_more_than_once",
    });
  });

  test("report rows use current events and verified flag only", () => {
    const rows = toEmploymentReportRows([original, correction]);
    expect(rows).toEqual([
      { status: "seeking_work", specializationRelationship: "not_assessed", verified: true },
    ]);
  });
});

describe("communication eligibility and follow-ups", () => {
  const request = {
    graduateRecordId: record.recordId,
    purposeCode: "career_followup",
    noticeVersion: "v1",
    channel: "email" as const,
    contactPointId: verifiedEmailPoint.contactPointId,
    templateCode: "career-check-in-v1",
  };

  test("allows only consented communication through usable contact points", () => {
    expect(
      evaluateCommunicationEligibility({
        request,
        consents: [grantedCareer],
        contactPoints: [verifiedEmailPoint],
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateCommunicationEligibility({
        request,
        consents: [],
        contactPoints: [verifiedEmailPoint],
      }),
    ).toEqual({ ok: false, reason: "missing_active_purpose_consent" });
    expect(
      evaluateCommunicationEligibility({
        request,
        consents: [grantedCareer],
        contactPoints: [{ ...verifiedEmailPoint, revoked: true }],
      }),
    ).toEqual({ ok: false, reason: "contact_point_revoked" });
    expect(
      evaluateCommunicationEligibility({
        request,
        consents: [grantedCareer],
        contactPoints: [{ ...verifiedEmailPoint, verified: false }],
      }),
    ).toEqual({ ok: false, reason: "contact_point_not_verified" });
    expect(
      evaluateCommunicationEligibility({
        request: { ...request, purposeCode: "events" },
        consents: [grantedCareer],
        contactPoints: [verifiedEmailPoint],
      }),
    ).toEqual({ ok: false, reason: "contact_point_purpose_mismatch" });
  });

  test("follow-up lifecycle is terminal and single-active per graduate", () => {
    expect(canTransitionFollowUp("open", "completed")).toBe(false);
    expect(canTransitionFollowUp("open", "in_progress")).toBe(true);
    expect(canTransitionFollowUp("completed", "open")).toBe(false);
    // R10: communications re-exports the canonical authorization state machine.
    expect(canTransitionFollowUp).toBe(canTransitionFollowup);
    const base = {
      graduateRecordId: record.recordId,
      assigneeUserId: "33333333-3333-4333-8333-333333333333",
      purposeCode: "career_followup",
      nextActionAt: null,
    };
    expect(
      assertSingleActiveFollowUp([
        { ...base, followUpId: "a", state: "open" },
        { ...base, followUpId: "b", state: "in_progress" },
      ]),
    ).toEqual({ ok: false, reason: "multiple_active_followups_for_graduate" });
    expect(
      assertSingleActiveFollowUp([
        { ...base, followUpId: "a", state: "open" },
        { ...base, followUpId: "b", state: "completed" },
      ]),
    ).toEqual({ ok: true });
  });
});

describe("surveys: eligibility, answers, aggregation", () => {
  const survey: GraduateSurveyView = {
    surveyId: "77777777-7777-4777-8777-777777777777",
    purposeCode: "employment_quality",
    state: "active",
    minimumReportCellSize: 3,
  };
  const version: GraduateSurveyVersionView = {
    surveyVersionId: "88888888-8888-4888-8888-888888888888",
    surveyId: survey.surveyId,
    version: 1,
    noticeVersion: "v1",
    publishedAt: "2026-08-01T00:00:00Z",
    questions: [
      { key: "employed", kind: "single_choice", required: true, options: ["yes", "no"] },
      { key: "comment", kind: "free_text", required: false, maxLength: 10 },
    ],
  };
  const qualityConsent = { ...grantedCareer, purposeCode: "employment_quality" };

  test("response eligibility mirrors the SQL consent guard", () => {
    expect(
      evaluateSurveyResponseEligibility({
        survey,
        version,
        consents: [qualityConsent],
        alreadyResponded: false,
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateSurveyResponseEligibility({
        survey,
        version,
        consents: [],
        alreadyResponded: false,
      }),
    ).toEqual({ ok: false, reason: "missing_active_survey_consent" });
    expect(
      evaluateSurveyResponseEligibility({
        survey,
        version,
        consents: [qualityConsent],
        alreadyResponded: true,
      }),
    ).toEqual({ ok: false, reason: "duplicate_survey_response" });
    expect(
      evaluateSurveyResponseEligibility({
        survey: { ...survey, state: "closed" },
        version,
        consents: [qualityConsent],
        alreadyResponded: false,
      }),
    ).toEqual({ ok: false, reason: "survey_not_active" });
  });

  test("active version is the latest published one", () => {
    expect(resolveActiveSurveyVersion(survey, [version])?.surveyVersionId).toBe(
      version.surveyVersionId,
    );
    expect(
      resolveActiveSurveyVersion(survey, [{ ...version, publishedAt: null }]),
    ).toBeNull();
  });

  test("answer validation enforces required, choice, and length contracts", () => {
    expect(validateSurveyAnswers(version.questions, { employed: "yes" })).toEqual({ ok: true });
    expect(validateSurveyAnswers(version.questions, {})).toEqual({
      ok: false,
      errors: ["required_question_unanswered:employed"],
    });
    expect(validateSurveyAnswers(version.questions, { employed: "maybe" })).toEqual({
      ok: false,
      errors: ["invalid_choice:employed"],
    });
    expect(
      validateSurveyAnswers(version.questions, { employed: "yes", comment: "01234567890" }),
    ).toEqual({ ok: false, errors: ["free_text_too_long:comment"] });
  });

  test("aggregation is aggregate-only with small-cell suppression", () => {
    const report = aggregateSurveyResponses(
      version.questions,
      [{ employed: "yes" }, { employed: "no" }],
      3,
    );
    expect(report.totalResponses).toEqual({ total: null, suppressed: true });
    const wide = aggregateSurveyResponses(
      version.questions,
      [
        { employed: "yes", comment: "a" },
        { employed: "yes", comment: "b" },
        { employed: "no" },
      ],
      3,
    );
    expect(wide.totalResponses).toEqual({ total: 3, suppressed: false });
    expect(wide.questions[0]?.distribution).toEqual([
      { option: "yes", metric: { total: null, suppressed: true } },
      { option: "no", metric: { total: null, suppressed: true } },
    ]);
    expect(JSON.stringify(wide)).not.toContain("comment text");
  });
});

describe("cohort reports stay aggregate and small-cell suppressed", () => {
  test("cohorts below threshold suppress every metric", () => {
    const reports = buildCohortEmploymentReports(
      [
        {
          programId: "44444444-4444-4444-8444-444444444444",
          graduationYear: 2026,
          row: { status: "employed", specializationRelationship: "directly_related", verified: true },
        },
      ],
      5,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]?.summary.population).toEqual({ total: null, suppressed: true });
    expect(assertAggregateReportSafe(reports)).toEqual({ ok: true });
  });

  test("safety check rejects person-identifying keys", () => {
    expect(assertAggregateReportSafe([{ programId: "x", graduateName: "leak" }])).toEqual({
      ok: false,
      violations: ["report[0].graduateName"],
    });
  });
});

describe("comprehensive graduate file", () => {
  test("assembles only through the official decision gate", () => {
    const assembled = buildGraduateFile({
      decision,
      record,
      profile: null,
      contactPoints: [verifiedEmailPoint],
      consents: [grantedCareer],
      employmentEvents: [employmentEvent({})],
      followUps: [],
    });
    expect(assembled.ok).toBe(true);
    expect(
      buildGraduateFile({
        decision: { ...decision, state: "pending" },
        record,
        profile: null,
        contactPoints: [],
        consents: [],
        employmentEvents: [],
        followUps: [],
      }),
    ).toEqual({ ok: false, reason: "official_decision_not_approved" });
    expect(
      buildGraduateFile({
        decision,
        record: { ...record, programId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        profile: null,
        contactPoints: [],
        consents: [],
        employmentEvents: [],
        followUps: [],
      }),
    ).toEqual({ ok: false, reason: "record_fact_mismatch_official_decision" });
    expect(
      buildGraduateFile({
        decision,
        record,
        profile: null,
        contactPoints: [{ ...verifiedEmailPoint, graduateRecordId: decision.decisionId }],
        consents: [],
        employmentEvents: [],
        followUps: [],
      }),
    ).toEqual({ ok: false, reason: "contact_point_record_mismatch" });
  });

  test("summary is aggregate and non-identifying", () => {
    const assembled = buildGraduateFile({
      decision,
      record,
      profile: {
        graduateRecordId: record.recordId,
        publicDisplayName: null,
        preferredContactChannel: "email",
        careerSummary: null,
        visibility: "private",
      },
      contactPoints: [verifiedEmailPoint],
      consents: [grantedCareer],
      employmentEvents: [employmentEvent({ verificationState: "verified" })],
      followUps: [
        {
          followUpId: "a",
          graduateRecordId: record.recordId,
          assigneeUserId: "33333333-3333-4333-8333-333333333333",
          purposeCode: "career_followup",
          state: "open",
          nextActionAt: null,
        },
      ],
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(summarizeGraduateFile(assembled.file)).toEqual({
      recordState: "approved",
      version: 1,
      hasProfile: true,
      profileVisibility: "private",
      usableContactChannels: ["email"],
      activeConsentPurposes: ["career_followup"],
      currentEmploymentStatus: "employed",
      currentEmploymentVerified: true,
      openFollowUps: 1,
    });
  });
});

describe("completion SQL draft safety contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql"),
    "utf8",
  );

  test("contains follow-ups, communication log, and D-13 policy surface", () => {
    for (const name of [
      "graduate_followups",
      "graduate_communication_events",
      "graduate_account_continuity_policies",
      "graduate_followups_one_active_per_graduate",
      "graduate_followup_state_guard",
      "graduate_followups_append_only",
      "GRADUATE_FOLLOWUP_INVALID_TRANSITION",
      "graduate_communication_consent_guard",
      "GRADUATE_COMMUNICATION_CONSENT_REQUIRED",
      "GRADUATE_CONTACT_POINT_NOT_USABLE",
      "graduate_communication_events_append_only",
      "graduate_account_policy_decided_immutable",
      "GRADUATE_ACCOUNT_POLICY_DECIDED_IMMUTABLE",
      "evaluate_graduate_account_continuity",
      "IF p_at IS NULL THEN",
      "graduate_aggregate_employment_report",
      "v_employed < v_threshold THEN NULL",
    ])
      expect(sql).toContain(name);
  });

  test("never activates production, grants clients, or loosens the foundation", () => {
    expect(sql).not.toMatch(/student_profiles[\s\S]{0,120}status\s*=\s*'graduated'/i);
    expect(sql).not.toMatch(
      /student_visible\s*=|supabase\s+db\s+push|supabase\s+migration\s+up|preview_ui--publish/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|SELECT)[^;]*TO\s+(?:anon|authenticated)/i,
    );
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/DROP\s+(?:TRIGGER|TABLE)\s+(?:IF\s+EXISTS\s+)?graduate_/i);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("DRAFT ONLY");
  });
});
