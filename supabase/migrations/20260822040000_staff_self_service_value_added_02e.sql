-- PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
-- Forward-only SOURCE migration. NOT applied to any database in this stage.
-- Depends on 02A (foundation), 02B (private storage binding), 02D (read side).
--
-- Modules: issued documents + QR verification, annual performance evaluation,
-- attendance, overtime/assignments, training, promotions/settlements,
-- electronic clearance.
--
-- Authority model is inherited from 02A/02D and is never duplicated:
--   public.staff_service_is_admin(uuid)
--   public.staff_service_has_role(uuid, text, uuid)
--   public.staff_service_reject_event_mutation()
--   public.staff_service_touch_updated_at()

begin;

do $$
begin
  if to_regprocedure('public.staff_service_is_admin(uuid)') is null
     or to_regprocedure('public.staff_service_has_role(uuid, text, uuid)') is null
     or to_regprocedure('public.staff_service_reject_event_mutation()') is null
     or to_regprocedure('public.staff_service_touch_updated_at()') is null then
    raise exception 'STAFF_SERVICE_02E_REQUIRES_02A';
  end if;
  if to_regprocedure('public.staff_service_authorize_attachment_download(uuid)') is null then
    raise exception 'STAFF_SERVICE_02E_REQUIRES_02B';
  end if;
  if to_regclass('public.staff_service_read_audit_events') is null
     or to_regprocedure('public.staff_service_get_current_capabilities()') is null then
    raise exception 'STAFF_SERVICE_02E_REQUIRES_02D';
  end if;
end;
$$;

-- ===========================================================================
-- 0) Shared scope helpers + append-only value-added audit ledger
-- ===========================================================================

-- Identity-bound scope helpers.
--
-- They keep the (actor, subject) signature so RLS policies stay readable, but
-- they answer ONLY about the calling identity: when `_user_id` is anything
-- other than auth.uid() the answer is always false. This removes the
-- identity-oracle pattern (an authenticated client cannot probe "does actor X
-- manage profile Y?"). Every legitimate caller - RLS policies and the SECURITY
-- DEFINER RPCs below - already passes auth.uid(), so behaviour is unchanged.
create or replace function public.staff_service_manages_profile(
  _user_id uuid,
  _staff_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and _user_id is not distinct from auth.uid()
     and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = _staff_profile_id
      and sp.user_id is distinct from _user_id
      and public.staff_service_has_role(_user_id, 'direct_manager', sp.department_id)
  );
$$;

create or replace function public.staff_service_owns_profile(
  _user_id uuid,
  _staff_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and _user_id is not distinct from auth.uid()
     and exists (
    select 1 from public.staff_profiles sp
    where sp.id = _staff_profile_id and sp.user_id = _user_id
  );
$$;

create table public.staff_value_added_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete restrict,
  module text not null check (module in (
    'issued_document', 'performance', 'attendance', 'overtime',
    'training', 'promotion', 'clearance'
  )),
  subject_id uuid not null,
  event_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 8192)
);

create index staff_value_added_audit_subject_idx
  on public.staff_value_added_audit_events (module, subject_id, occurred_at desc);

create trigger staff_value_added_audit_immutable_update
  before update on public.staff_value_added_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

create trigger staff_value_added_audit_immutable_delete
  before delete on public.staff_value_added_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

-- ===========================================================================
-- 1) Issued documents (employment / experience statements) + QR verification
-- ===========================================================================

create table public.staff_issued_documents (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  document_type text not null check (document_type in (
    'employment_statement', 'experience_certificate',
    'training_certificate', 'clearance_certificate'
  )),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  request_id uuid unique references public.staff_service_requests(id) on delete restrict,
  language_code text not null default 'ar' check (language_code in ('ar', 'en')),
  purpose text,
  destination text,
  notes text,
  -- Verification token is never stored in clear text: only its SHA-256 digest.
  verification_token_digest text not null unique
    check (verification_token_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > issued_at),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (status <> 'revoked' or nullif(btrim(revoke_reason), '') is not null)
);

create index staff_issued_documents_owner_idx
  on public.staff_issued_documents (staff_profile_id, issued_at desc);

create trigger staff_issued_documents_touch
  before update on public.staff_issued_documents
  for each row execute function public.staff_service_touch_updated_at();

-- Verification amplification containment.
--
-- The public verifier is unauthenticated, so an attacker could otherwise force
-- an unbounded per-attempt trail against a shared sentinel subject. Failed
-- probes therefore write NOTHING but a bounded hourly counter (one row per
-- hour, for the whole system), and successful verifications write at most one
-- audit event per document per hour. No token material - neither raw token nor
-- probe digest - is ever persisted, and the outward invalid response is
-- byte-identical for malformed and unknown tokens.
create table public.staff_document_verification_probe_stats (
  window_start timestamptz primary key,
  failed_attempts bigint not null default 0 check (failed_attempts >= 0),
  succeeded_attempts bigint not null default 0 check (succeeded_attempts >= 0),
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- 2) Annual performance evaluation
-- ===========================================================================

create table public.staff_performance_cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_year integer not null unique check (cycle_year between 2000 and 2200),
  title_ar text not null,
  opens_on date not null,
  closes_on date not null,
  status text not null default 'open' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  check (closes_on >= opens_on)
);

create table public.staff_performance_evaluations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.staff_performance_cycles(id) on delete restrict,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  overall_rating numeric(5,2) check (overall_rating between 0 and 100),
  rating_band text check (rating_band in (
    'excellent', 'very_good', 'good', 'acceptable', 'weak'
  )),
  goals text,
  strengths text,
  improvements text,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_at timestamptz,
  acknowledged_at timestamptz,
  employee_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, staff_profile_id),
  check ((status = 'finalized') = (finalized_at is not null)),
  check (status = 'finalized' or acknowledged_at is null),
  check (acknowledged_at is null or acknowledged_at >= finalized_at)
);

create trigger staff_performance_evaluations_touch
  before update on public.staff_performance_evaluations
  for each row execute function public.staff_service_touch_updated_at();

-- ===========================================================================
-- 3) Attendance (authoritative, imported; clients never mutate)
-- ===========================================================================

create table public.staff_attendance_days (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  day_state text not null check (day_state in (
    'present', 'absent', 'late', 'leave', 'holiday', 'mission'
  )),
  source_system text not null,
  created_at timestamptz not null default now(),
  unique (staff_profile_id, attendance_date),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create index staff_attendance_days_month_idx
  on public.staff_attendance_days (staff_profile_id, attendance_date desc);

-- ===========================================================================
-- 4) Assignments / overtime (financial impact isolated for Finance)
-- ===========================================================================

create table public.staff_overtime_claims (
  id uuid primary key default gen_random_uuid(),
  claim_no text not null unique,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  claim_kind text not null check (claim_kind in ('overtime', 'assignment')),
  starts_on date not null,
  ends_on date not null,
  total_hours numeric(7,2) not null check (total_hours > 0 and total_hours <= 400),
  reason text not null check (char_length(btrim(reason)) >= 3),
  status text not null default 'submitted' check (status in (
    'submitted', 'manager_approved', 'hr_approved', 'rejected', 'cancelled'
  )),
  manager_decided_by uuid references auth.users(id) on delete set null,
  manager_decided_at timestamptz,
  manager_reason text,
  hr_decided_by uuid references auth.users(id) on delete set null,
  hr_decided_at timestamptz,
  hr_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, idempotency_key),
  check (ends_on >= starts_on)
);

create trigger staff_overtime_claims_touch
  before update on public.staff_overtime_claims
  for each row execute function public.staff_service_touch_updated_at();

