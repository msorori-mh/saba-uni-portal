-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Package: GP identity directory options + revision notes persistence
-- Mission: PORTAL-GRADUATION-PROJECTS-FINAL-PRODUCT-AND-E2E-CLOSURE-01
-- Source draft: docs/migration-drafts/GRADUATION-PROJECTS-IDENTITY-OPTIONS-AND-REVISION-NOTES-01.sql
-- DO NOT APPLY until L4 eligibility guard is applied and preflight PASSes.
begin;

do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'GP_IDENTITY_OPTIONS_A1_MISSING: graduation projects foundation required';
  end if;
  if to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid)') is null
     and to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid,text)') is null then
    raise exception 'GP_IDENTITY_OPTIONS_CONCLUDE_MISSING: conclude_graduation_project_result required';
  end if;
  if to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is null then
    raise exception 'GP_IDENTITY_OPTIONS_L4_MISSING: apply L4 eligibility guard first';
  end if;
end $$;

-- =============================================================================
-- Conclude result: optional p_notes persisted on event + readable via detail
-- =============================================================================

drop function if exists public.conclude_graduation_project_result(uuid, text, bigint, uuid);
drop function if exists public.conclude_graduation_project_result(uuid, text, bigint, uuid, text);

create function public.conclude_graduation_project_result(
  p_project_id uuid,
  p_decision text,
  p_expected_version bigint,
  p_correlation_id uuid,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.graduation_project_assignments;
  p public.graduation_projects;
  d public.graduation_project_discussions;
  v_avg numeric(5,2);
  v_panel int;
  v_submitted int;
  v_dec public.graduation_project_final_decision;
  v_req jsonb;
  v_replay uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(
    p_project_id,
    array['coordinator']::public.graduation_project_assignment_role[]
  );
  v_req := jsonb_build_object(
    'decision', p_decision,
    'expected_version', p_expected_version,
    'notes', v_notes
  );
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'result_concluded', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'evaluating' then raise exception 'result conclusion state denied'; end if;
  begin
    v_dec := p_decision::public.graduation_project_final_decision;
  exception when invalid_text_representation then
    raise exception 'final decision invalid';
  end;
  if v_dec not in ('passed','revisions_required','failed') then
    raise exception 'final decision invalid';
  end if;
  if v_dec = 'revisions_required' and v_notes is null then
    raise exception 'revision notes required';
  end if;
  select * into d from public.graduation_project_discussions
    where project_id = p_project_id and state = 'held';
  select count(*) into v_panel from public.graduation_project_panel_members where discussion_id = d.id;
  select count(*) into v_submitted from public.graduation_project_evaluations
    where discussion_id = d.id and state = 'submitted';
  if v_panel < 2 or v_submitted <> v_panel then
    raise exception 'all committee evaluations required';
  end if;
  select round(avg(score), 2) into v_avg from public.graduation_project_evaluations
    where discussion_id = d.id and state = 'submitted';
  update public.graduation_projects
    set final_decision = v_dec,
        average_score = v_avg,
        version = version + 1,
        updated_at = now()
    where id = p_project_id;
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    p_project_id, auth.uid(), a.id, 'result_concluded', 'graduation_projects', p_project_id, p_correlation_id,
    jsonb_build_object(
      'request', v_req,
      'final_decision', v_dec::text,
      'average_score', v_avg,
      'notes', v_notes
    )
  );
  return p_project_id;
end $$;

revoke all on function public.conclude_graduation_project_result(uuid, text, bigint, uuid, text)
  from public, anon;
grant execute on function public.conclude_graduation_project_result(uuid, text, bigint, uuid, text)
  to authenticated;

-- =============================================================================
-- Detail: identity_options (dept-scoped) + revisions_notes + committee_count
-- =============================================================================

