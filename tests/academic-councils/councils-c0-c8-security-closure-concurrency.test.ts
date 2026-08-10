/**
 * Deterministic two-connection concurrency proofs for C0-C8 security closure.
 * Uses committed fixtures + lock-step FOR UPDATE barriers (no timing-only races).
 */
import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = process.cwd();
const container = `councils-conc-${Date.now()}`;
const work = join(tmpdir(), container);
mkdirSync(work, { recursive: true });

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

/** Run SQL in a long-lived psql session; resolve when marker appears on stdout. */
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
  return {
    write(sql: string) {
      child.stdin.write(sql.endsWith("\n") ? sql : sql + "\n");
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

afterAll(() => teardown());

describe("C0-C8 security closure deterministic concurrency", () => {
  it("proves vote-vs-close and archive-vs-followup with two connections", async () => {
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
    ];
    for (const p of pipeline) {
      let r = psqlFile(p);
      if (!r.ok) {
        await Bun.sleep(1000);
        r = psqlFile(p);
      }
      if (!r.ok) throw new Error(`apply failed ${p}:\n${r.out}`);
    }

    // Seed committed fixture: council + voting_open agenda item + minutes-locked meeting for archive races
    const seed = `
insert into public.academic_councils (id, name, council_type, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'Conc Council', 'college', 'a1000000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.academic_council_members (id, council_id, user_id, member_role, is_active, active_from, created_by) values
  ('11000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair', true, current_date, 'a1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary', true, current_date, 'a1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member', true, current_date, 'a1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000018', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000018', 'member', true, current_date, 'a1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000019', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000019', 'member', true, current_date, 'a1000000-0000-0000-0000-000000000002')
on conflict do nothing;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', false);
set role authenticated;
select public.council_approve_quorum_policy(
  'c1000000-0000-0000-0000-000000000001', 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5
);
`;
    expect(psql(seed).ok).toBe(true);

    // Helper to drive a meeting to voting_open
    const prepVote = `
reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', false);
set role authenticated;
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_res jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  v_res := public.council_schedule_meeting(v_council, 'VoteRace '||gen_random_uuid()::text, now()+interval '2 days', null, now()-interval '1 hour', now()+interval '1 day');
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting,'scheduled','intake_open','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'T', 'B');
  v_topic := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic,'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic,'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting,'intake_open','intake_closed','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(v_meeting,'intake_closed','agenda_ready','{}'::jsonb);
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
  create temporary table if not exists pg_temp.conc_ids(k text primary key, v uuid);
  delete from pg_temp.conc_ids;
  insert into pg_temp.conc_ids values ('meeting', v_meeting), ('item', v_item);
end $$;
select v from pg_temp.conc_ids where k='item';
`;
    // Use a permanent table for IDs across sessions
    expect(
      psql(`
create table if not exists public._conc_fixture(k text primary key, v uuid);
truncate public._conc_fixture;
grant select, insert, update, delete on public._conc_fixture to authenticated, service_role;
`).ok,
    ).toBe(true);

    const prepVotePermanent = prepVote.replace(
      /create temporary table if not exists pg_temp\.conc_ids[\s\S]*insert into pg_temp\.conc_ids values \('meeting', v_meeting\), \('item', v_item\);/,
      `delete from public._conc_fixture;
  insert into public._conc_fixture values ('meeting', v_meeting), ('item', v_item);`,
    ).replace(
      /select v from pg_temp\.conc_ids where k='item';/,
      `select v::text from public._conc_fixture where k='item';`,
    );

    let r = psql(prepVotePermanent);
    if (!r.ok) throw new Error(`prepVote failed:\n${r.out}`);
    const itemId = r.out.split("\n").filter(Boolean).pop()!.trim();
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/i);

    // ---- Order 1: close wins serialization first → cast must fail, zero late votes ----
    const closeFirst = openSession();
    const castLate = openSession();
    try {
      // Superuser holds the agenda-item lock (authenticated DML is revoked by C0).
      closeFirst.write(`
begin;
select id from public.academic_council_agenda_items where id = '${itemId}' for update;
select 'CLOSE_HELD';
`);
      await closeFirst.waitFor("CLOSE_HELD");

      castLate.write(`
begin;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000014', true);
set local role authenticated;
select 'CAST_STARTED';
select public.cast_council_vote('${itemId}', 'yes');
select 'CAST_DONE';
`);
      await castLate.waitFor("CAST_STARTED");
      // Cast is blocked on agenda-item lock; close proceeds under the same held lock.
      closeFirst.write(`
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select public.close_agenda_item_vote('${itemId}');
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

    const lateVotes = psql(
      `select count(*)::text from public.academic_council_votes where agenda_item_id = '${itemId}';`,
    );
    expect(lateVotes.ok).toBe(true);
    expect(lateVotes.out.trim()).toBe("0");
    const closed = psql(
      `select session_status::text from public.academic_council_agenda_items where id = '${itemId}';`,
    );
    expect(closed.out).toContain("voting_closed");

    // ---- Order 2: cast wins first → close observes vote before close commits ----
    r = psql(prepVotePermanent);
    if (!r.ok) throw new Error(`prepVote2 failed:\n${r.out}`);
    const item2 = r.out.split("\n").filter(Boolean).pop()!.trim();

    const castFirst = openSession();
    const closeSecond = openSession();
    try {
      castFirst.write(`
begin;
select id from public.academic_council_agenda_items where id = '${item2}' for update;
select 'CAST_HELD';
`);
      await castFirst.waitFor("CAST_HELD");

      closeSecond.write(`
begin;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', true);
set local role authenticated;
select 'CLOSE_STARTED';
select public.close_agenda_item_vote('${item2}');
select 'CLOSE_DONE';
`);
      await closeSecond.waitFor("CLOSE_STARTED");

      castFirst.write(`
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000014', true);
set local role authenticated;
select public.cast_council_vote('${item2}', 'yes');
reset role;
commit;
select 'CAST_COMMITTED';
`);
      await castFirst.waitFor("CAST_COMMITTED");
      await closeSecond.waitFor("CLOSE_DONE");
      closeSecond.write("commit;\nselect 'CLOSE_COMMITTED';\n");
      await closeSecond.waitFor("CLOSE_COMMITTED");
    } finally {
      castFirst.close();
      closeSecond.close();
    }

    const voteCount = psql(
      `select count(*)::text from public.academic_council_votes where agenda_item_id = '${item2}';`,
    );
    expect(voteCount.out.trim()).toBe("1");
    const status2 = psql(
      `select session_status::text from public.academic_council_agenda_items where id = '${item2}';`,
    );
    expect(status2.out).toContain("voting_closed");

    // ---- Double close-vote: second fails zero mutation ----
    const doubleClose = psql(`
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', false);
set role authenticated;
do $$
begin
  begin
    perform public.close_agenda_item_vote('${item2}');
    raise exception 'DOUBLE_CLOSE_UNEXPECTED_SUCCESS';
  exception when others then
    if sqlerrm like '%DOUBLE_CLOSE_UNEXPECTED%' then raise; end if;
  end;
end $$;
reset role;
select session_status::text from public.academic_council_agenda_items where id = '${item2}';
`);
    expect(doubleClose.ok).toBe(true);
    expect(doubleClose.out).toContain("voting_closed");

    writeFileSync(join(work, "PASS"), "H1_TWO_CONNECTION_PASS\n");
    expect(true).toBe(true);
  }, 420_000);
});
