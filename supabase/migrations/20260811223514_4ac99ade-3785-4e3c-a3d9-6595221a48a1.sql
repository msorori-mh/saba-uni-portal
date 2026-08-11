ALTER TABLE public.graduation_project_policies
  ADD COLUMN IF NOT EXISTS enforce_proposal_window boolean,
  ADD COLUMN IF NOT EXISTS enforce_defense_window boolean;

-- Backfill already-published policies with an explicit decision derived from
-- their stored dates so published rows stay self-consistent (no behaviour change).
UPDATE public.graduation_project_policies
   SET enforce_proposal_window = (proposal_window_start IS NOT NULL AND proposal_window_end IS NOT NULL)
 WHERE enforce_proposal_window IS NULL AND status IN ('published','superseded');
UPDATE public.graduation_project_policies
   SET enforce_defense_window = (defense_window_start IS NOT NULL AND defense_window_end IS NOT NULL)
 WHERE enforce_defense_window IS NULL AND status IN ('published','superseded');

-- Draft save stays permissive: persist the (possibly undecided) window flags.
CREATE OR REPLACE FUNCTION public.gp_admin_save_policy_draft(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dept uuid := nullif(p_payload->>'department_id','')::uuid;
  v_year uuid := nullif(p_payload->>'academic_year_id','')::uuid;
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_version integer;
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;

  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.graduation_project_policies WHERE id = v_id AND status = 'draft') THEN
      RAISE EXCEPTION 'only draft policies can be edited';
    END IF;
  ELSE
    SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.graduation_project_policies
     WHERE department_id IS NOT DISTINCT FROM v_dept
       AND academic_year_id IS NOT DISTINCT FROM v_year;
    INSERT INTO public.graduation_project_policies(department_id, academic_year_id, version, status, created_by)
      VALUES (v_dept, v_year, v_version, 'draft', auth.uid())
      RETURNING id INTO v_id;
  END IF;

  UPDATE public.graduation_project_policies SET
    min_team_size = nullif(p_payload->>'min_team_size','')::int,
    max_team_size = nullif(p_payload->>'max_team_size','')::int,
    allow_co_supervisor = false,
    max_supervisors = 1,
    required_progress_reports = nullif(p_payload->>'required_progress_reports','')::int,
    min_committee_members = nullif(p_payload->>'min_committee_members','')::int,
    max_committee_members = nullif(p_payload->>'max_committee_members','')::int,
    passing_score = nullif(p_payload->>'passing_score','')::numeric,
    max_revision_rounds = nullif(p_payload->>'max_revision_rounds','')::int,
    enforce_proposal_window = nullif(p_payload->>'enforce_proposal_window','')::boolean,
    enforce_defense_window = nullif(p_payload->>'enforce_defense_window','')::boolean,
    proposal_window_start = nullif(p_payload->>'proposal_window_start','')::date,
    proposal_window_end = nullif(p_payload->>'proposal_window_end','')::date,
    defense_window_start = nullif(p_payload->>'defense_window_start','')::date,
    defense_window_end = nullif(p_payload->>'defense_window_end','')::date,
    notes = nullif(btrim(coalesce(p_payload->>'notes','')), ''),
    updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END $function$;

