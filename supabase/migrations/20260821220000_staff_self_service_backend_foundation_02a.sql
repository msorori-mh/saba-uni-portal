-- PORTAL_STAFF_SELF_SERVICE_BACKEND_FOUNDATION_02A
-- Source migration only. Do not apply to production without a separate preflight/apply gate.

begin;

create sequence public.staff_service_request_number_seq;

create table public.staff_service_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('direct_manager', 'hr', 'finance', 'administrator')),
  department_id uuid references public.departments(id) on delete cascade,
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_until date,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index staff_service_role_assignment_active_uq
  on public.staff_service_role_assignments (
    user_id,
    role,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where active;

create index staff_service_role_assignment_scope_idx
  on public.staff_service_role_assignments (role, department_id)
  where active;

create table public.staff_service_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  service_type text not null check (service_type in (
    'leave',
    'permission',
    'custody_transfer',
    'custody_return',
    'employment_certificate',
    'experience_certificate',
    'overtime',
    'training',
    'promotion_adjustment',
    'clearance'
  )),
  status text not null default 'submitted' check (status in (
    'draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled'
  )),
  current_step integer not null default 1 check (current_step > 0),
  payload jsonb not null default '{}'::jsonb,
  decision_reason text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, idempotency_key),
  check (jsonb_typeof(payload) = 'object'),
  check (octet_length(payload::text) <= 32768),
  check ((status in ('approved', 'rejected')) = (decided_at is not null))
);

create index staff_service_requests_owner_idx
  on public.staff_service_requests (staff_profile_id, submitted_at desc);

create index staff_service_requests_queue_idx
  on public.staff_service_requests (department_id, status, current_step, submitted_at);

create table public.staff_service_approval_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.staff_service_requests(id) on delete restrict,
  step_order integer not null check (step_order > 0),
  required_role text not null check (required_role in (
    'direct_manager', 'hr', 'finance', 'administrator'
  )),
  assignee_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'skipped'
  )),
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, step_order),
  check ((status in ('approved', 'rejected', 'skipped')) = (decided_at is not null)),
  check (status <> 'rejected' or nullif(btrim(decision_reason), '') is not null)
);

create index staff_service_approval_pending_idx
  on public.staff_service_approval_steps (required_role, status, request_id)
  where status = 'pending';

create table public.staff_service_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.staff_service_requests(id) on delete restrict,
  storage_bucket text not null default 'staff-service-private'
    check (storage_bucket = 'staff-service-private'),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  scan_state text not null default 'pending' check (scan_state in (
    'pending', 'clean', 'infected', 'failed'
  )),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index staff_service_attachments_request_idx
  on public.staff_service_attachments (request_id, created_at);

create table public.staff_service_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.staff_service_requests(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (request_id, event_type, correlation_id),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 16384)
);

create index staff_service_events_timeline_idx
  on public.staff_service_events (request_id, occurred_at, id);

create table public.staff_leave_balances (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  leave_type text not null check (leave_type in (
    'annual', 'sick', 'emergency', 'unpaid', 'other'
  )),
  balance_year integer not null check (balance_year between 2000 and 2200),
  entitled_days numeric(7,2) not null default 0 check (entitled_days >= 0),
  carried_days numeric(7,2) not null default 0 check (carried_days >= 0),
  consumed_days numeric(7,2) not null default 0 check (consumed_days >= 0),
  reserved_days numeric(7,2) not null default 0 check (reserved_days >= 0),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, leave_type, balance_year),
  check (consumed_days + reserved_days <= entitled_days + carried_days)
);

create table public.staff_payroll_statements (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  currency_code text not null default 'YER' check (currency_code = 'YER'),
  basic_salary numeric(16,2) not null check (basic_salary >= 0),
  allowances_total numeric(16,2) not null default 0 check (allowances_total >= 0),
  deductions_total numeric(16,2) not null default 0 check (deductions_total >= 0),
  net_amount numeric(16,2) generated always as
    (basic_salary + allowances_total - deductions_total) stored,
  source_system text not null,
  source_reference text not null,
  pdf_object_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, period_start, period_end),
  check (period_end >= period_start),
  check (basic_salary + allowances_total >= deductions_total)
);

create table public.staff_payroll_components (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.staff_payroll_statements(id) on delete restrict,
  component_type text not null check (component_type in ('allowance', 'deduction')),
  component_code text not null,
  label_ar text not null,
  amount numeric(16,2) not null check (amount >= 0),
  display_order integer not null default 0,
  unique (statement_id, component_type, component_code)
);

