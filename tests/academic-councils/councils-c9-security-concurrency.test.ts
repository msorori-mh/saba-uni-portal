/**
 * Deterministic two-connection concurrency proofs for C9 security closure.
 * Uses committed fixtures + lock-step FOR UPDATE barriers (no timing-only races).
 */
import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = process.cwd();
const container = `councils-c9-conc-${Date.now()}`;
const work = join(tmpdir(), container);
mkdirSync(work, { recursive: true });

const COUNCIL = "c1000000-0000-0000-0000-000000000001";
const CHAIR = "a1000000-0000-0000-0000-000000000011";
const SECRETARY = "a1000000-0000-0000-0000-000000000013";
const MEM_A = "a1000000-0000-0000-0000-000000000014";
const MEM_B = "a1000000-0000-0000-0000-000000000018";
const MEM_C = "a1000000-0000-0000-0000-000000000019";
const ADMIN = "a1000000-0000-0000-0000-000000000002";
const MEMBERSHIP_REVOKE = "11000000-0000-0000-0000-000000000018";

const paths = {
  minimal: join(root, "tests/academic-councils/postgres-minimal-schema.sql"),
  create: join(root, "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql"),
  harden: join(root, "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql"),
  history: join(root, "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql"),
  schedule: join(root, "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql"),
  c0: join(root, "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql"),
  c1: join(root, "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql"),
  c2: join(root, "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql"),
  c3: join(root, "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql"),
  c4: join(root, "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql"),
  c5: join(root, "supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql"),
  c6: join(root, "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql"),
  c7: join(root, "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql"),
  closure: join(root, "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql"),
  c9: join(root, "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql"),
};

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardown() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}`.trim() };
}

function psqlFile(filePath: string) {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

function openSession(): {
  write: (sql: string) => void;
  waitFor: (marker: string, ms?: number) => Promise<string>;
  close: () => void;
  buffer: () => string;
} {
  const child = spawn(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-t", "-A"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
  });
  child.stderr.on("data", (d) => {
    buf += d.toString();
  });
  // Docker/psql may close stdin immediately after a deliberate SQL rejection.
  // Capture EPIPE as session output instead of letting the stream emit an
  // unhandled process-level error; the state assertions below remain the
  // authoritative concurrency proof.
  child.stdin.on("error", (error: NodeJS.ErrnoException) => {
    buf += `\nSESSION_STDIN_ERROR:${error.code ?? "UNKNOWN"}:${error.message}\n`;
  });
  return {
    write(sql: string) {
      if (!child.stdin.writable || child.stdin.destroyed || child.stdin.writableEnded) {
        buf += "\nSESSION_STDIN_CLOSED\n";
        return;
      }
      try {
        child.stdin.write(sql.endsWith("\n") ? sql : sql + "\n", (error) => {
          if (error) {
            const e = error as NodeJS.ErrnoException;
            buf += `\nSESSION_STDIN_WRITE_ERROR:${e.code ?? "UNKNOWN"}:${e.message}\n`;
          }
        });
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        buf += `\nSESSION_STDIN_WRITE_THROW:${e.code ?? "UNKNOWN"}:${e.message}\n`;
      }
    },
    async waitFor(marker: string, ms = 15000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (buf.includes(marker)) return buf;
        await Bun.sleep(50);
      }
      throw new Error(`timeout waiting for ${marker}\nBUF:\n${buf}`);
    },
    close() {
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
    buffer: () => buf,
  };
}

function fixtureVal(key: string): string {
  const r = psql(`select v::text from public._c9_conc_fixture where k = '${key}';`);
  if (!r.ok) throw new Error(`fixture read failed ${key}:\n${r.out}`);
  const v = r.out.split("\n").filter(Boolean).pop()?.trim();
  if (!v) throw new Error(`fixture missing ${key}`);
  return v;
}

function notifFp(notificationId: string): string {
  const r = psql(`
