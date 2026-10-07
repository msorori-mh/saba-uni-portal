import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isB1FeeDecisionStep } from "@/lib/student-requests/b1-fee-decision-contract";

const read = (path: string) => readFileSync(path, "utf8");
const workspace = read("src/components/student-requests/b1/B1StaffWorkspace.tsx");

/**
 * The staff-portal workspace («الطلبات الطلابية المسندة») must give the college
 * registrar the fee-decision card on the fee step, exactly like the processing
 * inbox does — never the generic review button, which records no value due.
 */
describe("B1 staff workspace — registrar fee decision card", () => {
  test("the fee step renders the fee-decision card before the generic panel", () => {
    const feeBranch = workspace.indexOf("<B1FeeDecisionCard");
    const genericBranch = workspace.indexOf("<B1EmployeeActionPanel");
    expect(feeBranch).toBeGreaterThan(-1);
    expect(genericBranch).toBeGreaterThan(feeBranch);
    expect(workspace).toContain("isB1FeeDecisionStep(details.serviceCode, details.stepKey)");
  });

  test("the decision goes through the dedicated executor, not a plain review", () => {
    const start = workspace.indexOf("const decideFee");
    const body = workspace.slice(start, workspace.indexOf("// Operational bar counts"));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("adapter.recordB1ExcusedAbsenceFeeDecision(");
    expect(body).not.toContain("actOnB1RequestStep");
    expect(body).toContain("B1_STEP_ID_MISMATCH");
  });

  test("only the registrar fee step of the three services is a fee-decision step", () => {
    expect(isB1FeeDecisionStep("excused_absence", "registrar_fee_referral")).toBe(true);
    expect(isB1FeeDecisionStep("department_transfer", "registrar_fee_decision")).toBe(true);
    expect(isB1FeeDecisionStep("final_chance", "registrar_fee_decision")).toBe(true);
    expect(isB1FeeDecisionStep("excused_absence", "dean_review")).toBe(false);
    expect(isB1FeeDecisionStep("file_withdrawal", "registrar_fee_decision")).toBe(false);
  });
});

describe("SQL drafts — staff view hotfix and multi-course excuse", () => {
  const hotfix = read("docs/migration-drafts/STUDENT-REQUEST-STAFF-VIEW-HOTFIX-01.sql");
  const multi = read("docs/migration-drafts/EXCUSED-ABSENCE-MULTI-COURSE-01.sql");

  test("hotfix accepts the canonical excuse vocabulary and touches no rows", () => {
    expect(hotfix).toContain("'medical', 'family_emergency', 'official', 'other', 'family', 'emergency'");
    expect(hotfix).toContain("'program_name_ar'");
    for (const sql of [hotfix, multi]) {
      expect(sql).not.toMatch(/\b(delete\s+from|truncate|update\s+public\.)/i);
      expect(sql).toContain("EA_MULTI_PATCH_ANCHOR_MISMATCH");
    }
  });

  test("multi-course keeps the primary course and validates every extra one", () => {
    expect(multi).toContain("additional_course_section_ids uuid[] not null default '{}'::uuid[]");
    expect(multi).toContain("perform public.assert_b1_active_course_enrollment(p_student_profile_id, v_id);");
    expect(multi).toContain("from anon, authenticated");
  });
});
