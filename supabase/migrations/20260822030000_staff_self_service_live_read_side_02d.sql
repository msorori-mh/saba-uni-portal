-- PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
-- Forward-only source migration. NOT applied to any database in this stage.
-- Depends on 02A (foundation) and 02B (private storage binding).

begin;

do $$
begin
  if to_regclass('public.staff_correspondence_recipients') is null
     or to_regclass('public.staff_payroll_statements') is null
     or to_regprocedure('public.staff_service_is_admin(uuid)') is null
     or to_regprocedure('public.staff_service_has_role(uuid, text, uuid)') is null then
    raise exception 'STAFF_SERVICE_02D_REQUIRES_02A';
  end if;
  if to_regprocedure('public.staff_service_authorize_attachment_download(uuid)') is null then
    raise exception 'STAFF_SERVICE_02D_REQUIRES_02B';
  end if;
end;
$$;

-- 1) Remove the direct client mutation path on correspondence receipts.
drop policy if exists staff_correspondence_recipients_owner_ack
  on public.staff_correspondence_recipients;

revoke update on table public.staff_correspondence_recipients
  from public, anon, authenticated;

-- 2) Append-only audit ledger for read-side (correspondence / payroll) actions.
--    staff_service_events.request_id is NOT NULL, so read-side actions that are
--    not bound to a service request get their own immutable ledger.
create table public.staff_service_read_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  subject_kind text not null check (subject_kind in (
    'correspondence', 'payroll_statement'
  )),
  subject_id uuid not null,
  event_type text not null check (event_type in (
    'correspondence_received',
    'correspondence_read',
    'correspondence_acknowledged',
    'payroll_download_authorized'
  )),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (actor_user_id, subject_kind, subject_id, event_type),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 8192)
);

create index staff_service_read_audit_actor_idx
  on public.staff_service_read_audit_events (actor_user_id, occurred_at desc);

create trigger staff_service_read_audit_immutable_update
  before update on public.staff_service_read_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

create trigger staff_service_read_audit_immutable_delete
  before delete on public.staff_service_read_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

alter table public.staff_service_read_audit_events enable row level security;

create policy staff_service_read_audit_owner_or_admin_read
  on public.staff_service_read_audit_events for select to authenticated
  using (
    actor_user_id = auth.uid()
    or public.staff_service_is_admin(auth.uid())
  );

revoke all on table public.staff_service_read_audit_events
  from public, anon, authenticated;
grant select on table public.staff_service_read_audit_events to authenticated;
grant all on table public.staff_service_read_audit_events to service_role;

