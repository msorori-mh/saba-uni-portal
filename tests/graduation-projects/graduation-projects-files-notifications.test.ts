import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  FILE_KIND_LABELS,
  PROJECT_FILE_KINDS,
} from "../../src/lib/graduation-projects/lifecycle";
import { ERROR_LABELS } from "../../src/lib/graduation-projects/rpc";

const migration = readFileSync(
  "supabase/migrations/20260730100004_ff96c58a-8c93-4abe-9d0f-f0f44fe25a11.sql",
  "utf8",
);
const client = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");
const portalFunctions = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");

describe("GP-05 attachment policy (M5)", () => {
  test("register RPC keeps one identity with a defaulted file_kind", () => {
    expect(migration).toContain(
      "drop function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid);",
    );
    expect(migration).toContain("p_file_kind text default 'attachment'");
    expect(migration).toContain(
      "grant execute on function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text) to authenticated;",
    );
  });

  test("enforces MIME allowlist, size cap and stage binding", () => {
    expect(migration).toContain("raise exception 'file media type not allowed'");
    expect(migration).toContain("if p_byte_size > 52428800 then raise exception 'file size exceeds limit'; end if;");
    expect(migration).toContain("raise exception 'file kind invalid'");
    expect(migration).toContain("raise exception 'file stage binding invalid'");
    expect(migration).toContain("raise exception 'final manuscript must attach to a final milestone submission'");
    expect(migration).toContain("add column file_kind text not null default 'attachment'");
  });

  test("new guarded messages map to Arabic labels", () => {
    for (const message of [
      "file media type not allowed",
      "file size exceeds limit",
      "file kind invalid",
      "file stage binding invalid",
      "final manuscript must attach to a final milestone submission",
    ]) {
      expect(ERROR_LABELS[message]).toBeTruthy();
    }
  });
});

describe("GP-05 notification contract (M5)", () => {
  test("event trigger fans out with dedupe and actor exclusion", () => {
    expect(migration).toContain(
      "create trigger graduation_project_events_notify after insert on public.graduation_project_events",
    );
    expect(migration.match(/on conflict do nothing/g)?.length).toBeGreaterThanOrEqual(10);
    expect(migration).toContain("a.user_id<>new.actor_user_id");
  });

  test("notification types reuse the audited event vocabulary", () => {
    for (const type of [
      "proposal_submitted", "team_member_added", "faculty_assigned", "proposal_revision_required",
      "proposal_approved", "deliverable_submitted", "submission_accepted", "discussion_requested",
      "discussion_scheduled", "panel_member_assigned", "evaluation_finalized", "result_completed",
      "corrections_requested", "correction_accepted", "project_archived",
    ]) {
      expect(migration).toContain(`'${type}'`);
    }
  });

  test("read path is own-rows only; orphan review is service-only", () => {
    expect(migration).toContain("where n.recipient_user_id=auth.uid()");
    expect(migration).toContain(
      "grant execute on function public.list_my_graduation_project_notifications() to authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.list_graduation_project_orphan_files() from public, anon, authenticated;",
    );
  });
});

describe("GP-05 client surface", () => {
  test("rpc client sends p_file_kind and lists own notifications", () => {
    expect(client).toContain("p_file_kind: input.fileKind");
    expect(client).toContain("list_my_graduation_project_notifications");
  });

  test("portal function validates the literal kind enum", () => {
    expect(portalFunctions).toContain('"final_manuscript"');
    expect(portalFunctions).toContain("listMyGraduationProjectNotifications");
  });

  test("every file kind has an Arabic label", () => {
    for (const kind of PROJECT_FILE_KINDS) expect(FILE_KIND_LABELS[kind]).toBeTruthy();
    expect(PROJECT_FILE_KINDS).toContain("final_manuscript");
    expect(PROJECT_FILE_KINDS).toContain("defense_minutes");
  });
});
