-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Original k3 migration file: supabase/migrations/20260730100007_4f682b52-7e51-486d-ad02-4d886d2331ec.sql
-- Intended apply order: M8 of 8 (original timestamp 20260730100007).
-- Relocated from supabase/migrations/ to docs/migration-drafts/ per source-only mission rules.

-- GRADUATION-PROJECTS-PANEL-COMPLETENESS-01 (forward-only, NOT_APPLIED).
-- GP-08 journey 11: a discussion must not be recorded as held with an
-- incomplete committee. The 'held' outcome now requires at least one panel
-- member and exactly the assigned chair to be present. Scheduling itself stays
-- available (panel members can only be attached to a scheduled discussion), so
-- the completeness gate lives at the held transition.
begin;
do $$ begin
  if to_regprocedure('public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)') is null then
    raise exception 'graduation projects lifecycle missing; apply reviewed lifecycle first';
  end if;
end $$;

create or replace function public.record_graduation_project_discussion_outcome(
  p_project_id uuid, p_discussion_id uuid, p_outcome text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  d public.graduation_project_discussions; v_event text;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p_outcome not in ('held','postponed','cancelled') then raise exception 'discussion outcome unknown'; end if;
  v_event:=case p_outcome when 'held' then 'discussion_held' when 'postponed' then 'discussion_postponed' else 'discussion_cancelled' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_discussion_id; end if;
  select * into d from public.graduation_project_discussions where id=p_discussion_id and project_id=p_project_id for update;
  if d.id is null then raise exception 'discussion not found'; end if;
  if p_outcome='held' then
    if d.state not in ('scheduled','postponed') or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    if not exists(select 1 from public.graduation_project_panel_members pm where pm.discussion_id=d.id and pm.project_id=p_project_id)
      or not exists(select 1 from public.graduation_project_panel_members pm where pm.discussion_id=d.id and pm.project_id=p_project_id and pm.chair) then
      raise exception 'panel incomplete for defense';
    end if;
    update public.graduation_project_discussions set state='held' where id=d.id;
    update public.graduation_projects set state='evaluating',version=version+1,updated_at=now() where id=p_project_id;
  elsif p_outcome='postponed' then
    if d.state<>'scheduled' or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    update public.graduation_project_discussions set state='postponed' where id=d.id;
  else
    if d.state not in ('scheduled','postponed') or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    update public.graduation_project_discussions set state='cancelled' where id=d.id;
    update public.graduation_project_discussion_requests set state='cancelled',decided_at=now() where id=d.request_id;
    update public.graduation_projects set state='active',version=version+1,updated_at=now() where id=p_project_id;
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_project_discussions',d.id,p_correlation_id);
  return d.id;
end $$;
commit;
