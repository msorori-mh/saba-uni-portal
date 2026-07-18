import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const draftPath = join(root, "docs", "migration-drafts", "TIMETABLE-ANON-READ-HARDENING-01.sql");
const appliedPath = join(root, "supabase", "migrations", "20260531232114_d62ab13e-9bf1-4ecc-844e-839f5168e916.sql");
const draft = readFileSync(draftPath, "utf8");
const applied = readFileSync(appliedPath, "utf8");

describe("TIMETABLE-ANON-READ-HARDENING-01 source contract", () => {
  it("documents the original anonymous grants and policies without editing the applied migration", () => {
    expect(applied).toContain("GRANT SELECT ON public.class_schedule TO anon");
    expect(applied).toContain("CREATE POLICY sch_select_anon ON public.class_schedule");
    expect(applied).toContain("CREATE POLICY cs_select_anon ON public.course_sections");
    expect(applied).toContain("CREATE POLICY co_select_anon ON public.course_offerings");
  });

  for (const table of ["class_schedule", "course_sections", "course_offerings"]) {
    it(`revokes every anonymous table privilege on ${table}`, () => {
      expect(draft).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon;`);
      expect(draft).not.toContain(`GRANT SELECT ON public.${table} TO anon`);
    });
  }

  for (const [policy, table] of [
    ["sch_select_anon", "class_schedule"],
    ["cs_select_anon", "course_sections"],
    ["co_select_anon", "course_offerings"],
  ] as const) {
    it(`removes ${policy} idempotently`, () => {
      expect(draft).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table};`);
    });
  }

  it("is atomic, forward-only, and does not mutate timetable data", () => {
    expect(draft).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(draft).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b\s+(?:INTO\s+|FROM\s+)?public\./i);
    expect(draft).not.toMatch(/\b(?:DROP|ALTER)\s+TABLE\b/i);
  });

  it("does not modify authenticated or service-role privileges in this focused draft", () => {
    const executable = draft.split("COMMIT;")[0];
    expect(executable).not.toMatch(/\b(?:authenticated|service_role)\b/i);
  });

  it("records the authenticated least-privilege follow-up contract", () => {
    expect(draft).toContain("exact student_enrollments.course_section_id");
    expect(draft).toContain("direct faculty");
    expect(draft).toContain("explicitly authorized administrative roles");
    expect(draft).toContain("Do not restore");
  });
});
