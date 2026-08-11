-- Academic date contract: Yemen local date (UTC+3)
CREATE OR REPLACE FUNCTION public.gp_academic_date(p_at timestamptz DEFAULT now())
RETURNS date LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$ SELECT (p_at AT TIME ZONE 'Asia/Aden')::date $$;

-- GP-3E: co-supervision stays deferred; policies may not enable it
CREATE OR REPLACE FUNCTION public.gp_guard_policy_co_supervisor_deferred()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF coalesce(NEW.allow_co_supervisor, false) OR coalesce(NEW.max_supervisors, 1) > 1 THEN
    RAISE EXCEPTION 'co-supervision is not supported yet (CO_SUPERVISOR=DEFERRED)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_gp_policy_co_supervisor_deferred ON public.graduation_project_policies;
CREATE TRIGGER tg_gp_policy_co_supervisor_deferred
  BEFORE INSERT OR UPDATE ON public.graduation_project_policies
  FOR EACH ROW EXECUTE FUNCTION public.gp_guard_policy_co_supervisor_deferred();

-- GP-3A/3B: min team size + proposal window on submit
CREATE OR REPLACE FUNCTION public.submit_graduation_project_proposal(p_project_id uuid, p_expected_version bigint, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; v_req jsonb; v_replay uuid;
  pol public.graduation_project_policies; v_members int; v_today date;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'proposal_submitted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'draft' then raise exception 'proposal transition precondition failed'; end if;
  if not public.gp_proposal_complete(p) then raise exception 'proposal fields incomplete'; end if;
  if not public.gp_has_current_clean_file(p_project_id, 'proposal') then raise exception 'proposal attachment required'; end if;

  pol := public.gp_project_policy(p_project_id);
  select count(*) into v_members from public.graduation_project_assignments
    where project_id = p_project_id and role = 'student' and active;
  if v_members < coalesce(pol.min_team_size, 1) then
    raise exception 'graduation project team size below configured minimum';
  end if;
  v_today := public.gp_academic_date();
  if pol.proposal_window_start is not null and v_today < pol.proposal_window_start then
    raise exception 'proposal submission window not open';
  end if;
  if pol.proposal_window_end is not null and v_today > pol.proposal_window_end then
    raise exception 'proposal submission window closed';
  end if;

  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_submitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $function$;

CREATE OR REPLACE FUNCTION public.resubmit_graduation_project_proposal(p_project_id uuid, p_expected_version bigint, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; v_req jsonb; v_replay uuid;
  pol public.graduation_project_policies; v_members int; v_today date;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'proposal_resubmitted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'revision_required' then raise exception 'proposal resubmission precondition failed'; end if;
  if not public.gp_proposal_complete(p) then raise exception 'proposal fields incomplete'; end if;
  if not public.gp_has_current_clean_file(p_project_id, 'proposal') then raise exception 'proposal attachment required'; end if;

  pol := public.gp_project_policy(p_project_id);
  select count(*) into v_members from public.graduation_project_assignments
    where project_id = p_project_id and role = 'student' and active;
  if v_members < coalesce(pol.min_team_size, 1) then
    raise exception 'graduation project team size below configured minimum';
  end if;
  v_today := public.gp_academic_date();
  if pol.proposal_window_start is not null and v_today < pol.proposal_window_start then
    raise exception 'proposal submission window not open';
  end if;
  if pol.proposal_window_end is not null and v_today > pol.proposal_window_end then
    raise exception 'proposal submission window closed';
  end if;

  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_resubmitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $function$;

-- GP-3C: required APPROVED progress reports before final submission
CREATE OR REPLACE FUNCTION public.submit_graduation_project_final(p_project_id uuid, p_file_id uuid, p_expected_version bigint, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  v_req jsonb; v_replay uuid; pol public.graduation_project_policies; v_approved int;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('file_id', p_file_id, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'final_submitted', v_req);
  if v_replay is not null then return p_file_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'active' and p.final_decision is distinct from 'revisions_required' then
    raise exception 'final submit state denied';
  end if;

  pol := public.gp_project_policy(p_project_id);
  if coalesce(pol.required_progress_reports, 0) > 0 then
    select count(*) into v_approved from public.graduation_project_progress_entries
      where project_id = p_project_id and state = 'approved';
    if v_approved < pol.required_progress_reports then
      raise exception 'required approved progress reports not met';
    end if;
  end if;

  select * into f from public.graduation_project_files where id = p_file_id and project_id = p_project_id for update;
  if f.id is null or f.category <> 'final' or not f.is_current or f.upload_status <> 'active' or f.scan_state <> 'clean' then
    raise exception 'current clean final file required';
  end if;
  update public.graduation_projects set version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'final_submitted', 'graduation_project_files', f.id, p_correlation_id,
      jsonb_build_object('request', v_req, 'file_id', f.id));
  return f.id;
end $function$;

-- GP-3D: defense window checked against the scheduled defense date
CREATE OR REPLACE FUNCTION public.schedule_graduation_project_defense(p_project_id uuid, p_starts_at timestamp with time zone, p_venue text, p_expected_version bigint, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  d_id uuid; v_req jsonb; v_replay uuid; pol public.graduation_project_policies; v_day date;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('starts_at', p_starts_at, 'venue', p_venue, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'defense_scheduled', v_req);
  if v_replay is not null then return v_replay; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'active' then raise exception 'defense schedule state denied'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments s
    where s.project_id = p_project_id and s.role = 'supervisor' and s.active and s.supervision_status = 'accepted'
  ) then raise exception 'accepted supervisor required'; end if;
  select * into f from public.graduation_project_files
    where project_id = p_project_id and category = 'final' and is_current and upload_status = 'active' and scan_state = 'clean';
  if f.id is null then raise exception 'current clean final file required'; end if;
  if not exists (
    select 1 from public.graduation_project_events ev
    where ev.project_id = p_project_id and ev.event_type = 'final_marked_ready' and ev.entity_id = f.id
      and ev.occurred_at >= (
        select max(x.occurred_at) from public.graduation_project_events x
        where x.project_id = p_project_id and x.event_type = 'final_submitted' and x.entity_id = f.id
      )
  ) then raise exception 'final readiness required'; end if;
  if length(btrim(coalesce(p_venue,''))) = 0 or p_starts_at is null then raise exception 'defense schedule fields required'; end if;

  pol := public.gp_project_policy(p_project_id);
  v_day := public.gp_academic_date(p_starts_at);
  if pol.defense_window_start is not null and v_day < pol.defense_window_start then
    raise exception 'defense date before configured defense window';
  end if;
  if pol.defense_window_end is not null and v_day > pol.defense_window_end then
    raise exception 'defense date after configured defense window';
  end if;

  insert into public.graduation_project_discussions(project_id, starts_at, venue, coordinator_assignment_id, state)
    values (p_project_id, p_starts_at, btrim(p_venue), a.id, 'scheduled') returning id into d_id;
  update public.graduation_projects set lifecycle_state = 'defense_scheduled', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'defense_scheduled', 'graduation_project_discussions', d_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'starts_at', p_starts_at, 'venue', btrim(p_venue)));
  return d_id;
end $function$;