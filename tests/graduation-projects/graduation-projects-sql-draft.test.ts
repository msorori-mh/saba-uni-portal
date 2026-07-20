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
});
