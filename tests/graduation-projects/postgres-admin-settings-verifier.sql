-- Executable disposable-PostgreSQL admin/settings verifier (psql).
-- NEVER run on production. Prerequisite: minimal schema + migrations
-- 20260730100000..20260730100005 (drafts GRADUATION-PROJECTS-M1..M6-*.NOT_APPLIED.sql
-- in docs/migration-drafts/) applied, plus synthetic fixtures.
\set ON_ERROR_STOP on
\if :{?department_id}
\else
  \warn 'department_id is required'; \quit 1
\endif
\if :{?student_profile_id}
\else
  \warn 'student_profile_id is required'; \quit 1
\endif
\if :{?student_user_id}
\else
  \warn 'student_user_id is required'; \quit 1
\endif
\if :{?faculty_profile_id}
\else
  \warn 'faculty_profile_id is required'; \quit 1
\endif
\if :{?faculty_user_id}
\else
  \warn 'faculty_user_id is required'; \quit 1
\endif

begin;
set local role postgres;
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
select set_config('gp.faculty_user_id', :'faculty_user_id', true);
select set_config('gp.student_user_id', :'student_user_id', true);
select set_config('gp.department_id', :'department_id', true);

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
create function pg_temp.expect_gp_error(statement text,expected_message text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected graduation-project error was not raised';
exception when sqlstate 'P0001' then
  if sqlerrm<>expected_message then raise exception 'unexpected error: %, expected: %',sqlerrm,expected_message; end if;
end $$;

insert into auth.users values
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005');
insert into public.faculty_profiles values
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id'),
  ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',:'department_id');
insert into public.student_profiles values
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005',:'department_id');

-- structure
do $$ begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='graduation_project_settings' and c.relrowsecurity)<>1 then
    raise exception 'CHECK FAILED: settings table missing or RLS disabled';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='graduation_project_settings') then
    raise exception 'CHECK FAILED: settings table must stay policy-free';
  end if;
end $$;

-- project with department_head manager + student
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Admin A','draft') returning id)
insert into gp_ids select 'p1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'department_head',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'head1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'stu1',id from x;

-- settings denied for non-authority (student), allowed for department_head
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',
  :'department_id'),
  'settings administration assignment required');
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.upsert_graduation_project_settings(%L,null,4,2,null,true,30,7,gen_random_uuid())',
  :'department_id'),
  'settings invalid');
with x as (select public.upsert_graduation_project_settings(:'department_id',null,2,2,1,false,30,7,'31111111-0000-0000-0000-000000000001') id)
insert into gp_ids select 'set1',id from x;
-- upsert is idempotent on (department, null year)
select public.upsert_graduation_project_settings(:'department_id',null,2,2,1,false,30,7,'31111111-0000-0000-0000-000000000002');
do $$ declare v_n integer; begin
  select count(*) into v_n from public.graduation_project_settings where department_id=current_setting('gp.department_id')::uuid;
  if v_n<>1 then raise exception 'CHECK FAILED: settings upsert duplicated the row'; end if;
end $$;
do $$ declare v jsonb; begin
  v:=public.get_graduation_project_settings(current_setting('gp.department_id')::uuid);
  if (v->0->>'team_max')::integer<>2 then raise exception 'CHECK FAILED: settings read mismatch'; end if;
end $$;

-- team_max=2: one seat left (stu1 already occupies one)
with x as (select public.add_graduation_project_team_member(
  (select v from gp_ids where k='p1'),'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','31111111-0000-0000-0000-000000000003') id)
insert into gp_ids select 'stu2',id from x;
select pg_temp.expect_gp_error(format(
  'select public.add_graduation_project_team_member(%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','31111111-0000-0000-0000-000000000004'),
  'team size limit reached');

-- co_supervisor disallowed by settings
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'co_supervisor','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','31111111-0000-0000-0000-000000000005'),
  'co-supervisor not allowed by settings');
-- supervisor capacity=1: first supervisor fits, second hits the cap
with x as (select public.assign_graduation_project_faculty(
  (select v from gp_ids where k='p1'),'supervisor','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','31111111-0000-0000-0000-000000000006') id)