-- Financial fields live in their own table so Finance least privilege is a
-- table boundary rather than a UI convention.
create table public.staff_overtime_financial_impact (
  claim_id uuid primary key references public.staff_overtime_claims(id) on delete restrict,
  currency_code text not null default 'YER' check (currency_code = 'YER'),
  hourly_rate numeric(16,2) not null check (hourly_rate >= 0),
  gross_amount numeric(16,2) not null check (gross_amount >= 0),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger staff_overtime_financial_impact_touch
  before update on public.staff_overtime_financial_impact
  for each row execute function public.staff_service_touch_updated_at();

-- ===========================================================================
-- 5) Training / development
-- ===========================================================================

create table public.staff_training_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title_ar text not null,
  provider text not null,
  starts_on date not null,
  ends_on date not null,
  total_hours numeric(6,2) not null check (total_hours > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.staff_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.staff_training_courses(id) on delete restrict,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'rejected', 'completed', 'cancelled'
  )),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  completed_at timestamptz,
  -- Certificate metadata follows the 02B private-storage convention: bucket +
  -- path + checksum only, never a public URL.
  certificate_bucket text check (certificate_bucket = 'staff-service-private'),
  certificate_object_path text,
  certificate_sha256 text check (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, staff_profile_id),
  check ((status in ('approved', 'rejected')) = (decided_at is not null)),
  check (status <> 'rejected' or nullif(btrim(decision_reason), '') is not null),
  check ((status = 'completed') = (completed_at is not null)),
  check ((certificate_object_path is null) = (certificate_bucket is null))
);

create trigger staff_training_enrollments_touch
  before update on public.staff_training_enrollments
  for each row execute function public.staff_service_touch_updated_at();

-- ===========================================================================
-- 6) Promotions / settlements
-- ===========================================================================

create table public.staff_promotion_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  case_kind text not null check (case_kind in (
    'promotion', 'settlement', 'grade_adjustment'
  )),
  current_grade text,
  proposed_grade text,
  status text not null default 'under_study' check (status in (
    'under_study', 'hr_review', 'approved', 'rejected', 'implemented'
  )),
  effective_on date,
  notes text,
  opened_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, idempotency_key)
);

create trigger staff_promotion_cases_touch
  before update on public.staff_promotion_cases
  for each row execute function public.staff_service_touch_updated_at();

create table public.staff_promotion_financial_impact (
  case_id uuid primary key references public.staff_promotion_cases(id) on delete restrict,
  currency_code text not null default 'YER' check (currency_code = 'YER'),
  current_basic numeric(16,2) not null check (current_basic >= 0),
  proposed_basic numeric(16,2) not null check (proposed_basic >= 0),
  retroactive_amount numeric(16,2) not null default 0 check (retroactive_amount >= 0),
  updated_at timestamptz not null default now()
);

create trigger staff_promotion_financial_impact_touch
  before update on public.staff_promotion_financial_impact
  for each row execute function public.staff_service_touch_updated_at();

-- ===========================================================================
-- 7) Electronic clearance
-- ===========================================================================

create table public.staff_clearance_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  reason text not null,
  status text not null default 'in_progress' check (status in (
    'in_progress', 'completed', 'cancelled'
  )),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  custody_override boolean not null default false,
  custody_override_reason text,
  custody_override_by uuid references auth.users(id) on delete set null,
  custody_override_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, idempotency_key),
  check ((status = 'completed') = (completed_at is not null)),
  check (custody_override = false or (
    nullif(btrim(custody_override_reason), '') is not null
    and custody_override_by is not null
    and custody_override_at is not null
  ))
);

-- At most one live clearance case per employee (replay-safe case opening).
create unique index staff_clearance_cases_single_open_idx
  on public.staff_clearance_cases (staff_profile_id)
  where status = 'in_progress';

create trigger staff_clearance_cases_touch
  before update on public.staff_clearance_cases
  for each row execute function public.staff_service_touch_updated_at();

create table public.staff_clearance_checkpoints (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.staff_clearance_cases(id) on delete restrict,
  checkpoint_kind text not null check (checkpoint_kind in (
    'direct_manager', 'hr', 'finance', 'it_custody', 'administration'
  )),
  required_role text not null check (required_role in (
    'direct_manager', 'hr', 'finance', 'administrator'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'cleared', 'blocked'
  )),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  unique (case_id, checkpoint_kind),
  check ((status in ('cleared', 'blocked')) = (decided_at is not null)),
  check (status <> 'blocked' or nullif(btrim(decision_reason), '') is not null)
);

-- ===========================================================================
-- 8) State-changing RPCs
-- ===========================================================================

create or replace function public.staff_service_request_employment_statement(
  p_document_type text,
  p_language_code text,
  p_purpose text,
  p_destination text,
  p_notes text,
  p_idempotency_key uuid
)
returns public.staff_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_type text;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_document_type not in ('employment_statement', 'experience_certificate') then
    raise exception 'STAFF_SERVICE_DOCUMENT_TYPE_INVALID' using errcode = '22023';
  end if;
  if coalesce(p_language_code, 'ar') not in ('ar', 'en') then
    raise exception 'STAFF_SERVICE_DOCUMENT_LANGUAGE_INVALID' using errcode = '22023';
  end if;

  v_service_type := case p_document_type
    when 'employment_statement' then 'employment_certificate'
    else 'experience_certificate'
  end;

  -- Reuse the proven 02A submission path: workflow, audit and notification
  -- behaviour are not duplicated here.
  return public.staff_service_submit_request(
    v_service_type,
    jsonb_build_object(
      'document_type', p_document_type,
      'language_code', coalesce(p_language_code, 'ar'),
      'purpose', nullif(btrim(p_purpose), ''),
      'destination', nullif(btrim(p_destination), ''),
      'notes', nullif(btrim(p_notes), '')
    ),
    p_idempotency_key
  );
end;
$$;

create or replace function public.staff_service_issue_document(
  p_request_id uuid,
  p_valid_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_request public.staff_service_requests;
  v_token text;
  v_digest text;
  v_doc public.staff_issued_documents;
  v_type text;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 3650 then
    raise exception 'STAFF_SERVICE_DOCUMENT_VALIDITY_INVALID' using errcode = '22023';
  end if;

  select * into v_request
  from public.staff_service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'STAFF_SERVICE_REQUEST_NOT_FOUND' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'hr', v_request.department_id)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_DOCUMENT_ISSUE_DENIED' using errcode = '42501';
  end if;

  if v_request.service_type not in ('employment_certificate', 'experience_certificate') then
    raise exception 'STAFF_SERVICE_DOCUMENT_TYPE_INVALID' using errcode = '22023';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'STAFF_SERVICE_DOCUMENT_REQUEST_NOT_APPROVED' using errcode = '42501';
  end if;

  -- Replay safety: one issued document per request (also enforced by the
  -- UNIQUE constraint on request_id).
  perform 1
  from public.staff_issued_documents
  where request_id = p_request_id;
  if found then
    raise exception 'STAFF_SERVICE_DOCUMENT_ALREADY_ISSUED' using errcode = '23505';
  end if;

  v_type := case v_request.service_type
    when 'employment_certificate' then 'employment_statement'
    else 'experience_certificate'
  end;

  -- 256 bits of CSPRNG material, persisted only as a SHA-256 digest.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  v_digest := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');

  insert into public.staff_issued_documents (
    reference_no, document_type, staff_profile_id, request_id,
    language_code, purpose, destination, notes,
    verification_token_digest, issued_by, expires_at
  ) values (
    'DOC-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_type,
    v_request.staff_profile_id,
    v_request.id,
    coalesce(v_request.payload ->> 'language_code', 'ar'),
    v_request.payload ->> 'purpose',
    v_request.payload ->> 'destination',
    v_request.payload ->> 'notes',
    v_digest,
    v_user,
    now() + make_interval(days => p_valid_days)
  ) returning * into v_doc;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'issued_document', v_doc.id, 'document_issued',
    jsonb_build_object('reference_no', v_doc.reference_no, 'document_type', v_type)
  );

  -- The raw token is returned exactly once, to the issuing HR actor, so it can
  -- be embedded in the QR of the generated document. It is never persisted and
  -- never written to any audit row.
  return jsonb_build_object(
    'document_id', v_doc.id,
    'reference_no', v_doc.reference_no,
    'document_type', v_doc.document_type,
    'issued_at', v_doc.issued_at,
    'expires_at', v_doc.expires_at,
    'verification_token', v_token
  );
