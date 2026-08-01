-- AUDIT-06 PART 4 — F-2 AUDIT/CORRELATION MATRIX for M9 department-scoped events,
-- settings/rubric upsert idempotency, append-only trigger, scope CHECK, dedupe index.
-- Disposable PG17; prerequisite: minimal schema + M1..M9. Synthetic TEST_ONLY data
-- (7e59-prefixed ids); single rolled-back transaction. Prints AUDIT06 rows.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_ids(k text primary key, v uuid not null) on commit drop;
insert into gp_ids values
  ('dept1','7e590000-0000-4000-8000-0000000000d1'),
  ('dept2','7e590000-0000-4000-8000-0000000000d2'),
  ('u_s1','7e590000-0000-4000-8000-0000000000a1'),
  ('u_head','7e590000-0000-4000-8000-0000000000b1'),
  ('u_coord','7e590000-0000-4000-8000-0000000000b2'),
  ('u_head2','7e590000-0000-4000-8000-0000000000b3'),
  ('u_solo','7e590000-0000-4000-8000-0000000000b4'),
  ('sp_s1','7e590000-0000-4000-8000-0000000000e1'),
  ('fp_head','7e590000-0000-4000-8000-0000000000f1'),
  ('fp_coord','7e590000-0000-4000-8000-0000000000f2'),
  ('fp_head2','7e590000-0000-4000-8000-0000000000f3'),
  ('fp_solo','7e590000-0000-4000-8000-0000000000f4');

insert into auth.users select v from gp_ids where k like 'u\_%';
insert into public.departments select v from gp_ids where k like 'dept_';
insert into public.student_profiles values
  ((select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='fp_solo'),(select v from gp_ids where k='u_solo'),(select v from gp_ids where k='dept1'));

create temporary table a06r(n bigint generated always as identity, id text, description text, result text, detail text) on commit drop;
create temporary table gp_num(k text primary key, v bigint) on commit drop;
create temporary table gp_txt(k text primary key, v text) on commit drop;
create function pg_temp.ok(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','completed');
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.guard(p_id text, p_desc text, p_check text) returns void language plpgsql as $$
begin execute p_check; insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','invariant holds');
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlerrm);
end $$;
create function pg_temp.note(p_id text, p_desc text, p_query text) returns void language plpgsql as $$
declare v text;
begin execute p_query into v; insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: '||coalesce(v,'(null)'));
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD query raised: '||sqlerrm);
end $$;
create function pg_temp.rec(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: completed without error');
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: raised '||sqlstate||': '||sqlerrm);
end $$;
-- denial with exact P0001 message + zero NEW events anywhere (delta proof)
create function pg_temp.deny0(p_id text, p_desc text, p_stmt text, p_expected text) returns void language plpgsql as $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from public.graduation_project_events;
  execute p_stmt;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm<>p_expected then
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected message: '||sqlerrm);
  else
    select count(*) into v_after from public.graduation_project_events;
    if v_after<>v_before then
      insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','denied but events grew by '||(v_after-v_before)||': '||sqlerrm);
    else
      insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||sqlerrm||' | zero new events');
    end if;
  end if;
when others then
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','sqlstate '||sqlstate||': '||sqlerrm);
end $$;
-- expect a specific SQLSTATE (for 23514 / 23505 / 42501 style denials)
create function pg_temp.deny_state(p_id text, p_desc text, p_stmt text, p_state text) returns void language plpgsql as $$
begin execute p_stmt; insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected '||p_state||' not raised');
exception when others then
  if sqlstate=p_state then insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||sqlstate||': '||sqlerrm);
  else insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected: '||sqlstate||': '||sqlerrm); end if;
end $$;
-- genuine ACL probe under a given role
create function pg_temp.aclr(p_id text, p_desc text, p_role text, p_stmt text, p_state text) returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  execute format('set role %I', p_role);
  begin
    execute p_stmt;
    execute 'reset role';
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected ACL denial '||p_state||' not raised');
  exception when others then
    v_state:=sqlstate; v_msg:=sqlerrm;
    execute 'reset role';
    if v_state=p_state then insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||v_state||': '||v_msg);
    else insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected: '||v_state||': '||v_msg); end if;
  end;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','outer: '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub','',true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;

