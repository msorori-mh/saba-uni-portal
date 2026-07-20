import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql", "utf8");

describe("graduation projects SQL draft", () => {
  test("is explicitly source-only and does not create public storage", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
    expect(sql).not.toMatch(/publicURL|student_visible/i);
  });

  test("covers lifecycle, delivery, discussion, evaluation and immutable audit", () => {
    for (const table of [
      "graduation_projects", "graduation_project_assignments", "graduation_project_approvals",
      "graduation_project_milestones", "graduation_project_submissions", "graduation_project_supervisor_notes",
      "graduation_project_files", "graduation_project_discussion_requests", "graduation_project_discussions",
      "graduation_project_panel_members", "graduation_project_evaluations", "graduation_project_evaluation_scores",
      "graduation_project_corrections", "graduation_project_final_archives", "graduation_project_events",
    ]) expect(sql).toContain(`public.${table}`);
    expect(sql).toContain("on delete restrict");
  });

  test("defaults every new surface to deny", () => {
    expect((sql.match(/enable row level security/g) ?? []).length).toBe(15);
    expect(sql).toContain("from anon, authenticated");
    expect(sql).toContain("active direct assignment");
  });

  test("binds actor and evidence rows to the same project", () => {
    expect((sql.match(/references public\.graduation_project_assignments\(id, project_id\)/g) ?? []).length).toBeGreaterThanOrEqual(9);
    for (const binding of [
      "references public.graduation_project_milestones(id, project_id)",
      "references public.graduation_project_submissions(id, project_id)",
      "references public.graduation_project_files(id, project_id)",
      "references public.graduation_project_discussion_requests(id, project_id)",
      "references public.graduation_project_discussions(id, project_id)",
      "references public.graduation_project_panel_members(id, discussion_id, project_id)",
    ]) expect(sql).toContain(binding);
  });

  test("enforces identity shape, append-only audit and locked idempotent archive RPC", () => {
    expect(sql).toContain("assignment_subject_shape");
    expect(sql).toContain("assignment identity/department mismatch");
    expect(sql).toContain("graduation_project_events_append_only");
    expect(sql).toContain("project not archive-ready");
    expect(sql).toContain("m.milestone_kind='final'");
    expect(sql).toContain("correlation_id uuid not null unique");
    expect(sql).toContain("security definer set search_path = public, pg_temp");
  });

  test("is transaction bounded and contains fail-closed readiness/report sources", () => {
    expect(sql.trimStart().indexOf("begin;")).toBeGreaterThan(0);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("refuse ambiguous retry");
    expect(sql).toContain("graduation_project_is_discussion_ready");
    expect(sql).toContain("graduation_project_reporting");
  });
});
