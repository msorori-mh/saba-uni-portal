import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const materials = readFileSync(join(root, "src/lib/student-materials.functions.ts"), "utf8");
const shared = readFileSync(join(root, "src/lib/course-materials.shared.ts"), "utf8");
const profileSchema = readFileSync(
  join(root, "supabase/migrations/20260705120000_student_profiles_study_system.sql"),
  "utf8",
);
const enrollmentSchema = readFileSync(
  join(root, "supabase/migrations/20260531232752_5865cae8-4ba6-44ae-b10a-fceb5fb3f15c.sql"),
  "utf8",
);
const report = readFileSync(join(root, "docs/STUDENT-TO-COHORT-BINDING-AUDIT-01-REPORT.md"), "utf8");
const normalizedEnrollmentSchema = enrollmentSchema.replace(/\s+/g, " ");
const normalizedReport = report.replace(/\s+/g, " ");

describe("STUDENT-TO-COHORT-BINDING-AUDIT-01 evidence", () => {
  it("identifies exact enrollment-to-section as the authoritative binding", () => {
    expect(normalizedEnrollmentSchema).toMatch(/student_profile_id uuid NOT NULL/i);
    expect(normalizedEnrollmentSchema).toMatch(/course_section_id uuid NOT NULL/i);
    expect(normalizedEnrollmentSchema).toMatch(/UNIQUE\s*\(student_profile_id,\s*course_section_id\)/i);
    expect(normalizedReport).toContain("student_enrollments.course_section_id -> course_sections.id");
    expect(normalizedReport).toContain("course_sections.course_offering_id -> course_offerings.id");
  });

  it("records the broad academic-status cohort fallback as a HOLD", () => {
    // Audit documented the broad student_academic_status sibling fallback as HOLD.
    // Runtime later closed that path: the setting default string remains, but
    // audience resolution is exact current enrollment only (no academic-status
    // sibling inference).
    expect(materials).toContain('?? "cohort_fallback"');
    expect(materials).toContain("never use either mode to infer sibling");
    expect(materials).toContain("exactCurrentMaterialSectionIds");
    expect(materials).toContain("fetchCanonicalCurrentTerm");
    expect(materials).not.toContain('.from("student_academic_status")');
    expect(report).toContain("PASS_AUDIT_COMPLETE");
    expect(report).toContain("HOLD_INTEGRATED_RUNTIME");
  });

  it("proves current-term ambiguity is not rejected by the fallback", () => {
    // Post-remediation contract: missing/ambiguous current term fails closed
    // (empty section set) instead of expanding via academic-status keys.
    expect(materials).toContain("if (!currentTerm) return new Set<string>()");
    expect(materials).toContain("fetchCanonicalCurrentTerm");
    expect(materials).toContain('.from("student_enrollments")');
    expect(normalizedReport).toContain("zero, one, or many academic-status rows");
  });

  it("resolves the study-system vocabulary through one canonical mapping", () => {
    // COURSE-SYLLABUS-MATERIALS-AND-STUDY-SYSTEM-CLOSURE-01 closed the mismatch:
    // canonical general/private/both, with legacy regular/parallel read-compatible.
    expect(shared).toContain('"general" | "private" | "both"');
    expect(shared).toContain("export function normalizeStudySystemTag");
    expect(shared).toContain("regular: \"general\"");
    expect(shared).toContain("parallel: \"private\"");
    expect(profileSchema).toContain("study_system IN ('regular', 'private')");
  });

  it("documents transfer, suspension, RLS and exact audience verification", () => {
    for (const phrase of [
      "After a transfer",
      "suspended profile",
      "service-role reads bypass",
      "valid term with zero matching enrollments",
      "another student's section and file IDs",
      "negative cases create neither",
    ]) {
      expect(normalizedReport).toContain(phrase);
    }
  });

  it("requires exact current-active enrollment and no generic historical fallback", () => {
    expect(normalizedReport).toContain("status is exactly `enrolled`");
    expect(normalizedReport).toContain("Suspension must remain denied unless an explicit approved status rule");
    expect(normalizedReport).toContain('`completed`, `dropped`, or a generic "non-dropped"');
  });

  it("remains a source-only audit with no executable schema or production action", () => {
    expect(report).toContain("No runtime, schema, migration, RLS policy");
    expect(report).not.toMatch(/supabase db push|supabase migration up|student_visible\s*=/i);
  });
});