-- 3) Monotonic, idempotent correspondence receipt RPCs (replace client UPDATE).
create or replace function public.staff_service_record_correspondence_read(
  p_correspondence_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.staff_correspondence_recipients;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select r.* into v_row
  from public.staff_correspondence_recipients r
  join public.staff_correspondence c on c.id = r.correspondence_id
  where r.correspondence_id = p_correspondence_id
    and r.recipient_user_id = v_user
    and c.published_at is not null
  for update of r;

  if not found then
    raise exception 'STAFF_SERVICE_CORRESPONDENCE_ACCESS_DENIED' using errcode = '42501';
  end if;

  update public.staff_correspondence_recipients r
  set received_at = coalesce(r.received_at, v_now),
      read_at = coalesce(r.read_at, v_now)
  where r.id = v_row.id
    and r.recipient_user_id = v_user
  returning r.* into v_row;

  insert into public.staff_service_read_audit_events (
    actor_user_id, subject_kind, subject_id, event_type, metadata
  )
  values
    (v_user, 'correspondence', p_correspondence_id, 'correspondence_received',
     jsonb_build_object('received_at', v_row.received_at)),
    (v_user, 'correspondence', p_correspondence_id, 'correspondence_read',
     jsonb_build_object('read_at', v_row.read_at))
  on conflict (actor_user_id, subject_kind, subject_id, event_type) do nothing;

  return jsonb_build_object(
    'correspondence_id', v_row.correspondence_id,
    'received_at', v_row.received_at,
    'read_at', v_row.read_at,
    'acknowledged_at', v_row.acknowledged_at
  );
end;
$$;

create or replace function public.staff_service_acknowledge_correspondence(
  p_correspondence_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.staff_correspondence_recipients;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select r.* into v_row
  from public.staff_correspondence_recipients r
  join public.staff_correspondence c on c.id = r.correspondence_id
  where r.correspondence_id = p_correspondence_id
    and r.recipient_user_id = v_user
    and c.published_at is not null
  for update of r;

  if not found then
    raise exception 'STAFF_SERVICE_CORRESPONDENCE_ACCESS_DENIED' using errcode = '42501';
  end if;

  update public.staff_correspondence_recipients r
  set received_at = coalesce(r.received_at, v_now),
      read_at = coalesce(r.read_at, v_now),
      acknowledged_at = coalesce(r.acknowledged_at, v_now)
  where r.id = v_row.id
    and r.recipient_user_id = v_user
  returning r.* into v_row;

  insert into public.staff_service_read_audit_events (
    actor_user_id, subject_kind, subject_id, event_type, metadata
  )
  values
    (v_user, 'correspondence', p_correspondence_id, 'correspondence_received',
     jsonb_build_object('received_at', v_row.received_at)),
    (v_user, 'correspondence', p_correspondence_id, 'correspondence_read',
     jsonb_build_object('read_at', v_row.read_at)),
    (v_user, 'correspondence', p_correspondence_id, 'correspondence_acknowledged',
     jsonb_build_object('acknowledged_at', v_row.acknowledged_at))
  on conflict (actor_user_id, subject_kind, subject_id, event_type) do nothing;

  return jsonb_build_object(
    'correspondence_id', v_row.correspondence_id,
    'received_at', v_row.received_at,
    'read_at', v_row.read_at,
    'acknowledged_at', v_row.acknowledged_at
  );
end;
$$;

-- 4) Payroll statement secure generation contract (owner / finance / admin only).
create or replace function public.staff_service_authorize_payroll_statement_download(
  p_statement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_statement public.staff_payroll_statements;
  v_profile public.staff_profiles;
  v_access text;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_statement
  from public.staff_payroll_statements
  where id = p_statement_id;

  if not found then
    raise exception 'STAFF_SERVICE_PAYROLL_STATEMENT_NOT_FOUND' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_profiles
  where id = v_statement.staff_profile_id;

  if v_profile.user_id = v_user then
    v_access := 'owner';
  elsif public.staff_service_is_admin(v_user) then
    v_access := 'administrator';
  elsif public.staff_service_has_role(v_user, 'finance', null) then
    v_access := 'finance';
  else
    raise exception 'STAFF_SERVICE_PAYROLL_ACCESS_DENIED' using errcode = '42501';
  end if;

  if v_statement.published_at is null then
    raise exception 'STAFF_SERVICE_PAYROLL_STATEMENT_NOT_PUBLISHED' using errcode = '42501';
  end if;

  insert into public.staff_service_read_audit_events (
    actor_user_id, subject_kind, subject_id, event_type, metadata
  )
  values (
    v_user, 'payroll_statement', p_statement_id, 'payroll_download_authorized',
    jsonb_build_object('access_mode', v_access)
  )
  on conflict (actor_user_id, subject_kind, subject_id, event_type) do nothing;

  return jsonb_build_object(
    'statement_id', v_statement.id,
    'access_mode', v_access,
    'expires_in_seconds', 300,
    'staff_name_ar', v_profile.full_name_ar,
    'employee_number', v_profile.employee_number,
    'period_start', v_statement.period_start,
    'period_end', v_statement.period_end,
    'currency_code', v_statement.currency_code,
    'basic_salary', v_statement.basic_salary,
    'allowances_total', v_statement.allowances_total,
    'deductions_total', v_statement.deductions_total,
    'net_amount', v_statement.net_amount,
    'components', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'component_type', pc.component_type,
          'label_ar', pc.label_ar,
          'amount', pc.amount
        )
        order by pc.component_type, pc.display_order, pc.component_code
      )
      from public.staff_payroll_components pc
      where pc.statement_id = v_statement.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_service_record_correspondence_read(uuid)
  from public, anon;
revoke all on function public.staff_service_acknowledge_correspondence(uuid)
  from public, anon;
revoke all on function public.staff_service_authorize_payroll_statement_download(uuid)
  from public, anon;

grant execute on function public.staff_service_record_correspondence_read(uuid)
  to authenticated;
grant execute on function public.staff_service_acknowledge_correspondence(uuid)
  to authenticated;
grant execute on function public.staff_service_authorize_payroll_statement_download(uuid)
  to authenticated;

commit;