end;
$$;

create or replace function public.staff_service_revoke_issued_document(
  p_document_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_doc public.staff_issued_documents;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_SERVICE_REVOKE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_doc
  from public.staff_issued_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'STAFF_SERVICE_DOCUMENT_NOT_FOUND' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_DOCUMENT_REVOKE_DENIED' using errcode = '42501';
  end if;

  update public.staff_issued_documents
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_user,
      revoke_reason = btrim(p_reason)
  where id = v_doc.id
    and status = 'issued'
  returning * into v_doc;

  if not found then
    raise exception 'STAFF_SERVICE_DOCUMENT_ALREADY_REVOKED' using errcode = '42501';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, reason, metadata
  ) values (
    v_user, 'issued_document', v_doc.id, 'document_revoked', btrim(p_reason),
    jsonb_build_object('reference_no', v_doc.reference_no)
  );

  return jsonb_build_object(
    'document_id', v_doc.id,
    'status', v_doc.status,
    'revoked_at', v_doc.revoked_at
  );
end;
$$;

-- Public verification: the only 02E surface reachable without a staff session.
-- It accepts an opaque token, compares digests, audits the attempt WITHOUT the
-- raw token, and returns minimal, non-sensitive authenticity metadata.
create or replace function public.staff_service_verify_issued_document(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_digest text;
  v_doc public.staff_issued_documents;
  v_profile public.staff_profiles;
  v_result text;
  v_holder text;
begin
  if p_token is null or btrim(p_token) !~ '^[a-f0-9]{64}$' then
    -- Shape check only; no token material is echoed, returned or stored.
    return jsonb_build_object('result', 'invalid');
  end if;

  v_digest := encode(sha256(convert_to(btrim(p_token), 'UTF8')), 'hex');

  select * into v_doc
  from public.staff_issued_documents
  where verification_token_digest = v_digest;

  if not found then
    -- Containment: bounded hourly counter only. No per-attempt audit row, no
    -- sentinel subject trail, no token/digest material, identical response.
    insert into public.staff_document_verification_probe_stats as st
      (window_start, failed_attempts)
    values (date_trunc('hour', now()), 1)
    on conflict (window_start) do update
      set failed_attempts = st.failed_attempts + 1,
          updated_at = now();
    return jsonb_build_object('result', 'invalid');
  end if;

  v_result := case
    when v_doc.status = 'revoked' then 'revoked'
    when v_doc.expires_at is not null and v_doc.expires_at <= now() then 'expired'
    else 'valid'
  end;

  select * into v_profile
  from public.staff_profiles
  where id = v_doc.staff_profile_id;

  -- Masked holder label: first name plus a masked remainder.
  v_holder := split_part(coalesce(v_profile.full_name_ar, ''), ' ', 1) || ' ****';

  insert into public.staff_document_verification_probe_stats as st
    (window_start, succeeded_attempts)
  values (date_trunc('hour', now()), 1)
  on conflict (window_start) do update
    set succeeded_attempts = st.succeeded_attempts + 1,
        updated_at = now();

  -- Bounded: at most one verification event per document per hour.
  if not exists (
    select 1 from public.staff_value_added_audit_events e
    where e.module = 'issued_document'
      and e.subject_id = v_doc.id
      and e.event_type = 'document_verified'
      and e.occurred_at >= date_trunc('hour', now())
  ) then
    insert into public.staff_value_added_audit_events (
      actor_user_id, module, subject_id, event_type, metadata
    ) values (
      auth.uid(), 'issued_document', v_doc.id, 'document_verified',
      jsonb_build_object('result', v_result)
    );
  end if;

  return jsonb_build_object(
    'result', v_result,
    'issuer_ar', 'كلية تقنية المعلومات وعلوم الحاسوب — جامعة سبأ',
    'document_type', v_doc.document_type,
    'holder_label', v_holder,
    'reference_no', v_doc.reference_no,
    'issued_at', v_doc.issued_at,
    'expires_at', v_doc.expires_at
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Performance evaluation
-- --------------------------------------------------------------------------

create or replace function public.staff_service_finalize_evaluation(
  p_evaluation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_eval public.staff_performance_evaluations;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_eval
  from public.staff_performance_evaluations
  where id = p_evaluation_id
  for update;

  if not found then
    raise exception 'STAFF_SERVICE_EVALUATION_NOT_FOUND' using errcode = '42501';
  end if;

  if public.staff_service_owns_profile(v_user, v_eval.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_EVALUATION_DENIED' using errcode = '42501';
  end if;

  if not (
    public.staff_service_manages_profile(v_user, v_eval.staff_profile_id)
    or public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_EVALUATION_SCOPE_DENIED' using errcode = '42501';
  end if;

  if v_eval.status = 'finalized' then
    raise exception 'STAFF_SERVICE_EVALUATION_ALREADY_FINALIZED' using errcode = '42501';
  end if;

  if v_eval.overall_rating is null or v_eval.rating_band is null then
    raise exception 'STAFF_SERVICE_EVALUATION_INCOMPLETE' using errcode = '22023';
  end if;

  update public.staff_performance_evaluations
  set status = 'finalized', finalized_at = now()
  where id = v_eval.id
    and status = 'draft'
  returning * into v_eval;

  if not found then
    raise exception 'STAFF_SERVICE_EVALUATION_ALREADY_FINALIZED' using errcode = '42501';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'performance', v_eval.id, 'evaluation_finalized',
    jsonb_build_object('cycle_id', v_eval.cycle_id)
  );

  return jsonb_build_object('evaluation_id', v_eval.id, 'status', v_eval.status);
end;
$$;

create or replace function public.staff_service_acknowledge_evaluation(
  p_evaluation_id uuid,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_eval public.staff_performance_evaluations;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_eval
  from public.staff_performance_evaluations
  where id = p_evaluation_id
  for update;

  if not found or not public.staff_service_owns_profile(v_user, v_eval.staff_profile_id) then
    raise exception 'STAFF_SERVICE_EVALUATION_SCOPE_DENIED' using errcode = '42501';
  end if;

  if v_eval.status <> 'finalized' then
    raise exception 'STAFF_SERVICE_EVALUATION_NOT_FINALIZED' using errcode = '42501';
  end if;

  if v_eval.acknowledged_at is not null then
    raise exception 'STAFF_SERVICE_EVALUATION_ALREADY_ACKNOWLEDGED' using errcode = '42501';
  end if;

  update public.staff_performance_evaluations
  set acknowledged_at = now(),
      employee_comment = nullif(btrim(p_comment), '')
  where id = v_eval.id
    and acknowledged_at is null
  returning * into v_eval;

  if not found then
    raise exception 'STAFF_SERVICE_EVALUATION_ALREADY_ACKNOWLEDGED' using errcode = '42501';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, reason, metadata
  ) values (
    v_user, 'performance', v_eval.id, 'evaluation_acknowledged',
    nullif(btrim(p_comment), ''), '{}'::jsonb
  );

  return jsonb_build_object(
    'evaluation_id', v_eval.id,
    'acknowledged_at', v_eval.acknowledged_at
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Attendance summary (own month, or scoped oversight)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_get_attendance_summary(
  p_staff_profile_id uuid,
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_start date;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2200
     or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'STAFF_SERVICE_ATTENDANCE_PERIOD_INVALID' using errcode = '22023';
  end if;

  if not (
    public.staff_service_owns_profile(v_user, p_staff_profile_id)
    or public.staff_service_manages_profile(v_user, p_staff_profile_id)
    or public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_ATTENDANCE_SCOPE_DENIED' using errcode = '42501';
  end if;

  v_start := make_date(p_year, p_month, 1);

  return (
    select jsonb_build_object(
      'staff_profile_id', p_staff_profile_id,
      'year', p_year,
      'month', p_month,
      'present_days', count(*) filter (where day_state = 'present'),
      'absent_days', count(*) filter (where day_state = 'absent'),
      'late_days', count(*) filter (where day_state = 'late'),
      'leave_days', count(*) filter (where day_state = 'leave'),
      'worked_hours', round(coalesce(sum(worked_minutes), 0) / 60.0, 2),
      'late_minutes', coalesce(sum(late_minutes), 0),
      'overtime_hours', round(coalesce(sum(overtime_minutes), 0) / 60.0, 2)
    )
    from public.staff_attendance_days
    where staff_profile_id = p_staff_profile_id
      and attendance_date >= v_start
      and attendance_date < (v_start + interval '1 month')
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Overtime / assignments
-- --------------------------------------------------------------------------

create or replace function public.staff_service_submit_overtime_claim(
  p_claim_kind text,
  p_starts_on date,
  p_ends_on date,
  p_total_hours numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns public.staff_overtime_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.staff_profiles;
  v_claim public.staff_overtime_claims;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;
  if p_claim_kind not in ('overtime', 'assignment') then
    raise exception 'STAFF_SERVICE_OVERTIME_KIND_INVALID' using errcode = '22023';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'STAFF_SERVICE_OVERTIME_PERIOD_INVALID' using errcode = '22023';
  end if;
  if p_total_hours is null or p_total_hours <= 0 or p_total_hours > 400 then
    raise exception 'STAFF_SERVICE_OVERTIME_HOURS_INVALID' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'STAFF_SERVICE_OVERTIME_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_profile
  from public.staff_profiles
  where user_id = v_user and status = 'active';
  if not found then
    raise exception 'STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_claim
  from public.staff_overtime_claims
  where staff_profile_id = v_profile.id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_claim;
  end if;

  insert into public.staff_overtime_claims (
    claim_no, staff_profile_id, department_id, claim_kind,
    starts_on, ends_on, total_hours, reason, idempotency_key
  ) values (
    'OVT-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_profile.id, v_profile.department_id, p_claim_kind,
    p_starts_on, p_ends_on, p_total_hours, btrim(p_reason), p_idempotency_key
  ) returning * into v_claim;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'overtime', v_claim.id, 'overtime_submitted',
    jsonb_build_object('claim_no', v_claim.claim_no, 'claim_kind', p_claim_kind)
  );

  return v_claim;
end;
$$;

create or replace function public.staff_service_decide_overtime_claim(
  p_claim_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.staff_overtime_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_claim public.staff_overtime_claims;
  v_stage text;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'STAFF_SERVICE_DECISION_INVALID' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_SERVICE_REJECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_claim
  from public.staff_overtime_claims
  where id = p_claim_id
  for update;
  if not found then
    raise exception 'STAFF_SERVICE_OVERTIME_NOT_FOUND' using errcode = '42501';
  end if;

  if public.staff_service_owns_profile(v_user, v_claim.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  v_stage := case v_claim.status
    when 'submitted' then 'direct_manager'
    when 'manager_approved' then 'hr'
    else null
  end;

  if v_stage is null then
    raise exception 'STAFF_SERVICE_OVERTIME_STATE_INVALID' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, v_stage, v_claim.department_id)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  if v_stage = 'direct_manager' then
    update public.staff_overtime_claims
    set status = case when p_decision = 'approved' then 'manager_approved' else 'rejected' end,
        manager_decided_by = v_user,
        manager_decided_at = now(),
        manager_reason = nullif(btrim(p_reason), '')
    where id = v_claim.id and status = 'submitted'
    returning * into v_claim;
  else
    update public.staff_overtime_claims
    set status = case when p_decision = 'approved' then 'hr_approved' else 'rejected' end,
        hr_decided_by = v_user,
        hr_decided_at = now(),
        hr_reason = nullif(btrim(p_reason), '')
    where id = v_claim.id and status = 'manager_approved'
    returning * into v_claim;
  end if;

  if not found then
    -- Another transaction advanced the claim first: replay is denied.
    raise exception 'STAFF_SERVICE_OVERTIME_STATE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, reason, metadata
  ) values (
    v_user, 'overtime', v_claim.id, 'overtime_' || v_stage || '_' || p_decision,
    nullif(btrim(p_reason), ''),
    jsonb_build_object('status', v_claim.status)
  );

  return v_claim;
end;
$$;

-- --------------------------------------------------------------------------
-- Training
-- --------------------------------------------------------------------------

create or replace function public.staff_service_request_training_enrollment(
  p_course_id uuid
)
returns public.staff_training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.staff_profiles;
  v_course public.staff_training_courses;
  v_row public.staff_training_enrollments;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_profiles
  where user_id = v_user and status = 'active';
  if not found then
    raise exception 'STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_course
  from public.staff_training_courses
  where id = p_course_id and active;
  if not found then
    raise exception 'STAFF_SERVICE_TRAINING_COURSE_UNAVAILABLE' using errcode = '42501';
  end if;

  select * into v_row
  from public.staff_training_enrollments
  where course_id = p_course_id and staff_profile_id = v_profile.id;
  if found then
    return v_row;
  end if;

  insert into public.staff_training_enrollments (course_id, staff_profile_id)
  values (p_course_id, v_profile.id)
  returning * into v_row;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'training', v_row.id, 'training_requested',
    jsonb_build_object('course_id', p_course_id)
  );

  return v_row;
end;
$$;

create or replace function public.staff_service_decide_training_enrollment(
  p_enrollment_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.staff_training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_training_enrollments;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'STAFF_SERVICE_DECISION_INVALID' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_SERVICE_REJECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_row
  from public.staff_training_enrollments
  where id = p_enrollment_id
  for update;
  if not found then
    raise exception 'STAFF_SERVICE_TRAINING_NOT_FOUND' using errcode = '42501';
  end if;

  if public.staff_service_owns_profile(v_user, v_row.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  update public.staff_training_enrollments
  set status = p_decision,
      decided_by = v_user,
      decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = v_row.id and status = 'requested'
  returning * into v_row;

  if not found then
    raise exception 'STAFF_SERVICE_TRAINING_STATE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, reason, metadata
  ) values (
    v_user, 'training', v_row.id, 'training_' || p_decision,
    nullif(btrim(p_reason), ''), jsonb_build_object('status', v_row.status)
  );

  return v_row;
end;
$$;

create or replace function public.staff_service_complete_training_enrollment(
  p_enrollment_id uuid,
  p_certificate_object_path text default null,
  p_certificate_sha256 text default null
)
returns public.staff_training_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_training_enrollments;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_certificate_sha256 is not null and p_certificate_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'STAFF_SERVICE_TRAINING_CERTIFICATE_INVALID' using errcode = '22023';
  end if;
  if p_certificate_object_path is not null
     and (p_certificate_object_path like '%..%' or btrim(p_certificate_object_path) = '') then
    raise exception 'STAFF_SERVICE_TRAINING_CERTIFICATE_INVALID' using errcode = '22023';
  end if;

  select * into v_row
  from public.staff_training_enrollments
  where id = p_enrollment_id
  for update;
  if not found then
    raise exception 'STAFF_SERVICE_TRAINING_NOT_FOUND' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  update public.staff_training_enrollments
  set status = 'completed',
      completed_at = now(),
      certificate_bucket = case
        when p_certificate_object_path is null then null
        else 'staff-service-private'
      end,
      certificate_object_path = p_certificate_object_path,
      certificate_sha256 = p_certificate_sha256
  where id = v_row.id and status = 'approved'
  returning * into v_row;

  if not found then
    raise exception 'STAFF_SERVICE_TRAINING_STATE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'training', v_row.id, 'training_completed', '{}'::jsonb
  );

  return v_row;
end;
$$;

-- --------------------------------------------------------------------------
-- Clearance
-- --------------------------------------------------------------------------

create or replace function public.staff_service_decide_clearance_checkpoint(
  p_checkpoint_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.staff_clearance_checkpoints
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_point public.staff_clearance_checkpoints;
  v_case public.staff_clearance_cases;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('cleared', 'blocked') then
    raise exception 'STAFF_SERVICE_DECISION_INVALID' using errcode = '22023';
  end if;
  if p_decision = 'blocked' and nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_SERVICE_REJECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_point
  from public.staff_clearance_checkpoints
  where id = p_checkpoint_id
  for update;
  if not found then
    raise exception 'STAFF_SERVICE_CLEARANCE_NOT_FOUND' using errcode = '42501';
  end if;

  select * into v_case
  from public.staff_clearance_cases
  where id = v_point.case_id;

  if public.staff_service_owns_profile(v_user, v_case.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  -- Only the checkpoint owner decides. This deliberately does NOT use
  -- staff_service_has_role(): that helper answers true for any role when the
  -- caller is an administrator, while a clearance checkpoint requires a real,
  -- active assignment for that exact unit.
  if not exists (
    select 1
    from public.staff_service_role_assignments a
    where a.user_id = v_user
      and a.role = v_point.required_role
      and a.active
      and a.valid_from <= current_date
      and (a.valid_until is null or a.valid_until >= current_date)
      and (a.department_id is null or a.department_id = v_case.department_id)
  ) then
    raise exception 'STAFF_SERVICE_CHECKPOINT_OWNER_ONLY' using errcode = '42501';
  end if;

  update public.staff_clearance_checkpoints
  set status = p_decision,
      decided_by = v_user,
      decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = v_point.id and status = 'pending'
  returning * into v_point;

  if not found then
    raise exception 'STAFF_SERVICE_CLEARANCE_STATE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, reason, metadata
  ) values (
    v_user, 'clearance', v_case.id, 'clearance_checkpoint_' || p_decision,
    nullif(btrim(p_reason), ''),
    jsonb_build_object('checkpoint_kind', v_point.checkpoint_kind)
  );

  return v_point;
end;
$$;

create or replace function public.staff_service_complete_clearance_case(
  p_case_id uuid,
  p_custody_override boolean default false,
  p_override_reason text default null
)
returns public.staff_clearance_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_case public.staff_clearance_cases;
  v_pending integer;
  v_custody integer;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_case
  from public.staff_clearance_cases
  where id = p_case_id
  for update;
  if not found then
    raise exception 'STAFF_SERVICE_CLEARANCE_NOT_FOUND' using errcode = '42501';
  end if;

  if public.staff_service_owns_profile(v_user, v_case.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'hr', v_case.department_id)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_CLEARANCE_COMPLETION_DENIED' using errcode = '42501';
  end if;

  if v_case.status <> 'in_progress' then
    raise exception 'STAFF_SERVICE_CLEARANCE_STATE_INVALID' using errcode = '42501';
  end if;

  select count(*) into v_pending
  from public.staff_clearance_checkpoints
  where case_id = v_case.id and status <> 'cleared';
  if v_pending > 0 then
    raise exception 'STAFF_SERVICE_CLEARANCE_CHECKPOINTS_PENDING' using errcode = '42501';
  end if;

  select count(*) into v_custody
  from public.staff_custody_assignments
  where staff_profile_id = v_case.staff_profile_id
    and returned_on is null;

  if v_custody > 0 then
    if not coalesce(p_custody_override, false) then
      raise exception 'STAFF_SERVICE_CLEARANCE_ACTIVE_CUSTODY' using errcode = '42501';
    end if;
    if nullif(btrim(p_override_reason), '') is null then
      raise exception 'STAFF_SERVICE_CLEARANCE_OVERRIDE_REASON_REQUIRED' using errcode = '22023';
    end if;
    -- Overriding an active custody blocker is an administrator-only act.
    if not public.staff_service_is_admin(v_user) then
      raise exception 'STAFF_SERVICE_CLEARANCE_OVERRIDE_DENIED' using errcode = '42501';
    end if;
  end if;

  update public.staff_clearance_cases
  set status = 'completed',
      completed_at = now(),
      completed_by = v_user,
      custody_override = (v_custody > 0),
      custody_override_reason = case when v_custody > 0 then btrim(p_override_reason) end,
      custody_override_by = case when v_custody > 0 then v_user end,
      custody_override_at = case when v_custody > 0 then now() end
  where id = v_case.id and status = 'in_progress'
  returning * into v_case;

  if not found then
    raise exception 'STAFF_SERVICE_CLEARANCE_STATE_CONFLICT' using errcode = '40001';
  end if;

  if v_custody > 0 then
    insert into public.staff_value_added_audit_events (
      actor_user_id, module, subject_id, event_type, reason, metadata
    ) values (
      v_user, 'clearance', v_case.id, 'clearance_custody_override',
      btrim(p_override_reason),
      jsonb_build_object('active_custody_count', v_custody)
    );
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'clearance', v_case.id, 'clearance_completed',
    jsonb_build_object('custody_override', v_custody > 0)
  );

  return v_case;
end;
$$;

-- --------------------------------------------------------------------------
-- Value-added capability probe (boolean-only, extends the 02D contract)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_get_value_added_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_base jsonb := public.staff_service_get_current_capabilities();
begin
  return v_base || jsonb_build_object(
    'can_issue_documents',
    coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_manage_evaluations',
    coalesce((v_base ->> 'is_direct_manager')::boolean, false)
      or coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_view_financial_impact',
    coalesce((v_base ->> 'is_finance')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_decide_clearance',
    coalesce((v_base ->> 'is_direct_manager')::boolean, false)
      or coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_finance')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    -- Finance is deliberately excluded from every non-financial queue below.
    'can_view_overtime_queue',
    coalesce((v_base ->> 'is_direct_manager')::boolean, false)
      or coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_view_clearance_cases',
    coalesce((v_base ->> 'is_direct_manager')::boolean, false)
      or coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_manage_clearance_cases',
    coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_manage_promotions',
    coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_manage_training',
    coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false),
    'can_view_attendance_reports',
    coalesce((v_base ->> 'is_direct_manager')::boolean, false)
      or coalesce((v_base ->> 'is_hr')::boolean, false)
      or coalesce((v_base ->> 'is_administrator')::boolean, false)
  );
end;
$$;


-- --------------------------------------------------------------------------
-- Finance narrow projections
--
-- Finance has NO row access to the operational base tables (claims, clearance
-- cases/checkpoints, promotion cases). It reads money through these SECURITY
-- DEFINER projections only: no free-text reason, no decision note, no
-- attachment, no profile/contact/payroll identity ever crosses the boundary.
-- --------------------------------------------------------------------------

create or replace function public.staff_service_list_overtime_financial_projection()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'finance', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_FINANCIAL_SCOPE_DENIED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item order by item ->> 'claim_no')
    from (
      select jsonb_build_object(
        'claim_id', c.id,
        'claim_no', c.claim_no,
        'claim_kind', c.claim_kind,
        'financial_status', case
          when c.status = 'hr_approved' then 'approved_for_settlement'
          else 'not_settleable'
        end,
        'approved_total_hours', case when c.status = 'hr_approved' then c.total_hours end,
        'currency_code', f.currency_code,
        'hourly_rate', f.hourly_rate,
        'gross_amount', f.gross_amount,
        'settled_at', f.settled_at
      ) as item
      from public.staff_overtime_financial_impact f
      join public.staff_overtime_claims c on c.id = f.claim_id
    ) src
  ), '[]'::jsonb);
end;
$$;

create or replace function public.staff_service_list_promotion_financial_projection()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'finance', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_FINANCIAL_SCOPE_DENIED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item order by item ->> 'case_no')
    from (
      select jsonb_build_object(
        'case_id', p.id,
        'case_no', p.case_no,
        'case_kind', p.case_kind,
        'financial_status', case
          when p.status in ('approved', 'implemented') then 'approved_for_settlement'
          else 'not_settleable'
        end,
        'effective_on', p.effective_on,
        'currency_code', f.currency_code,
        'current_basic', f.current_basic,
        'proposed_basic', f.proposed_basic,
        'retroactive_amount', f.retroactive_amount
      ) as item
      from public.staff_promotion_financial_impact f
      join public.staff_promotion_cases p on p.id = f.case_id
    ) src
  ), '[]'::jsonb);
end;
$$;

-- Checkpoint-owner projection: every decider (including Finance) sees only the
-- checkpoints it is itself required to decide, plus the minimum case context.
-- HR reasons, custody override reason and unrelated checkpoints never appear.
create or replace function public.staff_service_list_assigned_clearance_checkpoints()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item order by item ->> 'case_no', item ->> 'checkpoint_kind')
    from (
      select jsonb_build_object(
        'checkpoint_id', cp.id,
        'case_id', c.id,
        'case_no', c.case_no,
        'checkpoint_kind', cp.checkpoint_kind,
        'checkpoint_status', cp.status,
        'case_status', c.status,
        'opened_at', c.created_at
      ) as item
      from public.staff_clearance_checkpoints cp
      join public.staff_clearance_cases c on c.id = cp.case_id
      where c.status = 'in_progress'
        and not public.staff_service_owns_profile(v_user, c.staff_profile_id)
        and public.staff_service_has_role(v_user, cp.required_role, c.department_id)
    ) src
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------------------------------------
-- Performance evaluation authoring (draft -> finalize)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_upsert_evaluation_draft(
  p_cycle_id uuid,
  p_staff_profile_id uuid,
  p_overall_rating numeric default null,
  p_rating_band text default null,
  p_goals text default null,
  p_strengths text default null,
  p_improvements text default null
)
returns public.staff_performance_evaluations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_performance_evaluations;
  v_cycle public.staff_performance_cycles;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_cycle from public.staff_performance_cycles where id = p_cycle_id;
  if not found or v_cycle.status <> 'open' then
    raise exception 'STAFF_SERVICE_EVALUATION_CYCLE_CLOSED' using errcode = '42501';
  end if;

  if public.staff_service_owns_profile(v_user, p_staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_EVALUATION_DENIED' using errcode = '42501';
  end if;

  if not (
    public.staff_service_manages_profile(v_user, p_staff_profile_id)
    or public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  if p_rating_band is not null and p_rating_band not in (
    'excellent', 'very_good', 'good', 'acceptable', 'weak'
  ) then
    raise exception 'STAFF_SERVICE_EVALUATION_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if p_overall_rating is not null and (p_overall_rating < 0 or p_overall_rating > 100) then
    raise exception 'STAFF_SERVICE_EVALUATION_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  select * into v_row
  from public.staff_performance_evaluations
  where cycle_id = p_cycle_id and staff_profile_id = p_staff_profile_id
  for update;

  if found and v_row.status = 'finalized' then
    raise exception 'STAFF_SERVICE_EVALUATION_ALREADY_FINALIZED' using errcode = '40001';
  end if;

  if found then
    update public.staff_performance_evaluations
    set overall_rating = p_overall_rating,
        rating_band = p_rating_band,
        goals = p_goals,
        strengths = p_strengths,
        improvements = p_improvements,
        evaluator_user_id = v_user
    where id = v_row.id and status = 'draft'
    returning * into v_row;
    if not found then
      raise exception 'STAFF_SERVICE_EVALUATION_STATE_CONFLICT' using errcode = '40001';
    end if;
  else
    insert into public.staff_performance_evaluations (
      cycle_id, staff_profile_id, evaluator_user_id,
      overall_rating, rating_band, goals, strengths, improvements
    ) values (
      p_cycle_id, p_staff_profile_id, v_user,
      p_overall_rating, p_rating_band, p_goals, p_strengths, p_improvements
    )
    returning * into v_row;
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'evaluation', v_row.id, 'evaluation_draft_saved', '{}'::jsonb
  );

  return v_row;
end;
$$;

-- --------------------------------------------------------------------------
-- Promotions / settlements authoring (HR / Administrator only)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_open_promotion_case(
  p_staff_profile_id uuid,
  p_case_kind text,
  p_current_grade text,
  p_proposed_grade text,
  p_notes text,
  p_idempotency_key uuid
)
returns public.staff_promotion_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_promotion_cases;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_case_kind not in ('promotion', 'settlement', 'grade_adjustment') then
    raise exception 'STAFF_SERVICE_PROMOTION_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;
  if public.staff_service_owns_profile(v_user, p_staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
    where sp.id = p_staff_profile_id and sp.status = 'active'
  ) then
    raise exception 'STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_row
  from public.staff_promotion_cases
  where staff_profile_id = p_staff_profile_id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  insert into public.staff_promotion_cases (
    case_no, staff_profile_id, case_kind, current_grade, proposed_grade,
    notes, opened_by, idempotency_key
  ) values (
    'PRM-' || to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_staff_profile_id, p_case_kind, p_current_grade, p_proposed_grade,
    nullif(btrim(coalesce(p_notes, '')), ''), v_user, p_idempotency_key
  )
  returning * into v_row;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'promotion', v_row.id, 'promotion_case_opened',
    jsonb_build_object('case_kind', v_row.case_kind, 'status', v_row.status)
  );

  return v_row;
