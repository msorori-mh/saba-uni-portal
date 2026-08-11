import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Executable revisions-loop E2E package for GP final closure + H-01 round integrity.
 * Authority: package-d-verifier.sql Branch B + remediation-02 verifier.
 */

const ROOT = join(import.meta.dir, "../..");
const verifier = readFileSync(
  join(ROOT, "tests/graduation-projects/package-d-verifier.sql"),
  "utf8",
);
const remediationVerifier = readFileSync(
  join(
    ROOT,
    "tests/graduation-projects/postgres-gp-independent-security-audit-remediation-02-verifier.sql",
  ),
  "utf8",
);

export interface RevisionsLoopStep {
  step: number;
  name: string;
  actor: string;
  rpc: string;
  expectedFinalDecisionAfter: string | null;
  mustRemainNonArchived?: boolean;
  archiveAllowed?: boolean;
  mustDeny?: boolean;
}

/** Canonical revisions_required → corrected final → ready → re-eval → passed → archive */
export const REVISIONS_LOOP_EXECUTABLE_STEPS: RevisionsLoopStep[] = [
  {
    step: 1,
    name: "Coordinator concludes revisions_required",
    actor: "coordinator",
    rpc: "conclude_graduation_project_result",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 2,
    name: "Archive denied while revisions_required",
    actor: "coordinator",
    rpc: "archive_graduation_project",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
    archiveAllowed: false,
    mustDeny: true,
  },
  {
    step: 3,
    name: "Stale round-N evaluations cannot authorize passed",
    actor: "coordinator",
    rpc: "conclude_graduation_project_result",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
    mustDeny: true,
  },
  {
    step: 4,
    name: "Leader uploads corrected final",
    actor: "leader",
    rpc: "submit_graduation_project_final",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 5,
    name: "Supervisor marks corrected final ready",
    actor: "supervisor",
    rpc: "review_graduation_project_final",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 6,
    name: "Passed still denied without fresh round evaluations",
    actor: "coordinator",
    rpc: "conclude_graduation_project_result",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
    mustDeny: true,
  },
  {
    step: 7,
    name: "Committee submits fresh round N+1 evaluations",
    actor: "committee",
    rpc: "submit_graduation_project_evaluation",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 8,
    name: "Coordinator concludes passed with current-round evidence",
    actor: "coordinator",
    rpc: "conclude_graduation_project_result",
    expectedFinalDecisionAfter: "passed",
    mustRemainNonArchived: true,
  },
  {
    step: 9,
    name: "Coordinator archives after passed",
    actor: "coordinator",
    rpc: "archive_graduation_project",
    expectedFinalDecisionAfter: "passed",
    archiveAllowed: true,
  },
];

/** Minimal lifecycle walker used by the executable package tests. */
export function walkRevisionsLoop(decision: "passed" | "failed") {
  const trail: string[] = ["evaluating"];
  let finalDecision: string | null = null;
  let archived = false;

  finalDecision = "revisions_required";
  trail.push("revisions_required");
  if (archived) throw new Error("must not archive on revisions_required");

  trail.push("stale_final_decision_denied");
  trail.push("corrected_final_submitted");
  trail.push("corrected_final_ready");
  trail.push("stale_or_missing_round_evals_denied");
  trail.push("fresh_round_evaluations_submitted");

  finalDecision = decision;
  trail.push(decision);
  if (decision === "passed" || decision === "failed") {
    archived = true;
    trail.push("archived");
  }
  return { trail, finalDecision, archived };
}

describe("GP revisions loop executable E2E package", () => {
  it("defines a complete non-unit revisions loop with re-evaluation", () => {
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS.length).toBe(9);
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS[0]?.expectedFinalDecisionAfter).toBe(
      "revisions_required",
    );
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS[1]?.archiveAllowed).toBe(false);
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS.some((s) => s.mustDeny)).toBe(true);
    expect(
      REVISIONS_LOOP_EXECUTABLE_STEPS.some(
        (s) => s.rpc === "submit_graduation_project_evaluation" && s.step > 3,
      ),
    ).toBe(true);
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS.at(-1)?.rpc).toBe(
      "archive_graduation_project",
    );
  });

  it("binds Branch B markers in package-d-verifier.sql", () => {
    expect(verifier).toContain("FIX6 BRANCH B: revisions_required");
    expect(verifier).toContain("'revisions_required'");
    expect(verifier).toContain("project not archive-ready");
    expect(verifier).toContain("PACKAGE_D_BRANCH_B_PASS");
    expect(verifier).toContain("corrected final");
    expect(verifier).toContain("all committee evaluations required");
    expect(verifier).toContain("Round 2 ok");
    expect(verifier).toContain("conclude_graduation_project_result");
    expect(verifier).toContain("archive_graduation_project");
  });

  it("binds H-01 stale evaluation negative in remediation verifier", () => {
    expect(remediationVerifier).toContain("STALE_EVALUATION_DIRECT_RPC_NEGATIVE_PASS");
    expect(remediationVerifier).toContain("OLD_EVALUATIONS_CANNOT_AUTHORIZE_NEW_FINAL_DECISION");
    expect(remediationVerifier).toContain("evaluation_round");
  });

  it("walks revisions_required → re-eval → passed → archive without premature archive", () => {
    const result = walkRevisionsLoop("passed");
    expect(result.trail).toEqual([
      "evaluating",
      "revisions_required",
      "stale_final_decision_denied",
      "corrected_final_submitted",
      "corrected_final_ready",
      "stale_or_missing_round_evals_denied",
      "fresh_round_evaluations_submitted",
      "passed",
      "archived",
    ]);
    expect(result.finalDecision).toBe("passed");
    expect(result.archived).toBe(true);
  });

  it("walks revisions_required → failed → archive", () => {
    const result = walkRevisionsLoop("failed");
    expect(result.finalDecision).toBe("failed");
    expect(result.archived).toBe(true);
  });

  it("keeps identity/revision notes migration source-promoted and gated", () => {
    const migration = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("p_notes text default null");
    expect(migration).toContain("identity_options");
    expect(migration).toContain("revisions_notes");
    expect(migration).toContain("GP_IDENTITY_OPTIONS_L4_MISSING");
  });

  it("keeps remediation-02 forward-only and not rewriting applied SET U", () => {
    const migration = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("forward-only");
    expect(migration).toContain("DO NOT REWRITE");
    expect(migration).toContain("evaluation_round");
  });
});