create or replace function public.get_graduation_project_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.graduation_projects;
  v_roles text[];
  v_is_coord boolean;
  v_is_panel boolean;
  v_is_leader boolean;
  v_own_eval jsonb;
  v_agg jsonb;
  v_identity jsonb := '{}'::jsonb;
  v_notes text;
  v_committee_count int := 0;
  v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
  ) then raise exception 'exact direct processing assignment required'; end if;
  perform public.require_student_actor_gp_fourth_level(p_project_id);
  select array_agg(distinct a.role::text) into v_roles
    from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active;
  v_is_coord := 'coordinator' = any (v_roles);
  v_is_panel := 'panel_member' = any (v_roles);
  v_is_leader := exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
      and a.role = 'student' and a.is_leader
  );

  if v_is_panel then
    select jsonb_build_object('evaluation_id', e.id, 'score', e.score, 'notes', e.notes, 'state', e.state)
      into v_own_eval
    from public.graduation_project_evaluations e
    join public.graduation_project_panel_members pm on pm.id = e.panel_member_id
    join public.graduation_project_assignments asg on asg.id = pm.assignment_id
    where e.project_id = p_project_id and asg.user_id = auth.uid()
    order by e.submitted_at desc nulls last
    limit 1;
  end if;

  if v_is_coord then
    select jsonb_build_object(
      'submitted_count', count(*) filter (where e.state = 'submitted'),
      'required_count', greatest(count(distinct pm.id), 2),
      'average_score', p.average_score
    ) into v_agg
    from public.graduation_project_discussions d
    left join public.graduation_project_panel_members pm on pm.discussion_id = d.id
    left join public.graduation_project_evaluations e on e.discussion_id = d.id
    where d.project_id = p_project_id;
  end if;

  select count(*) into v_committee_count
  from public.graduation_project_panel_members pm
  join public.graduation_project_discussions dd on dd.id = pm.discussion_id
  where dd.project_id = p_project_id;

  select nullif(btrim(coalesce(e.payload->>'notes', e.payload->'request'->>'notes', '')), '')
    into v_notes
  from public.graduation_project_events e
  where e.project_id = p_project_id and e.event_type = 'result_concluded'
  order by e.occurred_at desc nulls last
  limit 1;

  if v_is_coord or v_is_leader then
    select jsonb_build_object(
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', sp.id,
          'user_id', sp.user_id,
          'name', sp.full_name_ar,
          'academic_number', sp.academic_number
        ) order by sp.full_name_ar)
        from public.student_profiles sp
        where sp.department_id = p.department_id
          and sp.status = 'active'
          and sp.user_id is not null
          and public.student_is_current_fourth_academic_level(sp.id)
          and not exists (
            select 1 from public.graduation_project_assignments a
            where a.user_id = sp.user_id and a.role = 'student' and a.active
          )
      ), '[]'::jsonb),
      'supervisors', case when v_is_coord then coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', fp.id,
          'user_id', fp.user_id,
          'name', fp.full_name_ar,
          'employee_number', fp.employee_number
        ) order by fp.full_name_ar)
        from public.faculty_profiles fp
        where fp.department_id = p.department_id
          and fp.status = 'active'
          and fp.user_id is not null
      ), '[]'::jsonb) else '[]'::jsonb end,
      'committee', case when v_is_coord then coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', fp.id,
          'user_id', fp.user_id,
          'name', fp.full_name_ar,
          'employee_number', fp.employee_number
        ) order by fp.full_name_ar)
        from public.faculty_profiles fp
        where fp.department_id = p.department_id
          and fp.status = 'active'
          and fp.user_id is not null
      ), '[]'::jsonb) else '[]'::jsonb end
    ) into v_identity;
  end if;

  select jsonb_build_object(
    'project_id', p.id,
    'department_id', p.department_id,
    'title', p.title,
    'problem_statement', p.problem_statement,
    'objectives', p.objectives,
    'summary', p.summary,
    'lifecycle_state', p.lifecycle_state::text,
    'final_decision', p.final_decision::text,
    'revisions_notes', v_notes,
    'average_score', case when v_is_coord then p.average_score else null end,
    'version', p.version,
    'team', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', x.id, 'user_id', x.user_id, 'is_leader', x.is_leader, 'active', x.active
      )) from public.graduation_project_assignments x
      where x.project_id = p_project_id and x.role = 'student'), '[]'::jsonb),
    'supervisor', (select jsonb_build_object(
        'user_id', x.user_id, 'status', x.supervision_status::text, 'active', x.active
      ) from public.graduation_project_assignments x
      where x.project_id = p_project_id and x.role = 'supervisor' and x.active
        and x.supervision_status in ('pending','accepted') limit 1),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'version_no', pe.version_no, 'summary', pe.summary,
        'state', pe.state, 'review_comments', pe.review_comments,
        'file_id', pe.file_id
      ) order by pe.version_no)
      from public.graduation_project_progress_entries pe where pe.project_id = p_project_id), '[]'::jsonb),
    'final_file', (select jsonb_build_object(
        'file_id', ff.id, 'scan_state', ff.scan_state::text,
        'is_current', ff.is_current, 'upload_status', ff.upload_status::text
      ) from public.graduation_project_files ff
      where ff.project_id = p_project_id and ff.category = 'final' and ff.is_current limit 1),
    'proposal_file', (select jsonb_build_object(
        'file_id', pf.id, 'scan_state', pf.scan_state::text, 'is_current', pf.is_current
      ) from public.graduation_project_files pf
      where pf.project_id = p_project_id and pf.category = 'proposal' and pf.is_current limit 1),
    'defense', (select jsonb_build_object(
        'discussion_id', dd.id, 'starts_at', dd.starts_at, 'venue', dd.venue,
        'state', dd.state, 'committee_count', v_committee_count
      ) from public.graduation_project_discussions dd where dd.project_id = p_project_id),
    'own_evaluation', v_own_eval,
    'evaluation_aggregate', v_agg,
    'identity_options', v_identity,
    'viewer_roles', to_jsonb(v_roles)
  ) into v;
  return v;
end $$;

commit;
