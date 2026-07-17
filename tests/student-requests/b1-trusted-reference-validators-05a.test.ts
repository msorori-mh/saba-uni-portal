import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql"), "utf8");

describe("B1 trusted reference validators 05A", () => {
  it("binds semester to the selected academic year", () => {
    expect(sql).toContain("s.id=p_semester_id AND y.id=p_academic_year_id");
    expect(sql).toContain("s.status='active' AND y.status='active'");
    expect(sql).toContain("B1_TRUSTED_ACADEMIC_PERIOD_REQUIRED");
  });
  it("requires the student's active course enrollment", () => {
    expect(sql).toContain("e.student_profile_id=p_student_profile_id");
    expect(sql).toContain("e.enrollment_status='enrolled' AND s.status='active'");
    expect(sql).toContain("JOIN public.course_offerings o ON o.id=s.course_offering_id");
    expect(sql).toContain("o.status='active'");
    expect(sql).toContain("B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED");
  });
  it("binds an active target program to its exact department", () => {
    expect(sql).toContain("p.id=p_program_id AND d.id=p_department_id");
    expect(sql).toContain("p.is_active=true AND d.is_active=true");
    expect(sql).toContain("B1_TARGET_PROGRAM_DEPARTMENT_REQUIRED");
  });
  it("is internal-only and has no writes, activation, or financial fields", () => {
    expect(sql.match(/REVOKE ALL ON FUNCTION/g)).toHaveLength(3);
    expect(sql).not.toMatch(/GRANT EXECUTE|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|student_visible|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
