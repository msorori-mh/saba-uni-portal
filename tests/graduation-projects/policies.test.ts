import { describe, expect, it } from "bun:test";
import {
  GP_POLICY_EMPTY_DRAFT,
  describePolicyScope,
  validateDraftPolicy,
  validatePolicyForPublish,
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
  enforce_proposal_window: false,
  enforce_defense_window: false,
};

const base = (over: Partial<GraduationProjectPolicyDraft> = {}): GraduationProjectPolicyDraft => ({
  ...COMPLETE,
  ...over,
});

describe("validateDraftPolicy — INCOMPLETE_DRAFT_SAVE = ALLOW", () => {
  it("accepts a completely empty draft", () => {
    expect(validateDraftPolicy({ ...GP_POLICY_EMPTY_DRAFT })).toEqual([]);
  });

  it("accepts a partially filled draft with undecided windows", () => {
    expect(
      validateDraftPolicy({ ...GP_POLICY_EMPTY_DRAFT, min_team_size: 2, passing_score: 60 }),
    ).toEqual([]);
  });

  it("accepts a window start without an end while still drafting", () => {
    expect(
      validateDraftPolicy({ ...GP_POLICY_EMPTY_DRAFT, proposal_window_start: "2026-01-01" }),
    ).toEqual([]);
  });

  it("still denies structurally invalid values", () => {
    expect(validateDraftPolicy(base({ min_team_size: 4, max_team_size: 2 })).length).toBe(1);
    expect(validateDraftPolicy(base({ min_committee_members: 1 })).length).toBe(1);
    expect(validateDraftPolicy(base({ passing_score: 140 })).length).toBe(1);
    expect(validateDraftPolicy(base({ max_revision_rounds: 9 })).length).toBe(1);
    expect(validateDraftPolicy(base({ allow_co_supervisor: true })).length).toBe(1);
    expect(
      validateDraftPolicy(
        base({ defense_window_start: "2026-05-01", defense_window_end: "2026-04-01" }),
      ).length,
    ).toBe(1);
  });
});

describe("validatePolicyForPublish — INCOMPLETE_PUBLISH = DENY", () => {
  it("accepts a complete policy with both windows explicitly disabled", () => {
    expect(validatePolicyForPublish(base())).toEqual([]);
  });

  it("accepts a complete policy with enforced windows and dates", () => {
    expect(
      validatePolicyForPublish(
        base({
          enforce_proposal_window: true,
          proposal_window_start: "2026-01-01",
          proposal_window_end: "2026-02-01",
        }),
      ),
    ).toEqual([]);
  });

  it("fails closed on an empty draft: academic values plus both window decisions", () => {
    const errors = validatePolicyForPublish({ ...GP_POLICY_EMPTY_DRAFT });
    expect(errors.filter((e) => e.includes("قيمة مطلوبة")).length).toBe(7);
    expect(errors.filter((e) => e.includes("قرار صريح")).length).toBe(2);
  });

  it("requires an explicit decision for each window", () => {
    expect(
      validatePolicyForPublish(base({ enforce_proposal_window: null })).some((e) =>
        e.includes("قرار صريح"),
      ),
    ).toBe(true);
    expect(
      validatePolicyForPublish(base({ enforce_defense_window: null })).some((e) =>
        e.includes("قرار صريح"),
      ),
    ).toBe(true);
  });

  it("requires both dates only when the window is enforced", () => {
    expect(
      validatePolicyForPublish(base({ enforce_defense_window: true })).some((e) =>
        e.includes("تاريخا البداية والنهاية"),
      ),
    ).toBe(true);
    expect(
      validatePolicyForPublish(base({ enforce_defense_window: false })).length,
    ).toBe(0);
  });

  it("ignores stale dates when the window is explicitly disabled", () => {
    expect(
      validatePolicyForPublish(
        base({ enforce_proposal_window: false, proposal_window_start: "2026-01-01" }),
      ),
    ).toEqual([]);
  });

  it("keeps co-supervision deferred (single supervisor only)", () => {
    expect(validatePolicyForPublish(base({ max_supervisors: 2 })).length).toBe(1);
    expect(validatePolicyForPublish(base({ allow_co_supervisor: true })).length).toBe(1);
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