create table public.staff_career_history (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'appointment', 'grade_change', 'title_change', 'promotion', 'adjustment', 'transfer'
  )),
  effective_on date not null,
  grade text,
  job_title text,
  decision_reference text,
  notes text,
  source_system text,
  created_at timestamptz not null default now()
);

create index staff_career_history_owner_idx
  on public.staff_career_history (staff_profile_id, effective_on desc);

create table public.staff_correspondence (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  title text not null,
  body text not null,
  sender_department_id uuid references public.departments(id) on delete restrict,
  importance text not null default 'normal' check (importance in (
    'normal', 'important', 'urgent'
  )),
  archive_category text not null,
  attachment_object_path text,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.staff_correspondence_recipients (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.staff_correspondence(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  received_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (correspondence_id, recipient_user_id),
  check (acknowledged_at is null or read_at is not null)
);

create table public.staff_custody_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  asset_name text not null,
  asset_tag text not null unique,
  serial_number text,
  condition text not null default 'good' check (condition in (
    'new', 'good', 'needs_maintenance', 'damaged', 'returned'
  )),
  delivered_on date not null,
  returned_on date,
  source_system text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (returned_on is null or returned_on >= delivered_on)
);

create index staff_custody_assignments_owner_idx
  on public.staff_custody_assignments (staff_profile_id, returned_on);

create table public.staff_service_notifications_outbox (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid references public.staff_service_requests(id) on delete restrict,
  channel text not null check (channel in ('in_app', 'email', 'mobile')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'sent', 'failed', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, channel, template_key, idempotency_key),
  check (jsonb_typeof(payload) = 'object')
);

create or replace function public.staff_service_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_service_role_assignments_touch
  before update on public.staff_service_role_assignments
  for each row execute function public.staff_service_touch_updated_at();

create trigger staff_service_requests_touch
  before update on public.staff_service_requests
  for each row execute function public.staff_service_touch_updated_at();

create trigger staff_payroll_statements_touch
  before update on public.staff_payroll_statements
  for each row execute function public.staff_service_touch_updated_at();

create trigger staff_custody_assignments_touch
  before update on public.staff_custody_assignments
  for each row execute function public.staff_service_touch_updated_at();

create or replace function public.staff_service_is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.has_any_role(_user_id, array['admin', 'system_admin']),
    false
  ) or exists (
    select 1
    from public.staff_service_role_assignments a
    where a.user_id = _user_id
      and a.role = 'administrator'
      and a.active
      and a.valid_from <= current_date
      and (a.valid_until is null or a.valid_until >= current_date)
  );
$$;

create or replace function public.staff_service_has_role(
  _user_id uuid,
  _role text,
  _department_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when _user_id is null then false
    when public.staff_service_is_admin(_user_id) then true
    when _role = 'employee' then exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = _user_id and sp.status = 'active'
    )
    else exists (
      select 1
      from public.staff_service_role_assignments a
      where a.user_id = _user_id
        and a.role = _role
        and a.active
        and a.valid_from <= current_date
        and (a.valid_until is null or a.valid_until >= current_date)
        and (a.department_id is null or a.department_id = _department_id)
    )
  end;
$$;

create or replace function public.staff_service_can_access_request(
  _user_id uuid,
  _request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_service_requests r
    join public.staff_profiles sp on sp.id = r.staff_profile_id
    where r.id = _request_id
      and (
        sp.user_id = _user_id
        or public.staff_service_is_admin(_user_id)
        or exists (
          select 1
          from public.staff_service_approval_steps s
          where s.request_id = r.id
            and public.staff_service_has_role(_user_id, s.required_role, r.department_id)
        )
      )
  );
$$;

create or replace function public.staff_service_reject_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'STAFF_SERVICE_AUDIT_IMMUTABLE'
    using errcode = '42501';
end;
$$;

create trigger staff_service_events_immutable_update
  before update on public.staff_service_events
  for each row execute function public.staff_service_reject_event_mutation();

create trigger staff_service_events_immutable_delete
  before delete on public.staff_service_events
  for each row execute function public.staff_service_reject_event_mutation();