end;
$$;

create or replace function public.staff_service_update_promotion_case(
  p_case_id uuid,
  p_status text,
  p_proposed_grade text default null,
  p_effective_on date default null,
  p_notes text default null
)
returns public.staff_promotion_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_promotion_cases;
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  select * into v_row from public.staff_promotion_cases where id = p_case_id for update;
  if not found then
    raise exception 'STAFF_SERVICE_PROMOTION_NOT_FOUND' using errcode = '42501';
  end if;
  if public.staff_service_owns_profile(v_user, v_row.staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  v_allowed := case v_row.status
    when 'under_study' then p_status in ('hr_review', 'rejected')
    when 'hr_review' then p_status in ('approved', 'rejected')
    when 'approved' then p_status = 'implemented'
    else false
  end;
  if not v_allowed then
    raise exception 'STAFF_SERVICE_PROMOTION_TRANSITION_DENIED' using errcode = '40001';
  end if;
  if p_status = 'implemented' and coalesce(p_effective_on, v_row.effective_on) is null then
    raise exception 'STAFF_SERVICE_PROMOTION_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  update public.staff_promotion_cases
  set status = p_status,
      proposed_grade = coalesce(p_proposed_grade, proposed_grade),
      effective_on = coalesce(p_effective_on, effective_on),
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
  where id = v_row.id and status = v_row.status
  returning * into v_row;
  if not found then
    raise exception 'STAFF_SERVICE_PROMOTION_STATE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'promotion', v_row.id, 'promotion_case_updated',
    jsonb_build_object('status', v_row.status)
  );

  return v_row;
