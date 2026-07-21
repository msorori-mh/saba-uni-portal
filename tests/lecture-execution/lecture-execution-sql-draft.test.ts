import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("docs/drafts/20260722120000_lecture_execution_mvp_01.draft.sql", "utf8");
const verifier = readFileSync("tests/lecture-execution/postgres-foundation-verifier.sql", "utf8");
const minimalSchema = readFileSync("tests/lecture-execution/postgres-minimal-schema.sql", "utf8");

describe("lecture execution SQL draft", () => {
  test("is explicitly source-only and creates no storage or client-visible surfaces", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
    expect(sql).not.toMatch(/publicURL|student_visible/i);
  });

  test("covers the contracted model: weeks, kinds, eight states, dual confirmation", () => {
    for (const table of [
      "lecture_execution_settings",
      "lecture_execution_sessions",
      "lecture_execution_actor_assignments",
      "lecture_execution_confirmations",
      "lecture_execution_events",
    ]) expect(sql).toContain(`create table ${table}`);
    for (const state of [
      "executed", "hindered", "compensated", "cancelled",
      "scheduled", "in_progress", "postponed", "not_started",
    ]) expect(sql).toContain(`'${state}'`);
    expect(sql).toContain("create type lecture_execution_session_kind as enum ('theory', 'practical')");
    expect(sql).toContain("week_no smallint not null check (week_no between 1 and 30)");
    expect(sql).toContain("unique (class_schedule_id, week_no, session_kind)");
    expect(sql).toContain("on delete restrict");
  });

  test("anchors on published schedule slots and legacy sections from the merged contracts", () => {
    expect(sql).toContain("references class_schedule(id)");
    expect(sql).toContain("references course_sections(id)");
    expect(sql).toContain("references academic_levels(id)");
    expect(sql).toContain("references rooms(id)");
    expect(sql).toContain("only published schedule slots can be tracked");
    expect(sql).toContain("schedule slot is not on an active section/offering");
    expect(sql).not.toContain("delivery_group");
    expect(sql).not.toMatch(/section_code\s*[~*]/); // never parse section_code
  });

  test("defaults every surface to deny with RLS and revokes", () => {
    expect((sql.match(/enable row level security/g) ?? []).length).toBe(5);
    expect((sql.match(/revoke all on table lecture_execution_\w+ from anon, authenticated/g) ?? []).length).toBe(5);
    expect(sql).toContain("revoke all on lecture_execution_reporting from anon, authenticated");
    expect(sql).toContain("exact direct processing assignment required");
  });

  test("binds child rows with composite same-department foreign keys", () => {
    expect((sql.match(/references lecture_execution_sessions \(id, department_id\)/g) ?? []).length).toBe(2);
    expect((sql.match(/references lecture_execution_actor_assignments \(id, department_id\)/g) ?? []).length).toBe(2);
    expect((sql.match(/unique \(id, department_id\)/g) ?? []).length).toBe(2);
  });

  test("keeps D-15 delegate confirmation configuration-gated and fail-closed", () => {
    expect(sql).toContain("delegate_confirmation_enabled boolean not null default false");
    expect(sql).toContain("delegate confirmation is not enabled (D-15 pending)");
    expect(sql).toContain("lecture_execution_settings_global_key");
    // Settings are source-owned: no client RPC writes them.
    expect(sql).not.toMatch(/grant execute on function \w*settings\w*/i);
  });

  test("enforces identity shape, transitions, append-only audit and locked RPCs", () => {
    expect(sql).toContain("lecture_execution_assignment_subject_shape");
    expect(sql).toContain("lecture-execution assignment identity/department mismatch");
    expect(sql).toContain("lecture_execution_events_append_only");
    expect(sql).toContain("lecture_execution_transition_allowed");
    expect((sql.match(/security definer/g) ?? []).length).toBe(3);
    expect((sql.match(/set search_path = public, pg_temp/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("grant execute on function record_lecture_execution(uuid, smallint, lecture_execution_session_kind, lecture_execution_state, text, uuid) to authenticated");
    expect(sql).toContain("grant execute on function confirm_lecture_execution(uuid, text, text, uuid) to authenticated");
    expect(sql).toContain("revoke all on function require_lecture_execution_assignment(uuid, lecture_execution_actor_role[]) from public, anon, authenticated");
  });

  test("is transaction bounded and refuses ambiguous retries", () => {
    expect(sql.trimStart().indexOf("begin;")).toBeGreaterThan(0);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("ambiguous retry");
    expect(sql).toContain("security_invoker = true");
  });

  test("ships an executable PostgreSQL denial/idempotency verifier, not a comment matrix", () => {
    for (const statement of [
      "wrong-role assignment unexpectedly allowed",
      "wrong-owner assignment unexpectedly allowed",
      "exact direct processing assignment required",
      "delegate confirmation is not enabled (D-15 pending)",
      "session is not awaiting delegate confirmation",
      "a rejection note is required",
      "invalid execution transition: not_started -> executed",
      "invalid execution transition: executed -> scheduled",
      "idempotent retry returned a different id",
      "audit is not exactly once",
      "update public.lecture_execution_events",
      "delete from public.lecture_execution_events",
      "rollback;",
    ]) expect(verifier).toContain(statement);
    expect(verifier).toContain("denial had side effects");
    expect(verifier).not.toContain("exception when others");
    expect((verifier.match(/pg_temp\.expect_fk\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((verifier.match(/pg_temp\.expect_le_error\(/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect((verifier.match(/\\quit 1/g) ?? []).length).toBe(7);
    expect(verifier).toContain("has_function_privilege('anon'");
    expect(verifier).toContain("RPC matrices above exercise");
  });

  test("fixture schema provides every table the draft references", () => {
    for (const table of [
      "departments", "academic_levels", "academic_years", "semesters", "courses",
      "course_offerings", "course_sections", "class_schedule", "rooms", "time_slots",
      "faculty_profiles", "student_profiles",
    ]) expect(minimalSchema).toContain(`create table public.${table}(`);
    expect(minimalSchema).toContain("'published'");
    expect(minimalSchema).toContain("'lecture'");
  });
});