select md5(id::text || coalesce(is_read::text,'') || coalesce(read_at::text,''))::text
from public.academic_council_notifications where id = '${notificationId}';
`);
  if (!r.ok) throw new Error(`notif fp failed:\n${r.out}`);
  return r.out.split("\n").filter(Boolean).pop()!.trim();
}

function minutesFp(meetingId: string): string {
  const r = psql(`
select coalesce(fingerprint, md5(coalesce(body,'')))::text
from public.academic_council_minutes where meeting_id = '${meetingId}';
`);
  if (!r.ok) throw new Error(`minutes fp failed:\n${r.out}`);
  return r.out.split("\n").filter(Boolean).pop()!.trim();
}

afterAll(() => teardown());

describe("C9 security deterministic concurrency", () => {
  it("proves notification, archive, vote, and minutes races with two connections", async () => {
    if (!dockerReady) throw new Error("docker required");
    teardown();
    execSync(`docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`, {
      stdio: "ignore",
    });
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);

    const pipeline = [
      paths.minimal,
      paths.create,
      paths.harden,
      paths.history,
      paths.schedule,
      paths.c0,
      paths.c1,
      paths.c2,
      paths.c3,
      paths.c4,
      paths.c5,
      paths.c6,
      paths.c7,
      paths.closure,
      paths.c9,
    ];
    for (const p of pipeline) {
      let r = psqlFile(p);
      if (!r.ok) {
        await Bun.sleep(1000);
        r = psqlFile(p);
      }
      if (!r.ok) throw new Error(`apply failed ${p}:\n${r.out}`);
    }

    expect(
      psql(`
create table if not exists public._c9_conc_fixture(k text primary key, v uuid);
truncate public._c9_conc_fixture;
grant select, insert, update, delete on public._c9_conc_fixture to authenticated, service_role;

insert into public.academic_councils (id, name, council_type, created_by) values
  ('${COUNCIL}', 'C9 Conc Council', 'college', '${ADMIN}')
on conflict do nothing;
insert into public.academic_council_members (id, council_id, user_id, member_role, is_active, active_from, created_by) values
  ('11000000-0000-0000-0000-000000000011', '${COUNCIL}', '${CHAIR}', 'chair', true, current_date, '${ADMIN}'),
  ('11000000-0000-0000-0000-000000000013', '${COUNCIL}', '${SECRETARY}', 'secretary', true, current_date, '${ADMIN}'),
  ('11000000-0000-0000-0000-000000000014', '${COUNCIL}', '${MEM_A}', 'member', true, current_date, '${ADMIN}'),
  ('11000000-0000-0000-0000-000000000018', '${COUNCIL}', '${MEM_B}', 'member', true, current_date, '${ADMIN}'),
  ('11000000-0000-0000-0000-000000000019', '${COUNCIL}', '${MEM_C}', 'member', true, current_date, '${ADMIN}')
on conflict do nothing;

select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
select public.council_approve_quorum_policy(
  '${COUNCIL}', 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5
);
reset role;
`).ok,
    ).toBe(true);

    // Seed chair notification for acknowledge race (probe b)
    const ackPrep = psql(`
select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
do $$
declare
  v_meeting uuid;
  v_notif uuid;
begin
  v_meeting := ((public.council_schedule_meeting(
    '${COUNCIL}', 'C9AckPrep', now() + interval '4 days', null, now() - interval '1 hour', now() + interval '1 day'
  ))->>'meeting_id')::uuid;
  insert into public._c9_conc_fixture values ('ack_meeting', v_meeting);
  select id into v_notif from public.academic_council_notifications
  where user_id = '${CHAIR}' and meeting_id = v_meeting and event_type = 'meeting_scheduled'
  limit 1;
  if v_notif is null then raise exception 'ACK_PREP_NOTIF_MISSING'; end if;
  insert into public._c9_conc_fixture values ('ack_notif', v_notif);