create or replace function public.staff_service_submit_request(
  p_service_type text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns public.staff_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.staff_profiles%rowtype;
  v_request public.staff_service_requests%rowtype;
  v_roles text[];
  v_role text;
  v_step integer := 0;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 32768 then
    raise exception 'STAFF_SERVICE_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  select * into v_profile
  from public.staff_profiles
  where user_id = auth.uid() and status = 'active';

  if not found then
    raise exception 'STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_request
  from public.staff_service_requests
  where staff_profile_id = v_profile.id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_request.service_type <> p_service_type or v_request.payload <> p_payload then
      raise exception 'STAFF_SERVICE_IDEMPOTENT_REPLAY_MISMATCH' using errcode = '23505';
    end if;
    return v_request;
  end if;

  v_roles := case p_service_type
    when 'leave' then array['direct_manager', 'hr']
    when 'permission' then array['direct_manager', 'hr']
    when 'custody_transfer' then array['direct_manager', 'hr']
    when 'custody_return' then array['direct_manager', 'hr']
    when 'employment_certificate' then array['hr']
    when 'experience_certificate' then array['hr']
    when 'overtime' then array['direct_manager', 'hr', 'finance']
    when 'training' then array['direct_manager', 'hr']
    when 'promotion_adjustment' then array['direct_manager', 'hr']
    when 'clearance' then array['direct_manager', 'hr', 'finance', 'administrator']
    else null
  end;

  if v_roles is null then
    raise exception 'STAFF_SERVICE_TYPE_INVALID' using errcode = '22023';
  end if;

  insert into public.staff_service_requests (
    request_no,
    staff_profile_id,
    department_id,
    service_type,
    status,
    current_step,
    payload,
    idempotency_key
  ) values (
    'SSR-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
      lpad(nextval('public.staff_service_request_number_seq')::text, 6, '0'),
    v_profile.id,
    v_profile.department_id,
    p_service_type,
    'submitted',
    1,
    p_payload,
    p_idempotency_key
  ) returning * into v_request;

  foreach v_role in array v_roles loop
    v_step := v_step + 1;
    insert into public.staff_service_approval_steps (
      request_id, step_order, required_role
    ) values (
      v_request.id, v_step, v_role
    );
  end loop;

  insert into public.staff_service_events (
    request_id,
    event_type,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    metadata,
    correlation_id
  ) values (
    v_request.id,
    'request_submitted',
    auth.uid(),
    'employee',
    null,
    'submitted',
    jsonb_build_object('service_type', p_service_type),
    p_idempotency_key
  );

  insert into public.staff_service_notifications_outbox (
    recipient_user_id,
    request_id,
    channel,
    template_key,
    payload,
    idempotency_key
  ) values (
    auth.uid(),
    v_request.id,
    'in_app',
    'staff_request_submitted',
    jsonb_build_object('request_no', v_request.request_no),
    p_idempotency_key
  );

  return v_request;
end;
$$;

create or replace function public.staff_service_decide_request(
  p_request_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key uuid
)
returns public.staff_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.staff_service_requests%rowtype;
  v_step public.staff_service_approval_steps%rowtype;
  v_owner_user_id uuid;
  v_next_step integer;
  v_actor_role text;
  v_target_status text;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'STAFF_SERVICE_DECISION_INVALID' using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  if p_decision = 'rejected' and nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_SERVICE_REJECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select r.*
    into v_request
  from public.staff_service_requests r
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'STAFF_SERVICE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select sp.user_id into v_owner_user_id
  from public.staff_profiles sp
  where sp.id = v_request.staff_profile_id;

  if exists (
    select 1 from public.staff_service_events e
    where e.request_id = p_request_id
      and e.event_type = 'approval_decided'
      and e.correlation_id = p_idempotency_key
  ) then
    return v_request;
  end if;

  if v_request.status not in ('submitted', 'in_review') then
    raise exception 'STAFF_SERVICE_REQUEST_NOT_ACTIONABLE' using errcode = '55000';
  end if;

  select * into v_step
  from public.staff_service_approval_steps
  where request_id = p_request_id
    and step_order = v_request.current_step
  for update;

  if not found or v_step.status <> 'pending' then
    raise exception 'STAFF_SERVICE_PENDING_STEP_NOT_FOUND' using errcode = '55000';
  end if;

  v_actor_role := v_step.required_role;

  if not public.staff_service_has_role(
    auth.uid(),
    v_step.required_role,
    v_request.department_id
  ) then
    raise exception 'STAFF_SERVICE_APPROVER_SCOPE_DENIED' using errcode = '42501';
  end if;

  if auth.uid() = v_owner_user_id and not public.staff_service_is_admin(auth.uid()) then
    raise exception 'STAFF_SERVICE_SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;

  update public.staff_service_approval_steps
  set status = p_decision,
      decided_by = auth.uid(),
      decision_reason = nullif(btrim(p_reason), ''),
      decided_at = clock_timestamp()
  where id = v_step.id;

  if p_decision = 'rejected' then
    v_target_status := 'rejected';
    update public.staff_service_requests
    set status = 'rejected',
        decision_reason = btrim(p_reason),
        decided_at = clock_timestamp()
    where id = p_request_id
    returning * into v_request;
  else
    select min(step_order) into v_next_step
    from public.staff_service_approval_steps
    where request_id = p_request_id
      and step_order > v_request.current_step
      and status = 'pending';

    if v_next_step is null then
      v_target_status := 'approved';
      update public.staff_service_requests
      set status = 'approved',
          decision_reason = nullif(btrim(p_reason), ''),
          decided_at = clock_timestamp()
      where id = p_request_id
      returning * into v_request;
    else
      v_target_status := 'in_review';
      update public.staff_service_requests
      set status = 'in_review',
          current_step = v_next_step
      where id = p_request_id
      returning * into v_request;
    end if;
  end if;

  insert into public.staff_service_events (
    request_id,
    event_type,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    reason,
    metadata,
    correlation_id
  ) values (
    p_request_id,
    'approval_decided',
    auth.uid(),
    v_actor_role,
    v_step.status,
    p_decision,
    nullif(btrim(p_reason), ''),
    jsonb_build_object(
      'step_order', v_step.step_order,
      'request_status', v_target_status
    ),
    p_idempotency_key
  );

  insert into public.staff_service_notifications_outbox (
    recipient_user_id,
    request_id,
    channel,
    template_key,
    payload,
    idempotency_key
  ) values (
    v_owner_user_id,
    p_request_id,
    'in_app',
    case when p_decision = 'approved'
      then 'staff_request_step_approved'
      else 'staff_request_rejected'
    end,
    jsonb_build_object(
      'request_no', v_request.request_no,
      'request_status', v_request.status,
      'reason', nullif(btrim(p_reason), '')
    ),
    p_idempotency_key
  );

  return v_request;
end;
$$;

alter table public.staff_service_role_assignments enable row level security;
alter table public.staff_service_requests enable row level security;
alter table public.staff_service_approval_steps enable row level security;
alter table public.staff_service_attachments enable row level security;
alter table public.staff_service_events enable row level security;
alter table public.staff_leave_balances enable row level security;
alter table public.staff_payroll_statements enable row level security;
alter table public.staff_payroll_components enable row level security;
alter table public.staff_career_history enable row level security;
alter table public.staff_correspondence enable row level security;
alter table public.staff_correspondence_recipients enable row level security;
alter table public.staff_custody_assignments enable row level security;
alter table public.staff_service_notifications_outbox enable row level security;

create policy staff_service_role_assignments_admin_read
  on public.staff_service_role_assignments for select to authenticated
  using (public.staff_service_is_admin(auth.uid()));

create policy staff_service_requests_authorized_read
  on public.staff_service_requests for select to authenticated
  using (public.staff_service_can_access_request(auth.uid(), id));

create policy staff_service_steps_authorized_read
  on public.staff_service_approval_steps for select to authenticated
  using (public.staff_service_can_access_request(auth.uid(), request_id));

create policy staff_service_attachments_authorized_read
  on public.staff_service_attachments for select to authenticated
  using (public.staff_service_can_access_request(auth.uid(), request_id));

create policy staff_service_events_authorized_read
  on public.staff_service_events for select to authenticated
  using (public.staff_service_can_access_request(auth.uid(), request_id));

create policy staff_leave_balances_owner_or_hr_read
  on public.staff_leave_balances for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.staff_service_has_role(auth.uid(), 'hr', null)
  );

