/**
 * GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01 — source contract.
 * Behaviour is proven by the PG chain `graduation-projects-department-head-workflow`
 * (tests/graduation-projects/gp-department-head-workflow-01.pg-verify.sql).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const draft = read("docs/migration-drafts/GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01.sql");
const client = read("src/lib/graduation-projects/head-workflow.ts");
const board = read("src/components/graduation-projects/DepartmentHeadBoard.tsx");
const card = read("src/components/graduation-projects/ProjectWorkflowCard.tsx");
const ci = read(".github/workflows/ci.yml");

const CALLABLE = [
  "student_create_graduation_project_team(uuid)",
  "gp_list_team_candidates(uuid)",
  "gp_add_team_member_by_profile(uuid,uuid,uuid)",
  "gp_submit_team_for_approval(uuid,bigint,uuid)",
  "gp_return_team(uuid,text,bigint,uuid)",
  "gp_approve_team_and_assign_supervisor(uuid,uuid,bigint,uuid)",
  "gp_supervisor_review_proposal(uuid,text,text,bigint,uuid)",
  "gp_project_workflow_status(uuid)",
  "gp_department_projects_overview()",
  "gp_list_supervisor_options()",
] as const;

const INTERNAL = [
  "gp_department_head_user(uuid)",
  "gp_vice_dean_academic_user()",
  "gp_department_manager_faculty(uuid)",
  "gp_set_project_coordinator(uuid,uuid,uuid,uuid)",
  "gp_require_department_manager(uuid)",
] as const;

describe("GP department head workflow 01", () => {
  test("draft is a single transaction and is not a live migration", () => {
    expect(draft).toContain("NOT APPLIED TO PRODUCTION");
    expect(draft.trimEnd().endsWith("commit;")).toBe(true);
    expect(draft).toMatch(/^begin;$/m);
  });

  test("every client-callable RPC is revoked from anon and granted to authenticated only", () => {
    for (const sig of CALLABLE) {
      expect(draft).toContain(`revoke all on function public.${sig} from public, anon;`);
      expect(draft).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
  });

  test("internal helpers are not callable by clients", () => {
    for (const sig of INTERNAL) {
      expect(draft).toContain(
        `revoke all on function public.${sig} from public, anon, authenticated;`,
      );
    }
  });

  test("rules are enforced by triggers, not only by the new RPCs", () => {
    expect(draft).toContain("create trigger tg_gp_enforce_department_head_workflow");
    expect(draft).toContain("graduation project team approval required before proposal");
    expect(draft).toContain("supervisor endorsement required before proposal approval");
    expect(draft).toContain("graduation project team is locked after approval");
  });

  test("supervisor assignment is final and self supervision escalates to the vice dean", () => {
    expect(draft).toContain("'supervisor', sup.id, sup.user_id, p.department_id, 'accepted'");
    expect(draft).toContain("vice dean for academic affairs is not configured");
    expect(draft).toContain("op.code = 'vice_dean_academic'");
  });

  test("client calls RPCs only and never touches GP tables", () => {
    for (const source of [client, board, card]) {
      expect(source).not.toMatch(/\.from\s*\(\s*["']graduation_project/);
    }
    for (const sig of CALLABLE) {
      expect(client).toContain(`"${sig.slice(0, sig.indexOf("("))}"`);
    }
  });

  test("the head board uses pickers, never identifier inputs", () => {
    expect(board).toContain("<select");
    expect(board).not.toMatch(/placeholder=.*(UUID|معرّف|xxxxxxxx)/);
    expect(card).not.toMatch(/placeholder=.*(UUID|معرّف|xxxxxxxx)/);
  });

  test("the PG chain is registered in CI and ends with the verifier", () => {
    expect(ci).toContain("name: graduation-projects-department-head-workflow");
    expect(ci).toContain("docs/migration-drafts/GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01.sql");
    expect(ci).toContain("tests/graduation-projects/gp-department-head-workflow-01.pg-verify.sql");
  });
});