insert into gp_ids select 'sup1',id from x;
-- (slot rule fires first for a second supervisor on the same project; capacity is
-- proven on a second project below)
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Admin B','draft') returning id)
insert into gp_ids select 'p2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'department_head',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'head2',id from x;
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p2'),'supervisor','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','31111111-0000-0000-0000-000000000007'),
  'supervisor capacity reached');

-- team_min=2 on submit: p2 has no students -> team below minimum size
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'stu2b',id from x;
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.submit_graduation_project_proposal(%L,1,%L)',
  (select v from gp_ids where k='p2'),'31111111-0000-0000-0000-000000000008'),
  'team below minimum size');
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- proposal window: close it, submit denied; reopen, submit allowed
update public.graduation_project_settings set proposal_window_closes_at=now()-interval '1 day' where id=(select v from gp_ids where k='set1');
with x as (select public.add_graduation_project_team_member(
  (select v from gp_ids where k='p2'),'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','31111111-0000-0000-0000-000000000009') id)
insert into gp_ids select 'stu2c',id from x;
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.submit_graduation_project_proposal(%L,1,%L)',
  (select v from gp_ids where k='p2'),'31111111-0000-0000-0000-00000000000a'),
  'proposal window closed');
update public.graduation_project_settings set proposal_window_closes_at=now()+interval '30 days' where id=(select v from gp_ids where k='set1');
select public.submit_graduation_project_proposal((select v from gp_ids where k='p2'),1,'31111111-0000-0000-0000-00000000000b');
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- rubric management: invalid payload, create, read, update-criteria, not found
select pg_temp.expect_gp_error(format(
  'select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
  :'department_id','GEN','v1','General rubric','[]'),
  'rubric payload invalid');
with x as (select public.upsert_graduation_project_rubric(:'department_id',null,'GEN','v1','General rubric',60,
  '[{"criterion_code":"C1","criterion_label":"Content","maximum_score":60,"sequence_no":1},
    {"criterion_code":"C2","criterion_label":"Defense","maximum_score":40,"sequence_no":2}]'::jsonb,
  '31111111-0000-0000-0000-00000000000c') id)
insert into gp_ids select 'rub1',id from x;
do $$ declare v jsonb; begin
  v:=public.list_graduation_project_rubrics(current_setting('gp.department_id')::uuid);
  if jsonb_array_length(v)<>1 then raise exception 'CHECK FAILED: rubric list mismatch'; end if;
  if jsonb_array_length(v->0->'criteria')<>2 then raise exception 'CHECK FAILED: rubric criteria mismatch'; end if;
end $$;
select public.upsert_graduation_project_rubric(:'department_id',(select v from gp_ids where k='rub1'),'GEN','v1','General rubric (revised)',65,
  '[{"criterion_code":"C1","criterion_label":"Content","maximum_score":100,"sequence_no":1}]'::jsonb,
  '31111111-0000-0000-0000-00000000000d');
do $$ declare v jsonb; begin
  v:=public.list_graduation_project_rubrics(current_setting('gp.department_id')::uuid);
  if jsonb_array_length(v->0->'criteria')<>1 then raise exception 'CHECK FAILED: rubric criteria replace failed'; end if;
  if (v->0->>'passing_threshold')::numeric<>65 then raise exception 'CHECK FAILED: rubric update failed'; end if;
end $$;
select pg_temp.expect_gp_error(format(
  'select public.upsert_graduation_project_rubric(%L,gen_random_uuid(),%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
  :'department_id','GEN','v9','Ghost',
  '[{"criterion_code":"C1","criterion_label":"X","maximum_score":10,"sequence_no":1}]'),
  'rubric not found');

-- defense report: empty department data returns well-formed payload
do $$ declare v jsonb; begin
  v:=public.get_graduation_project_defense_report(current_setting('gp.department_id')::uuid);
  if v->'scheduled_defenses' is null or v->'missing_evaluations' is null or v->'results_distribution' is null then
    raise exception 'CHECK FAILED: defense report payload malformed';
  end if;
end $$;

-- Admin/settings verified: settings authority, upsert idempotency, team min/max,
-- co-supervisor rule, supervisor capacity, proposal window, rubric CRUD, defense report.
rollback;