end;
$$;

-- --------------------------------------------------------------------------
-- Clearance case opening (atomic: case + the five required checkpoints)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_open_clearance_case(
  p_staff_profile_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns public.staff_clearance_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.staff_clearance_cases;
  v_department uuid;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'STAFF_SERVICE_CLEARANCE_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;
  if public.staff_service_owns_profile(v_user, p_staff_profile_id) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  select department_id into v_department
  from public.staff_profiles
  where id = p_staff_profile_id and status = 'active';
  if not found then
    raise exception 'STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_row
  from public.staff_clearance_cases
  where staff_profile_id = p_staff_profile_id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  if exists (
    select 1 from public.staff_clearance_cases
    where staff_profile_id = p_staff_profile_id and status = 'in_progress'
  ) then
    raise exception 'STAFF_SERVICE_CLEARANCE_CASE_ALREADY_OPEN' using errcode = '40001';
  end if;

  insert into public.staff_clearance_cases (
    case_no, staff_profile_id, department_id, reason, opened_by, idempotency_key
  ) values (
    'CLR-' || to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_staff_profile_id, v_department, btrim(p_reason), v_user, p_idempotency_key
  )
  returning * into v_row;

  insert into public.staff_clearance_checkpoints (case_id, checkpoint_kind, required_role)
  values
    (v_row.id, 'direct_manager', 'direct_manager'),
    (v_row.id, 'hr', 'hr'),
    (v_row.id, 'finance', 'finance'),
    (v_row.id, 'it_custody', 'administrator'),
    (v_row.id, 'administration', 'administrator');

  insert into public.staff_value_added_audit_events (
    actor_user_id, module, subject_id, event_type, metadata
  ) values (
    v_user, 'clearance', v_row.id, 'clearance_case_opened',
    jsonb_build_object('checkpoints', 5)
  );

  return v_row;
end;
$$;

-- --------------------------------------------------------------------------
-- Attendance oversight reporting (manager scope / HR / Administrator)
-- --------------------------------------------------------------------------

create or replace function public.staff_service_list_attendance_month_report(
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_from date;
  v_to date;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_year is null or p_month is null
     or p_year not between 2000 and 2200 or p_month not between 1 and 12 then
    raise exception 'STAFF_SERVICE_ATTENDANCE_RANGE_INVALID' using errcode = '22023';
  end if;
  if not (
    public.staff_service_has_role(v_user, 'direct_manager', null)
    or public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
    or exists (
      select 1 from public.staff_service_role_assignments a
      where a.user_id = v_user and a.role = 'direct_manager' and a.active
    )
  ) then
    raise exception 'STAFF_SERVICE_REPORT_SCOPE_DENIED' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to := (v_from + interval '1 month')::date;

  return coalesce((
    select jsonb_agg(item order by item ->> 'full_name_ar')
    from (
      select jsonb_build_object(
        'staff_profile_id', sp.id,
        'full_name_ar', sp.full_name_ar,
        'present_days', count(*) filter (where d.day_state = 'present'),
        'absent_days', count(*) filter (where d.day_state = 'absent'),
        'late_days', count(*) filter (where d.day_state = 'late'),
        'leave_days', count(*) filter (where d.day_state = 'leave'),
        'worked_hours', round(coalesce(sum(d.worked_minutes), 0) / 60.0, 2)
      ) as item
      from public.staff_attendance_days d
      join public.staff_profiles sp on sp.id = d.staff_profile_id
      where d.attendance_date >= v_from
        and d.attendance_date < v_to
        and (
          public.staff_service_has_role(v_user, 'hr', null)
          or public.staff_service_is_admin(v_user)
          or public.staff_service_manages_profile(v_user, sp.id)
        )
      group by sp.id, sp.full_name_ar
    ) src
  ), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- 9) RLS
-- ===========================================================================

alter table public.staff_document_verification_probe_stats enable row level security;
alter table public.staff_value_added_audit_events enable row level security;
alter table public.staff_issued_documents enable row level security;
alter table public.staff_performance_cycles enable row level security;
alter table public.staff_performance_evaluations enable row level security;
alter table public.staff_attendance_days enable row level security;
alter table public.staff_overtime_claims enable row level security;
alter table public.staff_overtime_financial_impact enable row level security;
alter table public.staff_training_courses enable row level security;
alter table public.staff_training_enrollments enable row level security;
alter table public.staff_promotion_cases enable row level security;
alter table public.staff_promotion_financial_impact enable row level security;
alter table public.staff_clearance_cases enable row level security;
alter table public.staff_clearance_checkpoints enable row level security;

create policy staff_value_added_audit_scoped_read
  on public.staff_value_added_audit_events for select to authenticated
  using (
    actor_user_id = auth.uid()
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_issued_documents_owner_or_hr_read
  on public.staff_issued_documents for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_performance_cycles_read
  on public.staff_performance_cycles for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.status = 'active'
    )
  );

-- The employee sees only their own FINALIZED evaluation; the manager sees only
-- scoped direct reports; HR/Administrator have oversight.
create policy staff_performance_evaluations_scoped_read
  on public.staff_performance_evaluations for select to authenticated
  using (
    (
      status = 'finalized'
      and public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    )
    or public.staff_service_manages_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_attendance_days_scoped_read
  on public.staff_attendance_days for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_manages_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

-- Finance is intentionally ABSENT here: the base claim row carries reason,
-- manager_reason, hr_reason, staff_profile_id and workflow state, none of which
-- Finance may see. Finance reads
-- public.staff_service_list_overtime_financial_projection() instead.
create policy staff_overtime_claims_scoped_read
  on public.staff_overtime_claims for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_manages_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

-- Bounded verification counters: oversight roles only, never anon.
create policy staff_document_verification_probe_stats_read
  on public.staff_document_verification_probe_stats for select to authenticated
  using (
    public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

-- Finance least privilege: the money columns are a separate table that only
-- Finance/Administrator may read at all.
create policy staff_overtime_financial_impact_finance_read
  on public.staff_overtime_financial_impact for select to authenticated
  using (
    public.staff_service_has_role(auth.uid(), 'finance', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_training_courses_read
  on public.staff_training_courses for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.status = 'active'
    )
  );

create policy staff_training_enrollments_scoped_read
  on public.staff_training_enrollments for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_manages_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_promotion_cases_scoped_read
  on public.staff_promotion_cases for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_promotion_financial_impact_finance_read
  on public.staff_promotion_financial_impact for select to authenticated
  using (
    public.staff_service_has_role(auth.uid(), 'finance', null)
    or public.staff_service_is_admin(auth.uid())
  );

-- Finance is intentionally ABSENT from the clearance base tables: it may not
-- read the case reason, custody override reason or unrelated checkpoints. It
-- decides its own checkpoint through
-- public.staff_service_list_assigned_clearance_checkpoints().
create policy staff_clearance_cases_scoped_read
  on public.staff_clearance_cases for select to authenticated
  using (
    public.staff_service_owns_profile(auth.uid(), staff_profile_id)
    or public.staff_service_manages_profile(auth.uid(), staff_profile_id)
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_clearance_checkpoints_scoped_read
  on public.staff_clearance_checkpoints for select to authenticated
  using (
    exists (
      select 1 from public.staff_clearance_cases c
      where c.id = case_id
        and (
          public.staff_service_owns_profile(auth.uid(), c.staff_profile_id)
          or public.staff_service_manages_profile(auth.uid(), c.staff_profile_id)
          or public.staff_service_has_role(auth.uid(), 'hr', null)
          or public.staff_service_is_admin(auth.uid())
        )
    )
  );

-- ===========================================================================
-- 10) Privileges — RPCs are authoritative; clients never mutate directly.
-- ===========================================================================

revoke all on table public.staff_document_verification_probe_stats from public, anon, authenticated;
revoke all on table public.staff_value_added_audit_events from public, anon, authenticated;
revoke all on table public.staff_issued_documents from public, anon, authenticated;
revoke all on table public.staff_performance_cycles from public, anon, authenticated;
revoke all on table public.staff_performance_evaluations from public, anon, authenticated;
revoke all on table public.staff_attendance_days from public, anon, authenticated;
revoke all on table public.staff_overtime_claims from public, anon, authenticated;
revoke all on table public.staff_overtime_financial_impact from public, anon, authenticated;
revoke all on table public.staff_training_courses from public, anon, authenticated;
revoke all on table public.staff_training_enrollments from public, anon, authenticated;
revoke all on table public.staff_promotion_cases from public, anon, authenticated;
revoke all on table public.staff_promotion_financial_impact from public, anon, authenticated;
revoke all on table public.staff_clearance_cases from public, anon, authenticated;
revoke all on table public.staff_clearance_checkpoints from public, anon, authenticated;

grant select on table public.staff_document_verification_probe_stats to authenticated;
grant select on table public.staff_value_added_audit_events to authenticated;
grant select on table public.staff_issued_documents to authenticated;
grant select on table public.staff_performance_cycles to authenticated;
grant select on table public.staff_performance_evaluations to authenticated;
grant select on table public.staff_attendance_days to authenticated;
grant select on table public.staff_overtime_claims to authenticated;
grant select on table public.staff_overtime_financial_impact to authenticated;
grant select on table public.staff_training_courses to authenticated;
grant select on table public.staff_training_enrollments to authenticated;
grant select on table public.staff_promotion_cases to authenticated;
grant select on table public.staff_promotion_financial_impact to authenticated;
grant select on table public.staff_clearance_cases to authenticated;
grant select on table public.staff_clearance_checkpoints to authenticated;

grant all on table public.staff_document_verification_probe_stats to service_role;
grant all on table public.staff_value_added_audit_events to service_role;
grant all on table public.staff_issued_documents to service_role;
grant all on table public.staff_performance_cycles to service_role;
grant all on table public.staff_performance_evaluations to service_role;
grant all on table public.staff_attendance_days to service_role;
grant all on table public.staff_overtime_claims to service_role;
grant all on table public.staff_overtime_financial_impact to service_role;
grant all on table public.staff_training_courses to service_role;
grant all on table public.staff_training_enrollments to service_role;
grant all on table public.staff_promotion_cases to service_role;
grant all on table public.staff_promotion_financial_impact to service_role;
grant all on table public.staff_clearance_cases to service_role;
grant all on table public.staff_clearance_checkpoints to service_role;

revoke all on function public.staff_service_manages_profile(uuid, uuid) from public, anon;
revoke all on function public.staff_service_owns_profile(uuid, uuid) from public, anon;
revoke all on function public.staff_service_request_employment_statement(text, text, text, text, text, uuid) from public, anon;
revoke all on function public.staff_service_issue_document(uuid, integer) from public, anon;
revoke all on function public.staff_service_revoke_issued_document(uuid, text) from public, anon;
revoke all on function public.staff_service_verify_issued_document(text) from public;
revoke all on function public.staff_service_finalize_evaluation(uuid) from public, anon;
revoke all on function public.staff_service_acknowledge_evaluation(uuid, text) from public, anon;
revoke all on function public.staff_service_get_attendance_summary(uuid, integer, integer) from public, anon;
revoke all on function public.staff_service_submit_overtime_claim(text, date, date, numeric, text, uuid) from public, anon;
revoke all on function public.staff_service_decide_overtime_claim(uuid, text, text) from public, anon;
revoke all on function public.staff_service_request_training_enrollment(uuid) from public, anon;
revoke all on function public.staff_service_decide_training_enrollment(uuid, text, text) from public, anon;
revoke all on function public.staff_service_complete_training_enrollment(uuid, text, text) from public, anon;
revoke all on function public.staff_service_decide_clearance_checkpoint(uuid, text, text) from public, anon;
revoke all on function public.staff_service_complete_clearance_case(uuid, boolean, text) from public, anon;
revoke all on function public.staff_service_list_overtime_financial_projection() from public, anon;
revoke all on function public.staff_service_list_promotion_financial_projection() from public, anon;
revoke all on function public.staff_service_list_assigned_clearance_checkpoints() from public, anon;
revoke all on function public.staff_service_upsert_evaluation_draft(uuid, uuid, numeric, text, text, text, text) from public, anon;
revoke all on function public.staff_service_open_promotion_case(uuid, text, text, text, text, uuid) from public, anon;
revoke all on function public.staff_service_update_promotion_case(uuid, text, text, date, text) from public, anon;
revoke all on function public.staff_service_open_clearance_case(uuid, text, uuid) from public, anon;
revoke all on function public.staff_service_list_attendance_month_report(integer, integer) from public, anon;
revoke all on function public.staff_service_get_value_added_capabilities() from public, anon;

grant execute on function public.staff_service_manages_profile(uuid, uuid) to authenticated;
grant execute on function public.staff_service_owns_profile(uuid, uuid) to authenticated;
grant execute on function public.staff_service_request_employment_statement(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.staff_service_issue_document(uuid, integer) to authenticated;
grant execute on function public.staff_service_revoke_issued_document(uuid, text) to authenticated;
grant execute on function public.staff_service_finalize_evaluation(uuid) to authenticated;
grant execute on function public.staff_service_acknowledge_evaluation(uuid, text) to authenticated;
grant execute on function public.staff_service_get_attendance_summary(uuid, integer, integer) to authenticated;
grant execute on function public.staff_service_submit_overtime_claim(text, date, date, numeric, text, uuid) to authenticated;
grant execute on function public.staff_service_decide_overtime_claim(uuid, text, text) to authenticated;
grant execute on function public.staff_service_request_training_enrollment(uuid) to authenticated;
grant execute on function public.staff_service_decide_training_enrollment(uuid, text, text) to authenticated;
grant execute on function public.staff_service_complete_training_enrollment(uuid, text, text) to authenticated;
grant execute on function public.staff_service_decide_clearance_checkpoint(uuid, text, text) to authenticated;
grant execute on function public.staff_service_complete_clearance_case(uuid, boolean, text) to authenticated;
grant execute on function public.staff_service_list_overtime_financial_projection() to authenticated;
grant execute on function public.staff_service_list_promotion_financial_projection() to authenticated;
grant execute on function public.staff_service_list_assigned_clearance_checkpoints() to authenticated;
grant execute on function public.staff_service_upsert_evaluation_draft(uuid, uuid, numeric, text, text, text, text) to authenticated;
grant execute on function public.staff_service_open_promotion_case(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.staff_service_update_promotion_case(uuid, text, text, date, text) to authenticated;
grant execute on function public.staff_service_open_clearance_case(uuid, text, uuid) to authenticated;
grant execute on function public.staff_service_list_attendance_month_report(integer, integer) to authenticated;
grant execute on function public.staff_service_get_value_added_capabilities() to authenticated;

-- Public authenticity check: intentionally reachable by anon, and intentionally
-- the ONLY 02E surface that is. It exposes no private, payroll or contact data.
grant execute on function public.staff_service_verify_issued_document(text) to anon, authenticated;

comment on function public.staff_service_verify_issued_document(text) is
  'Opaque-token authenticity check for issued documents. Digest-at-rest, minimal public metadata, audits the attempt without storing the raw token.';
comment on table public.staff_value_added_audit_events is
  'Append-only 02E audit ledger; UPDATE and DELETE are rejected by triggers.';
comment on table public.staff_overtime_financial_impact is
  'Finance-only monetary projection for overtime/assignment claims (least privilege boundary).';
comment on table public.staff_document_verification_probe_stats is
  'Bounded hourly counters for public verification attempts; contains audit amplification without storing token material.';
comment on function public.staff_service_list_overtime_financial_projection() is
  'Finance-safe overtime projection: money only, no reasons, notes, attachments or holder identity.';
comment on function public.staff_service_list_assigned_clearance_checkpoints() is
  'Checkpoint-owner projection: only the checkpoints the caller must decide, with minimal case context.';
comment on table public.staff_promotion_financial_impact is
  'Finance-only monetary projection for promotion/settlement cases (least privilege boundary).';

commit;