create policy staff_payroll_statements_owner_or_finance_read
  on public.staff_payroll_statements for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.staff_service_has_role(auth.uid(), 'finance', null)
  );

create policy staff_payroll_components_owner_or_finance_read
  on public.staff_payroll_components for select to authenticated
  using (
    exists (
      select 1
      from public.staff_payroll_statements ps
      join public.staff_profiles sp on sp.id = ps.staff_profile_id
      where ps.id = statement_id and sp.user_id = auth.uid()
    )
    or public.staff_service_has_role(auth.uid(), 'finance', null)
  );

create policy staff_career_history_owner_or_hr_read
  on public.staff_career_history for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.staff_service_has_role(auth.uid(), 'hr', null)
  );

create policy staff_correspondence_recipient_or_publisher_read
  on public.staff_correspondence for select to authenticated
  using (
    (
      published_at is not null
      and exists (
        select 1 from public.staff_correspondence_recipients r
        where r.correspondence_id = id
          and r.recipient_user_id = auth.uid()
      )
    )
    or public.staff_service_has_role(auth.uid(), 'hr', sender_department_id)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_correspondence_recipients_owner_or_hr_read
  on public.staff_correspondence_recipients for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or public.staff_service_has_role(auth.uid(), 'hr', null)
    or public.staff_service_is_admin(auth.uid())
  );

