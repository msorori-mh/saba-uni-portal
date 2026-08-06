-- Package A foundation verifier (disposable PG17). NEVER run on production.
-- Prerequisites: postgres-minimal-schema + A1 + A2 + A3 applied in-session.
-- Validates schema invariants, RLS deny, helper presence, storage contract shape.
-- Ends with ROLLBACK (no durable rows).

begin;

do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'foundation tables missing';
  end if;
  if to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is null then
    raise exception 'A3 lifecycle RPCs missing';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'graduation_project_final_decision' and e.enumlabel = 'passed'
  ) then raise exception 'final_decision enum missing passed'; end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'graduation_project_final_decision' and e.enumlabel = 'revisions_required'
  ) then raise exception 'final_decision enum missing revisions_required'; end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'graduation_project_final_decision' and e.enumlabel = 'failed'
  ) then raise exception 'final_decision enum missing failed'; end if;
  if exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'graduation_project_assignment_role' and e.enumlabel in ('department_head','dean')
  ) then raise exception 'operational bypass roles must not exist on assignment_role'; end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'graduation_project_one_leader') then
    raise exception 'one-leader index missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'graduation_project_one_active_student_team') then
    raise exception 'one-active-team index missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'graduation_project_one_pending_supervisor') then
    raise exception 'one pending/accepted supervisor index missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'graduation_project_current_proposal_file') then
    raise exception 'current proposal file index missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'graduation_project_current_final_file') then
    raise exception 'current final file index missing';
  end if;
end $$;

do $$
declare r record; n int := 0;
begin
  for r in
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'graduation_project%'
  loop
    if not r.relrowsecurity then
      raise exception 'RLS not enabled on %', r.relname;
    end if;
    n := n + 1;
  end loop;
  if n < 11 then raise exception 'expected >=11 GP tables with RLS, got %', n; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.require_graduation_project_assignment(uuid,public.graduation_project_assignment_role[])', 'execute') then
    raise exception 'require_graduation_project_assignment must not be granted to authenticated';
  end if;
  if has_function_privilege('authenticated', 'public.gp_take_replay(uuid,uuid,text,jsonb)', 'execute') then
    raise exception 'gp_take_replay must not be granted to authenticated';
  end if;
  if has_function_privilege('anon', 'public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)', 'execute') then
    raise exception 'anon must not execute create_graduation_project_team';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from storage.buckets
    where id = 'graduation-projects' and public = false
      and 'application/pdf' = any (allowed_mime_types)
  ) then
    raise exception 'graduation-projects private PDF bucket contract missing';
  end if;
end $$;

insert into public.graduation_project_department_coordinators(department_id, faculty_profile_id, user_id, assigned_by)
values (
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-00000000f001'
);

create or replace function pg_temp.expect_fail(p_sql text, p_frag text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when raise_exception then
    if position(p_frag in sqlerrm) = 0 then
      raise exception 'expected failure containing %, got %', p_frag, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected failure containing % but statement succeeded', p_frag;
end $$;

select pg_temp.expect_fail(
  $q$update public.graduation_project_events set reason = 'x' where true$q$,
  'append-only'
);
select pg_temp.expect_fail(
  $q$delete from public.graduation_project_events where true$q$,
  'append-only'
);

do $$ begin raise notice 'PACKAGE_A_FOUNDATION_VERIFIER_PASS'; end $$;
rollback;