end $$;
reset role;
`);
    if (!ackPrep.ok) throw new Error(`ack prep failed:\n${ackPrep.out}`);

    const notifId = fixtureVal("ack_notif");
    const fpBeforeAck = notifFp(notifId);

    // ---- (a) notification dispatch vs membership revocation ----
    const holdMember = openSession();
    const scheduleRace = openSession();
    try {
      holdMember.write(`
begin;
select id from public.academic_council_members where id = '${MEMBERSHIP_REVOKE}' for update;
select 'MEMBER_HELD';
`);
      await holdMember.waitFor("MEMBER_HELD");

      scheduleRace.write(`
begin;
select 'SCHEDULE_ENTER';
select id from public.academic_council_members where id = '${MEMBERSHIP_REVOKE}' for update;
select 'MEMBER_LOCKED';
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
set local role authenticated;
select public.council_schedule_meeting(
  '${COUNCIL}', 'C9RevokeRace', now() + interval '5 days', null, now() - interval '1 hour', now() + interval '1 day'
);
select 'SCHEDULE_DONE';
`);
      await scheduleRace.waitFor("SCHEDULE_ENTER");

      holdMember.write(`
update public.academic_council_members
  set is_active = false, active_to = current_date, updated_at = now()
  where id = '${MEMBERSHIP_REVOKE}';
commit;
select 'REVOKED';
`);
      await holdMember.waitFor("REVOKED");
      await scheduleRace.waitFor("SCHEDULE_DONE", 20000);
      scheduleRace.write("commit;\nselect 'SCHEDULE_COMMITTED';\n");
      await scheduleRace.waitFor("SCHEDULE_COMMITTED");
    } finally {
      holdMember.close();
      scheduleRace.close();
    }

    const revokeMeeting = psql(`
select id::text from public.academic_council_meetings
where council_id = '${COUNCIL}' and title = 'C9RevokeRace'
order by created_at desc limit 1;
`);
    expect(revokeMeeting.ok).toBe(true);
    const revokeMeetingId = revokeMeeting.out.split("\n").filter(Boolean).pop()!.trim();
    expect(revokeMeetingId).toMatch(/^[0-9a-f-]{36}$/i);

    const revokedNotifs = psql(`
select count(*)::text from public.academic_council_notifications
where user_id = '${MEM_B}' and meeting_id = '${revokeMeetingId}' and event_type = 'meeting_scheduled';
`);
    expect(revokedNotifs.out.trim()).toBe("0");

    const activeNotifs = psql(`
select count(*)::text from public.academic_council_notifications
where meeting_id = '${revokeMeetingId}' and event_type = 'meeting_scheduled';
`);
    expect(Number(activeNotifs.out.trim())).toBeGreaterThanOrEqual(4);

    // Restore revoked member for downstream probes
    expect(
      psql(`
update public.academic_council_members
  set is_active = true, active_to = null, updated_at = now()
  where id = '${MEMBERSHIP_REVOKE}';
`).ok,
    ).toBe(true);

    // ---- (b) notification acknowledgement race ----
    const holdNotif = openSession();
    const ackRace = openSession();
    try {
      holdNotif.write(`
begin;
select id from public.academic_council_notifications where id = '${notifId}' for update;
select 'NOTIF_HELD';
`);
      await holdNotif.waitFor("NOTIF_HELD");

      ackRace.write(`
begin;
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
set local role authenticated;
select 'ACK2_STARTED';
select public.acknowledge_council_notification('${notifId}');
select 'ACK2_DONE';
`);
      await ackRace.waitFor("ACK2_STARTED");

      holdNotif.write(`
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
set local role authenticated;
select public.acknowledge_council_notification('${notifId}');
reset role;
commit;
select 'ACK1_COMMITTED';
`);
      await holdNotif.waitFor("ACK1_COMMITTED");

      let ack2Outcome = "";
      try {
        ack2Outcome = await ackRace.waitFor("ACK2_DONE", 8000);
      } catch {
        ack2Outcome = ackRace.buffer();
      }
      if (ack2Outcome.includes("ACK2_DONE")) {
        ackRace.write("commit;\n");
      } else {
        expect(ack2Outcome.toLowerCase()).toMatch(/not_found|access_denied|error/);
        ackRace.write("rollback;\n");
      }
    } finally {
      holdNotif.close();
      ackRace.close();
    }

    const readState = psql(`
