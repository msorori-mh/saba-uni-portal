/**
 * Phase A — executable reproduction of Codex HIGH-1..HIGH-4 against the
 * pre-closure C0-C7 chain (base d3ddce61 semantics), then proves closure remediates.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const container = `councils-hfind-${Date.now()}`;

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
  c5: join(root, "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql"),
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
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
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

afterAll(() => teardown());

describe("Phase A Codex HIGH findings reproduction + closure", () => {
  it("static: base cast_council_vote lacks FOR UPDATE; closure adds it", () => {
    const c4 = readFileSync(paths.c4, "utf8");
    const closure = readFileSync(paths.closure, "utf8");
    const castBase = c4.slice(c4.indexOf("CREATE OR REPLACE FUNCTION public.cast_council_vote"));
    const castEnd = castBase.indexOf("CREATE OR REPLACE FUNCTION public.close_agenda_item_vote");
    const castFn = castBase.slice(0, castEnd);
    expect(castFn).not.toMatch(/FOR UPDATE/);
    expect(closure).toMatch(/Serialize against close_agenda_item_vote/);
    expect(closure).toContain("COUNCIL_DECISION_SOURCE_MEETING_MISMATCH");
    expect(closure).toContain("council_decision_transition_is_legal");
    expect(closure).toContain("unresolved decision follow-up");
  });

  it("PG17: reproduce H2/H3/H4 on C0-C7 then remediate with closure", async () => {
    if (!dockerReady) throw new Error("docker required");
    teardown();
    execSync(`docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`, {
      stdio: "ignore",
    });
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);

    for (const p of [
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
    ]) {
      let r = psqlFile(p);
      if (!r.ok) {
        await Bun.sleep(1000);
        r = psqlFile(p);
      }
      if (!r.ok) throw new Error(`apply failed ${p}:\n${r.out}`);
    }

    // Prove H1 structurally: cast body still lacks FOR UPDATE until closure.
    const castProbe = psql(`
select pg_get_functiondef('public.cast_council_vote(uuid,text)'::regprocedure);
`);
    expect(castProbe.ok).toBe(true);
    expect(castProbe.out).not.toMatch(/FOR UPDATE/);
    // close has FOR UPDATE — asymmetric serialization gap = H1.
    const closeProbe = psql(`
select pg_get_functiondef('public.close_agenda_item_vote(uuid)'::regprocedure);
`);
    expect(closeProbe.out).toMatch(/FOR UPDATE/);

    // Seed + drive to minutes_locked with two meetings for H2/H3/H4 semantic repro.
    const repro = psql(`
insert into public.academic_councils (id, name, council_type, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'Repro Council', 'college', 'a1000000-0000-0000-0000-000000000002')
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
reset role;

create table if not exists public._repro_ids(k text primary key, v uuid);
grant select, insert, update, delete on public._repro_ids to authenticated, service_role;

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
  v_meeting uuid; v_meeting2 uuid; v_topic uuid; v_topic2 uuid; v_item uuid; v_item2 uuid; v_dec uuid; v_res jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  v_res := public.council_schedule_meeting(v_council, 'M1', now()+interval '2 days', null, now()-interval '1 hour', now()+interval '1 day');
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting,'scheduled','intake_open','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'T1', 'B');
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
  perform public.resolve_agenda_item(v_item, 'ok');
  perform public.close_council_session(v_meeting);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.draft_council_minutes(v_meeting, 'minutes');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.approve_and_lock_council_minutes(v_meeting, 'locked minutes');

  -- Second meeting/item for cross-meeting forge
  v_res := public.council_schedule_meeting(v_council, 'M2', now()+interval '5 days', null, now()-interval '1 hour', now()+interval '1 day');
  v_meeting2 := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting2,'scheduled','intake_open','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting2, 'T2', 'B');
  v_topic2 := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic2,'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic2,'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting2,'intake_open','intake_closed','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting2, v_topic2, 1);
  v_item2 := (v_res->>'agenda_item_id')::uuid;

  -- H2 PRE-CLOSURE: cross-meeting agenda item is ACCEPTED (vulnerable)
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  begin
    v_res := public.issue_council_decision(v_meeting, v_item2, 'Forged', 'Body', v_mem_a, null, null);
    insert into public._repro_ids values ('h2_forged_dec', (v_res->>'decision_id')::uuid)
    on conflict (k) do update set v = excluded.v;
  exception when others then
    raise exception 'H2_BASE_EXPECTED_ACCEPT_BUT_DENIED: %', sqlerrm;
  end;

  -- H3 PRE-CLOSURE: issued → completed skip is ACCEPTED
  v_res := public.issue_council_decision(v_meeting, v_item, 'Real', 'Body', v_mem_a, null, null);
  v_dec := (v_res->>'decision_id')::uuid;
  insert into public._repro_ids values ('meeting', v_meeting), ('item', v_item), ('dec', v_dec)
  on conflict (k) do update set v = excluded.v;
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  begin
    perform public.update_council_decision_followup(v_dec, 'completed', 'skip');
  exception when others then
    raise exception 'H3_BASE_EXPECTED_SKIP_ACCEPT_BUT_DENIED: %', sqlerrm;
  end;

  -- H4 PRE-CLOSURE: archive allowed with incomplete follow-up semantics —
  -- issue a fresh open decision and prove archive still succeeds on base C7.
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  -- Complete the skipped decision first (already completed). Issue another open one:
  -- Base C7 does not require decision completion, so archive of M1 should still work
  -- even if we leave the forged decision open... forged decision is on M1.
  -- Reset forged decision status to issued via direct update for H4 open-follow-up proof.
  execute 'reset role';
  update public.academic_council_decisions
    set status = 'issued', completed_at = null
    where id = (select v from public._repro_ids where k='h2_forged_dec');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  execute 'set local role authenticated';
  begin
    v_res := public.archive_council_meeting(v_meeting);
    if (v_res->>'status') <> 'archived' then
      raise exception 'H4_BASE_ARCHIVE_DID_NOT_SUCCEED';
    end if;
  exception when others then
    raise exception 'H4_BASE_EXPECTED_ARCHIVE_WITH_OPEN_DECISION: %', sqlerrm;
  end;

  -- Post-archive follow-up mutation via SECURITY DEFINER RPC succeeds on base
  -- (no archived-meeting check on decision rows / follow-up RPC).
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  begin
    perform public.update_council_decision_followup(
      (select v from public._repro_ids where k='h2_forged_dec'), 'in_progress', 'post-archive'
    );
  exception when others then
    raise exception 'H4_BASE_EXPECTED_POST_ARCHIVE_FOLLOWUP: %', sqlerrm;
  end;
end $$;
`);
    if (!repro.ok) throw new Error(`base reproduction failed:\n${repro.out}`);

    // Apply closure remediation
    let closureApply = psqlFile(paths.closure);
    if (!closureApply.ok) throw new Error(`closure apply failed:\n${closureApply.out}`);

    const castAfter = psql(`select pg_get_functiondef('public.cast_council_vote(uuid,text)'::regprocedure);`);
    expect(castAfter.out).toMatch(/FOR UPDATE/);

    // Fresh meeting proving remediations deny H2/H3/H4
    const remediated = psql(`
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
  v_meeting uuid; v_meeting2 uuid; v_topic uuid; v_topic2 uuid; v_item uuid; v_item2 uuid; v_dec uuid; v_res jsonb;
  v_before int; v_after int;
begin
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  v_res := public.council_schedule_meeting(v_council, 'M3', now()+interval '8 days', null, now()-interval '1 hour', now()+interval '1 day');
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting,'scheduled','intake_open','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting, 'T3', 'B');
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
  perform public.resolve_agenda_item(v_item, 'ok');
  perform public.close_council_session(v_meeting);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.draft_council_minutes(v_meeting, 'minutes3');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.approve_and_lock_council_minutes(v_meeting, 'locked3');

  v_res := public.council_schedule_meeting(v_council, 'M4', now()+interval '10 days', null, now()-interval '1 hour', now()+interval '1 day');
  v_meeting2 := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting2,'scheduled','intake_open','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  v_res := public.council_submit_topic(v_council, v_meeting2, 'T4', 'B');
  v_topic2 := (v_res->>'topic_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  perform public.council_review_topic(v_topic2,'under_review');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.council_review_topic(v_topic2,'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting2,'intake_open','intake_closed','{}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_sec::text, true);
  v_res := public.council_add_topic_to_agenda(v_meeting2, v_topic2, 1);
  v_item2 := (v_res->>'agenda_item_id')::uuid;

  select count(*) into v_before from public.academic_council_decisions;
  begin
    perform public.issue_council_decision(v_meeting, v_item2, 'Forged', 'Body', v_mem_a, null, null);
    raise exception 'H2_CLOSURE_SHOULD_DENY';
  exception when others then
    if sqlerrm like '%H2_CLOSURE_SHOULD_DENY%' then raise; end if;
  end;
  select count(*) into v_after from public.academic_council_decisions;
  if v_before <> v_after then raise exception 'H2_CLOSURE_MUTATED'; end if;

  v_res := public.issue_council_decision(v_meeting, v_item, 'Real3', 'Body', v_mem_a, null, null);
  v_dec := (v_res->>'decision_id')::uuid;
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  begin
    perform public.update_council_decision_followup(v_dec, 'completed', 'skip');
    raise exception 'H3_CLOSURE_SHOULD_DENY_SKIP';
  exception when others then
    if sqlerrm like '%H3_CLOSURE_SHOULD_DENY_SKIP%' then raise; end if;
  end;

  perform public.update_council_decision_followup(v_dec, 'in_progress', 'ok');
  -- H4: archive denied while open
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  begin
    perform public.archive_council_meeting(v_meeting);
    raise exception 'H4_CLOSURE_SHOULD_DENY_OPEN';
  exception when others then
    if sqlerrm like '%H4_CLOSURE_SHOULD_DENY_OPEN%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  perform public.complete_council_decision(v_dec, 'done');
  perform set_config('request.jwt.claim.sub', v_chair::text, true);
  perform public.archive_council_meeting(v_meeting);
  perform set_config('request.jwt.claim.sub', v_mem_a::text, true);
  begin
    perform public.update_council_decision_followup(v_dec, 'in_progress', 'nope');
    raise exception 'H4_CLOSURE_SHOULD_DENY_POST';
  exception when others then
    if sqlerrm like '%H4_CLOSURE_SHOULD_DENY_POST%' then raise; end if;
  end;
  raise notice 'PHASE_A_H1_H4_REMEDIATED';
end $$;
`);
    if (!remediated.ok) throw new Error(`remediation proof failed:\n${remediated.out}`);
    expect(remediated.out).toContain("PHASE_A_H1_H4_REMEDIATED");
  }, 420_000);
});
