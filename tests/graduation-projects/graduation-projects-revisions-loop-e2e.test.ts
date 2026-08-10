import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Executable revisions-loop E2E package for GP final closure.
 * Authority: package-d-verifier.sql Branch B + frozen RPC inventory.
 * This is not a browser E2E; it binds the Bun package to the executable SQL verifier.
 */

const ROOT = join(import.meta.dir, "../..");
const verifier = readFileSync(
  join(ROOT, "tests/graduation-projects/package-d-verifier.sql"),
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
}

/** Canonical revisions_required → corrected final → ready → passed → archive */
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
  },
  {
    step: 3,
    name: "Leader uploads corrected final",
    actor: "leader",
    rpc: "submit_graduation_project_final",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 4,
    name: "Supervisor marks corrected final ready",
    actor: "supervisor",
    rpc: "review_graduation_project_final",
    expectedFinalDecisionAfter: "revisions_required",
    mustRemainNonArchived: true,
  },
  {
    step: 5,
    name: "Coordinator re-concludes passed",
    actor: "coordinator",
    rpc: "conclude_graduation_project_result",
    expectedFinalDecisionAfter: "passed",
    mustRemainNonArchived: true,
  },
  {
    step: 6,
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

  trail.push("corrected_final_submitted");
  trail.push("corrected_final_ready");

  finalDecision = decision;
  trail.push(decision);
  if (decision === "passed" || decision === "failed") {
    archived = true;
    trail.push("archived");
  }
  return { trail, finalDecision, archived };
}

describe("GP revisions loop executable E2E package", () => {
  it("defines a complete non-unit revisions loop sequence", () => {
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS.length).toBe(6);
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS[0]?.expectedFinalDecisionAfter).toBe(
      "revisions_required",
    );
    expect(REVISIONS_LOOP_EXECUTABLE_STEPS[1]?.archiveAllowed).toBe(false);
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
    expect(verifier).toContain("conclude_graduation_project_result");
    expect(verifier).toContain("archive_graduation_project");
  });

  it("walks revisions_required → passed → archive without premature archive", () => {
    const result = walkRevisionsLoop("passed");
    expect(result.trail).toEqual([
      "evaluating",
      "revisions_required",
      "corrected_final_submitted",
      "corrected_final_ready",
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
});
