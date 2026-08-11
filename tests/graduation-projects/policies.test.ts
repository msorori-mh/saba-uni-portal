import { describe, expect, it } from "bun:test";
import {
  GP_POLICY_DEFAULTS,
  describePolicyScope,
  validateGraduationProjectPolicy,
  type GraduationProjectPolicyDraft,
} from "@/lib/graduation-projects/policies";

const base = (over: Partial<GraduationProjectPolicyDraft> = {}): GraduationProjectPolicyDraft => ({
  ...GP_POLICY_DEFAULTS,
  ...over,
});

describe("validateGraduationProjectPolicy", () => {
  it("accepts the built-in defaults (they mirror kernel behaviour)", () => {
    expect(validateGraduationProjectPolicy(base())).toEqual([]);
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

  it("blocks multiple supervisors when co-supervision is off", () => {
    expect(validateGraduationProjectPolicy(base({ max_supervisors: 2 })).length).toBe(1);
    expect(
      validateGraduationProjectPolicy(base({ max_supervisors: 2, allow_co_supervisor: true })),
    ).toEqual([]);
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
