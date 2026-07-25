-- B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01
-- DRAFT / PROMOTED SOURCE â€” NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01
-- Depends on: B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01 helpers + trusted refs + detail tables
-- No student_visible change. No activation. No submit. No workflow runtime. No staff notifications.
--
-- DESIGN (source-audited):
--   create_b1_request_draft_for_student(p_canonical_code text, p_idempotency_key text DEFAULT NULL) â†’ jsonb
--   save_b1_request_draft_for_student(p_request_id uuid, p_form_data jsonb, p_expected_updated_at timestamptz DEFAULT NULL, p_idempotency_key text DEFAULT NULL) â†’ jsonb
-- Identity: auth.uid() only â†’ active student_profiles row.
-- Stored request_type codes (freeze): enrollment_suspension|absence_excuse|transfer|extra_chance|file_withdrawal
-- Create: one open draft per (student_profile_id, request_type) via partial unique index + advisory xact lock.
-- Idempotency: optional key in b1_draft_mutation_idempotency; same key+hash â†’ return; same key+diff hash â†’ DENY.
-- Save: owner + status=draft only; strict allowlist DENY; draft-soft validation; detail upsert only when
--   NOT NULL detail columns can be satisfied; submit validation remains in persist_validated_b1_request_details.
-- Concurrency: required p_expected_updated_at â†’ B1_STALE_REQUEST_VERSION (same as submit); row FOR UPDATE always.
-- Opaque deny: B1_DRAFT_ACCESS_DENIED (no existence / identity / SQL leakage).

begin;

do $$
begin
  if to_regprocedure('public.create_b1_request_draft_for_student(text,text)') is not null then
    raise exception 'b1 secure draft mutations already exist; refuse ambiguous retry';
  end if;
  if to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') is null then
    raise exception 'b1 secure draft mutations require assert_b1_academic_period_reference';
  end if;
  if to_regclass('public.enrollment_suspension_details') is null
     or to_regclass('public.absence_excuse_details') is null
     or to_regclass('public.transfer_request_details') is null
     or to_regclass('public.extra_chance_details') is null
     or to_regclass('public.file_withdrawal_details') is null then
    raise exception 'b1 secure draft mutations require five service detail tables';
  end if;
end $$;

-- Secure-read helper parity (CREATE OR REPLACE). Safe if secure-read already applied.
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

