import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const a1 = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql", "utf8");
const a2 = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql", "utf8");
const a3 = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql", "utf8");
const verifier = readFileSync("tests/graduation-projects/postgres-package-a-verifier.sql", "utf8");
const migA1 = readFileSync("supabase/migrations/20260806120000_gp_mvp_package_a1_foundation_01.sql", "utf8");
const migA2 = readFileSync("supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql", "utf8");
const migA3 = readFileSync("supabase/migrations/20260806120200_gp_mvp_package_a3_lifecycle_01.sql", "utf8");

describe("graduation projects Package A SQL drafts", () => {
  test("are explicitly source-only and freeze-aligned", () => {
    for (const sql of [a1, a2, a3]) {
      expect(sql).toContain("DRAFT ONLY");
      expect(sql).toContain("DO NOT APPLY");
      expect(sql).toContain("7b67539a");
    }
    expect(a2).toContain("graduation-projects");
    expect(a2).not.toMatch(/getPublicUrl|publicURL/i);
    expect(a1 + a2 + a3).not.toMatch(/student_visible/);
  });

  test("A1 encodes final_decision separation and MVP invariants", () => {
    expect(a1).toContain("final_decision public.graduation_project_final_decision");
    expect(a1).toContain("'passed','revisions_required','failed'");
    expect(a1).toContain("lifecycle_state");
    expect(a1).toContain("graduation_project_one_leader");
    expect(a1).toContain("graduation_project_one_active_student_team");
    expect(a1).toContain("graduation_project_one_pending_supervisor");
    expect(a1).toContain("is_leader");
    expect(a1).toContain("supervision_status");
    expect(a1).not.toContain("'department_head'");
    expect(a1).not.toContain("'dean'");
    expect((a1.match(/enable row level security/g) ?? []).length).toBe(11);
  });

  test("A2 private bucket contract is PDF-only with upload/finalize/download flow", () => {
    expect(a2).toContain("insert into storage.buckets");
    expect(a2).toContain("'graduation-projects'");
    expect(a2).toContain("application/pdf");
    expect(a2).toContain("create_graduation_project_file_upload_intent");
    expect(a2).toContain("finalize_graduation_project_file");
    expect(a2).toContain("sha256 required at finalize");
    expect(a2).toContain("create_graduation_project_signed_download");
    expect(a2).toContain("cleanup_graduation_project_orphan_storage_contract");
    expect(a2).toContain("expires_in_seconds");
    expect(a2).toContain("graduation_projects_storage_insert");
    expect(a2).toMatch(/no storage\.objects delete/i);
    expect(a2).toContain("idempotent replay payload mismatch");
  });

  test("A3 exposes freeze write/read RPC inventory without title bypass", () => {
    for (const rpc of [
      "create_graduation_project_team",
      "add_graduation_project_team_member",
      "remove_graduation_project_team_member",
      "upsert_graduation_project_proposal",
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
      "list_my_graduation_projects",
      "get_graduation_project_detail",
      "list_administration_graduation_projects_overview",
    ]) {
      expect(a3).toContain(`create function public.${rpc}`);
    }
    expect(a3).toContain("array['coordinator']");
    expect(a3).not.toMatch(/array\[['"]department_head['"]/);
    expect(a3).not.toMatch(/array\[['"]dean['"]/);
    expect(a3).toContain("own_evaluation");
    expect(a3).toContain("evaluation_aggregate");
  });

  test("promoted migrations are marked not applied and match draft bodies", () => {
    for (const mig of [migA1, migA2, migA3]) {
      expect(mig).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(mig).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
    }
    expect(migA1).toContain("create table public.graduation_projects");
    expect(migA2).toContain("graduation-projects");
    expect(migA3).toContain("create_graduation_project_team");
  });

  test("ships executable Package A verifier with positive and core negatives", () => {
    for (const fragment of [
      "PACKAGE_A_VERIFIER_PASS",
      "rollback;",
      "idempotent retry returned a different id",
      "department graduation-project coordinator capability required",
      "exact team leader assignment required",
      "accepted supervisor assignment required",
      "evaluation already submitted",
      "peer evaluations leaked",
      "average score mismatch",
      "archive snapshot incomplete",
      "graduation project events are append-only",
      "has_function_privilege('anon'",
    ]) {
      expect(verifier).toContain(fragment);
    }
    expect(a1 + a2 + a3).not.toMatch(/exception when others/i);
  });
});
