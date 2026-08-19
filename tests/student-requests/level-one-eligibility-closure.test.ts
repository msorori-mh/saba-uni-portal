import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyLevelOneRequestTypeRestrictions,
  LEVEL_ONE_REQUEST_DISABLED_REASONS,
} from "../../src/lib/student-requests/level-eligibility";

const ROOT = join(import.meta.dir, "../..");

const rows = [
  {
    code: "enrollment_suspension",
    is_eligible: true,
    is_disabled: false,
    disabled_reason: null,
  },
  {
    code: "department_transfer",
    is_eligible: true,
    is_disabled: false,
    disabled_reason: null,
  },
  {
    code: "final_chance",
    is_eligible: true,
    is_disabled: false,
    disabled_reason: null,
  },
  {
    code: "october_exam_entry_form",
    is_eligible: true,
    is_disabled: false,
    disabled_reason: null,
  },
];

describe("LEVEL1-STUDENT-REQUEST-ELIGIBILITY-CLOSURE-01", () => {
  it("denies suspension and department transfer for level one", () => {
    const restricted = applyLevelOneRequestTypeRestrictions(rows, 1);
    const byCode = Object.fromEntries(restricted.map((row) => [row.code, row]));

    expect(byCode.enrollment_suspension?.is_eligible).toBe(false);
    expect(byCode.enrollment_suspension?.is_disabled).toBe(true);
    expect(byCode.enrollment_suspension?.disabled_reason).toBe(
      LEVEL_ONE_REQUEST_DISABLED_REASONS.enrollment_suspension,
    );

    expect(byCode.department_transfer?.is_eligible).toBe(false);
    expect(byCode.department_transfer?.is_disabled).toBe(true);
    expect(byCode.department_transfer?.disabled_reason).toBe(
      LEVEL_ONE_REQUEST_DISABLED_REASONS.department_transfer,
    );

    expect(byCode.final_chance).toEqual(rows[2]);
    expect(byCode.october_exam_entry_form?.is_eligible).toBe(false);
    expect(byCode.october_exam_entry_form?.is_disabled).toBe(true);
  });

  it("keeps October unavailable for levels two and three", () => {
    for (const level of [2, 3]) {
      const byCode = Object.fromEntries(
        applyLevelOneRequestTypeRestrictions(rows, level).map((row) => [row.code, row]),
      );
      expect(byCode.department_transfer).toEqual(rows[1]);
      expect(byCode.october_exam_entry_form?.is_eligible).toBe(false);
      expect(byCode.october_exam_entry_form?.is_disabled).toBe(true);
    }
  });

  it("allows October and department transfer at level four", () => {
    expect(applyLevelOneRequestTypeRestrictions(rows, 4)).toEqual(rows);
  });

  it("fails closed in both listing and submission server paths", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/student-affairs.functions.ts"),
      "utf8",
    );

    expect(source).toContain(
      "return applyLevelOneRequestTypeRestrictions(",
    );
    expect(source).toContain(
      "const restrictedRows = applyLevelOneRequestTypeRestrictions(rows, levelNumber);",
    );
    expect(source).toContain(
      "await assertStudentEligibleForRequestType(input.sessionClient, input.userId",
    );
    expect(source).toContain(
      "await assertStudentEligibleForRequestType(context.supabase, context.userId",
    );
  });
});
