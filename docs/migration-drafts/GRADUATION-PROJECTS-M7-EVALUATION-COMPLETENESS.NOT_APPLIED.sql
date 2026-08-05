-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Original k3 migration file: supabase/migrations/20260730100006_b953bddf-de2d-43f6-9d3d-10755d8a9da6.sql
-- Intended apply order: M7 of 8 (original timestamp 20260730100006).
-- Relocated from supabase/migrations/ to docs/migration-drafts/ per source-only mission rules.

-- GRADUATION-PROJECTS-EVALUATION-COMPLETENESS-01 (forward-only, NOT_APPLIED).
-- GP-07 finding (High): conclude_graduation_project_result previously verified
-- only that every RECORDED evaluation was finalized. A panel member who never
-- submitted left no row, so the result could be concluded with a missing
-- evaluation. The guard now requires every panel member of the held discussion
-- to hold a finalized evaluation.
begin;
do $$ begin
  if to_regprocedure('public.conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid)') is null then
    raise exception 'graduation projects lifecycle missing; apply reviewed lifecycle first';
  end if;
end $$;

create or replace function public.conclude_graduation_project_result(
  p_project_id uuid, p_outcome text, p_corrections jsonb, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  v_event text; v_stage text; v_round integer; v_correction jsonb; v_discussion uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['department_head','dean']::public.graduation_project_assignment_role[]);
  if p_outcome not in ('completed','corrections_required') then raise exception 'result outcome unknown'; end if;
  v_event:=case p_outcome when 'completed' then 'result_completed' else 'corrections_requested' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_project_id; end if;
  if p.state<>'evaluating' or p.version<>p_expected_version then raise exception 'result conclusion precondition failed'; end if;
  if not exists(select 1 from public.graduation_project_evaluations e where e.project_id=p_project_id and e.state='finalized')
    or exists(select 1 from public.graduation_project_evaluations e where e.project_id=p_project_id and e.state<>'finalized') then
    raise exception 'evaluations not finalized';
  end if;
  -- Panel completeness: every panel member of the held discussion must hold a
  -- finalized evaluation (a member who never submitted must not be skippable).
  select d.id into v_discussion from public.graduation_project_discussions d
    where d.project_id=p_project_id and d.state='held'
    order by d.starts_at desc limit 1;
  if v_discussion is null
    or exists(select 1 from public.graduation_project_panel_members pm
      where pm.project_id=p_project_id and pm.discussion_id=v_discussion
        and not exists(select 1 from public.graduation_project_evaluations e
          where e.project_id=p_project_id and e.panel_member_id=pm.id and e.state='finalized')) then
    raise exception 'evaluations not finalized';
  end if;
  if p_outcome='corrections_required' then
    if p_corrections is null or jsonb_typeof(p_corrections)<>'array' or jsonb_array_length(p_corrections)=0
      or exists(select 1 from jsonb_array_elements(p_corrections) el where jsonb_typeof(el)<>'object' or length(trim(coalesce(el->>'description','')))=0) then
      raise exception 'corrections payload invalid';
    end if;
  end if;
  select count(*) into v_round from public.graduation_project_approvals where project_id=p_project_id and stage like 'result_round_%';
  v_stage:='result_round_'||(v_round+1);
  insert into public.graduation_project_approvals(project_id,stage,decision,assignment_id)
    values(p_project_id,v_stage,case p_outcome when 'completed' then 'approved' else 'revision_required' end,a.id);
  if p_outcome='completed' then
    update public.graduation_projects set state='completed',completed_at=now(),version=version+1,updated_at=now() where id=p_project_id;
  else
    for v_correction in select * from jsonb_array_elements(p_corrections) loop
      insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description,due_at)
        values(p_project_id,a.id,trim(v_correction->>'description'),
          case when coalesce(v_correction->>'due_at','')~'^[0-9]{4}-' then (v_correction->>'due_at')::timestamptz else null end);
    end loop;
    update public.graduation_projects set state='corrections_required',version=version+1,updated_at=now() where id=p_project_id;
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_projects',p_project_id,p_correlation_id);
  return p_project_id;
end $$;
commit;
