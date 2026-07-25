-- TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME
-- Disposable helpers/counters for integrated lifecycle E2E.

-- Align rpc-matrix minimal student_requests with secure-draft create/save shape.
alter table public.student_requests add column if not exists title text;
alter table public.student_requests add column if not exists description text;
alter table public.student_requests add column if not exists student_notes text;

-- Reviewed secure-draft create gate reads request_types.student_visible (no write).
alter table public.request_types add column if not exists student_visible boolean not null default false;
update public.request_types
   set student_visible = true
 where code in (
   'enrollment_suspension','excused_absence','absence_excuse',
   'department_transfer','transfer','final_chance','extra_chance','file_withdrawal'
 );

-- Align academic stubs with secure-read form-options projections.
alter table public.academic_years add column if not exists name text;
alter table public.academic_years add column if not exists is_current boolean not null default false;
alter table public.semesters add column if not exists name text;
alter table public.semesters add column if not exists is_current boolean not null default false;
alter table public.programs add column if not exists name_ar text;
alter table public.course_offerings add column if not exists course_id uuid;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text,
  name_ar text
);

insert into public.courses(id, code, name_ar)
values ('88888888-8888-4888-8888-888888888800', 'CS101', 'مقدمة حاسوب')
on conflict (id) do nothing;

update public.course_offerings
   set course_id = '88888888-8888-4888-8888-888888888800'
 where id = '88888888-8888-4888-8888-888888888801'
   and course_id is null;

update public.programs
   set name_ar = coalesce(name_ar, 'برنامج اختباري')
 where name_ar is null;

update public.academic_years
   set name = coalesce(name, 'AY-TEST'), is_current = true
 where id = '77777777-7777-4777-8777-777777777701';
update public.semesters
   set name = coalesce(name, 'SEM-TEST'), is_current = true
 where id = '77777777-7777-4777-8777-777777777702';

create schema if not exists b1_e2e;

create table if not exists b1_e2e.results (
  case_id text not null,
  category text not null,
  status text not null check (status in ('PASS','FAIL')),
  detail text,
  recorded_at timestamptz not null default now()
);

create table if not exists b1_e2e.counters (
  key text primary key,
  value integer not null default 0
);

insert into b1_e2e.counters(key, value) values
  ('draft_creates',0),('draft_saves',0),
  ('read_allows',0),('read_denials',0),
  ('action_allows',0),('action_denials',0),
  ('zero_mutation',0),('attachment_assertions',0),
  ('idempotency',0),('concurrency',0),
  ('services_completed',0)
on conflict do nothing;

create table if not exists b1_e2e.summary (
  services_completed integer not null default 0,
  summary_line text not null,
  recorded_at timestamptz not null default now()
);

create or replace function b1_e2e.bump(p_key text, p_delta integer default 1)
returns void language plpgsql as $$
begin
  insert into b1_e2e.counters(key,value) values (p_key, p_delta)
  on conflict (key) do update set value = b1_e2e.counters.value + excluded.value;
end $$;

create or replace function b1_e2e.note(p_case text, p_category text, p_ok boolean, p_detail text)
returns void language plpgsql as $$
begin
  insert into b1_e2e.results(case_id,category,status,detail)
  values (p_case, p_category, case when p_ok then 'PASS' else 'FAIL' end, p_detail);
end $$;

create or replace function b1_e2e.set_uid(p uuid)
returns void language plpgsql as $$
begin
  perform set_config('e_rpcmatrix.uid', coalesce(p::text, ''), true);
  perform set_config('b1.atomic_init', '', true);
  perform set_config('b1.atomic_action', '', true);
  perform set_config('b1.specialized_action', '', true);
  perform set_config('b1.atomic_submit', '', true);
end $$;

create or replace function b1_e2e.snapshot_request(p_request_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'status', r.status,
    'updated_at', r.updated_at,
    'form_data', r.form_data,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('key',s.step_key,'status',s.status,'order',s.step_order) order by s.step_order)
      from public.student_request_workflow_steps s where s.student_request_id = r.id
    ), '[]'::jsonb),
    'events', (
      select count(*) from public.student_request_workflow_events e
      where e.student_request_id = r.id
    ),
    'attachments', (
      select count(*) from public.student_request_attachment_uploads a
      where a.student_request_id = r.id
    ),
    'processing_assignments_total', (
      select count(*) from public.request_processing_assignments
    ),
    'suspension_detail', (
      select to_jsonb(d) from public.enrollment_suspension_details d where d.request_id = r.id
    ),
    'absence_detail', (
      select to_jsonb(d) from public.absence_excuse_details d where d.request_id = r.id
    ),
    'transfer_detail', (
      select to_jsonb(d) from public.transfer_request_details d where d.request_id = r.id
    ),
    'final_chance_detail', (
      select to_jsonb(d) from public.extra_chance_details d where d.request_id = r.id
    ),
    'withdrawal_detail', (
      select to_jsonb(d) from public.file_withdrawal_details d where d.request_id = r.id
    )
  )
  from public.student_requests r where r.id = p_request_id;
$$;

create or replace function b1_e2e.expect_deny(
  p_case text, p_category text, p_uid uuid, p_sql text, p_error_like text,
  p_request_id uuid default null
) returns void language plpgsql as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_state text := 'OK';
  v_msg text := '';
  v_ok boolean;
begin
  if p_request_id is not null then
    v_before := b1_e2e.snapshot_request(p_request_id);
  end if;
  perform b1_e2e.set_uid(p_uid);
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  v_ok := v_state <> 'OK' and v_msg like p_error_like;
  if p_request_id is not null then
    v_after := b1_e2e.snapshot_request(p_request_id);
    v_ok := v_ok and v_before = v_after;
    if v_ok then perform b1_e2e.bump('zero_mutation'); end if;
  end if;
  if v_ok then
    if p_category like 'read%' then perform b1_e2e.bump('read_denials');
    elsif p_category like 'action%' then perform b1_e2e.bump('action_denials');
    elsif p_category like 'draft%' then perform b1_e2e.bump('idempotency');
    end if;
  end if;
  perform b1_e2e.note(p_case, p_category, v_ok, coalesce(v_msg, 'no-error'));
end $$;

create or replace function b1_e2e.active_step(p_request_id uuid)
returns public.student_request_workflow_steps language sql stable as $$
  select s.* from public.student_request_workflow_steps s
  where s.student_request_id = p_request_id and s.status = 'active'
  order by s.step_order limit 1;
$$;
