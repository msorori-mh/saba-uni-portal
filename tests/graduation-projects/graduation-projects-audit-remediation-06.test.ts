import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const m9 = readFileSync(
  "docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql",
  "utf8",
);

describe("M9 audit remediation draft structure", () => {
  test("is explicitly source-only, forward-only and transaction bounded", () => {
    expect(m9).toContain("NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY");
    expect(m9.startsWith("-- NOT_APPLIED")).toBe(true);
    expect(m9).toContain("begin;");
    expect(m9.trimEnd().endsWith("commit;")).toBe(true);
    expect(m9).toContain(
      "graduation projects M1..M8 missing; apply the reviewed package first",
    );
    expect(m9).toContain(
      "graduation projects audit remediation already exists; refuse ambiguous retry",
    );
  });

  test("F-1: rank boundary is derived from existing roles and fails closed", () => {
    expect(m9).toContain(
      "create function public.graduation_project_assignment_rank(p_role public.graduation_project_assignment_role)",
    );
    expect(m9).toContain("when 'dean' then 60 when 'department_head' then 50 when 'coordinator' then 40");
    expect(m9).toContain("else 0 end");
    expect(m9).toContain(
      "revoke all on function public.graduation_project_assignment_rank(public.graduation_project_assignment_role) from public, anon, authenticated;",
    );
    // strictly-greater authority required
    expect(m9).toContain(
      "if public.graduation_project_assignment_rank(a.role) <= public.graduation_project_assignment_rank(t.role) then",
    );
    expect(m9).toContain("raise exception 'assignment termination authority denied';");
    // actor whitelist unchanged: no dean added, no bypass
    expect(m9).not.toContain("array['coordinator','department_head','dean']");
    expect(m9.toLowerCase()).not.toContain("is_admin");
    expect(m9.toLowerCase()).not.toMatch(/is_dean|is_registrar/);
    // rank check precedes the already-ended no-op return
    expect(m9.indexOf("assignment termination authority denied")).toBeLessThan(
      m9.indexOf("if not t.active then return t.id;"),
    );
  });

  test("F-2: settings and rubric upserts consume correlation id and write one canonical event", () => {
    expect(m9.match(/raise exception 'correlation id required';/g)?.length).toBe(2);
    expect(m9).toContain("event_type='settings_upserted'");
    expect(m9).toContain("event_type='rubric_upserted'");
    expect(m9).toContain("'settings_upserted','graduation_project_settings',v_id,p_correlation_id");
    expect(m9).toContain("'rubric_upserted','graduation_project_rubrics',v_id,p_correlation_id");
    // canonical mechanism extended, not duplicated
    expect(m9).toContain("alter table public.graduation_project_events alter column project_id drop not null;");
    expect(m9).toContain("add column department_id uuid references public.departments(id) on delete restrict");
    expect(m9).toContain("add constraint graduation_project_events_scope check");
    expect(m9).toContain("create unique index graduation_project_events_department_correlation_key");
    expect(m9).not.toContain("create table public.graduation_project_admin");
    expect(m9).not.toContain("create table public.settings_audit");
  });

  test("low findings: F-6 scoped replay, F-7 replay-first, F-9 note ownership", () => {
    // F-6: create replay joined and department-scoped
    expect(m9).toContain("where e.correlation_id=p_correlation_id and e.event_type='project_created'");
    expect(m9).toContain("and p.department_id=p_department_id");
    // F-7: team-member replay before the state gate
    const replayIdx = m9.indexOf("event_type='team_member_added';\n  if new_id is not null then return new_id; end if;");
    const stateIdx = m9.indexOf("if p.state not in ('draft','revision_required') then raise exception 'team mutation state denied'; end if;");
    expect(replayIdx).toBeGreaterThan(-1);
    expect(replayIdx).toBeLessThan(stateIdx);
    // F-9
    expect(m9).toContain("if n.supervisor_assignment_id<>a.id then raise exception 'note ownership required'; end if;");
  });

  test("governance: explicit revokes/grants, pinned search_path, no table grants, no RLS policies, no storage", () => {
    expect(m9.match(/set search_path ?= ?public, ?pg_temp/g)?.length).toBeGreaterThanOrEqual(7);
    expect(m9).not.toContain("grant execute on function public.graduation_project_assignment_rank");
    expect(m9).not.toMatch(/grant .* on public\.graduation_project_events /);
    expect(m9).not.toContain("create policy");
    expect(m9).not.toContain("storage.");
    expect(m9).not.toMatch(/grant [^;]* to public[;,]/);
    for (const fn of [
      "public.end_graduation_project_assignment(uuid,uuid,uuid)",
      "public.upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid)",
      "public.upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid)",
      "public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)",
      "public.add_graduation_project_team_member(uuid,uuid,uuid,uuid)",
      "public.resolve_graduation_project_supervisor_note(uuid,uuid,uuid)",
    ]) {
      expect(m9).toContain(`revoke all on function ${fn} from public, anon;`);
      expect(m9).toContain(`grant execute on function ${fn} to authenticated;`);
    }
  });

  test("no weakening: every replaced RPC keeps its original authorization gate", () => {
    expect(m9).toContain("settings administration assignment required");
    expect(m9).toContain("rubric administration assignment required");
    expect(m9).toContain("project creation assignment required");
    expect(m9).toContain("cannot end own assignment");
    expect(m9.match(/require_graduation_project_assignment/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