-- Publish-time validation: academic values required, and each window needs an
-- explicit administrative decision (true => dates required, false => no window).
CREATE OR REPLACE FUNCTION public.gp_validate_policy(p_policy_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.graduation_project_policies; e text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO r FROM public.graduation_project_policies WHERE id = p_policy_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'policy not found'; END IF;

  IF r.min_team_size IS NULL THEN e := e || 'الحد الأدنى لأعضاء الفريق مطلوب.'; END IF;
  IF r.max_team_size IS NULL THEN e := e || 'الحد الأعلى لأعضاء الفريق مطلوب.'; END IF;
  IF r.required_progress_reports IS NULL THEN e := e || 'عدد تقارير التقدم المطلوبة مطلوب.'; END IF;
  IF r.min_committee_members IS NULL THEN e := e || 'الحد الأدنى لأعضاء لجنة المناقشة مطلوب.'; END IF;
  IF r.max_committee_members IS NULL THEN e := e || 'الحد الأعلى لأعضاء لجنة المناقشة مطلوب.'; END IF;
  IF r.passing_score IS NULL THEN e := e || 'درجة النجاح مطلوبة.'; END IF;
  IF r.max_revision_rounds IS NULL THEN e := e || 'عدد جولات التعديل مطلوب.'; END IF;

  IF r.min_team_size IS NOT NULL AND r.min_team_size < 1 THEN
    e := e || 'الحد الأدنى لأعضاء الفريق لا يقل عن 1.'; END IF;
  IF r.min_team_size IS NOT NULL AND r.max_team_size IS NOT NULL AND r.max_team_size < r.min_team_size THEN
    e := e || 'الحد الأعلى لأعضاء الفريق لا يقل عن الحد الأدنى.'; END IF;
  IF r.max_team_size IS NOT NULL AND r.max_team_size > 12 THEN
    e := e || 'الحد الأعلى لأعضاء الفريق لا يتجاوز 12.'; END IF;

  IF r.min_committee_members IS NOT NULL AND r.min_committee_members < 2 THEN
    e := e || 'لجنة المناقشة لا تقل عن عضوين.'; END IF;
  IF r.min_committee_members IS NOT NULL AND r.max_committee_members IS NOT NULL
     AND r.max_committee_members < r.min_committee_members THEN
    e := e || 'الحد الأعلى لأعضاء اللجنة لا يقل عن الحد الأدنى.'; END IF;
  IF r.max_committee_members IS NOT NULL AND r.max_committee_members > 9 THEN
    e := e || 'الحد الأعلى لأعضاء اللجنة لا يتجاوز 9.'; END IF;

  IF r.required_progress_reports IS NOT NULL
     AND (r.required_progress_reports < 0 OR r.required_progress_reports > 12) THEN
    e := e || 'عدد تقارير التقدم بين 0 و12.'; END IF;
  IF r.passing_score IS NOT NULL AND (r.passing_score < 0 OR r.passing_score > 100) THEN
    e := e || 'درجة النجاح بين 0 و100.'; END IF;
  IF r.max_revision_rounds IS NOT NULL AND (r.max_revision_rounds < 0 OR r.max_revision_rounds > 5) THEN
    e := e || 'عدد جولات التعديل بين 0 و5.'; END IF;

  IF coalesce(r.allow_co_supervisor, false) OR coalesce(r.max_supervisors, 1) <> 1 THEN
    e := e || 'المشرف المشارك غير مدعوم حاليًا؛ عدد المشرفين يبقى واحدًا.'; END IF;

  IF r.enforce_proposal_window IS NULL THEN
    e := e || 'فترة تقديم المقترحات: يجب اختيار قرار صريح (مفعّلة أو غير مفعّلة) قبل النشر.';
  ELSIF r.enforce_proposal_window THEN
    IF r.proposal_window_start IS NULL OR r.proposal_window_end IS NULL THEN
      e := e || 'فترة تقديم المقترحات مفعّلة: تاريخا البداية والنهاية مطلوبان.';
    ELSIF r.proposal_window_start > r.proposal_window_end THEN
      e := e || 'فترة تقديم المقترحات: تاريخ البداية بعد تاريخ النهاية.';
    END IF;
  END IF;

  IF r.enforce_defense_window IS NULL THEN
    e := e || 'فترة المناقشات: يجب اختيار قرار صريح (مفعّلة أو غير مفعّلة) قبل النشر.';
  ELSIF r.enforce_defense_window THEN
    IF r.defense_window_start IS NULL OR r.defense_window_end IS NULL THEN
      e := e || 'فترة المناقشات مفعّلة: تاريخا البداية والنهاية مطلوبان.';
    ELSIF r.defense_window_start > r.defense_window_end THEN
      e := e || 'فترة المناقشات: تاريخ البداية بعد تاريخ النهاية.';
    END IF;
  END IF;

  RETURN e;
END $function$;

-- Publishing normalises disabled windows so stale dates cannot affect runtime.
CREATE OR REPLACE FUNCTION public.gp_admin_publish_policy(p_policy_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.graduation_project_policies; v_errors text[];
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.graduation_project_policies WHERE id = p_policy_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'policy not found'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'only draft policies can be published'; END IF;

  UPDATE public.graduation_project_policies
     SET proposal_window_start = CASE WHEN enforce_proposal_window IS TRUE THEN proposal_window_start ELSE NULL END,
         proposal_window_end   = CASE WHEN enforce_proposal_window IS TRUE THEN proposal_window_end   ELSE NULL END,
         defense_window_start  = CASE WHEN enforce_defense_window  IS TRUE THEN defense_window_start  ELSE NULL END,
         defense_window_end    = CASE WHEN enforce_defense_window  IS TRUE THEN defense_window_end    ELSE NULL END
   WHERE id = p_policy_id;

  v_errors := public.gp_validate_policy(p_policy_id);
  IF array_length(v_errors, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'GP_POLICY_VALIDATION_FAILED: %', array_to_string(v_errors, ' | ');
  END IF;

  UPDATE public.graduation_project_policies
     SET status = 'superseded', superseded_at = now()
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM r.department_id
     AND academic_year_id IS NOT DISTINCT FROM r.academic_year_id;

  UPDATE public.graduation_project_policies
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_policy_id;

  RETURN p_policy_id;
END $function$;

-- Published policies stay immutable, including the new explicit window decisions.
CREATE OR REPLACE FUNCTION public.gp_guard_published_policy_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'published' THEN
    IF (NEW.min_team_size, NEW.max_team_size, NEW.allow_co_supervisor, NEW.max_supervisors,
        NEW.required_progress_reports, NEW.min_committee_members, NEW.max_committee_members,
        NEW.passing_score, NEW.max_revision_rounds, NEW.proposal_window_start, NEW.proposal_window_end,
        NEW.defense_window_start, NEW.defense_window_end, NEW.enforce_proposal_window, NEW.enforce_defense_window,
        NEW.department_id, NEW.academic_year_id, NEW.version)
       IS DISTINCT FROM
       (OLD.min_team_size, OLD.max_team_size, OLD.allow_co_supervisor, OLD.max_supervisors,
        OLD.required_progress_reports, OLD.min_committee_members, OLD.max_committee_members,
        OLD.passing_score, OLD.max_revision_rounds, OLD.proposal_window_start, OLD.proposal_window_end,
        OLD.defense_window_start, OLD.defense_window_end, OLD.enforce_proposal_window, OLD.enforce_defense_window,
        OLD.department_id, OLD.academic_year_id, OLD.version)
    THEN
      RAISE EXCEPTION 'published graduation project policy is immutable; publish a new version instead';
    END IF;
    IF NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'published policy may only be superseded';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Runtime: a disabled window must never gate submissions or scheduling.
CREATE OR REPLACE FUNCTION public.submit_graduation_project_proposal(p_project_id uuid, p_expected_version bigint, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  if pol.enforce_proposal_window is true then
    if pol.proposal_window_start is not null and v_today < pol.proposal_window_start then
      raise exception 'proposal submission window not open';
    end if;
    if pol.proposal_window_end is not null and v_today > pol.proposal_window_end then
      raise exception 'proposal submission window closed';
    end if;
  end if;

  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_submitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $function$;

CREATE OR REPLACE FUNCTION public.resubmit_graduation_project_proposal(p_project_id uuid, p_expected_version bigint, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  if pol.enforce_proposal_window is true then
    if pol.proposal_window_start is not null and v_today < pol.proposal_window_start then
      raise exception 'proposal submission window not open';
    end if;
    if pol.proposal_window_end is not null and v_today > pol.proposal_window_end then
      raise exception 'proposal submission window closed';
    end if;
  end if;

  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_resubmitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $function$;

CREATE OR REPLACE FUNCTION public.schedule_graduation_project_defense(p_project_id uuid, p_starts_at timestamp with time zone, p_venue text, p_expected_version bigint, p_correlation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  if pol.enforce_defense_window is true then
    if pol.defense_window_start is not null and v_day < pol.defense_window_start then
      raise exception 'defense date before configured defense window';
    end if;
    if pol.defense_window_end is not null and v_day > pol.defense_window_end then
      raise exception 'defense date after configured defense window';
    end if;
  end if;

  insert into public.graduation_project_discussions(project_id, starts_at, venue, coordinator_assignment_id, state)
    values (p_project_id, p_starts_at, btrim(p_venue), a.id, 'scheduled') returning id into d_id;
  update public.graduation_projects set lifecycle_state = 'defense_scheduled', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'defense_scheduled', 'graduation_project_discussions', d_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'starts_at', p_starts_at, 'venue', btrim(p_venue)));
  return d_id;
end $function$;