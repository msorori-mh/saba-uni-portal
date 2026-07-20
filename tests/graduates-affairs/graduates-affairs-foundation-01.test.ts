import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEmploymentQualitySummary,
  canTransitionOpportunity,
  evaluateGraduateRecordReadiness,
  hasActivePurposeConsent,
  type OfficialGraduationDecision,
} from "../../src/lib/graduates-affairs/foundation";

const validDecision: OfficialGraduationDecision = {
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

describe("graduates affairs official graduate gate", () => {
  test("allows only a complete approved official decision", () => {
    expect(evaluateGraduateRecordReadiness(validDecision)).toEqual({
      ok: true,
      decisionId: validDecision.decisionId,
    });
  });

  test("fails closed for candidates, profile status proxies, and incomplete provenance", () => {
    expect(evaluateGraduateRecordReadiness({ ...validDecision, state: "pending" })).toEqual({
      ok: false,
      reason: "official_decision_not_approved",
    });
    expect(evaluateGraduateRecordReadiness({ ...validDecision, approvedBy: null })).toEqual({
      ok: false,
      reason: "missing_official_approval_provenance",
    });
    expect(evaluateGraduateRecordReadiness({ ...validDecision, academicSnapshot: null })).toEqual({
      ok: false,
      reason: "missing_immutable_academic_snapshot",
    });
  });
});

describe("consent, opportunities, and privacy-safe quality reporting", () => {
  test("uses purpose/version consent and honors prospective withdrawal", () => {
    const granted = {
      purposeCode: "career_followup",
      noticeVersion: "v1",
      state: "granted" as const,
      grantedAt: "2026-01-01",
      withdrawnAt: null,
    };
    expect(hasActivePurposeConsent([granted], "career_followup", "v1")).toBe(true);
    expect(
      hasActivePurposeConsent(
        [granted, { ...granted, state: "withdrawn", withdrawnAt: "2026-02-01" }],
        "career_followup",
        "v1",
      ),
    ).toBe(false);
    expect(
      hasActivePurposeConsent(
        [{ ...granted, grantedAt: "not-a-timestamp" }],
        "career_followup",
        "v1",
      ),
    ).toBe(false);
    expect(hasActivePurposeConsent([granted], "surveys", "v1")).toBe(false);
    expect(
      hasActivePurposeConsent(
        [{ ...granted, state: "withdrawn", withdrawnAt: "2026-02-01" }, granted],
        "career_followup",
        "v1",
      ),
    ).toBe(false);
  });

  test("requires moderation and suppresses small report cells", () => {
    expect(canTransitionOpportunity("draft", "published")).toBe(false);
    expect(canTransitionOpportunity("in_review", "published")).toBe(true);
    const summary = buildEmploymentQualitySummary([
      { status: "employed", specializationRelationship: "directly_related", verified: true },
      { status: "seeking_work", specializationRelationship: "not_assessed", verified: false },
    ]);
    expect(summary.population).toEqual({ total: null, suppressed: true });
  });
});

describe("SQL draft safety contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql"),
    "utf8",
  );

  test("contains the complete source-only domain and official decision gate", () => {
    for (const name of [
      "graduate_official_decisions",
      "graduate_records",
      "graduate_profiles",
      "graduate_contact_points",
      "graduate_consents",
      "graduate_employers",
      "graduate_employment_events",
      "graduate_opportunities",
      "graduate_surveys",
      "graduate_survey_responses",
      "graduate_events",
      "graduate_event_registrations",
      "graduate_domain_events",
    ])
      expect(sql).toContain(name);
    expect(sql).toContain("create_graduate_record_from_official_decision");
    expect(sql).toContain("OFFICIAL_GRADUATION_DECISION_NOT_APPROVED");
    expect(sql).toContain("graduate_records_official_decision_guard");
    expect(sql).toContain("GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION");
    expect(sql).toContain("graduate_decision_state_propagation");
    expect(sql).toContain("SUPERSEDED_GRADUATION_DECISION_NOT_CURRENT");
    expect(sql).toContain("graduate_survey_response_consent_guard");
    expect(sql).toContain("ACTIVE_MATCHING_SURVEY_CONSENT_REQUIRED");
    expect(sql).toContain("graduate_event_registration_consent_guard");
    expect(sql).toContain("ACTIVE_MATCHING_EVENT_CONSENT_REQUIRED");
    expect(sql).toContain("graduate_domain_events_append_only");
    expect(sql).toContain("graduate_survey_versions_immutable_after_publish");
    expect(sql).toContain("graduate_official_decision_immutability");
    expect(sql).toContain("graduate_consent_identity_immutability");
    expect(sql).toContain("graduate_survey_scope_immutability");
    expect(sql).toContain("graduate_event_scope_immutability");
  });

  test("never promotes a candidate/profile status or activates production", () => {
    expect(sql).not.toMatch(/student_profiles[\s\S]{0,120}status\s*=\s*'graduated'/i);
    expect(sql).not.toMatch(
      /student_visible\s*=|supabase\s+db\s+push|supabase\s+migration\s+up|preview_ui--publish/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)[^;]*TO\s+(?:anon|authenticated)/i,
    );
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });
});
