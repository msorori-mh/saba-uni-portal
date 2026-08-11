-- GP policy closure: no invented academic defaults; fail-closed; validated publish.

ALTER TABLE public.graduation_project_policies
  ALTER COLUMN min_team_size DROP DEFAULT,
  ALTER COLUMN max_team_size DROP DEFAULT,
  ALTER COLUMN required_progress_reports DROP DEFAULT,
  ALTER COLUMN min_committee_members DROP DEFAULT,
  ALTER COLUMN max_committee_members DROP DEFAULT,
  ALTER COLUMN passing_score DROP DEFAULT,
  ALTER COLUMN max_revision_rounds DROP DEFAULT,
  ALTER COLUMN min_team_size DROP NOT NULL,
  ALTER COLUMN max_team_size DROP NOT NULL,
  ALTER COLUMN required_progress_reports DROP NOT NULL,
  ALTER COLUMN min_committee_members DROP NOT NULL,
  ALTER COLUMN max_committee_members DROP NOT NULL,
  ALTER COLUMN passing_score DROP NOT NULL,
  ALTER COLUMN max_revision_rounds DROP NOT NULL;

-- Validation shared by publish and the admin panel preflight.
CREATE OR REPLACE FUNCTION public.gp_validate_policy(p_policy_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  IF (r.proposal_window_start IS NULL) <> (r.proposal_window_end IS NULL) THEN
    e := e || 'فترة تقديم المقترحات: يجب تحديد البداية والنهاية معًا.'; END IF;
  IF r.proposal_window_start IS NOT NULL AND r.proposal_window_end IS NOT NULL
     AND r.proposal_window_start > r.proposal_window_end THEN
    e := e || 'فترة تقديم المقترحات: تاريخ البداية بعد تاريخ النهاية.'; END IF;
  IF (r.defense_window_start IS NULL) <> (r.defense_window_end IS NULL) THEN
    e := e || 'فترة المناقشات: يجب تحديد البداية والنهاية معًا.'; END IF;
  IF r.defense_window_start IS NOT NULL AND r.defense_window_end IS NOT NULL
     AND r.defense_window_start > r.defense_window_end THEN
    e := e || 'فترة المناقشات: تاريخ البداية بعد تاريخ النهاية.'; END IF;

  RETURN e;
END $$;

REVOKE ALL ON FUNCTION public.gp_validate_policy(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.gp_admin_validate_policy(p_policy_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;
  RETURN public.gp_validate_policy(p_policy_id);
END $$;

REVOKE ALL ON FUNCTION public.gp_admin_validate_policy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gp_admin_validate_policy(uuid) TO authenticated;

-- Draft saving: explicit values only (no silent carry-over of invented defaults).
CREATE OR REPLACE FUNCTION public.gp_admin_save_policy_draft(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    proposal_window_start = nullif(p_payload->>'proposal_window_start','')::date,
    proposal_window_end = nullif(p_payload->>'proposal_window_end','')::date,
    defense_window_start = nullif(p_payload->>'defense_window_start','')::date,
    defense_window_end = nullif(p_payload->>'defense_window_end','')::date,
    notes = nullif(btrim(coalesce(p_payload->>'notes','')), ''),
    updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END $$;

-- Publish: mandatory validation.
CREATE OR REPLACE FUNCTION public.gp_admin_publish_policy(p_policy_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.graduation_project_policies; v_errors text[];
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.graduation_project_policies WHERE id = p_policy_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'policy not found'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'only draft policies can be published'; END IF;

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
END $$;

-- Effective policy: fail closed, no built-in academic defaults.
CREATE OR REPLACE FUNCTION public.gp_effective_policy(p_department_id uuid, p_academic_year_id uuid)
RETURNS graduation_project_policies
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.graduation_project_policies;
BEGIN
  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM p_department_id
     AND academic_year_id IS NOT DISTINCT FROM p_academic_year_id
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM p_department_id
     AND academic_year_id IS NULL
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NULL
     AND academic_year_id IS NOT DISTINCT FROM p_academic_year_id
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published' AND department_id IS NULL AND academic_year_id IS NULL
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  RAISE EXCEPTION 'GP_NO_PUBLISHED_POLICY: لا توجد سياسة مشاريع تخرج منشورة لهذا القسم/العام الأكاديمي. يجب على الإدارة نشر سياسة قبل إنشاء المشاريع.'
    USING ERRCODE = 'P0001';
END $$;

-- New projects pin the actually published policy.
CREATE OR REPLACE FUNCTION public.create_graduation_project_team(p_department_id uuid, p_leader_student_profile_id uuid, p_leader_user_id uuid, p_program_id uuid, p_academic_year_id uuid, p_semester_id uuid, p_correlation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  c public.graduation_project_department_coordinators;
  v_id uuid; v_coord uuid; v_leader uuid; v_replay uuid; v_payload jsonb; v_req jsonb;
  pol public.graduation_project_policies;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  c := public.require_graduation_project_department_coordinator(p_department_id);
  v_req := jsonb_build_object(
    'department_id', p_department_id, 'leader_student_profile_id', p_leader_student_profile_id,
    'leader_user_id', p_leader_user_id, 'program_id', p_program_id,
    'academic_year_id', p_academic_year_id, 'semester_id', p_semester_id
  );
  select e.entity_id, e.payload into v_replay, v_payload
  from public.graduation_project_events e
  where e.correlation_id = p_correlation_id and e.event_type = 'team_created' limit 1;
  if v_replay is not null then
    if v_payload ? 'request' and v_payload->'request' is distinct from v_req then
      raise exception 'idempotent replay payload mismatch';
    end if;
    return v_replay;
  end if;

  if not exists (
    select 1 from public.programs pr
    where pr.id = p_program_id
      and pr.department_id = p_department_id
      and coalesce(pr.is_active, false) = true
  ) then
    raise exception 'program department mismatch';
  end if;

  if to_regprocedure('public.require_student_gp_fourth_level_eligibility(uuid)') is not null then
    perform public.require_student_gp_fourth_level_eligibility(p_leader_student_profile_id);
  end if;

  pol := public.gp_effective_policy(p_department_id, p_academic_year_id);

  insert into public.graduation_projects(
      department_id, program_id, academic_year_id, semester_id, lifecycle_state,
      policy_id, policy_snapshot, policy_pinned_at, policy_pin_source)
    values (p_department_id, p_program_id, p_academic_year_id, p_semester_id, 'draft',
      pol.id, to_jsonb(pol), now(), 'PUBLISHED_POLICY_AT_CREATE')
    returning id into v_id;
  insert into public.graduation_project_assignments(project_id, role, faculty_profile_id, user_id, department_id, assigned_by)
    values (v_id, 'coordinator', c.faculty_profile_id, auth.uid(), p_department_id, auth.uid()) returning id into v_coord;
  begin
    insert into public.graduation_project_assignments(project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by)
      values (v_id, 'student', p_leader_student_profile_id, p_leader_user_id, p_department_id, true, auth.uid()) returning id into v_leader;
  exception when unique_violation then
    raise exception 'student already has an active graduation project team';
  end;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (v_id, auth.uid(), v_coord, 'team_created', 'graduation_projects', v_id, p_correlation_id,
      jsonb_build_object('leader_assignment_id', v_leader, 'coordinator_assignment_id', v_coord, 'request', v_req,
        'policy_id', pol.id, 'policy_pin_source', 'PUBLISHED_POLICY_AT_CREATE'));
  return v_id;
end $$;