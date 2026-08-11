import { describe, expect, it } from "bun:test";
import {
  GP_POLICY_EMPTY_DRAFT,
  describePolicyScope,
  validateGraduationProjectPolicy,
  type GraduationProjectPolicyDraft,
} from "@/lib/graduation-projects/policies";

/** A fully filled administrative draft — the platform ships no academic defaults. */
const COMPLETE: GraduationProjectPolicyDraft = {
  ...GP_POLICY_EMPTY_DRAFT,
  min_team_size: 1,
  max_team_size: 5,
  required_progress_reports: 1,
  min_committee_members: 2,
  max_committee_members: 5,
  passing_score: 60,
  max_revision_rounds: 2,
};

const base = (over: Partial<GraduationProjectPolicyDraft> = {}): GraduationProjectPolicyDraft => ({
  ...COMPLETE,
  ...over,
});

describe("validateGraduationProjectPolicy", () => {
  it("accepts a fully filled administrative draft", () => {
    expect(validateGraduationProjectPolicy(base())).toEqual([]);
  });

  it("fails closed on an empty draft: every academic value is required", () => {
    const errors = validateGraduationProjectPolicy({ ...GP_POLICY_EMPTY_DRAFT });
    expect(errors.length).toBe(7);
    expect(errors.every((e) => e.includes("قيمة مطلوبة"))).toBe(true);
  });

  it("requires each missing academic value individually", () => {
    const errors = validateGraduationProjectPolicy(base({ passing_score: null }));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("درجة النجاح");
  });

  it("never lets configuration drop the committee below two members", () => {
    const errors = validateGraduationProjectPolicy(base({ min_committee_members: 1 }));
    expect(errors.some((e) => e.includes("عضوين"))).toBe(true);
  });

  it("rejects inverted team and committee bounds", () => {
    expect(
      validateGraduationProjectPolicy(base({ min_team_size: 4, max_team_size: 2 })).length,
    ).toBe(1);
    expect(
      validateGraduationProjectPolicy(base({ min_committee_members: 4, max_committee_members: 3 }))
        .length,
    ).toBe(1);
  });

  it("keeps co-supervision deferred (single supervisor only)", () => {
    expect(validateGraduationProjectPolicy(base({ max_supervisors: 2 })).length).toBe(1);
    expect(
      validateGraduationProjectPolicy(base({ max_supervisors: 2, allow_co_supervisor: true })).length,
    ).toBe(1);
    expect(validateGraduationProjectPolicy(base({ allow_co_supervisor: true })).length).toBe(1);
  });

  it("requires both ends of a window and a correct order", () => {
    expect(
      validateGraduationProjectPolicy(base({ proposal_window_start: "2026-01-01" })).length,
    ).toBe(1);
    expect(
      validateGraduationProjectPolicy(
        base({ defense_window_start: "2026-05-01", defense_window_end: "2026-04-01" }),
      ).length,
    ).toBe(1);
  });

  it("bounds passing score and revision rounds", () => {
    expect(validateGraduationProjectPolicy(base({ passing_score: 140 })).length).toBe(1);
    expect(validateGraduationProjectPolicy(base({ max_revision_rounds: 9 })).length).toBe(1);
  });
});

describe("describePolicyScope", () => {
  it("labels the college-wide default scope", () => {
    expect(describePolicyScope({ department_id: null, academic_year_id: null })).toBe(
      "كل الأقسام — كل الأعوام",
    );
  });

  it("uses resolved names when provided", () => {
    expect(
      describePolicyScope({ department_id: "d", academic_year_id: "y" }, "علوم الحاسوب", "2026"),
    ).toBe("علوم الحاسوب — 2026");
  });
});
