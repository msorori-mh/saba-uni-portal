import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const report = readFileSync(
  join(process.cwd(), "docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md"),
  "utf8",
);
const normalized = report.replace(/\s+/g, " ");

describe("graduates affairs MVP audit/design report", () => {
  test("separates audit completion from implementation authorization", () => {
    expect(report).toContain("PASS_AUDIT_COMPLETE");
    expect(report).toContain("HOLD_PENDING_GRADUATE_DOMAIN_DECISIONS");
    expect(normalized).toContain("after graduation-projects implementation");
  });

  test("does not invent a graduate definition", () => {
    expect(report).toContain("None is approved as the sole graduate source");
    expect(normalized).toContain("candidate`, `eligible`, `approved_graduate`");
    expect(normalized).toContain("must not silently create a graduate");
    expect(normalized).toContain("authoritative graduation fact");
  });

  test("covers required domain contracts", () => {
    for (const token of [
      "graduate_records", "graduate_profiles", "graduate_contact_points",
      "graduate_consents", "graduate_employment_events", "graduate_employers",
      "graduate_job_opportunities", "graduate_surveys", "graduate_survey_responses",
      "graduate_followups", "graduate_domain_events",
    ]) expect(report).toContain(token);
  });

  test("defines privacy and fail-closed authorization", () => {
    for (const token of [
      "Default deny via RLS", "direct object", "Same role unassigned",
      "admin, registrar and dean bypass are DENY", "zero profile, consent",
      "small-cell suppression", "Audit sensitive reads", "purpose/version specific",
    ]) expect(normalized).toContain(token);
  });

  test("keeps documents and accounts behind explicit gates", () => {
    expect(report).toContain("Post-graduation account continuity");
    expect(report).toContain("cannot change results");
    expect(report).toContain("prohibition on graduates-affairs issuance");
    expect(report).toContain("signed issued/archived access");
  });

  test("defines ordered source-only bundles with individual holds", () => {
    for (const token of [
      "DRAFTS_ONLY_NO_APPLY",
      "P0 — graduate fact and authority foundation",
      "P1 — graduate profile, consent and career follow-up",
      "P1 — employers and jobs",
      "P2 — surveys and privacy-safe reports",
      "P2 — documents, notifications and integration",
      "Later — runtime/UI/staging/release",
      "HOLD_DEPENDS_ON_GRADUATION_PROJECTS_AND_CORE_DECISIONS",
      "HOLD_DEPENDS_ON_P0_PRIVACY_AND_CAREER_POLICY",
      "HOLD_DEPENDS_ON_P0_P1_EMPLOYER_POLICY",
      "HOLD_DEPENDS_ON_P1_SURVEY_REPORT_POLICY",
      "HOLD_DEPENDS_ON_DOCUMENTS_AND_NOTIFICATION_GATES",
      "HOLD_NO_RELEASE_AUTHORIZATION",
    ]) expect(report).toContain(token);
  });

  test("records no forbidden implementation or production impact", () => {
    expect(normalized).toContain("Production impact is zero");
    expect(normalized).toContain("No SQL/migration/runtime/UI/schema, `student_visible`");
    expect(report).not.toMatch(/ALTER TABLE|CREATE POLICY|supabase db push/i);
  });
});
