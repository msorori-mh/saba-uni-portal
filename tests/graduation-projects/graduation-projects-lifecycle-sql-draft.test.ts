import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const legacy = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql", "utf8");
const client = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");

describe("graduation projects legacy lifecycle SQL draft", () => {
  test("is superseded by Package A lifecycle draft", () => {
    expect(legacy).toContain("SUPERSEDED BY PACKAGE A");
    expect(existsSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql")).toBe(true);
    expect(existsSync("tests/graduation-projects/postgres-package-a-verifier.sql")).toBe(true);
  });
});

describe("graduation projects Package B client RPC inventory", () => {
  test("client module follows frozen MVP RPC inventory", () => {
    const frozen = [
      "create_graduation_project_team",
      "add_graduation_project_team_member",
      "remove_graduation_project_team_member",
      "upsert_graduation_project_proposal",
      "register_graduation_project_file",
      "finalize_graduation_project_file",
      "submit_graduation_project_proposal",
      "resubmit_graduation_project_proposal",
      "review_graduation_project_proposal",
      "assign_graduation_project_supervisor",
      "respond_graduation_project_supervision",
      "submit_graduation_project_progress",
      "review_graduation_project_progress",
      "submit_graduation_project_final",
      "review_graduation_project_final",
      "schedule_graduation_project_defense",
      "assign_graduation_project_committee_member",
      "mark_graduation_project_defense_held",
      "submit_graduation_project_evaluation",
      "conclude_graduation_project_result",
      "archive_graduation_project",
      "create_graduation_project_signed_download",
      "list_my_graduation_projects",
      "get_graduation_project_detail",
      "list_administration_graduation_projects_overview",
    ];
    for (const name of frozen) expect(client).toContain(`"${name}"`);
    expect(client).not.toContain(".from(");
    expect(client).toContain("p_correlation_id");
    expect(client).toContain("p_expected_version");
    expect(client).toContain("p_decision");
  });
});
