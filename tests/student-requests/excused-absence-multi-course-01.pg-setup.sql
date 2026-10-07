-- EXCUSED-ABSENCE-MULTI-COURSE-01 — disposable PostgreSQL fixture.
-- Minimal schema + stubs, then the deployed function bodies (copied verbatim
-- from the promoted migrations named in each header) that the draft patches.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.student_profiles (
  id uuid primary key, user_id uuid, status text not null default 'active',
  program_id uuid, department_id uuid, full_name_ar text, academic_number text,
  created_at timestamptz default now());
create table public.student_requests (
  id uuid primary key, student_profile_id uuid not null references public.student_profiles(id),
  request_type text not null, status text not null default 'draft', form_data jsonb,
  request_number text, submitted_at timestamptz, updated_at timestamptz default now());
create table public.request_types (code text primary key, name_ar text);
create table public.courses (id uuid primary key, code text, name_ar text);
create table public.course_offerings (id uuid primary key, course_id uuid references public.courses(id), status text default 'active');
create table public.course_sections (id uuid primary key, course_offering_id uuid references public.course_offerings(id), status text default 'active');
create table public.student_enrollments (
  student_profile_id uuid not null, course_section_id uuid not null, enrollment_status text not null default 'enrolled');
create table public.absence_excuse_details (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  course_section_id uuid not null, absence_date date not null, reason_type text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  record_applied_at timestamptz, absence_reason_detail text);
create table public.student_excused_absences (
  id uuid primary key default gen_random_uuid(), student_profile_id uuid not null,
  course_section_id uuid not null references public.course_sections(id), absence_date date not null,
  reason_type text not null, absence_excuse_request_id uuid references public.student_requests(id) on delete restrict,
  constraint sea_reason_chk check (reason_type in ('medical','family','emergency','other')),
  constraint sea_request_unique unique (absence_excuse_request_id),
  constraint sea_student_section_date_unique unique (student_profile_id, course_section_id, absence_date));
create table public.request_type_workflow_steps (
  id uuid primary key, step_key text, action_type text, can_return_to_student boolean, can_reject boolean);
create table public.student_request_workflow_steps (
  id uuid primary key, student_request_id uuid, workflow_step_id uuid, status text, step_order int,
  step_key text, step_name_ar text, completed_by uuid, completed_at timestamptz,
  processing_unit_id uuid, processing_role_id uuid);
create table public.student_request_workflow_events (
  id uuid primary key default gen_random_uuid(), student_request_id uuid, workflow_step_runtime_id uuid,
  event_type text, actor_user_id uuid, actor_unit_id uuid, actor_role_id uuid, payload jsonb, visible_to_student boolean);

create or replace function public.can_current_user_act_on_step(uuid, text) returns boolean language sql stable as $$ select true $$;
create or replace function public.user_matches_workflow_runtime_step(uuid) returns boolean language sql stable as $$ select true $$;
create or replace function public.assert_required_student_request_attachments(uuid, uuid[]) returns void language sql as $$ select $$;
create or replace function public.b1_require_auth_uid() returns uuid language sql stable as $$ select auth.uid() $$;
create or replace function public.b1_is_five_service_type(text) returns boolean language sql immutable as $$ select true $$;
create or replace function public.b1_stored_to_canonical(p text) returns text language sql immutable as
$$ select case p when 'absence_excuse' then 'excused_absence' else p end $$;
create or replace function public.b1_list_attachment_metas_for_request(uuid) returns jsonb language sql stable as $$ select '[]'::jsonb $$;
create or replace function public.b1_deny_read() returns void language plpgsql as
$$ begin raise exception 'B1_READ_DENIED' using errcode = '42501'; end $$;