-- privileged bootstrap fixtures: one project per department with head+coordinator.
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept1'),'TEST_ONLY — A06 audit d1','draft') returning id)
insert into gp_ids select 'p0',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_head'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'coordinator',(select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_head'));
insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'student',(select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_head'));
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept2'),'TEST_ONLY — A06 audit d2','draft') returning id)
insert into gp_ids select 'p0d2',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0d2'),'department_head',(select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept2'),(select v from gp_ids where k='u_head2'));
insert into gp_ids values
  ('corrS1',gen_random_uuid()),('corrS2',gen_random_uuid()),('corrR1',gen_random_uuid()),
  ('corrR2',gen_random_uuid()),('corrD9',gen_random_uuid()),('corrX',gen_random_uuid());

-- 1. settings upsert (insert path) -> exactly one canonical department event
select pg_temp.as_user('u_head');
select pg_temp.ok('T4.01.settings-insert','department_head upserts settings (insert path)',
  format('with x as (select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),pg_temp.gp('corrS1'),'set1'));
select pg_temp.guard('T4.01.event-shape','exactly one department-scoped settings_upserted event with the canonical shape',
  format('do $$ begin
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    if not exists(select 1 from public.graduation_project_events where correlation_id=%L and event_type=%L
        and project_id is null and department_id=%L::uuid and entity_type=%L and entity_id=%L::uuid
        and actor_user_id=%L::uuid and actor_assignment_id is null) then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrS1'),'settings_upserted','event count <> 1',
    pg_temp.gp('corrS1'),'settings_upserted',pg_temp.gp('dept1'),'graduation_project_settings',pg_temp.gp('set1'),pg_temp.gp('u_head'),
    'event shape mismatch'));
select pg_temp.guard('T4.01.payload-insert','payload has operation=insert, changed_keys and after-scalars',
  format('do $$ declare pl jsonb; begin
    select payload into pl from public.graduation_project_events where correlation_id=%L and event_type=%L;
    if pl->>%L<>%L or (pl->%L->>%L)::integer<>3 or not (pl->%L ? %L) then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrS1'),'settings_upserted','operation','insert','after','team_max','changed_keys','team_min','payload insert shape mismatch'));
select pg_temp.guard('T4.01.payload-no-pii-keys','payload top-level keys limited to operation/changed_keys/before/after (no PII keys)',
  format('do $$ declare pl jsonb; begin
    select payload into pl from public.graduation_project_events where correlation_id=%L and event_type=%L;
    if exists(select 1 from jsonb_object_keys(pl) k where k not in (%L,%L,%L,%L)) then raise exception %L; end if;
    if pl::text ilike %L or pl::text ilike %L then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrS1'),'settings_upserted','operation','changed_keys','before','after','unexpected payload key','%email%','%name%','PII-looking content in payload'));
select pg_temp.note('T4.01.payload-verbatim','RECORD: verbatim settings_upserted payload',
  format('select payload::text from public.graduation_project_events where correlation_id=%L and event_type=%L',
    pg_temp.gp('corrS1'),'settings_upserted'));
-- 2. faithful replay: same id, one event, updated_at unchanged
insert into gp_txt select 'set1_updated_at',updated_at::text from public.graduation_project_settings where id=(select v from gp_ids where k='set1');
select pg_temp.guard('T4.02.replay','replay same call+correlation returns the same id, one event, row untouched',
  format('do $$ begin
    if public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,%L)<>%L::uuid then raise exception %L; end if;
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    if (select updated_at::text from public.graduation_project_settings where id=%L::uuid)<>(select v from gp_txt where k=%L) then raise exception %L; end if;
    end $$',
    pg_temp.gp('dept1'),pg_temp.gp('corrS1'),pg_temp.gp('set1'),'replay returned a different id',
    pg_temp.gp('corrS1'),'settings_upserted','second event after replay',
    pg_temp.gp('set1'),'set1_updated_at','updated_at changed on replay'));
-- 3. same correlation, DIFFERENT args -> record actual behavior verbatim
select pg_temp.rec('T4.03.same-corr-different-args','RECORD: same correlation id with different args (team 9..9)',
  format('select public.upsert_graduation_project_settings(%L,null,9,9,null,false,10,3,%L)',pg_temp.gp('dept1'),pg_temp.gp('corrS1')));
select pg_temp.note('T4.03.post-state','RECORD: settings row after the colliding call (team_min/team_max, updated_at unchanged?)',
  format('select team_min||%L||team_max||%L||(updated_at::text=(select v from gp_txt where k=%L)) from public.graduation_project_settings where id=%L::uuid',
    '/',' | updated_at_unchanged=','set1_updated_at',pg_temp.gp('set1')));
-- 4. second upsert with a new correlation (update path)
select pg_temp.ok('T4.04.settings-update','second upsert with a new correlation id (update path)',
  format('select public.upsert_graduation_project_settings(%L,null,1,5,null,true,30,7,%L)',pg_temp.gp('dept1'),pg_temp.gp('corrS2')));
select pg_temp.guard('T4.04.update-event','exactly one update event with operation=update, changed_keys=[team_max], before/after',
  format('do $$ declare pl jsonb; begin
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    select payload into pl from public.graduation_project_events where correlation_id=%L and event_type=%L;
    if pl->>%L<>%L or pl->%L<>%L::jsonb or (pl->%L->>%L)::integer<>3 or (pl->%L->>%L)::integer<>5 then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrS2'),'settings_upserted','update event count <> 1',
    pg_temp.gp('corrS2'),'settings_upserted',
    'operation','update','changed_keys','["team_max"]','before','team_max','after','team_max','update payload mismatch'));
-- 5. null correlation id
select pg_temp.deny0('T4.05.null-correlation','upsert settings with a null correlation id must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,null)',pg_temp.gp('dept1')),
  'correlation id required');
-- 6. invalid payload (team_max < team_min)
insert into gp_txt select 'set1_updated_at2',updated_at::text from public.graduation_project_settings where id=(select v from gp_ids where k='set1');
select pg_temp.deny0('T4.06.invalid-payload','upsert settings with team_max<team_min must fail',
  format('select public.upsert_graduation_project_settings(%L,null,4,2,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings invalid');
select pg_temp.guard('T4.06.row-unchanged','settings row unchanged after the invalid upsert',
  format('do $$ begin if (select updated_at::text from public.graduation_project_settings where id=%L::uuid)<>(select v from gp_txt where k=%L) then raise exception %L; end if; end $$',
    pg_temp.gp('set1'),'set1_updated_at2','settings row mutated by invalid upsert'));
-- 7. coordinator lacks settings authority
select pg_temp.as_user('u_coord');
select pg_temp.deny0('T4.07.as-coordinator','coordinator upserting settings must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings administration assignment required');
-- 8. student / unrelated / anonymous
select pg_temp.as_user('u_s1');
select pg_temp.deny0('T4.08a.as-student','student upserting settings must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings administration assignment required');
select pg_temp.as_user('u_solo');
select pg_temp.deny0('T4.08b.as-unrelated','unrelated user upserting settings must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings administration assignment required');
select pg_temp.as_anon();
select pg_temp.deny0('T4.08c.as-anonymous','anonymous upserting settings must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings administration assignment required');
-- 9. wrong-department head
select pg_temp.as_user('u_head2');
select pg_temp.deny0('T4.09.wrong-dept-head','a department_head of dept2 upserting settings for dept1 must fail',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept1')),
  'settings administration assignment required');

-- 10. rubric insert
select pg_temp.as_user('u_head');
select pg_temp.ok('T4.10.rubric-insert','department_head upserts a rubric (insert path)',
  format('with x as (select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'GEN','v1','TEST_ONLY — General rubric',
    '[{"criterion_code":"c1","criterion_label":"Content","maximum_score":60,"sequence_no":1},{"criterion_code":"c2","criterion_label":"Defense","maximum_score":40,"sequence_no":2}]',
    pg_temp.gp('corrR1'),'rub1'));
select pg_temp.guard('T4.10.rubric-event','exactly one rubric_upserted event with operation=insert, code/version_label/criteria_count',
  format('do $$ declare pl jsonb; begin
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    select payload into pl from public.graduation_project_events where correlation_id=%L and event_type=%L;
    if pl->>%L<>%L or pl->>%L<>%L or pl->>%L<>%L or (pl->>%L)::integer<>2 then raise exception %L; end if;
    if not exists(select 1 from public.graduation_project_events where correlation_id=%L and event_type=%L
        and project_id is null and department_id=%L::uuid and entity_type=%L and entity_id=%L::uuid and actor_assignment_id is null) then raise exception %L; end if;
    if (select count(*) from public.graduation_project_rubric_criteria where rubric_id=%L::uuid)<>2 then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrR1'),'rubric_upserted','rubric event count <> 1',
    pg_temp.gp('corrR1'),'rubric_upserted',
    'operation','insert','code','GEN','version_label','v1','criteria_count','rubric payload mismatch',
    pg_temp.gp('corrR1'),'rubric_upserted',pg_temp.gp('dept1'),'graduation_project_rubrics',pg_temp.gp('rub1'),'rubric event shape mismatch',
    pg_temp.gp('rub1'),'criteria rows missing'));
select pg_temp.note('T4.10.payload-verbatim','RECORD: verbatim rubric_upserted payload',
  format('select payload::text from public.graduation_project_events where correlation_id=%L and event_type=%L',
    pg_temp.gp('corrR1'),'rubric_upserted'));
-- 11. rubric replay
select pg_temp.guard('T4.11.rubric-replay','rubric replay returns the same id, one event, criteria not duplicated',
  format('do $$ begin
    if public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,%L)<>%L::uuid then raise exception %L; end if;
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    if (select count(*) from public.graduation_project_rubric_criteria where rubric_id=%L::uuid)<>2 then raise exception %L; end if;
    end $$',
    pg_temp.gp('dept1'),'GEN','v1','TEST_ONLY — General rubric',
    '[{"criterion_code":"c1","criterion_label":"Content","maximum_score":60,"sequence_no":1},{"criterion_code":"c2","criterion_label":"Defense","maximum_score":40,"sequence_no":2}]',
    pg_temp.gp('corrR1'),pg_temp.gp('rub1'),'replay returned a different id',
    pg_temp.gp('corrR1'),'rubric_upserted','second rubric event after replay',
    pg_temp.gp('rub1'),'criteria duplicated after replay'));
-- 12. rubric update path
select pg_temp.ok('T4.12.rubric-update','rubric update path (p_rubric_id set, 3 criteria)',
  format('select public.upsert_graduation_project_rubric(%L,%L,%L,%L,%L,65,%L::jsonb,%L)',
    pg_temp.gp('dept1'),pg_temp.gp('rub1'),'GEN','v1','TEST_ONLY — General rubric (revised)',
    '[{"criterion_code":"c1","criterion_label":"Content","maximum_score":50,"sequence_no":1},{"criterion_code":"c2","criterion_label":"Defense","maximum_score":30,"sequence_no":2},{"criterion_code":"c3","criterion_label":"Impact","maximum_score":20,"sequence_no":3}]',
    pg_temp.gp('corrR2')));
select pg_temp.guard('T4.12.rubric-update-event','one update event with before/after title/threshold/criteria_count; criteria replaced',
  format('do $$ declare pl jsonb; begin
    if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    select payload into pl from public.graduation_project_events where correlation_id=%L and event_type=%L;
    if pl->>%L<>%L or pl->%L->>%L<>%L or (pl->%L->>%L)::integer<>2
      or pl->%L->>%L<>%L or (pl->%L->>%L)::numeric<>65 then raise exception %L; end if;
    if (select count(*) from public.graduation_project_rubric_criteria where rubric_id=%L::uuid)<>3 then raise exception %L; end if;
    end $$',
    pg_temp.gp('corrR2'),'rubric_upserted','update event count <> 1',
    pg_temp.gp('corrR2'),'rubric_upserted',
    'operation','update','before','title','TEST_ONLY — General rubric','before','criteria_count',
    'after','title','TEST_ONLY — General rubric (revised)','after','passing_threshold','update payload mismatch',
    pg_temp.gp('rub1'),'criteria not replaced'));
-- 13. rubric null correlation
select pg_temp.deny0('T4.13.rubric-null-correlation','rubric upsert with a null correlation id must fail',
  format('select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,null)',
    pg_temp.gp('dept1'),'GEN2','v1','TEST_ONLY — x',
    '[{"criterion_code":"c1","criterion_label":"C","maximum_score":10,"sequence_no":1}]'),
  'correlation id required');
-- 14. rubric invalid payload
select pg_temp.deny0('T4.14.rubric-invalid','rubric upsert with an empty criteria array must fail',
  format('select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
    pg_temp.gp('dept1'),'GEN2','v1','TEST_ONLY — x','[]'),
  'rubric payload invalid');
select pg_temp.guard('T4.14.criteria-unchanged','criteria unchanged after the invalid rubric upsert',
  format('do $$ begin if (select count(*) from public.graduation_project_rubric_criteria where rubric_id=%L::uuid)<>3 then raise exception %L; end if; end $$',
    pg_temp.gp('rub1'),'criteria mutated by invalid upsert'));
-- 15. rubric not found
select pg_temp.deny0('T4.15.rubric-not-found','rubric update against a non-existent rubric id must fail',
  format('select public.upsert_graduation_project_rubric(%L,gen_random_uuid(),%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
    pg_temp.gp('dept1'),'GEN2','v1','TEST_ONLY — x',
    '[{"criterion_code":"c1","criterion_label":"C","maximum_score":10,"sequence_no":1}]'),
  'rubric not found');
-- 16. rubric as coordinator
select pg_temp.as_user('u_coord');
select pg_temp.deny0('T4.16.rubric-as-coordinator','coordinator upserting a rubric must fail',
  format('select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
    pg_temp.gp('dept1'),'GEN2','v1','TEST_ONLY — x',
    '[{"criterion_code":"c1","criterion_label":"C","maximum_score":10,"sequence_no":1}]'),
  'rubric administration assignment required');

-- 17. append-only trigger covers the new department-scoped rows
select pg_temp.deny0('T4.17a.append-only-update','UPDATE on a department-scoped event row must fail',
  format('update public.graduation_project_events set payload=%L::jsonb where correlation_id=%L and event_type=%L',
    '{}',pg_temp.gp('corrS1'),'settings_upserted'),
  'graduation project events are append-only');
select pg_temp.deny0('T4.17b.append-only-delete','DELETE on a department-scoped event row must fail',
  format('delete from public.graduation_project_events where correlation_id=%L and event_type=%L',
    pg_temp.gp('corrS1'),'settings_upserted'),
  'graduation project events are append-only');
-- 18. scope CHECK: both scopes set / both null
select pg_temp.deny_state('T4.18a.scope-both-set','direct insert with both project_id and department_id must violate the scope CHECK',
  format('insert into public.graduation_project_events(project_id,department_id,actor_user_id,event_type,entity_type,correlation_id) values(%L,%L,%L,%L,%L,gen_random_uuid())',
    pg_temp.gp('p0'),pg_temp.gp('dept1'),pg_temp.gp('u_head'),'probe','probe'),
  '23514');
select pg_temp.deny_state('T4.18b.scope-both-null','direct insert with both scopes null must violate the scope CHECK',
  format('insert into public.graduation_project_events(project_id,department_id,actor_user_id,event_type,entity_type,correlation_id) values(null,null,%L,%L,%L,gen_random_uuid())',
    pg_temp.gp('u_head'),'probe','probe'),
  '23514');
-- 19. department dedupe index: same (department_id, correlation_id, event_type) twice
select pg_temp.ok('SETUP.dedupe-first','first department event for the dedupe probe',
  format('insert into public.graduation_project_events(project_id,department_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,payload) values(null,%L,%L,%L,%L,gen_random_uuid(),%L,%L::jsonb)',
    pg_temp.gp('dept1'),pg_temp.gp('u_head'),'settings_upserted','graduation_project_settings',pg_temp.gp('corrD9'),'{"probe":1}'));
select pg_temp.deny_state('T4.19.department-dedupe','second department event with the same (department_id, correlation_id, event_type) must fail unique',
  format('insert into public.graduation_project_events(project_id,department_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,payload) values(null,%L,%L,%L,%L,gen_random_uuid(),%L,%L::jsonb)',
    pg_temp.gp('dept1'),pg_temp.gp('u_head'),'settings_upserted','graduation_project_settings',pg_temp.gp('corrD9'),'{"probe":2}'),
  '23505');
-- 20. no notification fan-out for the new department event types
select pg_temp.guard('T4.20.no-notification-fanout','notification_log gains zero rows for settings_upserted / rubric_upserted',
  format('do $$ begin if exists(select 1 from public.graduation_project_notification_log where notification_type in (%L,%L)) then raise exception %L; end if; end $$',
    'settings_upserted','rubric_upserted','notification fan-out leaked department events'));
-- 21. rank function ACL
select pg_temp.aclr('T4.21a.rank-acl-authenticated','graduation_project_assignment_rank as role authenticated must fail 42501',
  'authenticated',$$select public.graduation_project_assignment_rank('dean')$$,'42501');
select pg_temp.aclr('T4.21b.rank-acl-anon','graduation_project_assignment_rank as role anon must fail 42501',
  'anon',$$select public.graduation_project_assignment_rank('dean')$$,'42501');

select 'AUDIT06|'||id||'|'||result||'|'||description||' :: '||detail from a06r order by n;
rollback;
