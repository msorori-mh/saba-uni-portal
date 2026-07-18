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
    it(`revokes every anonymous and PUBLIC table privilege on ${table}`, () => {
      expect(draft).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon;`);
      expect(draft).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC;`);
      expect(draft).not.toContain(`GRANT SELECT ON public.${table} TO anon`);
    });
  }

  for (const [policy, table] of [
    ["sch_select_anon", "class_schedule"],
    ["cs_select_anon", "course_sections"],
    ["co_select_anon", "course_offerings"],
  ] as const) {
    it(`requires and removes the exact reviewed ${policy} policy`, () => {
      expect(draft).toContain(`('${policy}', '${table}')`);
      expect(draft).toContain(`DROP POLICY ${policy} ON public.${table};`);
    });
  }

  it("is atomic, forward-only, and does not mutate timetable data", () => {
    expect(draft).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(draft).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b\s+(?:INTO\s+|FROM\s+)?public\./i);
    expect(draft).not.toMatch(/\b(?:DROP|ALTER)\s+TABLE\b/i);
  });

  it("fails on missing, renamed, or unexpected anon-applicable policies", () => {
    expect(draft).toContain("TIMETABLE_ANON_POLICY_INVENTORY_MISSING_OR_RENAMED");
    expect(draft).toContain("TIMETABLE_ANON_UNEXPECTED_APPLICABLE_POLICY");
    expect(draft).toContain("pg_catalog.pg_has_role('anon'");
    expect(draft).toContain("lower(granted_role.role_name::text) = 'public'");
  });

  it("post-verifies every effective anon table privilege and SELECT policy", () => {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(draft).toContain(`'${privilege}'`);
    }
    expect(draft).toContain("TIMETABLE_ANON_EFFECTIVE_PRIVILEGE_REMAINS");
    expect(draft).toContain("TIMETABLE_ANON_EFFECTIVE_SELECT_POLICY_REMAINS");
  });

  it("guards authenticated and service-role compatibility before and after", () => {
    expect(draft).not.toMatch(/REVOKE[^;]+FROM (?:authenticated|service_role)/i);
    expect(draft).toContain("TIMETABLE_AUTHENTICATED_BASELINE_MISMATCH");
    expect(draft).toContain("TIMETABLE_SERVICE_ROLE_BASELINE_MISMATCH");
    expect(draft).toContain("TIMETABLE_AUTHENTICATED_PRIVILEGE_CHANGED");
    expect(draft).toContain("TIMETABLE_SERVICE_ROLE_PRIVILEGE_CHANGED");
  });

  it("checks one exact privilege per has_table_privilege call", () => {
    expect(draft.split("has_table_privilege('authenticated', format('public.%I', v_table), v_privilege)")).toHaveLength(3);
    expect(draft.split("has_table_privilege('service_role', format('public.%I', v_table), v_privilege)")).toHaveLength(3);
    expect(draft).toContain("has_table_privilege('anon', format('public.%I', v_table), v_privilege)");
    expect(draft).not.toMatch(/has_table_privilege\([^)]*'(?:SELECT|INSERT|UPDATE|DELETE),/);
  });

  it("covers authenticated four and service-role seven privileges in both phases", () => {
    const authenticatedSet = "ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']";
    const serviceSet = "ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']";
    expect(draft.split(authenticatedSet)).toHaveLength(3);
    // preflight service-role, postverify anon-denial, postverify service-role
    expect(draft.split(serviceSet)).toHaveLength(4);
    expect(draft.split("FOREACH v_table IN ARRAY ARRAY['class_schedule', 'course_sections', 'course_offerings'] LOOP").length).toBeGreaterThanOrEqual(3);
  });

  it("records the authenticated least-privilege follow-up contract", () => {
    expect(draft).toContain("exact student_enrollments.course_section_id");
    expect(draft).toContain("direct faculty");
    expect(draft).toContain("explicitly authorized administrative roles");
    expect(draft).toContain("Do not restore");
  });
});