-- persist_b1_draft_form_and_details <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.persist_b1_draft_form_and_details(
  p_request_id uuid,
  p_canonical text,
  p_form jsonb,
  p_profile public.student_profiles
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year uuid;
  v_semester uuid;
  v_section uuid;
  v_target_dept uuid;
  v_target_prog uuid;
  v_reason text;
  v_duration text;
  v_chance text;
  v_date date;
  v_reason_type text;
  v_detail text;
  v_terms jsonb;
  v_impact jsonb;
  v_sync boolean := false;
begin
  perform public.b1_assert_draft_form_object(p_form);
  perform public.b1_assert_draft_allowlist(p_canonical, p_form);
  perform public.b1_assert_uuid_array_field(p_form, 'excuse_documents');
  perform public.b1_assert_uuid_array_field(p_form, 'secondary_certificate_file');

  if p_canonical = 'enrollment_suspension' then
    if p_form ? 'suspension_duration_type' then
      v_duration := p_form->>'suspension_duration_type';
      if v_duration is not null and v_duration not in ('one_semester', 'full_year') then
        raise exception 'B1_SUSPENSION_INPUT_INVALID' using errcode = '23514';
      end if;
    end if;
    if p_form ? 'terms_acknowledgment' then
      v_terms := p_form->'terms_acknowledgment';
      if jsonb_typeof(v_terms) <> 'boolean' then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end if;
    end if;
    if (p_form ? 'target_academic_year') and (p_form ? 'target_semester')
       and nullif(p_form->>'target_academic_year','') is not null
       and nullif(p_form->>'target_semester','') is not null then
      begin
        v_year := (p_form->>'target_academic_year')::uuid;
        v_semester := (p_form->>'target_semester')::uuid;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
      perform public.assert_b1_academic_period_reference(v_year, v_semester);
    elsif (p_form ? 'target_academic_year') or (p_form ? 'target_semester') then
      -- Partial period refs accepted in form_data; trusted assert deferred until both present.
      null;
    end if;
    v_reason := nullif(btrim(coalesce(p_form->>'suspension_reason','')), '');
    if v_year is not null and v_semester is not null
       and v_reason is not null and v_duration in ('one_semester','full_year') then
      v_sync := true;
      insert into public.enrollment_suspension_details(
        request_id, requested_from_academic_year_id, requested_from_semester_id,
        suspension_reason, suspension_duration_type, notes
      ) values (
        p_request_id, v_year, v_semester, v_reason, v_duration,
        nullif(btrim(coalesce(p_form->>'notes','')), '')
      )
      on conflict (request_id) do update set
        requested_from_academic_year_id = excluded.requested_from_academic_year_id,
        requested_from_semester_id = excluded.requested_from_semester_id,
        suspension_reason = excluded.suspension_reason,
        suspension_duration_type = excluded.suspension_duration_type,
        notes = excluded.notes,
        updated_at = now();
    end if;

  elsif p_canonical = 'excused_absence' then
    if exists (
      select 1 from public.absence_excuse_details d
      where d.request_id = p_request_id and d.record_applied_at is not null
    ) then
      raise exception 'B1_ABSENCE_EFFECT_ALREADY_APPLIED' using errcode = '55000';
    end if;
    if p_form ? 'reason_type' then
      v_reason_type := p_form->>'reason_type';
      if v_reason_type is not null and v_reason_type not in ('medical','family_emergency','official','other') then
        raise exception 'B1_ABSENCE_INPUT_INVALID' using errcode = '23514';
      end if;
    end if;
    if p_form ? 'absence_date' and nullif(p_form->>'absence_date','') is not null then
      begin
        v_date := (p_form->>'absence_date')::date;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
      if v_date > current_date then
        raise exception 'B1_ABSENCE_INPUT_INVALID' using errcode = '23514';
      end if;
    end if;
    if p_form ? 'course_section_id' and nullif(p_form->>'course_section_id','') is not null then
      begin
        v_section := (p_form->>'course_section_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
      perform public.assert_b1_active_course_enrollment(p_profile.id, v_section);
    end if;
    v_detail := nullif(btrim(coalesce(p_form->>'absence_reason_detail','')), '');
    -- Contract uses single absence_date (no start/end pair in freeze allowlist).
    if v_section is not null and v_date is not null and v_reason_type is not null then
      v_sync := true;
      insert into public.absence_excuse_details(
        request_id, course_section_id, absence_date, reason_type, absence_reason_detail
      ) values (
        p_request_id, v_section, v_date, v_reason_type, coalesce(v_detail, '')
      )
      on conflict (request_id) do update set
        course_section_id = excluded.course_section_id,
        absence_date = excluded.absence_date,
        reason_type = excluded.reason_type,
        absence_reason_detail = excluded.absence_reason_detail,
        updated_at = now();
    end if;

  elsif p_canonical = 'department_transfer' then
    if p_form ? 'target_department_id' and nullif(p_form->>'target_department_id','') is not null then
      begin
        v_target_dept := (p_form->>'target_department_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
      if p_profile.department_id is not null and v_target_dept = p_profile.department_id then
        raise exception 'B1_TRANSFER_INPUT_INVALID' using errcode = '23514';
      end if;
    end if;
    if p_form ? 'target_program_id' and nullif(p_form->>'target_program_id','') is not null then
      begin
        v_target_prog := (p_form->>'target_program_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
    end if;
    if v_target_dept is not null and v_target_prog is not null then
      perform public.assert_b1_target_program_department(v_target_prog, v_target_dept);
    end if;
    v_reason := nullif(btrim(coalesce(p_form->>'transfer_reason','')), '');
    if v_target_dept is not null and v_target_prog is not null
       and p_profile.program_id is not null and p_profile.department_id is not null
       and v_reason is not null then
      v_sync := true;
      insert into public.transfer_request_details(
        request_id, current_program_id, requested_program_id,
        current_department_id, requested_department_id, transfer_reason
      ) values (
        p_request_id, p_profile.program_id, v_target_prog,
        p_profile.department_id, v_target_dept, v_reason
      )
      on conflict (request_id) do update set
        current_program_id = excluded.current_program_id,
        requested_program_id = excluded.requested_program_id,
        current_department_id = excluded.current_department_id,
        requested_department_id = excluded.requested_department_id,
        transfer_reason = excluded.transfer_reason,
        updated_at = now();
    end if;

  elsif p_canonical = 'final_chance' then
    if exists (
      select 1 from public.extra_chance_details d
      where d.request_id = p_request_id and d.chance_applied_at is not null
    ) then
      raise exception 'B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED' using errcode = '55000';
    end if;
    if p_form ? 'chance_type' then
      v_chance := coalesce(p_form->>'chance_type', 'final_chance');
      if v_chance <> 'final_chance' then
        raise exception 'B1_FINAL_CHANCE_INPUT_INVALID' using errcode = '23514';
      end if;
    end if;
    if (p_form ? 'target_academic_year') and (p_form ? 'target_semester')
       and nullif(p_form->>'target_academic_year','') is not null
       and nullif(p_form->>'target_semester','') is not null then
      begin
        v_year := (p_form->>'target_academic_year')::uuid;
        v_semester := (p_form->>'target_semester')::uuid;
      exception when invalid_text_representation then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end;
      perform public.assert_b1_academic_period_reference(v_year, v_semester);
    end if;
    v_reason := nullif(btrim(coalesce(p_form->>'reason','')), '');
    if v_year is not null and v_semester is not null and v_reason is not null then
      v_sync := true;
      insert into public.extra_chance_details(
        request_id, academic_year_id, semester_id, reason, chance_type
      ) values (
        p_request_id, v_year, v_semester, v_reason, 'final_chance'
      )
      on conflict (request_id) do update set
        academic_year_id = excluded.academic_year_id,
        semester_id = excluded.semester_id,
        reason = excluded.reason,
        chance_type = 'final_chance',
        updated_at = now();
    end if;

  elsif p_canonical = 'file_withdrawal' then
    if exists (
      select 1 from public.file_withdrawal_details d
      where d.request_id = p_request_id
        and num_nonnulls(
          d.library_cleared_at, d.labs_cleared_at, d.activities_cleared_at,
          d.finance_cleared_at, d.records_transferred_at
        ) > 0
    ) then
      raise exception 'B1_WITHDRAWAL_CLEARANCE_ALREADY_APPLIED' using errcode = '55000';
    end if;
    if p_form ? 'impact_acknowledgment' then
      v_impact := p_form->'impact_acknowledgment';
      if jsonb_typeof(v_impact) <> 'boolean' then
        raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
      end if;
    end if;
    v_reason := nullif(btrim(coalesce(p_form->>'withdrawal_reason','')), '');
    -- Partial draft may omit impact_acknowledgment; submit still requires true via persist_validated_*.
    if v_reason is not null and p_form ? 'impact_acknowledgment' then
      v_sync := true;
      insert into public.file_withdrawal_details(
        request_id, withdrawal_reason, impact_ack
      ) values (
        p_request_id, v_reason, (p_form->'impact_acknowledgment') = 'true'::jsonb
      )
      on conflict (request_id) do update set
        withdrawal_reason = excluded.withdrawal_reason,
        impact_ack = excluded.impact_ack,
        updated_at = now();
    end if;
  else
    raise exception 'B1_CANONICAL_CODE_REQUIRED' using errcode = '22023';
  end if;

  update public.student_requests
  set form_data = p_form,
      updated_at = now()
  where id = p_request_id
    and status = 'draft';

  if not found then
    perform public.b1_deny_draft_mutation();
  end if;

  -- v_sync is informational for future auditing; keep assigned to avoid unused warnings in some planners.
  perform set_config('b1.draft_detail_synced', case when v_sync then '1' else '0' end, true);
end;
$$;

-- b1_assert_uuid_array_field <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.b1_assert_uuid_array_field(p_form jsonb, p_key text)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  e jsonb;
begin
  if not (p_form ? p_key) then
    return;
  end if;
  v := p_form -> p_key;
  if v is null or jsonb_typeof(v) <> 'array' then
    raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(v)
  loop
    if jsonb_typeof(e) <> 'string' or (e #>> '{}')::uuid is null then
      raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
    end if;
  end loop;
exception
  when invalid_text_representation then
    raise exception 'B1_DRAFT_FIELD_TYPE_INVALID' using errcode = '22023';
end;
$$;

-- b1_assert_draft_allowlist <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.b1_assert_draft_allowlist(p_canonical text, p_form jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_allowed text[] := public.b1_draft_form_allowlist(p_canonical);
begin
  if exists (
    select 1 from jsonb_object_keys(p_form) k where k <> all (v_allowed)
  ) then
    raise exception 'B1_UNEXPECTED_FORM_FIELD' using errcode = '22023';
  end if;
end;
$$;

-- b1_assert_draft_form_object <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.b1_assert_draft_form_object(p_form jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_form is null or jsonb_typeof(p_form) <> 'object' then
    raise exception 'B1_FORM_OBJECT_REQUIRED' using errcode = '22023';
  end if;
  if p_form ? 'storage_bucket' or p_form ? 'storage_object_path' or p_form ? 'object_key'
     or p_form ? 'amount' or p_form ? 'currency' or p_form ? 'invoice'
     or p_form ? 'payment_reference' or p_form ? 'student_id' or p_form ? 'user_id'
     or p_form ? 'actor_id' or p_form ? 'status' or p_form ? 'updated_at'
     or p_form ? 'submitted_at' or p_form ? 'current_department_id' then
    raise exception 'B1_UNEXPECTED_FORM_FIELD' using errcode = '22023';
  end if;
end;
$$;

-- b1_deny_draft_mutation <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.b1_deny_draft_mutation()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'B1_DRAFT_ACCESS_DENIED' using errcode = '42501';
end;
$$;

-- b1_draft_form_allowlist <- supabase/migrations/20260727065136_2f09b10d-8f1a-4b6b-9de2-ac52c28fc943.sql
create or replace function public.b1_draft_form_allowlist(p_canonical text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_canonical
    when 'enrollment_suspension' then array[
      'target_academic_year','target_semester','suspension_reason','suspension_duration_type','notes','terms_acknowledgment'
    ]
    when 'excused_absence' then array[
      'course_section_id','absence_date','reason_type','absence_reason_detail','excuse_documents'
    ]
    when 'department_transfer' then array[
      'target_department_id','target_program_id','transfer_reason','secondary_certificate_file'
    ]
    when 'final_chance' then array[
      'target_academic_year','target_semester','reason','chance_type'
    ]
    when 'file_withdrawal' then array[
      'withdrawal_reason','impact_acknowledgment'
    ]
    else array[]::text[]
  end;
$$;

-- persist_validated_b1_request_details <- supabase/migrations/20260727065316_8a230a3b-458c-42f4-ad9c-16e2c3fa363f.sql
CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid,p_canonical_code text,p_form_data jsonb,p_attachment_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_profile public.student_profiles%ROWTYPE;
  v_allowed text[];
  v_year uuid; v_semester uuid; v_section uuid; v_target_program uuid; v_target_department uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF p_canonical_code NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
    THEN RAISE EXCEPTION 'B1_CANONICAL_CODE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_form_data IS NULL OR jsonb_typeof(p_form_data)<>'object'
    THEN RAISE EXCEPTION 'B1_FORM_OBJECT_REQUIRED' USING ERRCODE='22023'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r WHERE r.id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT sp.* INTO v_profile FROM public.student_profiles sp
    WHERE sp.id=v_request.student_profile_id AND sp.user_id=auth.uid() AND sp.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_ACTIVE_REQUEST_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF v_request.status NOT IN ('draft','returned','returned_for_completion')
    THEN RAISE EXCEPTION 'B1_REQUEST_NOT_WRITABLE' USING ERRCODE='42501'; END IF;
  IF (CASE v_request.request_type WHEN 'absence_excuse' THEN 'excused_absence'
       WHEN 'transfer' THEN 'department_transfer' WHEN 'extra_chance' THEN 'final_chance'
       ELSE v_request.request_type END) IS DISTINCT FROM p_canonical_code
    THEN RAISE EXCEPTION 'B1_REQUEST_TYPE_MISMATCH' USING ERRCODE='42501'; END IF;

  v_allowed:=CASE p_canonical_code
    WHEN 'enrollment_suspension' THEN ARRAY['target_academic_year','target_semester','suspension_reason','suspension_duration_type','notes','terms_acknowledgment']
    WHEN 'excused_absence' THEN ARRAY['course_section_id','absence_date','reason_type','absence_reason_detail','excuse_documents']
    WHEN 'department_transfer' THEN ARRAY['target_department_id','target_program_id','transfer_reason','secondary_certificate_file']
    WHEN 'final_chance' THEN ARRAY['target_academic_year','target_semester','reason','chance_type']
    WHEN 'file_withdrawal' THEN ARRAY['withdrawal_reason','impact_acknowledgment'] END;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_form_data) k WHERE k<>ALL(v_allowed))
    THEN RAISE EXCEPTION 'B1_UNEXPECTED_FORM_FIELD' USING ERRCODE='22023'; END IF;

  IF p_canonical_code='enrollment_suspension' THEN
    IF COALESCE(cardinality(p_attachment_ids),0)<>0
      OR p_form_data->'terms_acknowledgment' IS DISTINCT FROM 'true'::jsonb
      OR p_form_data->>'suspension_duration_type' NOT IN ('one_semester','full_year')
      OR length(btrim(COALESCE(p_form_data->>'suspension_reason','')))<3
      THEN RAISE EXCEPTION 'B1_SUSPENSION_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    v_year:=(p_form_data->>'target_academic_year')::uuid; v_semester:=(p_form_data->>'target_semester')::uuid;
    PERFORM public.assert_b1_academic_period_reference(v_year,v_semester);
    INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id,suspension_reason,suspension_duration_type,notes)
      VALUES(p_request_id,v_year,v_semester,btrim(p_form_data->>'suspension_reason'),p_form_data->>'suspension_duration_type',nullif(btrim(p_form_data->>'notes'),''))
      ON CONFLICT(request_id) DO UPDATE SET requested_from_academic_year_id=EXCLUDED.requested_from_academic_year_id,
        requested_from_semester_id=EXCLUDED.requested_from_semester_id,suspension_reason=EXCLUDED.suspension_reason,
        suspension_duration_type=EXCLUDED.suspension_duration_type,notes=EXCLUDED.notes,updated_at=now();

  ELSIF p_canonical_code='excused_absence' THEN
    IF EXISTS (SELECT 1 FROM public.absence_excuse_details d
      WHERE d.request_id=p_request_id AND d.record_applied_at IS NOT NULL)
      THEN RAISE EXCEPTION 'B1_ABSENCE_EFFECT_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    v_section:=(p_form_data->>'course_section_id')::uuid;
    IF p_form_data->>'reason_type' NOT IN ('medical','family_emergency','official','other')
      OR length(btrim(COALESCE(p_form_data->>'absence_reason_detail','')))<3
      OR (p_form_data->>'absence_date')::date>current_date
      THEN RAISE EXCEPTION 'B1_ABSENCE_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    PERFORM public.assert_b1_active_course_enrollment(v_profile.id,v_section);
    PERFORM public.assert_required_student_request_attachments(p_request_id,p_attachment_ids);
    INSERT INTO public.absence_excuse_details(request_id,course_section_id,absence_date,reason_type,absence_reason_detail)
      VALUES(p_request_id,v_section,(p_form_data->>'absence_date')::date,p_form_data->>'reason_type',btrim(p_form_data->>'absence_reason_detail'))
      ON CONFLICT(request_id) DO UPDATE SET course_section_id=EXCLUDED.course_section_id,absence_date=EXCLUDED.absence_date,
        reason_type=EXCLUDED.reason_type,absence_reason_detail=EXCLUDED.absence_reason_detail,updated_at=now();

  ELSIF p_canonical_code='department_transfer' THEN
    v_target_department:=(p_form_data->>'target_department_id')::uuid;
    v_target_program:=(p_form_data->>'target_program_id')::uuid;
    IF v_profile.program_id IS NULL OR v_profile.department_id IS NULL
      OR v_target_department=v_profile.department_id OR length(btrim(COALESCE(p_form_data->>'transfer_reason','')))<3
      THEN RAISE EXCEPTION 'B1_TRANSFER_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    PERFORM public.assert_b1_target_program_department(v_target_program,v_target_department);
    PERFORM public.assert_required_student_request_attachments(p_request_id,p_attachment_ids);
    INSERT INTO public.transfer_request_details(request_id,current_program_id,requested_program_id,current_department_id,requested_department_id,transfer_reason)
      VALUES(p_request_id,v_profile.program_id,v_target_program,v_profile.department_id,v_target_department,btrim(p_form_data->>'transfer_reason'))
      ON CONFLICT(request_id) DO UPDATE SET current_program_id=EXCLUDED.current_program_id,requested_program_id=EXCLUDED.requested_program_id,
        current_department_id=EXCLUDED.current_department_id,requested_department_id=EXCLUDED.requested_department_id,
        transfer_reason=EXCLUDED.transfer_reason,updated_at=now();

  ELSIF p_canonical_code='final_chance' THEN
    IF EXISTS (SELECT 1 FROM public.extra_chance_details d
      WHERE d.request_id=p_request_id AND d.chance_applied_at IS NOT NULL)
      THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    IF COALESCE(cardinality(p_attachment_ids),0)<>0 OR COALESCE(p_form_data->>'chance_type','final_chance')<>'final_chance'
      OR length(btrim(COALESCE(p_form_data->>'reason','')))<3
      THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    v_year:=(p_form_data->>'target_academic_year')::uuid; v_semester:=(p_form_data->>'target_semester')::uuid;
    PERFORM public.assert_b1_academic_period_reference(v_year,v_semester);
    INSERT INTO public.extra_chance_details(request_id,academic_year_id,semester_id,reason,chance_type)
      VALUES(p_request_id,v_year,v_semester,btrim(p_form_data->>'reason'),'final_chance')
      ON CONFLICT(request_id) DO UPDATE SET academic_year_id=EXCLUDED.academic_year_id,semester_id=EXCLUDED.semester_id,
        reason=EXCLUDED.reason,chance_type='final_chance',updated_at=now();

  ELSE
    IF EXISTS (SELECT 1 FROM public.file_withdrawal_details d WHERE d.request_id=p_request_id
      AND num_nonnulls(d.library_cleared_at,d.labs_cleared_at,d.activities_cleared_at,
        d.finance_cleared_at,d.records_transferred_at)>0)
      THEN RAISE EXCEPTION 'B1_WITHDRAWAL_CLEARANCE_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    IF COALESCE(cardinality(p_attachment_ids),0)<>0
      OR p_form_data->'impact_acknowledgment' IS DISTINCT FROM 'true'::jsonb
      OR length(btrim(COALESCE(p_form_data->>'withdrawal_reason','')))<10
      THEN RAISE EXCEPTION 'B1_WITHDRAWAL_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    INSERT INTO public.file_withdrawal_details(request_id,withdrawal_reason,impact_ack)
      VALUES(p_request_id,btrim(p_form_data->>'withdrawal_reason'),true)
      ON CONFLICT(request_id) DO UPDATE SET withdrawal_reason=EXCLUDED.withdrawal_reason,impact_ack=true,updated_at=now();
  END IF;
END $$;

-- apply_b1_excused_absence_effect <- supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
CREATE OR REPLACE FUNCTION public.apply_b1_excused_absence_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.absence_excuse_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type NOT IN ('absence_excuse','excused_absence') OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='record_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.absence_excuse_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_DETAILS_REQUIRED'; END IF;
  IF v_details.record_applied_at IS NOT NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_enrollments WHERE student_profile_id=v_request.student_profile_id
    AND course_section_id=v_details.course_section_id AND enrollment_status='enrolled') THEN RAISE EXCEPTION 'B1_ACTIVE_ENROLLMENT_REQUIRED'; END IF;
  INSERT INTO public.student_excused_absences(student_profile_id,course_section_id,absence_date,reason_type,absence_excuse_request_id)
    VALUES(v_request.student_profile_id,v_details.course_section_id,v_details.absence_date,v_details.reason_type,p_request_id)
    ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;
  UPDATE public.absence_excuse_details SET record_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','excused_absence','course_section_id',v_details.course_section_id,'absence_date',v_details.absence_date),true);
END $$;

-- get_b1_assigned_request_details_for_actor <- supabase/migrations/20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql
CREATE OR REPLACE FUNCTION public.get_b1_assigned_request_details_for_actor(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- LITERAL CONTRACT (66): no UI alias mapping.
    v_action := coalesce(v_cfg.action_type, 'review');
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
$function$;

-- assert_b1_active_course_enrollment <- supabase/migrations/20260727043104_7f122b12-ebed-4dc1-a6ef-5fc917a2e124.sql
CREATE OR REPLACE FUNCTION public.assert_b1_active_course_enrollment(
  p_student_profile_id uuid,
  p_course_section_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_student_profile_id IS NULL OR p_course_section_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.student_enrollments e
    JOIN public.course_sections s ON s.id=e.course_section_id
    JOIN public.course_offerings o ON o.id=s.course_offering_id
    WHERE e.student_profile_id=p_student_profile_id
      AND e.course_section_id=p_course_section_id
      AND e.enrollment_status='enrolled' AND s.status='active' AND o.status='active'
  ) THEN RAISE EXCEPTION 'B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED' USING ERRCODE='23503'; END IF;
END $$;

-- get_student_request_detail_for_actor <- supabase/migrations/20260729173359_9a749214-c28e-489b-95ec-038f290a5c3c.sql
CREATE OR REPLACE FUNCTION public.get_student_request_detail_for_actor(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بعرض هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  v_is_owner := public.is_owner_of_request(v_uid, p_request_id);

  SELECT jsonb_build_object(
    'request', jsonb_build_object(
      'id', sr.id,
      'request_number', sr.request_number,
      'request_type', sr.request_type,
      'request_type_name_ar', rt.name_ar,
      'title', sr.title,
      'status', sr.status,
      'form_data', CASE WHEN v_is_owner THEN sr.form_data ELSE COALESCE(sr.form_data, '{}'::jsonb) END,
      'student_notes', sr.student_notes,
      'submitted_at', sr.submitted_at,
      'created_at', sr.created_at,
      'updated_at', sr.updated_at,
      'current_step_index', sr.current_step_index,
      'current_role_key', sr.current_role_key
    ),
    'student', jsonb_build_object(
      'id', sp.id,
      'full_name_ar', sp.full_name_ar,
      'academic_number', sp.academic_number,
      'department_id', sp.department_id,
      'department_name_ar', d.name_ar,
      'status', sp.status
    ),
    'workflow_steps', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'step_key', s.step_key,
          'step_name_ar', s.step_name_ar,
          'step_order', s.step_order,
          'status', s.status,
          'decision', s.decision,
          'comment', s.comment,
          'processing_unit_name_ar', rpu.name_ar,
          'processing_role_name_ar', rpr.name_ar,
          'entered_at', s.entered_at,
          'completed_at', s.completed_at,
          'is_actionable', (
            s.status = 'active'
            AND public.workflow_runtime_step_configured_action(s.id) IS NOT NULL
            AND public.can_current_user_act_on_step(
                  s.id,
                  public.workflow_runtime_step_configured_action(s.id)
                )
          )
        )
        ORDER BY s.step_order
      )
      FROM public.student_request_workflow_steps s
      LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
      LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
      WHERE s.student_request_id = sr.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'message_ar', e.message_ar,
          'payload', e.payload,
          'created_at', e.created_at,
          'visible_to_student', e.visible_to_student
        )
        ORDER BY e.created_at
      )
      FROM public.student_request_workflow_events e
      WHERE e.student_request_id = sr.id
        AND (
          NOT v_is_owner
          OR e.visible_to_student = true
        )
    ), '[]'::jsonb),
    'attachments', '[]'::jsonb
  )
  INTO v_result
  FROM public.student_requests sr
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  WHERE sr.id = p_request_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'الطلب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$function$;
