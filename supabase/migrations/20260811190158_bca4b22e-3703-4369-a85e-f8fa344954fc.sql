CREATE OR REPLACE FUNCTION public.get_graduation_project_detail(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_archive jsonb;
  v_round int;
  v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
  ) then raise exception 'exact direct processing assignment required'; end if;
  if to_regprocedure('public.require_student_actor_gp_fourth_level(uuid)') is not null then
    perform public.require_student_actor_gp_fourth_level(p_project_id);
  end if;

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
  v_round := coalesce(p.evaluation_round, 1);

  if v_is_panel then
    select jsonb_build_object(
      'evaluation_id', e.id, 'score', e.score, 'notes', e.notes, 'state', e.state,
      'evaluation_round', e.evaluation_round
    )
      into v_own_eval
    from public.graduation_project_evaluations e
    join public.graduation_project_panel_members pm on pm.id = e.panel_member_id
    join public.graduation_project_assignments asg on asg.id = pm.assignment_id
    where e.project_id = p_project_id
      and asg.user_id = auth.uid()
      and e.evaluation_round = v_round
    order by e.submitted_at desc nulls last
    limit 1;
  end if;

  select count(*) into v_committee_count
  from public.graduation_project_panel_members pm
  join public.graduation_project_discussions dd on dd.id = pm.discussion_id
  where dd.project_id = p_project_id;

  if v_is_coord then
    select jsonb_build_object(
      'submitted_count', (
        select count(*)::int
        from public.graduation_project_evaluations e
        join public.graduation_project_discussions d on d.id = e.discussion_id
        where d.project_id = p_project_id
          and e.state = 'submitted'
          and e.evaluation_round = v_round
      ),
      'required_count', v_committee_count,
      'average_score', p.average_score,
      'evaluation_round', v_round
    ) into v_agg;
  end if;

  select nullif(btrim(coalesce(e.payload->>'notes', e.payload->'request'->>'notes', '')), '')
    into v_notes
  from public.graduation_project_events e
  where e.project_id = p_project_id and e.event_type = 'result_concluded'
  order by e.occurred_at desc nulls last
  limit 1;

  select jsonb_build_object(
    'archive_id', ar.id,
    'archived_at', ar.archived_at,
    'final_decision', ar.final_decision::text,
    'average_score', ar.average_score,
    'final_file_id', ar.final_file_id,
    'summary', coalesce(nullif(btrim(p.title), ''), 'مشروع مؤرشف')
  ) into v_archive
  from public.graduation_project_final_archives ar
  where ar.project_id = p_project_id;

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
          and (
            case
              when to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is null then true
              else public.student_is_current_fourth_academic_level(sp.id)
            end
          )
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
    'evaluation_round', v_round,
    'viewer_is_leader', v_is_leader,
    'team', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', x.id, 'user_id', x.user_id, 'is_leader', x.is_leader, 'active', x.active,
        'name', coalesce(nullif(btrim(sp.full_name_ar), ''), 'عضو الفريق'),
        'academic_number', sp.academic_number
      )) from public.graduation_project_assignments x
      left join public.student_profiles sp on sp.user_id = x.user_id
      where x.project_id = p_project_id and x.role = 'student'), '[]'::jsonb),
    'supervisor', (select jsonb_build_object(
        'user_id', x.user_id, 'status', x.supervision_status::text, 'active', x.active,
        'name', coalesce(nullif(btrim(fp.full_name_ar), ''), 'مشرف')
      ) from public.graduation_project_assignments x
      left join public.faculty_profiles fp on fp.user_id = x.user_id
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
    'archive', v_archive,
    'identity_options', v_identity,
    'viewer_roles', to_jsonb(v_roles)
  ) into v;
  return v;
end $function$;