select is_read::text, count(*)::text
from public.academic_council_notifications where id = '${notifId}'
group by is_read;
`);
    expect(readState.out).toContain("t");
    expect(readState.out).toMatch(/\|1$/);
    const fpAfterAck = notifFp(notifId);
    expect(fpAfterAck).toMatch(/^[0-9a-f]{32}$/i);
    expect(fpAfterAck).not.toBe(fpBeforeAck.replace(/[^0-9a-f]/gi, ""));

    // Prep minutes_locked meeting + open decision for archive races (c, d) and locked minutes (f)
    const archivePrep = psql(`
select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
do $$
declare
  v_council uuid := '${COUNCIL}';
  v_chair uuid := '${CHAIR}';
  v_sec uuid := '${SECRETARY}';
  v_mem_a uuid := '${MEM_A}';
  v_mem_b uuid := '${MEM_B}';
  v_mem_c uuid := '${MEM_C}';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_dec uuid;
  v_res jsonb;
begin
  v_res := public.council_schedule_meeting(
    v_council, 'C9ArchiveRace', now() + interval '6 days', null, now() - interval '1 hour', now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting, 'scheduled', 'intake_open', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'ArchiveTopic', 'Body');
  v_topic := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic, 'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting, 'intake_open', 'intake_closed', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(v_meeting, 'intake_closed', 'agenda_ready', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.finalize_council_meeting_attendance(v_meeting);
  perform public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.open_agenda_item_vote(v_item);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  perform public.cast_council_vote(v_item, 'yes');
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.cast_council_vote(v_item, 'yes');
  perform set_config('request.jwt.claim.sub', v_mem_b::text, true);
  perform public.cast_council_vote(v_item, 'no');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.cast_council_vote(v_item, 'abstain');
  perform public.close_agenda_item_vote(v_item);
  perform public.calculate_agenda_item_result(v_item);
  perform public.resolve_agenda_item(v_item, 'approved');
  perform public.close_council_session(v_meeting);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.draft_council_minutes(v_meeting, 'C9 archive race minutes body');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.approve_and_lock_council_minutes(v_meeting, 'C9 archive race minutes body locked');
  v_res := public.issue_council_decision(v_meeting, v_item, 'C9 Decision', 'Body', v_mem_a, null, null);
  v_dec := (v_res->>'decision_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  perform public.update_council_decision_followup(v_dec, 'in_progress', 'started');
  delete from public._c9_conc_fixture where k in ('archive_meeting', 'archive_decision', 'locked_minutes_meeting');
  insert into public._c9_conc_fixture values
    ('archive_meeting', v_meeting),
    ('archive_decision', v_dec),
    ('locked_minutes_meeting', v_meeting);
end $$;
reset role;
`);
    if (!archivePrep.ok) throw new Error(`archive prep failed:\n${archivePrep.out}`);

    const archiveMeetingId = fixtureVal("archive_meeting");
    const archiveDecisionId = fixtureVal("archive_decision");
    const lockedMinutesMeetingId = fixtureVal("locked_minutes_meeting");
    const lockedFpBefore = minutesFp(lockedMinutesMeetingId);

    // ---- (c) decision follow-up vs archive ----
    const followStateBefore = psql(`
select status::text, coalesce(execution_note,'') as note
from public.academic_council_decisions where id = '${archiveDecisionId}';
`);
    expect(followStateBefore.ok).toBe(true);
    expect(followStateBefore.out).toContain("in_progress");

    const holdArchive = openSession();
    const followRace = openSession();
    try {
      holdArchive.write(`
begin;
select id from public.academic_council_meetings where id = '${archiveMeetingId}' for update;
select 'ARCHIVE_HELD';
`);
      await holdArchive.waitFor("ARCHIVE_HELD");

      followRace.write(`
begin;
select set_config('request.jwt.claim.sub', '${MEM_A}', true);
set local role authenticated;
select 'FOLLOW_STARTED';
select public.update_council_decision_followup('${archiveDecisionId}', 'blocked', 'race attempt');
select 'FOLLOW_DONE';
`);
      await followRace.waitFor("FOLLOW_STARTED");

      holdArchive.write(`
select set_config('request.jwt.claim.sub', '${MEM_A}', true);
set local role authenticated;
select public.complete_council_decision('${archiveDecisionId}', 'completed for archive');
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
select public.archive_council_meeting('${archiveMeetingId}');
reset role;
commit;
select 'ARCHIVE_COMMITTED';
`);
      await holdArchive.waitFor("ARCHIVE_COMMITTED");

      let followOutcome = "";
      try {
        followOutcome = await followRace.waitFor("FOLLOW_DONE", 8000);
      } catch {
        followOutcome = followRace.buffer();
      }
      expect(followOutcome).not.toMatch(/FOLLOW_DONE/);
      expect(followOutcome.toLowerCase()).toMatch(/archived|immutable|error|denied|not_found|invalid|illegal/);
      followRace.write("rollback;\n");
    } finally {
      holdArchive.close();
      followRace.close();
    }

    const followFinal = psql(`
select status::text, execution_note from public.academic_council_decisions where id = '${archiveDecisionId}';
`);
    expect(followFinal.out).toContain("completed");
    expect(followFinal.out).toContain("completed for archive");
    expect(followFinal.out).not.toContain("race attempt");

    const archivedStatus = psql(
      `select status::text from public.academic_council_meetings where id = '${archiveMeetingId}';`,
    );
    expect(archivedStatus.out).toContain("archived");

    // ---- (d) decision completion vs archive ----
    const completePrep = psql(`
select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
do $$
declare
  v_council uuid := '${COUNCIL}';
  v_chair uuid := '${CHAIR}';
  v_sec uuid := '${SECRETARY}';
  v_mem_a uuid := '${MEM_A}';
  v_mem_b uuid := '${MEM_B}';
  v_mem_c uuid := '${MEM_C}';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_dec uuid;
  v_res jsonb;
begin
  v_res := public.council_schedule_meeting(
    v_council, 'C9CompleteRace', now() + interval '7 days', null, now() - interval '1 hour', now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting, 'scheduled', 'intake_open', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'CompleteTopic', 'Body');
  v_topic := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic, 'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting, 'intake_open', 'intake_closed', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(v_meeting, 'intake_closed', 'agenda_ready', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.finalize_council_meeting_attendance(v_meeting);
  perform public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.open_agenda_item_vote(v_item);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  perform public.cast_council_vote(v_item, 'yes');
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.cast_council_vote(v_item, 'yes');
  perform set_config('request.jwt.claim.sub', v_mem_b::text, true);
  perform public.cast_council_vote(v_item, 'no');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.cast_council_vote(v_item, 'abstain');
  perform public.close_agenda_item_vote(v_item);
  perform public.calculate_agenda_item_result(v_item);
  perform public.resolve_agenda_item(v_item, 'approved');
  perform public.close_council_session(v_meeting);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.draft_council_minutes(v_meeting, 'Complete race minutes');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.approve_and_lock_council_minutes(v_meeting, 'Complete race minutes locked');
  v_res := public.issue_council_decision(v_meeting, v_item, 'Complete Decision', 'Body', v_mem_a, null, null);
  v_dec := (v_res->>'decision_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  perform public.update_council_decision_followup(v_dec, 'in_progress', 'open for race');
  delete from public._c9_conc_fixture where k in ('complete_meeting', 'complete_decision');
  insert into public._c9_conc_fixture values
    ('complete_meeting', v_meeting),
    ('complete_decision', v_dec);
end $$;
reset role;
`);
    if (!completePrep.ok) throw new Error(`complete prep failed:\n${completePrep.out}`);

    const completeMeetingId = fixtureVal("complete_meeting");
    const completeDecisionId = fixtureVal("complete_decision");

    const holdComplete = openSession();
    const archiveRace = openSession();
    try {
      holdComplete.write(`
begin;
select id from public.academic_council_decisions where id = '${completeDecisionId}' for update;
select 'DECISION_HELD';
`);
      await holdComplete.waitFor("DECISION_HELD");

      archiveRace.write(`
begin;
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
set local role authenticated;
select 'ARCHIVE2_STARTED';
select public.archive_council_meeting('${completeMeetingId}');
select 'ARCHIVE2_DONE';
`);
      await archiveRace.waitFor("ARCHIVE2_STARTED");

      holdComplete.write(`
select set_config('request.jwt.claim.sub', '${MEM_A}', true);
set local role authenticated;
select public.complete_council_decision('${completeDecisionId}', 'race complete');
reset role;
commit;
select 'COMPLETE_COMMITTED';
`);
      await holdComplete.waitFor("COMPLETE_COMMITTED");

      let archive2Outcome = "";
      try {
        archive2Outcome = await archiveRace.waitFor("ARCHIVE2_DONE", 8000);
      } catch {
        archive2Outcome = archiveRace.buffer();
      }
      if (archive2Outcome.includes("ARCHIVE2_DONE")) {
        archiveRace.write("commit;\nselect 'ARCHIVE2_COMMITTED';\n");
        await archiveRace.waitFor("ARCHIVE2_COMMITTED");
      } else {
        expect(archive2Outcome.toLowerCase()).toMatch(/prerequisite|open|unresolved|error/);
        archiveRace.write("rollback;\n");
        const retryArchive = psql(`
select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
select public.archive_council_meeting('${completeMeetingId}');
reset role;
`);
        expect(retryArchive.ok).toBe(true);
      }
    } finally {
      holdComplete.close();
      archiveRace.close();
    }

    expect(
      psql(`select status::text from public.academic_council_decisions where id = '${completeDecisionId}';`).out,
    ).toContain("completed");
    expect(
      psql(`select status::text from public.academic_council_meetings where id = '${completeMeetingId}';`).out,
    ).toContain("archived");

    const lateComplete = psql(`
select set_config('request.jwt.claim.sub', '${MEM_A}', false);
set role authenticated;
do $$
begin
  begin
    perform public.complete_council_decision('${completeDecisionId}', 'late');
    raise exception 'LATE_COMPLETE_UNEXPECTED_SUCCESS';
  exception when others then
    if sqlerrm like '%LATE_COMPLETE_UNEXPECTED%' then raise; end if;
  end;
end $$;
reset role;
select status::text from public.academic_council_meetings where id = '${completeMeetingId}';
`);
    expect(lateComplete.ok).toBe(true);
    expect(lateComplete.out).toContain("archived");

    // ---- (e) vote vs close-vote (C0-C8 pattern) ----
    const prepVote = psql(`
select set_config('request.jwt.claim.sub', '${CHAIR}', false);
set role authenticated;
do $$
declare
  v_council uuid := '${COUNCIL}';
  v_chair uuid := '${CHAIR}';
  v_sec uuid := '${SECRETARY}';
  v_mem_a uuid := '${MEM_A}';
  v_mem_b uuid := '${MEM_B}';
  v_mem_c uuid := '${MEM_C}';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_res jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  v_res := public.council_schedule_meeting(
    v_council, 'C9VoteRace ' || gen_random_uuid()::text, now() + interval '8 days',
    null, now() - interval '1 hour', now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting, 'scheduled', 'intake_open', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'VoteTopic', 'Body');
  v_topic := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic, 'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting, 'intake_open', 'intake_closed', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(v_meeting, 'intake_closed', 'agenda_ready', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.finalize_council_meeting_attendance(v_meeting);
  perform public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.open_agenda_item_vote(v_item);
  delete from public._c9_conc_fixture where k = 'vote_item';
  insert into public._c9_conc_fixture values ('vote_item', v_item);
end $$;
reset role;
select v::text from public._c9_conc_fixture where k = 'vote_item';
`);
    if (!prepVote.ok) throw new Error(`vote prep failed:\n${prepVote.out}`);
    const voteItemId = prepVote.out.split("\n").filter(Boolean).pop()!.trim();

    const closeFirst = openSession();
    const castLate = openSession();
    try {
      closeFirst.write(`
begin;
select id from public.academic_council_agenda_items where id = '${voteItemId}' for update;
select 'CLOSE_HELD';
`);
      await closeFirst.waitFor("CLOSE_HELD");

      castLate.write(`
begin;
select set_config('request.jwt.claim.sub', '${MEM_A}', true);
set local role authenticated;
select 'CAST_STARTED';
select public.cast_council_vote('${voteItemId}', 'yes');
select 'CAST_DONE';
`);
      await castLate.waitFor("CAST_STARTED");

      closeFirst.write(`
select set_config('request.jwt.claim.sub', '${CHAIR}', true);
set local role authenticated;
select public.close_agenda_item_vote('${voteItemId}');
reset role;
commit;
select 'CLOSE_COMMITTED';
`);
      await closeFirst.waitFor("CLOSE_COMMITTED");

      let castOutcome = "";
      try {
        castOutcome = await castLate.waitFor("CAST_DONE", 8000);
      } catch {
        castOutcome = castLate.buffer();
      }
      expect(castOutcome).not.toMatch(/CAST_DONE/);
      expect(castOutcome.toLowerCase()).toMatch(/voting_not_open|error/);
      castLate.write("rollback;\n");
    } finally {
      closeFirst.close();
      castLate.close();
    }

    expect(
      psql(
        `select count(*)::text from public.academic_council_votes where agenda_item_id = '${voteItemId}';`,
      ).out.trim(),
    ).toBe("0");
    expect(
      psql(
        `select session_status::text from public.academic_council_agenda_items where id = '${voteItemId}';`,
      ).out,
    ).toContain("voting_closed");

    // ---- (f) minutes lock vs mutation ----
    const holdMinutes = openSession();
    const draftRace = openSession();
    try {
      holdMinutes.write(`
begin;
select id from public.academic_council_minutes where meeting_id = '${lockedMinutesMeetingId}' for update;
select 'MINUTES_HELD';
`);
      await holdMinutes.waitFor("MINUTES_HELD");

      draftRace.write(`
begin;
select set_config('request.jwt.claim.sub', '${SECRETARY}', true);
set local role authenticated;
select 'DRAFT_STARTED';
select public.draft_council_minutes('${lockedMinutesMeetingId}', 'FORGED locked body mutation');
select 'DRAFT_DONE';
`);
      await draftRace.waitFor("DRAFT_STARTED");

      holdMinutes.write(`
commit;
select 'MINUTES_RELEASED';
`);
      await holdMinutes.waitFor("MINUTES_RELEASED");

      let draftOutcome = "";
      try {
        draftOutcome = await draftRace.waitFor("DRAFT_DONE", 8000);
      } catch {
        draftOutcome = draftRace.buffer();
      }
      expect(draftOutcome).not.toMatch(/DRAFT_DONE/);
      expect(draftOutcome.toLowerCase()).toMatch(/locked|immutable|error|invalid/);
      draftRace.write("rollback;\n");
    } finally {
      holdMinutes.close();
      draftRace.close();
    }

    expect(minutesFp(lockedMinutesMeetingId)).toBe(lockedFpBefore);
    expect(
      psql(
        `select is_locked::text from public.academic_council_minutes where meeting_id = '${lockedMinutesMeetingId}';`,
      ).out,
    ).toContain("t");

    writeFileSync(join(work, "PASS"), "C9_TWO_CONNECTION_PASS\n");
    expect(true).toBe(true);
  }, 600_000);
});