create policy staff_correspondence_recipients_owner_ack
  on public.staff_correspondence_recipients for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy staff_custody_owner_or_hr_read
  on public.staff_custody_assignments for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.staff_service_has_role(auth.uid(), 'hr', null)
  );

create policy staff_notifications_owner_read
  on public.staff_service_notifications_outbox for select to authenticated
  using (recipient_user_id = auth.uid());

revoke all on table public.staff_service_role_assignments from public, anon, authenticated;
revoke all on table public.staff_service_requests from public, anon, authenticated;
revoke all on table public.staff_service_approval_steps from public, anon, authenticated;
revoke all on table public.staff_service_attachments from public, anon, authenticated;
revoke all on table public.staff_service_events from public, anon, authenticated;
revoke all on table public.staff_leave_balances from public, anon, authenticated;
revoke all on table public.staff_payroll_statements from public, anon, authenticated;
revoke all on table public.staff_payroll_components from public, anon, authenticated;
revoke all on table public.staff_career_history from public, anon, authenticated;
revoke all on table public.staff_correspondence from public, anon, authenticated;
revoke all on table public.staff_correspondence_recipients from public, anon, authenticated;
revoke all on table public.staff_custody_assignments from public, anon, authenticated;
revoke all on table public.staff_service_notifications_outbox from public, anon, authenticated;

grant select on table public.staff_service_role_assignments to authenticated;
grant select on table public.staff_service_requests to authenticated;
grant select on table public.staff_service_approval_steps to authenticated;
grant select on table public.staff_service_attachments to authenticated;
grant select on table public.staff_service_events to authenticated;
grant select on table public.staff_leave_balances to authenticated;
grant select on table public.staff_payroll_statements to authenticated;
grant select on table public.staff_payroll_components to authenticated;
grant select on table public.staff_career_history to authenticated;
grant select on table public.staff_correspondence to authenticated;
grant select, update (received_at, read_at, acknowledged_at)
  on table public.staff_correspondence_recipients to authenticated;
grant select on table public.staff_custody_assignments to authenticated;
grant select on table public.staff_service_notifications_outbox to authenticated;

revoke all on function public.staff_service_touch_updated_at() from public, anon, authenticated;
revoke all on function public.staff_service_is_admin(uuid) from public, anon;
revoke all on function public.staff_service_has_role(uuid, text, uuid) from public, anon;
revoke all on function public.staff_service_can_access_request(uuid, uuid) from public, anon;
revoke all on function public.staff_service_reject_event_mutation() from public, anon, authenticated;
revoke all on function public.staff_service_submit_request(text, jsonb, uuid) from public, anon;
revoke all on function public.staff_service_decide_request(uuid, text, text, uuid) from public, anon;

grant execute on function public.staff_service_submit_request(text, jsonb, uuid)
  to authenticated;
grant execute on function public.staff_service_decide_request(uuid, text, text, uuid)
  to authenticated;

comment on table public.staff_service_events is
  'Append-only audit timeline for employee service requests; UPDATE and DELETE are rejected by triggers.';
comment on table public.staff_payroll_statements is
  'Sensitive read model imported from the authoritative financial system; employees may read only their own rows.';
comment on table public.staff_service_notifications_outbox is
  'Transactional notification outbox. Delivery workers use service_role; clients have read-only access to their own notifications.';
comment on function public.staff_service_submit_request(text, jsonb, uuid) is
  'Atomic idempotent request submission that creates the approved role workflow and audit event.';
comment on function public.staff_service_decide_request(uuid, text, text, uuid) is
  'Atomic scoped approval/rejection. Reject requires a reason and self-approval is denied.';

commit;
