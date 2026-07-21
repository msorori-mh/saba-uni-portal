import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql", "utf8");
const verifier = readFileSync("tests/graduation-projects/postgres-lifecycle-verifier.sql", "utf8");
const client = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");

const WRITE_RPCS = [
  "create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)",
  "review_graduation_project_proposal(uuid,text,text,bigint,uuid)",
  "resubmit_graduation_project_proposal(uuid,bigint,uuid)",
  "activate_graduation_project(uuid,bigint,uuid)",
  "assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid)",
  "end_graduation_project_assignment(uuid,uuid,uuid)",
  "submit_graduation_project_deliverable(uuid,uuid,text,uuid)",
  "review_graduation_project_submission(uuid,uuid,text,text,uuid)",
  "add_graduation_project_supervisor_note(uuid,uuid,text,uuid)",
  "resolve_graduation_project_supervisor_note(uuid,uuid,uuid)",
  "register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid)",
  "schedule_graduation_project_discussion(uuid,uuid,timestamptz,text,uuid)",
  "reject_graduation_project_discussion_request(uuid,uuid,text,uuid)",
  "assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid)",
  "record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)",
  "save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid)",
  "conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid)",
  "complete_graduation_project_correction(uuid,uuid,uuid)",
  "accept_graduation_project_correction(uuid,uuid,uuid)",
];

const READ_RPCS = [
  "list_my_graduation_projects()",
  "get_graduation_project_detail(uuid)",
  "get_graduation_project_states_report(uuid)",
  "get_graduation_project_assignments_report(uuid)",
  "get_graduation_project_evaluations_report(uuid)",
  "get_graduation_project_archive_report(uuid)",
];

describe("graduation projects lifecycle completion SQL draft", () => {
  test("is explicitly source-only and requires the reviewed foundation", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).toContain("graduation projects foundation missing; apply reviewed foundation first");
    expect(sql).toContain("graduation projects lifecycle completion already exists; refuse ambiguous retry");
    expect(sql.trimStart().indexOf("begin;")).toBeGreaterThan(0);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  test("creates no storage bucket, public URL, table grant, or RLS policy", () => {
    expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
    expect(sql).not.toMatch(/storage\.objects/i);
    expect(sql).not.toMatch(/publicURL|student_visible/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant (select|insert|update|delete)/i);
  });

  test("every new RPC is security definer, revoked from public/anon and granted only to authenticated", () => {
    for (const signature of [...WRITE_RPCS, ...READ_RPCS]) {
      const name = signature.slice(0, signature.indexOf("("));
      expect(sql).toContain(`create function public.${name}(`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
    expect((sql.match(/security definer set search_path ?= ?public ?, ?pg_temp/g) ?? []).length).toBe(25);
  });

  test("write RPCs follow foundation invariants (locks, idempotency, events)", () => {
    expect((sql.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(15);
    expect((sql.match(/correlation_id=p_correlation_id and event_type=/g) ?? []).length).toBeGreaterThanOrEqual(15);
    expect((sql.match(/insert into public\.graduation_project_events/g) ?? []).length).toBeGreaterThanOrEqual(19);
    expect(sql).not.toMatch(/update public\.graduation_project_events/i);
    expect(sql).not.toMatch(/delete from public\.graduation_project_events/i);
    expect((sql.match(/public\.require_graduation_project_assignment\(/g) ?? []).length).toBeGreaterThanOrEqual(15);
  });

  test("file access stays scan-gated and evaluation visibility approval-gated", () => {
    expect(sql).toContain("case when f.scan_state='clean' then f.object_key else null end");
    expect(sql).toContain("case when ff.scan_state='clean' then ff.object_key else null end");
    expect(sql).toContain("v_staff or e.state='finalized'");
    expect(sql).toContain("file object key outside project scope");
  });

  test("client module consumes exactly the drafted RPC surface", () => {
    for (const signature of [...WRITE_RPCS, ...READ_RPCS]) {
      expect(client).toContain(`"${signature.slice(0, signature.indexOf("("))}"`);
    }
    expect(client).not.toContain(".from(");
    expect(client).toContain("p_correlation_id");
  });

  test("verifier is an executable denial/idempotency matrix, not a comment matrix", () => {
    for (const statement of [
      "project creation assignment required",
      "proposal review precondition failed",
      "review reason required",
      "project activation precondition failed",
      "faculty assignment role denied",
      "cannot end own assignment",
      "deliverable submission state denied",
      "revision note required",
      "file object key outside project scope",
      "file metadata invalid",
      "panel assignment precondition failed",
      "discussion outcome precondition failed",
      "evaluation scores invalid",
      "evaluation already submitted",
      "evaluations not finalized",
      "corrections payload invalid",
      "correction acceptance precondition failed",
      "department report assignment required",
      "exact direct processing assignment required",
      "rollback;",
    ]) expect(verifier).toContain(statement);
    expect(verifier).toContain("student saw non-finalized evaluation");
    expect(verifier).toContain("pending-scan file key leaked");
    expect(verifier).toContain("clean file key missing for team");
    expect(verifier).not.toContain("exception when others");
    expect(verifier).toContain("has_function_privilege('anon'");
    expect((verifier.match(/_retry/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  test("verifier walks the full lifecycle: revision loop, corrections loop, reports, archive", () => {
    for (const step of [
      "resubmit_graduation_project_proposal",
      "activate_graduation_project",
      "submit_graduation_project_deliverable",
      "review_graduation_project_submission",
      "register_graduation_project_file",
      "schedule_graduation_project_discussion",
      "record_graduation_project_discussion_outcome",
      "save_graduation_project_evaluation",
      "conclude_graduation_project_result",
      "complete_graduation_project_correction",
      "accept_graduation_project_correction",
      "archive_graduation_project",
      "get_graduation_project_states_report",
      "get_graduation_project_assignments_report",
      "get_graduation_project_evaluations_report",
      "get_graduation_project_archive_report",
      "list_my_graduation_projects",
      "get_graduation_project_detail",
    ]) expect(verifier).toContain(step);
  });
});
