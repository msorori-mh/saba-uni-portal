import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const report = readFileSync(
  join(process.cwd(), "docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md"),
  "utf8",
);
const normalized = report.replace(/\s+/g, " ");

describe("graduation projects MVP audit/design report", () => {
  test("separates audit completion from implementation authorization", () => {
    expect(report).toContain("PASS_AUDIT_COMPLETE");
    expect(report).toContain("HOLD_PENDING_ACADEMIC_DECISIONS");
    expect(report).toContain("source-only design artifact");
  });

  test("anchors eligibility in exact academic provenance", () => {
    expect(normalized).toContain("student_enrollments -> course_sections -> course_offerings");
    expect(report).toContain("canonical current-term resolver");
    expect(report).toContain("never infer a cohort from program/level similarity");
  });

  test("covers the complete proposed domain without overloading adjacent stores", () => {
    for (const token of [
      "graduation_projects",
      "graduation_project_members",
      "graduation_project_supervisors",
      "graduation_project_milestones",
      "graduation_project_submissions",
      "graduation_project_submission_files",
      "graduation_project_evaluations",
      "graduation_project_evaluation_scores",
      "graduation_project_events",
    ]) expect(report).toContain(token);
    expect(report).toContain("Do not use `student_requests` or `official_documents` as the project store");
  });

  test("makes assignment, storage and denial rules explicit", () => {
    expect(report).toContain("Same role without assignment is DENY");
    expect(report).toContain("No admin, registrar, dean or graduate-affairs bypass");
    expect(report).toContain("Private storage only");
    expect(report).toContain("short-lived signed reads/downloads");
    expect(report).toContain("zero side effects");
  });

  test("keeps academic choices unresolved instead of inventing mappings", () => {
    for (const token of [
      "Eligible programs, levels, terms",
      "Minimum/maximum team size",
      "Supervisor eligibility",
      "Evaluation panel composition",
      "Allowed file types",
      "notification recipients",
    ]) expect(report).toContain(token);
    expect(normalized).toContain("Existing graduate-affairs titles are not mapped automatically");
  });

  test("defines ordered implementation and release gates", () => {
    for (const gate of [
      "Academic contract gate",
      "Threat/data-model gate",
      "Migration-draft gate",
      "Authorization-test gate",
      "Runtime gate",
      "UI gate",
      "Synthetic staging gate",
      "Release gate",
    ]) expect(report).toContain(gate);
  });

  test("records zero production impact and no forbidden change", () => {
    expect(report).toContain("Production impact");
    expect(report).toContain("Zero. No SQL or migration was created or applied");
    expect(normalized).toContain("no `student_visible`, runtime, UI, storage, deployment or publication was changed");
    expect(report).not.toMatch(/ALTER TABLE|CREATE POLICY|supabase db push/i);
  });
});