revoke all on function public.b1_stored_to_canonical(text) from public, anon, authenticated;
revoke all on function public.b1_require_auth_uid() from public, anon, authenticated;
revoke all on function public.b1_attachment_meta_json(public.student_request_attachment_uploads) from public, anon, authenticated;
revoke all on function public.b1_list_attachment_metas_for_request(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Idempotency registry (no direct client grants)
-- ---------------------------------------------------------------------------

create table if not exists public.b1_draft_mutation_idempotency (
  student_profile_id uuid not null references public.student_profiles(id),
  operation text not null check (operation in ('create_draft', 'save_draft')),
  idempotency_key text not null,
  request_id uuid not null references public.student_requests(id),
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (student_profile_id, operation, idempotency_key)
);

revoke all on table public.b1_draft_mutation_idempotency from public, anon, authenticated;

-- One legal open draft per student + stored B1 type (forward-only uniqueness).
create unique index if not exists uq_b1_one_open_draft_per_student_type
  on public.student_requests (student_profile_id, request_type)
  where status = 'draft'
    and request_type in (
      'enrollment_suspension',
      'absence_excuse',
      'excused_absence',
      'transfer',
      'department_transfer',
      'extra_chance',
      'final_chance',
      'file_withdrawal'
    );

-- ---------------------------------------------------------------------------
-- Internal helpers (no authenticated GRANT)
-- ---------------------------------------------------------------------------

create or replace function public.b1_canonical_primary_stored_code(p_canonical text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_canonical
    when 'enrollment_suspension' then 'enrollment_suspension'
    when 'excused_absence' then 'absence_excuse'
    when 'department_transfer' then 'transfer'
    when 'final_chance' then 'extra_chance'
    when 'file_withdrawal' then 'file_withdrawal'
    else null
  end;
$$;

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

create or replace function public.b1_draft_payload_hash(p_canonical text, p_form jsonb, p_request_id uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(
    coalesce(p_canonical, '') || '|' ||
    coalesce(p_request_id::text, '') || '|' ||
    coalesce(p_form::text, '{}')
  );
$$;

create or replace function public.b1_require_active_student_profile()
returns public.student_profiles
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.b1_require_auth_uid();
  v_sp public.student_profiles%rowtype;
begin
  select sp.* into v_sp
  from public.student_profiles sp
  where sp.user_id = v_uid and sp.status = 'active'
  order by sp.created_at asc
  limit 1;
  if v_sp.id is null then
    perform public.b1_deny_draft_mutation();
  end if;
  return v_sp;
end;
$$;

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

-- Soft draft validation + optional detail sync (submit-grade rules stay in persist_validated_b1_request_details).
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

create or replace function public.b1_build_student_draft_dto(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.b1_require_auth_uid();
  v_r public.student_requests%rowtype;
  v_canon text;
begin
  select r.* into v_r
  from public.student_requests r
  join public.student_profiles sp on sp.id = r.student_profile_id
  where r.id = p_request_id and sp.user_id = v_uid;
  if v_r.id is null then
    perform public.b1_deny_draft_mutation();
  end if;
  v_canon := public.b1_stored_to_canonical(v_r.request_type);
  if v_canon is null or v_r.status <> 'draft' then
    perform public.b1_deny_draft_mutation();
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

revoke all on function public.b1_canonical_primary_stored_code(text) from public, anon, authenticated;
revoke all on function public.b1_deny_draft_mutation() from public, anon, authenticated;
revoke all on function public.b1_draft_form_allowlist(text) from public, anon, authenticated;
revoke all on function public.b1_draft_payload_hash(text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.b1_require_active_student_profile() from public, anon, authenticated;
revoke all on function public.b1_assert_draft_form_object(jsonb) from public, anon, authenticated;
revoke all on function public.b1_assert_draft_allowlist(text,jsonb) from public, anon, authenticated;
revoke all on function public.b1_assert_uuid_array_field(jsonb,text) from public, anon, authenticated;
revoke all on function public.persist_b1_draft_form_and_details(uuid,text,jsonb,public.student_profiles) from public, anon, authenticated;
revoke all on function public.b1_build_student_draft_dto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Create or return legal open draft
-- ---------------------------------------------------------------------------

create or replace function public.create_b1_request_draft_for_student(
  p_canonical_code text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sp public.student_profiles%rowtype;
  v_canonical text := nullif(btrim(p_canonical_code), '');
  v_stored text;
  v_type public.request_types%rowtype;
  v_existing uuid;
  v_request_id uuid;
  v_request_number text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_hash text;
  v_idemp public.b1_draft_mutation_idempotency%rowtype;
  v_lock_key integer;
begin
  v_sp := public.b1_require_active_student_profile();

  if v_canonical is null or public.b1_canonical_primary_stored_code(v_canonical) is null then
    raise exception 'B1_CANONICAL_CODE_REQUIRED' using errcode = '22023';
  end if;
  v_stored := public.b1_canonical_primary_stored_code(v_canonical);

  -- Creation remains fail-closed until this service is explicitly visible and
  -- has exactly one active workflow. RPC existence is not activation.
  select rt.* into v_type from public.request_types rt where rt.code = v_stored;
  if not found then
    raise exception 'B1_REQUEST_TYPE_UNKNOWN' using errcode = '22023';
  end if;
  if v_type.is_active is distinct from true
     or v_type.student_visible is distinct from true
     or (
       select count(*)
       from public.request_type_workflows w
       where w.request_type_id = v_type.id
         and w.status = 'active'
         and w.is_active is true
     ) <> 1 then
    raise exception 'B1_REQUEST_TYPE_INACTIVE' using errcode = '42501';
  end if;

  v_hash := public.b1_draft_payload_hash(v_canonical, '{}'::jsonb, null);
  if v_key is not null then
    select i.* into v_idemp
    from public.b1_draft_mutation_idempotency i
    where i.student_profile_id = v_sp.id
      and i.operation = 'create_draft'
      and i.idempotency_key = v_key
    for update;
    if found then
      if v_idemp.payload_hash is distinct from v_hash then
        raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
      end if;
      return public.b1_build_student_draft_dto(v_idemp.request_id);
    end if;
  end if;

  v_lock_key := hashtext(v_sp.id::text || ':' || v_stored);
  perform pg_advisory_xact_lock(v_lock_key);

  select r.id into v_existing
  from public.student_requests r
  where r.student_profile_id = v_sp.id
    and r.request_type = v_stored
    and r.status = 'draft'
  order by r.created_at asc
  limit 1
  for update;

  if v_existing is not null then
    if v_key is not null then
      insert into public.b1_draft_mutation_idempotency(
        student_profile_id, operation, idempotency_key, request_id, payload_hash
      ) values (v_sp.id, 'create_draft', v_key, v_existing, v_hash)
      on conflict do nothing;
      if exists (
        select 1 from public.b1_draft_mutation_idempotency i
        where i.student_profile_id = v_sp.id
          and i.operation = 'create_draft'
          and i.idempotency_key = v_key
          and (i.payload_hash is distinct from v_hash or i.request_id is distinct from v_existing)
      ) then
        raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
      end if;
    end if;
    return public.b1_build_student_draft_dto(v_existing);
  end if;

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  begin
    insert into public.student_requests (
      request_number, student_profile_id, request_type, title, description,
      status, form_data, student_notes
    ) values (
      v_request_number, v_sp.id, v_stored, coalesce(nullif(btrim(v_type.name_ar), ''), v_stored),
      null, 'draft', '{}'::jsonb, null
    )
    returning id into v_request_id;
  exception
    when unique_violation then
      select r.id into v_request_id
      from public.student_requests r
      where r.student_profile_id = v_sp.id
        and r.request_type = v_stored
        and r.status = 'draft'
      order by r.created_at asc
      limit 1;
      if v_request_id is null then
        raise;
      end if;
  end;

  -- No detail row, no workflow runtime, no notifications.
  if v_key is not null then
    insert into public.b1_draft_mutation_idempotency(
      student_profile_id, operation, idempotency_key, request_id, payload_hash
    ) values (v_sp.id, 'create_draft', v_key, v_request_id, v_hash)
    on conflict (student_profile_id, operation, idempotency_key) do update
      set request_id = excluded.request_id
      where public.b1_draft_mutation_idempotency.payload_hash = excluded.payload_hash;
    if exists (
      select 1 from public.b1_draft_mutation_idempotency i
      where i.student_profile_id = v_sp.id and i.operation = 'create_draft'
        and i.idempotency_key = v_key and i.payload_hash is distinct from v_hash
    ) then
      raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
    end if;
  end if;

  return public.b1_build_student_draft_dto(v_request_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Atomic draft save (form_data + optional detail sync)
-- ---------------------------------------------------------------------------

create or replace function public.save_b1_request_draft_for_student(
  p_request_id uuid,
  p_form_data jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sp public.student_profiles%rowtype;
  v_r public.student_requests%rowtype;
  v_canonical text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_hash text;
  v_idemp public.b1_draft_mutation_idempotency%rowtype;
  v_before timestamptz;
  v_after_count integer;
begin
  v_sp := public.b1_require_active_student_profile();

  if p_request_id is null then
    perform public.b1_deny_draft_mutation();
  end if;

  select r.* into v_r
  from public.student_requests r
  where r.id = p_request_id
  for update;

  if not found or v_r.student_profile_id is distinct from v_sp.id then
    perform public.b1_deny_draft_mutation();
  end if;

  v_canonical := public.b1_stored_to_canonical(v_r.request_type);
  if v_canonical is null then
    perform public.b1_deny_draft_mutation();
  end if;

  -- Draft mutations only; submitted/completed/cancelled/returned â†’ opaque deny.
  if v_r.status is distinct from 'draft' then
    perform public.b1_deny_draft_mutation();
  end if;

  if p_expected_updated_at is null then
    raise exception 'B1_STALE_REQUEST_VERSION' using errcode = '40001';
  end if;

  perform public.b1_assert_draft_form_object(p_form_data);
  perform public.b1_assert_draft_allowlist(v_canonical, p_form_data);

  v_hash := public.b1_draft_payload_hash(v_canonical, p_form_data, p_request_id);
  if v_key is not null then
    select i.* into v_idemp
    from public.b1_draft_mutation_idempotency i
    where i.student_profile_id = v_sp.id
      and i.operation = 'save_draft'
      and i.idempotency_key = v_key
    for update;
    if found then
      if v_idemp.payload_hash is distinct from v_hash
         or v_idemp.request_id is distinct from p_request_id then
        raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
      end if;
      return public.b1_build_student_draft_dto(p_request_id);
    end if;
  end if;

  -- Idempotent retries are resolved above. A new mutation must match the
  -- authoritative timestamp returned by the backend read.
  if v_r.updated_at is distinct from p_expected_updated_at then
    raise exception 'B1_STALE_REQUEST_VERSION' using errcode = '40001';
  end if;

  v_before := v_r.updated_at;
  perform public.persist_b1_draft_form_and_details(p_request_id, v_canonical, p_form_data, v_sp);

  if v_key is not null then
    insert into public.b1_draft_mutation_idempotency(
      student_profile_id, operation, idempotency_key, request_id, payload_hash
    ) values (v_sp.id, 'save_draft', v_key, p_request_id, v_hash);
  end if;

  -- Ensure updated_at moved when form changed (DB trigger may already bump it).
  select count(*) into v_after_count
  from public.student_requests r
  where r.id = p_request_id and r.updated_at is not distinct from v_before
    and r.form_data = p_form_data;
  -- no-op if identical payload kept same timestamp; still return DB DTO.

  return public.b1_build_student_draft_dto(p_request_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Capability surface: open create/save on top of secure-read capability
-- ---------------------------------------------------------------------------

create or replace function public.get_b1_secure_read_runtime_capability()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_ready_services jsonb;
declare v_ready_count integer;
begin
  perform public.b1_require_auth_uid();
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
    'available', v_ready_count = 5,
    'contract', 'B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01',
    'draft_mutations_contract', 'B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01',
    'services', v_ready_services,
    'reads', jsonb_build_array(
      'form_options','draft','student_details','student_list',
      'assigned_inbox','assigned_details','step_actions','attachments'
    ),
    'writes_available', case when v_ready_count = 5
      then jsonb_build_array('create_draft','save_draft') else '[]'::jsonb end,
    'writes_fail_closed', case when v_ready_count = 5
      then '[]'::jsonb else jsonb_build_array('create_draft','save_draft') end,
    'submit_rpc', 'submit_b1_student_request_atomic'
  );
end;
$$;

revoke all on function public.create_b1_request_draft_for_student(text, text) from public, anon;
revoke all on function public.save_b1_request_draft_for_student(uuid, jsonb, timestamptz, text) from public, anon;
grant execute on function public.create_b1_request_draft_for_student(text, text) to authenticated;
grant execute on function public.save_b1_request_draft_for_student(uuid, jsonb, timestamptz, text) to authenticated;

commit;
