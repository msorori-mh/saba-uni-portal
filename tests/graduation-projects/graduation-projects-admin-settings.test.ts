import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ERROR_LABELS } from "../../src/lib/graduation-projects/rpc";

const migration = readFileSync(
  "docs/migration-drafts/GRADUATION-PROJECTS-M6-ADMIN-SETTINGS.NOT_APPLIED.sql",
  "utf8",
);
const portalFunctions = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");
const reports = readFileSync("src/components/graduation-projects/GraduationProjectReports.tsx", "utf8");
const admin = readFileSync("src/components/graduation-projects/GraduationProjectAdmin.tsx", "utf8");
const client = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");

describe("GP-06 settings contract (M6)", () => {
  test("settings table is deny-by-default with a null-year unique key", () => {
    expect(migration).toContain("create table public.graduation_project_settings");
    expect(migration).toContain("alter table public.graduation_project_settings enable row level security");
    expect(migration).toContain("revoke all on public.graduation_project_settings from anon, authenticated");
    expect(migration).toContain("nulls not distinct");
    expect(migration).not.toContain("grant all on public.graduation_project_settings");
  });

  test("settings administration requires department_head/dean of the department", () => {
    expect(migration).toContain("raise exception 'settings administration assignment required'");
    expect(migration).toContain("raise exception 'settings invalid'");
    expect(migration).toContain("a.role in ('department_head','dean') and p.department_id=p_department_id");
  });

  test("settings enforcement lives inside the existing RPCs", () => {
    expect(migration).toContain("raise exception 'team size limit reached'");
    expect(migration).toContain("raise exception 'team below minimum size'");
    expect(migration).toContain("raise exception 'proposal window closed'");
    expect(migration).toContain("raise exception 'supervisor capacity reached'");
    expect(migration).toContain("raise exception 'co-supervisor not allowed by settings'");
    for (const message of [
      "settings administration assignment required",
      "settings invalid",
      "team size limit reached",
      "team below minimum size",
      "proposal window closed",
      "supervisor capacity reached",
      "co-supervisor not allowed by settings",
      "rubric administration assignment required",
      "rubric payload invalid",
      "rubric not found",
    ]) {
      expect(ERROR_LABELS[message]).toBeTruthy();
    }
  });

  test("rubric management validates criteria and replaces them atomically", () => {
    expect(migration).toContain("raise exception 'rubric payload invalid'");
    expect(migration).toContain("raise exception 'rubric not found'");
    expect(migration).toContain("delete from public.graduation_project_rubric_criteria where rubric_id=v_id and department_id=p_department_id");
    expect(migration).toContain("v_rows<>v_codes or v_rows<>v_seqs");
  });

  test("defense report covers schedule, missing evaluations and distribution", () => {
    expect(migration).toContain("create function public.get_graduation_project_defense_report(p_department_id uuid)");
    expect(migration).toContain("'scheduled_defenses'");
    expect(migration).toContain("'missing_evaluations'");
    expect(migration).toContain("'results_distribution'");
  });
});

describe("GP-06 portal and UI surface", () => {
  test("server functions exist with literal schemas", () => {
    for (const name of [
      "getGraduationProjectSettings",
      "upsertGraduationProjectSettings",
      "listGraduationProjectRubrics",
      "upsertGraduationProjectRubric",
    ]) {
      expect(portalFunctions).toContain(`export const ${name}`);
    }
    expect(portalFunctions).toContain('"defense"');
    expect(portalFunctions).toContain("getDefenseReport");
  });

  test("rpc client wrappers call the exact RPC names", () => {
    expect(client).toContain("upsert_graduation_project_settings");
    expect(client).toContain("upsert_graduation_project_rubric");
    expect(client).toContain("list_graduation_project_rubrics");
    expect(client).toContain("get_graduation_project_defense_report");
  });

  test("admin component renders settings and rubric management without raw ids", () => {
    expect(admin).toContain("gp-save-settings");
    expect(admin).toContain("gp-save-rubric");
    expect(admin).toContain('dir="rtl"');
    expect(/\{[^}]*user_id/.test(admin)).toBe(false);
  });

  test("reports expose the defense tab and CSV export via the existing export utility", () => {
    expect(reports).toContain('value="defense"');
    expect(reports).toContain("المناقشات المجدولة");
    expect(reports).toContain("تقييمات ناقصة");
    expect(reports).toContain("توزيع النتائج");
    expect(reports).toContain('from "../../lib/reports/export"');
    expect(reports.match(/تصدير CSV/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
