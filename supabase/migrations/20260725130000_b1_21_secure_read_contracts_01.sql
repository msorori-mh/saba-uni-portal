-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01 / order 21
-- Source draft: docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01
-- DRAFT / PROMOTED SOURCE — NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01
-- Closes BACKEND_CONTRACT_PENDING read gaps for the five B1 services.
-- No student_visible change. No activation. No storage public URLs.
-- No admin/dean/registrar/department_head broad bypass.

begin;

do $$
begin
  if to_regprocedure('public.get_b1_secure_read_runtime_capability()') is not null then
    raise exception 'b1 secure read contracts already exist; refuse ambiguous retry';
  end if;
  if to_regprocedure('public.user_matches_workflow_runtime_step(uuid)') is null then
    raise exception 'b1 secure read contracts require user_matches_workflow_runtime_step';
  end if;
  if to_regprocedure('public.can_current_user_act_on_step(uuid,text)') is null then
    raise exception 'b1 secure read contracts require can_current_user_act_on_step';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers (internal — no authenticated GRANT)
-- ---------------------------------------------------------------------------

create or replace function public.b1_canonical_to_stored_codes(p_canonical text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_canonical
    when 'enrollment_suspension' then array['enrollment_suspension']
    when 'excused_absence' then array['excused_absence','absence_excuse']
    when 'department_transfer' then array['department_transfer','transfer']
    when 'final_chance' then array['final_chance','extra_chance']
    when 'file_withdrawal' then array['file_withdrawal']
    else array[]::text[]
  end;
$$;

create or replace function public.b1_stored_to_canonical(p_stored text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_stored in ('enrollment_suspension') then 'enrollment_suspension'
    when p_stored in ('excused_absence','absence_excuse') then 'excused_absence'
    when p_stored in ('department_transfer','transfer') then 'department_transfer'
    when p_stored in ('final_chance','extra_chance') then 'final_chance'
    when p_stored in ('file_withdrawal') then 'file_withdrawal'
    else null
  end;
$$;

create or replace function public.b1_is_five_service_type(p_stored text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.b1_stored_to_canonical(p_stored) is not null;
$$;

create or replace function public.b1_map_ui_staff_action(p_action_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_action_type
    when 'confirm_payment' then 'confirm_payment'
    when 'review' then 'review'
    when 'approve' then 'approve'
    when 'clear' then 'approve'
    when 'apply_decision' then 'approve'
    when 'archive' then 'approve'
    when 'return' then 'return'
    when 'reject' then 'reject'
    else null
  end;
$$;

create or replace function public.b1_require_auth_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  return v;
end;
$$;

create or replace function public.b1_deny_read()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Opaque denial: never distinguish missing vs unauthorized vs wrong dept.
  raise exception 'B1_READ_ACCESS_DENIED' using errcode = '42501';
end;
$$;

create or replace function public.b1_attachment_meta_json(a public.student_request_attachment_uploads)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'attachment_id', a.id,
    'attachment_type', a.field_key,
    'file_name', a.original_file_name,
    'file_size_bytes', a.size_bytes,
    'mime_type', a.mime_type,
    'status', case a.upload_status
      when 'pending' then 'uploading'
      when 'uploaded' then 'uploading'
      when 'attached' then 'attached'
      else 'failed'
    end,
    -- Opaque storage ref only — never bucket/object_path/object_key.
    'storage_ref', 'att:' || a.id::text
  );
$$;

create or replace function public.b1_list_attachment_metas_for_request(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(public.b1_attachment_meta_json(a) order by a.created_at), '[]'::jsonb)
  from public.student_request_attachment_uploads a
  where a.student_request_id = p_request_id
    and a.upload_status in ('pending','uploaded','attached');
$$;

create or replace function public.b1_map_request_status(p_status text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'draft' then 'draft'
    when 'submitted' then 'submitted'
    when 'in_review' then 'in_review'
    when 'under_review' then 'in_review'
    when 'waiting_payment' then 'waiting_payment_confirmation'
    when 'waiting_payment_confirmation' then 'waiting_payment_confirmation'
    when 'returned' then 'returned'
    when 'returned_for_completion' then 'returned'
    when 'completed' then 'completed'
    when 'approved' then 'completed'
    when 'rejected' then 'rejected'
    when 'cancelled' then 'rejected'
    else 'in_review'
  end;
$$;

revoke all on function public.b1_canonical_to_stored_codes(text) from public, anon, authenticated;
revoke all on function public.b1_stored_to_canonical(text) from public, anon, authenticated;
revoke all on function public.b1_is_five_service_type(text) from public, anon, authenticated;
revoke all on function public.b1_map_ui_staff_action(text) from public, anon, authenticated;
revoke all on function public.b1_require_auth_uid() from public, anon, authenticated;
revoke all on function public.b1_deny_read() from public, anon, authenticated;
revoke all on function public.b1_attachment_meta_json(public.student_request_attachment_uploads) from public, anon, authenticated;
revoke all on function public.b1_list_attachment_metas_for_request(uuid) from public, anon, authenticated;
revoke all on function public.b1_map_request_status(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Runtime capability / readiness
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_secure_read_runtime_capability()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid;
declare v_ready_services jsonb;
declare v_ready_count integer;
begin
  v_uid := public.b1_require_auth_uid();
  select
    coalesce(jsonb_agg(x.canonical_code order by x.canonical_code), '[]'::jsonb),
    count(*)
  into v_ready_services, v_ready_count
  from (
    select public.b1_stored_to_canonical(rt.code) as canonical_code
    from public.request_types rt
    where public.b1_is_five_service_type(rt.code)
      and rt.is_active is true
      and rt.student_visible is true
      and (
        select count(*)
        from public.request_type_workflows w
        where w.request_type_id = rt.id
          and w.status = 'active'
          and w.is_active is true
      ) = 1
    group by public.b1_stored_to_canonical(rt.code)
  ) x;
  return jsonb_build_object(
    -- RPC existence is not activation. All five services must be explicitly
    -- visible/active with exactly one active workflow before runtime is ready.
    'available', v_ready_count = 5,
    'contract', 'B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01',
    'services', v_ready_services,
    'reads', jsonb_build_array(
      'form_options','draft','student_details','student_list',
      'assigned_inbox','assigned_details','step_actions','attachments'
    ),
    -- Draft create/save remain write-side; not opened by this read track.
    'writes_fail_closed', jsonb_build_array('create_draft','save_draft')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Form options (student)
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_request_form_options(p_canonical_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_sp public.student_profiles%rowtype;
  v_codes text[];
  v_years jsonb;
  v_semesters jsonb;
  v_enrollments jsonb;
  v_departments jsonb;
  v_programs jsonb;
  v_dept_label text;
  v_prog_label text;
  v_fc jsonb;
begin
  v_uid := public.b1_require_auth_uid();
  v_codes := public.b1_canonical_to_stored_codes(p_canonical_code);
  if coalesce(cardinality(v_codes),0) = 0 then
    perform public.b1_deny_read();
  end if;

  select * into v_sp from public.student_profiles
  where user_id = v_uid and status = 'active'
  order by created_at desc nulls last
  limit 1;
  if v_sp.id is null then
    raise exception 'ACTIVE_STUDENT_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('value', y.id, 'labelAr', y.name) order by y.name), '[]'::jsonb)
    into v_years
  from public.academic_years y
  where y.status in ('active','open','current') or y.is_current = true;

  select coalesce(jsonb_object_agg(s.academic_year_id::text, s.items), '{}'::jsonb)
    into v_semesters
  from (
    select sem.academic_year_id,
      jsonb_agg(jsonb_build_object('value', sem.id, 'labelAr', sem.name) order by sem.name) as items
    from public.semesters sem
    where sem.status in ('active','open','current') or sem.is_current = true
    group by sem.academic_year_id
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'value', cs.id,
      'labelAr', coalesce(c.code,'') || ' — ' || coalesce(c.name_ar,'')
    ) order by c.code), '[]'::jsonb)
    into v_enrollments
  from public.student_enrollments se
  join public.course_sections cs on cs.id = se.course_section_id
  join public.course_offerings co on co.id = cs.course_offering_id
  join public.courses c on c.id = co.course_id
  where se.student_profile_id = v_sp.id
    and se.enrollment_status in ('enrolled','registered','active');

  select coalesce(jsonb_agg(jsonb_build_object('value', d.id, 'labelAr', d.name_ar) order by d.name_ar), '[]'::jsonb)
    into v_departments
  from public.departments d
  where coalesce(d.is_active, true) = true;

  select coalesce(jsonb_object_agg(p.department_id::text, p.items), '{}'::jsonb)
    into v_programs
  from (
    select pr.department_id,
      jsonb_agg(jsonb_build_object('value', pr.id, 'labelAr', pr.name_ar) order by pr.name_ar) as items
    from public.programs pr
    where coalesce(pr.is_active, true) = true
      and pr.department_id is not null
    group by pr.department_id
  ) p;

  select d.name_ar into v_dept_label from public.departments d where d.id = v_sp.department_id;
  select pr.name_ar into v_prog_label from public.programs pr where pr.id = v_sp.program_id;

  if p_canonical_code = 'final_chance' then
    if exists (
      select 1 from public.student_requests r
      where r.student_profile_id = v_sp.id
        and public.b1_stored_to_canonical(r.request_type) = 'final_chance'
        and r.status in ('submitted','in_review','under_review','waiting_payment','waiting_payment_confirmation','approved','completed')
    ) then
      v_fc := jsonb_build_object('eligible', false, 'reasonAr', 'لديك طلب فرصة أخيرة سابق لا يزال قائماً أو مكتملاً.');
    else
      v_fc := jsonb_build_object('eligible', true);
    end if;
  else
    v_fc := null;
  end if;

  return jsonb_build_object(
    'serviceCode', p_canonical_code,
    'academicYears', v_years,
    'semestersByYear', v_semesters,
    'currentEnrollments', case when p_canonical_code = 'excused_absence' then v_enrollments else '[]'::jsonb end,
    'availableDepartments', case when p_canonical_code = 'department_transfer' then v_departments else '[]'::jsonb end,
    'programsByDepartment', case when p_canonical_code = 'department_transfer' then v_programs else '{}'::jsonb end,
    'currentDepartmentLabelAr', v_dept_label,
    'currentProgramLabelAr', v_prog_label,
    'finalChanceEligibility', v_fc,
    'excuseReasonTypes', case when p_canonical_code = 'excused_absence' then jsonb_build_array(
      jsonb_build_object('value','medical','labelAr','طبي'),
      jsonb_build_object('value','family_emergency','labelAr','ظرف عائلي طارئ'),
      jsonb_build_object('value','official','labelAr','رسمي'),
      jsonb_build_object('value','other','labelAr','أخرى')
    ) else '[]'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Student draft read
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_request_draft_for_student(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_r public.student_requests%rowtype;
  v_canon text;
begin
  v_uid := public.b1_require_auth_uid();
  select r.* into v_r
  from public.student_requests r
  join public.student_profiles sp on sp.id = r.student_profile_id
  where r.id = p_request_id
    and sp.user_id = v_uid
    and sp.status = 'active';
  if v_r.id is null then
    perform public.b1_deny_read();
  end if;
  v_canon := public.b1_stored_to_canonical(v_r.request_type);
  if v_canon is null or v_r.status not in ('draft','returned','returned_for_completion') then
    perform public.b1_deny_read();
  end if;
  return jsonb_build_object(
    'requestId', v_r.id,
    'serviceCode', v_canon,
    'formData', coalesce(v_r.form_data, '{}'::jsonb),
    'attachments', public.b1_list_attachment_metas_for_request(v_r.id),
    'status', 'draft',
    'updatedAt', v_r.updated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Student request details
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_request_details_for_student(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_r public.student_requests%rowtype;
  v_canon text;
  v_title text;
  v_steps jsonb;
  v_msgs jsonb;
begin
  v_uid := public.b1_require_auth_uid();
  select r.* into v_r
  from public.student_requests r
  join public.student_profiles sp on sp.id = r.student_profile_id
  where r.id = p_request_id
    and sp.user_id = v_uid
    and sp.status = 'active';
  if v_r.id is null then
    perform public.b1_deny_read();
  end if;
  v_canon := public.b1_stored_to_canonical(v_r.request_type);
  if v_canon is null then
    perform public.b1_deny_read();
  end if;
  select rt.name_ar into v_title from public.request_types rt where rt.code = v_r.request_type;

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', s.step_key,
      'labelAr', s.step_name_ar,
      'status', case s.status
        when 'completed' then 'completed'
        when 'active' then 'active'
        when 'pending' then 'pending'
        when 'returned' then 'returned'
        when 'rejected' then 'rejected'
        else 'pending'
      end,
      'actedAt', s.completed_at,
      -- Student-visible comment only when return/reject; never internal staff notes.
      'commentAr', case when s.status in ('returned','rejected') then nullif(s.comment,'') else null end
    ) order by s.step_order), '[]'::jsonb)
    into v_steps
  from public.student_request_workflow_steps s
  where s.student_request_id = v_r.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'at', s.completed_at,
      'fromLabelAr', 'المعالجة',
      'bodyAr', s.comment
    ) order by s.completed_at), '[]'::jsonb)
    into v_msgs
  from public.student_request_workflow_steps s
  where s.student_request_id = v_r.id
    and s.status in ('returned','rejected')
    and nullif(btrim(coalesce(s.comment,'')),'') is not null;

  return jsonb_build_object(
    'requestId', v_r.id,
    'requestNumber', coalesce(v_r.request_number,''),
    'serviceCode', v_canon,
    'serviceTitleAr', coalesce(v_title, v_canon),
    'status', public.b1_map_request_status(v_r.status),
    'formData', coalesce(v_r.form_data, '{}'::jsonb),
    'attachments', public.b1_list_attachment_metas_for_request(v_r.id),
    'steps', v_steps,
    'studentVisibleMessages', coalesce(v_msgs, '[]'::jsonb),
    'updatedAt', v_r.updated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Student list (five services only)
-- ---------------------------------------------------------------------------

create or replace function public.list_b1_requests_for_student(
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_sp_id uuid;
  v_lim int;
  v_off int;
  v_rows jsonb;
begin
  v_uid := public.b1_require_auth_uid();
  select sp.id into v_sp_id from public.student_profiles sp
  where sp.user_id = v_uid and sp.status = 'active'
  order by sp.created_at desc nulls last limit 1;
  if v_sp_id is null then
    raise exception 'ACTIVE_STUDENT_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  v_lim := greatest(least(coalesce(p_limit,50),200),1);
  v_off := greatest(coalesce(p_offset,0),0);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
    into v_rows
  from (
    select
      r.id as "requestId",
      coalesce(r.request_number,'') as "requestNumber",
      public.b1_stored_to_canonical(r.request_type) as "serviceCode",
      coalesce(rt.name_ar, r.request_type) as "serviceTitleAr",
      public.b1_map_request_status(r.status) as status,
      r.submitted_at as "submittedAt",
      r.updated_at as "updatedAt"
    from public.student_requests r
    left join public.request_types rt on rt.code = r.request_type
    where r.student_profile_id = v_sp_id
      and public.b1_is_five_service_type(r.request_type)
    order by coalesce(r.updated_at, r.created_at) desc
    limit v_lim offset v_off
  ) x;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Staff assigned inbox (exact active assignment)
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_assigned_inbox_for_actor(
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_lim int;
  v_off int;
  v_rows jsonb;
begin
  v_uid := public.b1_require_auth_uid();
  v_lim := greatest(least(coalesce(p_limit,50),200),1);
  v_off := greatest(coalesce(p_offset,0),0);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
    into v_rows
  from (
    select
      sr.id as "requestId",
      s.id as "stepId",
      coalesce(sr.request_number,'') as "requestNumber",
      public.b1_stored_to_canonical(sr.request_type) as "serviceCode",
      coalesce(rt.name_ar, sr.request_type) as "serviceTitleAr",
      sp.full_name_ar as "studentNameAr",
      sp.academic_number as "studentNumber",
      s.step_key as "stepKey",
      s.step_name_ar as "stepLabelAr",
      case
        when public.can_current_user_act_on_step(
          s.id,
          coalesce(cfg.action_type, 'review')
        )
        then public.b1_map_ui_staff_action(coalesce(cfg.action_type, 'review'))
        else null
      end as "allowedAction",
      sr.submitted_at as "submittedAt",
      (
        select coalesce(jsonb_agg(act), '[]'::jsonb)
        from (
          select public.b1_map_ui_staff_action(coalesce(cfg.action_type, 'review')) as act
          where public.can_current_user_act_on_step(
            s.id,
            case coalesce(cfg.action_type, 'review')
              when 'confirm_payment' then 'confirm_payment'
              when 'review' then 'review'
              when 'approve' then 'approve'
              when 'clear' then 'clear'
              when 'apply_decision' then 'apply_decision'
              when 'archive' then 'archive'
              else coalesce(cfg.action_type, 'review')
            end
          )
          union all
          select 'return'
          where coalesce(cfg.can_return_to_student, false)
            and public.can_current_user_act_on_step(s.id, 'return')
          union all
          select 'reject'
          where coalesce(cfg.can_reject, false)
            and public.can_current_user_act_on_step(s.id, 'reject')
        ) aa
        where aa.act is not null
      ) as "allowedActions"
    from public.student_request_workflow_steps s
    join public.student_requests sr on sr.id = s.student_request_id
    join public.student_profiles sp on sp.id = sr.student_profile_id
    left join public.request_types rt on rt.code = sr.request_type
    left join public.request_type_workflow_steps cfg
      on cfg.id = s.workflow_step_id
    where s.status = 'active'
      and public.b1_is_five_service_type(sr.request_type)
      and public.user_matches_workflow_runtime_step(s.id)
      -- No admin/dean/registrar/dept-head bypass: assignment match only.
    order by coalesce(sr.submitted_at, s.created_at) desc
    limit v_lim offset v_off
  ) x;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Staff assigned request details
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_assigned_request_details_for_actor(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_step public.student_request_workflow_steps%rowtype;
  v_r public.student_requests%rowtype;
  v_sp public.student_profiles%rowtype;
  v_canon text;
  v_title text;
  v_action text;
  v_cfg public.request_type_workflow_steps%rowtype;
  v_summary jsonb;
  v_steps jsonb;
  v_allowed jsonb;
begin
  v_uid := public.b1_require_auth_uid();

  select s.* into v_step
  from public.student_request_workflow_steps s
  join public.student_requests sr on sr.id = s.student_request_id
  where sr.id = p_request_id
    and s.status = 'active'
    and public.b1_is_five_service_type(sr.request_type)
    and public.user_matches_workflow_runtime_step(s.id)
  order by s.step_order
  limit 1;
  if v_step.id is null then
    perform public.b1_deny_read();
  end if;

  select * into v_r from public.student_requests where id = p_request_id;
  select * into v_sp from public.student_profiles where id = v_r.student_profile_id;
  v_canon := public.b1_stored_to_canonical(v_r.request_type);
  select rt.name_ar into v_title from public.request_types rt where rt.code = v_r.request_type;
  select * into v_cfg from public.request_type_workflow_steps where id = v_step.workflow_step_id;
  if public.can_current_user_act_on_step(
    v_step.id,
    coalesce(v_cfg.action_type, 'review')
  ) then
    v_action := public.b1_map_ui_staff_action(coalesce(v_cfg.action_type, 'review'));
  else
    v_action := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('labelAr', e.key, 'valueAr', e.value) order by e.key), '[]'::jsonb)
    into v_summary
  from jsonb_each_text(coalesce(v_r.form_data, '{}'::jsonb)) as e(key, value);

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', s.step_key,
      'labelAr', s.step_name_ar,
      'status', case s.status
        when 'completed' then 'completed'
        when 'active' then 'active'
        when 'pending' then 'pending'
        when 'returned' then 'returned'
        when 'rejected' then 'rejected'
        else 'pending'
      end,
      'actedAt', s.completed_at
      -- Internal actor comments omitted from staff peer view of other stages.
    ) order by s.step_order), '[]'::jsonb)
    into v_steps
  from public.student_request_workflow_steps s
  where s.student_request_id = v_r.id;

  select coalesce(jsonb_agg(x.act), '[]'::jsonb) into v_allowed
  from (
    select v_action as act where v_action is not null
    union all
    select 'return'
    where coalesce(v_cfg.can_return_to_student, false)
      and public.can_current_user_act_on_step(v_step.id, 'return')
    union all
    select 'reject'
    where coalesce(v_cfg.can_reject, false)
      and public.can_current_user_act_on_step(v_step.id, 'reject')
  ) x;

  return jsonb_build_object(
    'requestId', v_r.id,
    'stepId', v_step.id,
    'requestNumber', coalesce(v_r.request_number,''),
    'serviceCode', v_canon,
    'serviceTitleAr', coalesce(v_title, v_canon),
    'studentNameAr', v_sp.full_name_ar,
    'studentNumber', v_sp.academic_number,
    'stepKey', v_step.step_key,
    'stepLabelAr', v_step.step_name_ar,
    'allowedAction', v_action,
    'allowedActions', v_allowed,
    'submittedAt', v_r.submitted_at,
    'formDataSummary', v_summary,
    'attachments', public.b1_list_attachment_metas_for_request(v_r.id),
    'steps', v_steps,
    'updatedAt', v_r.updated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Legal actions for current step
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_step_allowed_actions(p_step_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_step public.student_request_workflow_steps%rowtype;
  v_cfg public.request_type_workflow_steps%rowtype;
  v_req public.student_requests%rowtype;
  v_primary text;
  v_actions jsonb := '[]'::jsonb;
  v_raw text;
begin
  v_uid := public.b1_require_auth_uid();
  select * into v_step from public.student_request_workflow_steps where id = p_step_id;
  if v_step.id is null then
    perform public.b1_deny_read();
  end if;
  select * into v_req from public.student_requests where id = v_step.student_request_id;
  if not public.b1_is_five_service_type(v_req.request_type) then
    perform public.b1_deny_read();
  end if;
  if v_step.status is distinct from 'active' or not public.user_matches_workflow_runtime_step(p_step_id) then
    perform public.b1_deny_read();
  end if;
  select * into v_cfg from public.request_type_workflow_steps where id = v_step.workflow_step_id;
  v_raw := coalesce(v_cfg.action_type, 'review');
  v_primary := public.b1_map_ui_staff_action(v_raw);

  if v_raw = 'confirm_payment' then
    if public.can_current_user_act_on_step(p_step_id, 'confirm_payment') then
      v_actions := v_actions || jsonb_build_array('confirm_payment');
    end if;
  elsif public.can_current_user_act_on_step(p_step_id, v_raw) then
    v_actions := v_actions || jsonb_build_array(v_primary);
  end if;

  if coalesce(v_cfg.can_return_to_student, false) then
    if public.can_current_user_act_on_step(p_step_id, 'return') then
      v_actions := v_actions || jsonb_build_array('return');
    end if;
  end if;
  if coalesce(v_cfg.can_reject, false) then
    if public.can_current_user_act_on_step(p_step_id, 'reject') then
      v_actions := v_actions || jsonb_build_array('reject');
    end if;
  end if;

  return jsonb_build_object(
    'stepId', p_step_id,
    'requestId', v_step.student_request_id,
    'allowedAction', case
      when v_actions ? coalesce(v_primary, '') then v_primary
      else null
    end,
    'allowedActions', v_actions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Attachments for authorized viewer (owner or exact active assignee)
-- ---------------------------------------------------------------------------

create or replace function public.list_b1_request_attachments_for_viewer(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_r public.student_requests%rowtype;
  v_owner boolean := false;
  v_assignee boolean := false;
begin
  v_uid := public.b1_require_auth_uid();
  select * into v_r from public.student_requests where id = p_request_id;
  if v_r.id is null or not public.b1_is_five_service_type(v_r.request_type) then
    perform public.b1_deny_read();
  end if;

  select exists (
    select 1 from public.student_profiles sp
    where sp.id = v_r.student_profile_id
      and sp.user_id = v_uid
      and sp.status = 'active'
  ) into v_owner;

  select exists (
    select 1 from public.student_request_workflow_steps s
    where s.student_request_id = p_request_id
      and s.status = 'active'
      and public.user_matches_workflow_runtime_step(s.id)
  ) into v_assignee;

  if not (v_owner or v_assignee) then
    perform public.b1_deny_read();
  end if;

  return public.b1_list_attachment_metas_for_request(p_request_id);
end;
$$;

-- Grants: authenticated only; revoke public/anon
revoke all on function public.get_b1_secure_read_runtime_capability() from public, anon;
revoke all on function public.get_b1_request_form_options(text) from public, anon;
revoke all on function public.get_b1_request_draft_for_student(uuid) from public, anon;
revoke all on function public.get_b1_request_details_for_student(uuid) from public, anon;
revoke all on function public.list_b1_requests_for_student(integer,integer) from public, anon;
revoke all on function public.get_b1_assigned_inbox_for_actor(integer,integer) from public, anon;
revoke all on function public.get_b1_assigned_request_details_for_actor(uuid) from public, anon;
revoke all on function public.get_b1_step_allowed_actions(uuid) from public, anon;
revoke all on function public.list_b1_request_attachments_for_viewer(uuid) from public, anon;

grant execute on function public.get_b1_secure_read_runtime_capability() to authenticated;
grant execute on function public.get_b1_request_form_options(text) to authenticated;
grant execute on function public.get_b1_request_draft_for_student(uuid) to authenticated;
grant execute on function public.get_b1_request_details_for_student(uuid) to authenticated;
grant execute on function public.list_b1_requests_for_student(integer,integer) to authenticated;
grant execute on function public.get_b1_assigned_inbox_for_actor(integer,integer) to authenticated;
grant execute on function public.get_b1_assigned_request_details_for_actor(uuid) to authenticated;
grant execute on function public.get_b1_step_allowed_actions(uuid) to authenticated;
grant execute on function public.list_b1_request_attachments_for_viewer(uuid) to authenticated;

commit;
