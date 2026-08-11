-- GA-1: Follow-up Type Catalog
-- GA-2: Versioned Follow-up Workflow
-- GA-3: Pin new follow-ups to workflow version
-- Forward-only. No existing follow-up data is deleted or mutated destructively.

begin;

-- =========================================================================
-- Preflight
-- =========================================================================
do $$ begin
  if to_regclass('public.graduate_followups') is null then
    raise exception 'GA_FOLLOWUP_CATALOG_PREFLIGHT: graduate_followups required';
  end if;
  if to_regclass('public.graduate_followup_types') is not null then
    raise exception 'GA_FOLLOWUP_CATALOG_PREFLIGHT: graduate_followup_types already exists';
  end if;
  if to_regclass('public.graduate_followup_workflows') is not null then
    raise exception 'GA_FOLLOWUP_CATALOG_PREFLIGHT: graduate_followup_workflows already exists';
  end if;
end $$;

-- =========================================================================
-- Helper: extract state values from jsonb regardless of format
-- Supports both ["open","closed"] and [{"value":"open"}]
-- =========================================================================
create or replace function public._ga_extract_state_values(p_states jsonb)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select array_agg(
    case
      when jsonb_typeof(elem) = 'string' then elem#>>'{}'
      else elem->>'value'
    end
  )
  from jsonb_array_elements(p_states) as elem
$$;

-- =========================================================================
-- GA-1: Follow-up Type Catalog
-- =========================================================================
create table public.graduate_followup_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (btrim(code) <> ''),
  label_ar    text not null check (btrim(label_ar) <> ''),
  description_ar text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger graduate_followup_types_updated_at
  before update on public.graduate_followup_types
  for each row execute function public.update_updated_at_column();

alter table public.graduate_followup_types enable row level security;
grant select on public.graduate_followup_types to authenticated;
grant all on public.graduate_followup_types to service_role;

-- =========================================================================
-- GA-2: Versioned Follow-up Workflow
-- =========================================================================
create type public.graduate_followup_workflow_status as enum ('draft','published','superseded');

create table public.graduate_followup_workflows (
  id                        uuid primary key default gen_random_uuid(),
  followup_type_id          uuid not null references public.graduate_followup_types(id) on delete restrict,
  version                   integer not null,
  status                    public.graduate_followup_workflow_status not null default 'draft',
  states                    jsonb not null check (jsonb_typeof(states) = 'array'),
  transitions               jsonb not null check (jsonb_typeof(transitions) = 'array'),
  initial_state             text not null,
  terminal_states           jsonb not null default '["completed","cancelled"]'::jsonb check (jsonb_typeof(terminal_states) = 'array'),
  require_outcome_on_complete boolean not null default true,
  max_active_per_graduate   integer not null default 1 check (max_active_per_graduate >= 1),
  notes                     text,
  published_at              timestamptz,
  superseded_at             timestamptz,
  is_current                boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index graduate_followup_workflows_one_current
  on public.graduate_followup_workflows(followup_type_id)
  where is_current;

create unique index graduate_followup_workflows_type_version
  on public.graduate_followup_workflows(followup_type_id, version);

create trigger graduate_followup_workflows_updated_at
  before update on public.graduate_followup_workflows
  for each row execute function public.update_updated_at_column();

-- Published rows are immutable (only is_current demotion during supersession).
create or replace function public.enforce_graduate_followup_workflow_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    if new.status is distinct from old.status then
      raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_PUBLISHED_IMMUTABLE';
    end if;
    if new.followup_type_id is distinct from old.followup_type_id
       or new.version is distinct from old.version
       or new.states is distinct from old.states
       or new.transitions is distinct from old.transitions
       or new.initial_state is distinct from old.initial_state
       or new.terminal_states is distinct from old.terminal_states
       or new.require_outcome_on_complete is distinct from old.require_outcome_on_complete
       or new.max_active_per_graduate is distinct from old.max_active_per_graduate
       or new.notes is distinct from old.notes
       or new.published_at is distinct from old.published_at then
      raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_PUBLISHED_IMMUTABLE';
    end if;
    if old.is_current is true and new.is_current is false then
      return new;
    end if;
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_PUBLISHED_IMMUTABLE';
  end if;
  -- Draft rows: identity columns are immutable.
  if new.followup_type_id is distinct from old.followup_type_id
     or new.version is distinct from old.version then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger graduate_followup_workflow_immutable_guard
  before update on public.graduate_followup_workflows
  for each row execute function public.enforce_graduate_followup_workflow_update();

create trigger graduate_followup_workflows_append_only
  before delete on public.graduate_followup_workflows
  for each row execute function public.reject_graduate_immutable_mutation();

alter table public.graduate_followup_workflows enable row level security;
grant select on public.graduate_followup_workflows to authenticated;
grant all on public.graduate_followup_workflows to service_role;

-- =========================================================================
-- GA-3: Pin columns on graduate_followups
-- =========================================================================
alter table public.graduate_followups
  add column followup_type_id uuid references public.graduate_followup_types(id) on delete restrict,
  add column workflow_id uuid references public.graduate_followup_workflows(id) on delete restrict,
  add column workflow_snapshot jsonb not null default '{}'::jsonb;

drop index if exists public.graduate_followups_one_active_per_graduate;
create unique index graduate_followups_one_active_per_record_and_type
  on public.graduate_followups(graduate_record_id, coalesce(followup_type_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state in ('open','in_progress');

-- =========================================================================
-- Seed initial type catalog (GA-1)
-- =========================================================================
insert into public.graduate_followup_types (code, label_ar, description_ar) values
  ('career_followup',      'متابعة مهنية',         'متابعة المسار المهني للخريج وفرص العمل.'),
  ('employment_verification','تثبيت التوظيف',       'التحقق من حالة التوظيف المُبلّغ عنها.'),
  ('communications',       'تواصل عام',             'متابعة تواصلية عامة لا تندرج تحت نوع محدد.'),
  ('surveys',              'متابعة استبيان',         'متابعة مشاركة الخريج في الاستبيانات.'),
  ('events',               'متابعة فعالية',         'متابعة تسجيل الخريج في الفعاليات.'),
  ('employment_quality',   'جودة التوظيف',          'متابعة جودة التوظيف ومدى تطابق التخصص.');

-- =========================================================================
-- Seed a built-in published workflow for each type (GA-2)
-- =========================================================================
create or replace function public._ga_seed_builtin_workflows()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type record;
begin
  for v_type in select id from public.graduate_followup_types loop
    insert into public.graduate_followup_workflows (
      followup_type_id, version, status,
      states, transitions, initial_state, terminal_states,
      require_outcome_on_complete, max_active_per_graduate,
      notes, published_at, is_current
    ) values (
      v_type.id, 1, 'published',
      '["open","in_progress","completed","cancelled"]'::jsonb,
      '[{"from":"open","to":"in_progress"},{"from":"open","to":"cancelled"},{"from":"in_progress","to":"completed"},{"from":"in_progress","to":"cancelled"}]'::jsonb,
      'open', '["completed","cancelled"]'::jsonb,
      true, 1,
      'الإصدار المدمج — مطابق لدورة الحياة السابقة. الإدارة قد تنشر إصدارًا بديلًا.',
      now(), true
    );
  end loop;
end;
$$;

select public._ga_seed_builtin_workflows();
drop function public._ga_seed_builtin_workflows();

-- =========================================================================
-- Backfill the existing follow-up row (GA-3)
-- =========================================================================
update public.graduate_followups f
  set followup_type_id = t.id,
      workflow_id = w.id,
      workflow_snapshot = jsonb_build_object(
        'states', w.states,
        'transitions', w.transitions,
        'initial_state', w.initial_state,
        'terminal_states', w.terminal_states,
        'require_outcome_on_complete', w.require_outcome_on_complete,
        'max_active_per_graduate', w.max_active_per_graduate
      )
  from public.graduate_followup_types t,
       public.graduate_followup_workflows w
  where w.followup_type_id = t.id
    and w.is_current
    and t.code = 'employment_verification'
    and f.followup_type_id is null
    and f.purpose_code = 'employment_verification';

-- =========================================================================
-- Replace the state-guard trigger with a workflow-aware version
-- =========================================================================
create or replace function public.enforce_graduate_followup_update()
returns trigger language plpgsql as $$
declare
  v_transitions jsonb;
  v_allowed boolean;
  v_require_outcome boolean;
begin
  if new.graduate_record_id <> old.graduate_record_id
     or new.assignee_user_id <> old.assignee_user_id
     or new.followup_type_id is distinct from old.followup_type_id
     or new.workflow_id is distinct from old.workflow_id then
    raise exception 'GRADUATE_FOLLOWUP_IDENTITY_IMMUTABLE';
  end if;

  if new.state <> old.state then
    if coalesce(new.workflow_snapshot, '{}'::jsonb) <> '{}'::jsonb then
      v_transitions := new.workflow_snapshot->'transitions';
      select exists (
        select 1 from jsonb_array_elements(v_transitions) as t
        where t->>'from' = old.state and t->>'to' = new.state
      ) into v_allowed;
      if not v_allowed then
        raise exception 'GRADUATE_FOLLOWUP_INVALID_TRANSITION';
      end if;
      v_require_outcome := coalesce(
        (new.workflow_snapshot->>'require_outcome_on_complete')::boolean, true);
      if v_require_outcome and new.state = 'completed'
         and (new.outcome is null or btrim(new.outcome) = '') then
        raise exception 'GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED';
      end if;
    else
      if not (old.state = 'open' and new.state in ('in_progress','cancelled'))
         and not (old.state = 'in_progress' and new.state in ('completed','cancelled')) then
        raise exception 'GRADUATE_FOLLOWUP_INVALID_TRANSITION';
      end if;
      if new.state = 'completed' and (new.outcome is null or btrim(new.outcome) = '') then
        raise exception 'GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED';
      end if;
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists graduate_followup_state_guard on public.graduate_followups;
create trigger graduate_followup_state_guard
  before update on public.graduate_followups
  for each row execute function public.enforce_graduate_followup_update();

-- =========================================================================
-- Workflow snapshot helper
-- =========================================================================
create or replace function public.ga_resolve_current_workflow_snapshot(
  p_followup_type_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.graduate_followup_workflows%rowtype;
begin
  select * into v_workflow
  from public.graduate_followup_workflows
  where followup_type_id = p_followup_type_id
    and is_current
    and status = 'published';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'workflow_id', v_workflow.id,
    'states', v_workflow.states,
    'transitions', v_workflow.transitions,
    'initial_state', v_workflow.initial_state,
    'terminal_states', v_workflow.terminal_states,
    'require_outcome_on_complete', v_workflow.require_outcome_on_complete,
    'max_active_per_graduate', v_workflow.max_active_per_graduate
  );
end;
$$;

revoke all on function public.ga_resolve_current_workflow_snapshot(uuid) from public, anon;
grant execute on function public.ga_resolve_current_workflow_snapshot(uuid) to authenticated;

-- =========================================================================
-- Replace create followup RPC to accept followup_type_id
-- =========================================================================
drop function if exists public.graduate_affairs_create_followup(uuid, uuid, text, timestamptz);

create or replace function public.graduate_affairs_create_followup(
  p_graduate_record_id uuid,
  p_assignee_user_id uuid,
  p_followup_type_id uuid,
  p_next_action_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department_id uuid;
  v_followup_id uuid;
  v_manager_profile uuid;
  v_specialist_profile uuid;
  v_assignee_manager uuid;
  v_assignee_specialist uuid;
  v_type public.graduate_followup_types%rowtype;
  v_snapshot jsonb;
  v_workflow_id uuid;
  v_initial_state text;
  v_max_active int;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;

  select * into v_type
  from public.graduate_followup_types
  where id = p_followup_type_id and is_active;
  if not found then
    raise exception 'GRADUATE_FOLLOWUP_TYPE_NOT_FOUND';
  end if;

  v_snapshot := public.ga_resolve_current_workflow_snapshot(p_followup_type_id);
  if v_snapshot is null then
    raise exception 'GRADUATE_FOLLOWUP_NO_PUBLISHED_WORKFLOW';
  end if;
  v_workflow_id := (v_snapshot->>'workflow_id')::uuid;
  v_initial_state := v_snapshot->>'initial_state';
  v_max_active := coalesce((v_snapshot->>'max_active_per_graduate')::int, 1);

  select count(*) into v_active_count
  from public.graduate_followups
  where graduate_record_id = p_graduate_record_id
    and followup_type_id = p_followup_type_id
    and state in ('open','in_progress');
  if v_active_count >= v_max_active then
    raise exception 'GRADUATE_FOLLOWUP_MAX_ACTIVE_EXCEEDED';
  end if;

  select r.department_id into v_department_id
  from public.graduate_records r
  where r.id = p_graduate_record_id;
  if not found then
    raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  end if;

  v_manager_profile := public.graduate_affairs_lock_caller_authorized_staff_profile(
    'graduate_affairs_manager'
  );
  if v_manager_profile is null then
    v_specialist_profile := public.graduate_affairs_lock_caller_authorized_staff_profile(
      'graduate_affairs_specialist'
    );
  end if;
  if v_manager_profile is null
     and (
       v_specialist_profile is null
       or v_department_id not in (
         select spd.department_id
        from public.staff_profile_departments spd
        where spd.staff_profile_id = v_specialist_profile
      )
     ) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;

  v_assignee_manager := public.graduate_affairs_lock_authorized_staff_profile_id(
    p_assignee_user_id, 'graduate_affairs_manager'
  );
  v_assignee_specialist := public.graduate_affairs_lock_authorized_staff_profile_id(
    p_assignee_user_id, 'graduate_affairs_specialist'
  );
  if v_assignee_manager is null and v_assignee_specialist is null then
    raise exception 'GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF';
  end if;

  if v_manager_profile is not null then
    null;
  elsif v_specialist_profile is not null then
    if v_assignee_manager is null
       and (
         v_assignee_specialist is null
         or v_department_id not in (
           select spd.department_id
           from public.staff_profile_departments spd
           where spd.staff_profile_id = v_assignee_specialist
         )
       ) then
      raise exception 'GRADUATE_FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE';
    end if;
  else
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;

  insert into public.graduate_followups (
    graduate_record_id, assignee_user_id, purpose_code,
    followup_type_id, workflow_id, workflow_snapshot, state, next_action_at
  ) values (
    p_graduate_record_id, p_assignee_user_id, v_type.code,
    p_followup_type_id, v_workflow_id, v_snapshot, v_initial_state::public.graduate_followup_state, p_next_action_at
  )
  returning id into v_followup_id;

  perform public.graduate_affairs_audit(
    'graduate_followup_created', 'graduate_followup', v_followup_id,
    v_type.code, jsonb_build_object(
      'graduate_record_id', p_graduate_record_id,
      'assignee_user_id', p_assignee_user_id,
      'followup_type_id', p_followup_type_id,
      'workflow_id', v_workflow_id));
  return v_followup_id;
end;
$$;

revoke all on function public.graduate_affairs_create_followup(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.graduate_affairs_create_followup(uuid, uuid, uuid, timestamptz) to authenticated;

-- =========================================================================
-- Admin RPC: List follow-up types
-- =========================================================================
create or replace function public.ga_admin_list_followup_types()
returns table (
  id uuid,
  code text,
  label_ar text,
  description_ar text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  current_workflow_id uuid,
  current_workflow_version int,
  current_workflow_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  if not public.has_any_role(auth.uid(), array['admin','system_admin']) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  return query
  select t.id, t.code, t.label_ar, t.description_ar, t.is_active,
         t.created_at, t.updated_at,
         w.id, w.version, w.status::text
  from public.graduate_followup_types t
  left join public.graduate_followup_workflows w
    on w.followup_type_id = t.id and w.is_current
  order by t.code;
end;
$$;

revoke all on function public.ga_admin_list_followup_types() from public, anon;
grant execute on function public.ga_admin_list_followup_types() to authenticated;

-- =========================================================================
-- Admin RPC: Save (create or update) a follow-up type
-- =========================================================================
create or replace function public.ga_admin_save_followup_type(
  p_id uuid default null,
  p_code text default null,
  p_label_ar text default null,
  p_description_ar text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  if not public.has_any_role(auth.uid(), array['admin','system_admin']) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  if p_code is null or btrim(p_code) = '' then
    raise exception 'GRADUATE_FOLLOWUP_TYPE_CODE_REQUIRED';
  end if;
  if p_label_ar is null or btrim(p_label_ar) = '' then
    raise exception 'GRADUATE_FOLLOWUP_TYPE_LABEL_REQUIRED';
  end if;

  if p_id is not null then
    update public.graduate_followup_types
    set code = btrim(p_code),
        label_ar = btrim(p_label_ar),
        description_ar = p_description_ar,
        is_active = p_is_active
    where id = p_id
    returning id into v_id;
    if not found then
      raise exception 'GRADUATE_FOLLOWUP_TYPE_NOT_FOUND';
    end if;
  else
    insert into public.graduate_followup_types (code, label_ar, description_ar, is_active)
    values (btrim(p_code), btrim(p_label_ar), p_description_ar, p_is_active)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.ga_admin_save_followup_type(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.ga_admin_save_followup_type(uuid, text, text, text, boolean) to authenticated;

-- =========================================================================
-- Admin RPC: List workflow versions
-- =========================================================================
create or replace function public.ga_admin_list_followup_workflows(
  p_followup_type_id uuid default null
)
returns table (
  id uuid,
  followup_type_id uuid,
  type_code text,
  type_label_ar text,
  version int,
  status text,
  states jsonb,
  transitions jsonb,
  initial_state text,
  terminal_states jsonb,
  require_outcome_on_complete boolean,
  max_active_per_graduate int,
  notes text,
  published_at timestamptz,
  superseded_at timestamptz,
  is_current boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  if not public.has_any_role(auth.uid(), array['admin','system_admin']) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  return query
  select w.id, w.followup_type_id, t.code, t.label_ar,
         w.version, w.status::text,
         w.states, w.transitions, w.initial_state, w.terminal_states,
         w.require_outcome_on_complete, w.max_active_per_graduate,
         w.notes, w.published_at, w.superseded_at, w.is_current,
         w.created_at
  from public.graduate_followup_workflows w
  join public.graduate_followup_types t on t.id = w.followup_type_id
  where p_followup_type_id is null or w.followup_type_id = p_followup_type_id
  order by w.followup_type_id, w.version desc;
end;
$$;

revoke all on function public.ga_admin_list_followup_workflows(uuid) from public, anon;
grant execute on function public.ga_admin_list_followup_workflows(uuid) to authenticated;

-- =========================================================================
-- Admin RPC: Save a draft workflow
-- =========================================================================
create or replace function public.ga_admin_save_workflow_draft(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_type_id uuid := p_payload->>'followup_type_id';
  v_version int;
  v_states jsonb := p_payload->'states';
  v_transitions jsonb := p_payload->'transitions';
  v_initial text := p_payload->>'initial_state';
  v_terminal jsonb := coalesce(p_payload->'terminal_states', '["completed","cancelled"]'::jsonb);
  v_require_outcome boolean := coalesce((p_payload->>'require_outcome_on_complete')::boolean, true);
  v_max_active int := coalesce((p_payload->>'max_active_per_graduate')::int, 1);
  v_notes text := p_payload->>'notes';
  v_existing_id uuid := p_payload->>'id';
  v_existing record;
  v_state_values text[];
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  if not public.has_any_role(auth.uid(), array['admin','system_admin']) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  if v_type_id is null then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_TYPE_REQUIRED';
  end if;
  if not exists (select 1 from public.graduate_followup_types where id = v_type_id) then
    raise exception 'GRADUATE_FOLLOWUP_TYPE_NOT_FOUND';
  end if;
  if v_states is null or jsonb_array_length(v_states) = 0 then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_STATES_REQUIRED';
  end if;
  if v_transitions is null or jsonb_array_length(v_transitions) = 0 then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_TRANSITIONS_REQUIRED';
  end if;
  if v_initial is null or v_initial = '' then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_INITIAL_STATE_REQUIRED';
  end if;

  v_state_values := public._ga_extract_state_values(v_states);
  if v_initial <> all(v_state_values) then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_INITIAL_STATE_NOT_IN_STATES';
  end if;

  if v_existing_id is not null then
    select * into v_existing from public.graduate_followup_workflows where id = v_existing_id;
    if not found then
      raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_NOT_FOUND';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_NOT_DRAFT';
    end if;
    update public.graduate_followup_workflows
    set states = v_states,
        transitions = v_transitions,
        initial_state = v_initial,
        terminal_states = v_terminal,
        require_outcome_on_complete = v_require_outcome,
        max_active_per_graduate = v_max_active,
        notes = v_notes
    where id = v_existing_id
    returning id into v_id;
  else
    select coalesce(max(version), 0) + 1 into v_version
    from public.graduate_followup_workflows
    where followup_type_id = v_type_id;
    insert into public.graduate_followup_workflows (
      followup_type_id, version, status,
      states, transitions, initial_state, terminal_states,
      require_outcome_on_complete, max_active_per_graduate, notes
    ) values (
      v_type_id, v_version, 'draft',
      v_states, v_transitions, v_initial, v_terminal,
      v_require_outcome, v_max_active, v_notes
    )
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.ga_admin_save_workflow_draft(jsonb) from public, anon;
grant execute on function public.ga_admin_save_workflow_draft(jsonb) to authenticated;

-- =========================================================================
-- Admin RPC: Publish a draft workflow
-- =========================================================================
create or replace function public.ga_admin_publish_workflow(
  p_workflow_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.graduate_followup_workflows%rowtype;
  v_current public.graduate_followup_workflows%rowtype;
  v_state_values text[];
  v_invalid_transition boolean;
  v_terminal_values text[];
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  if not public.has_any_role(auth.uid(), array['admin','system_admin']) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;

  select * into v_draft
  from public.graduate_followup_workflows
  where id = p_workflow_id
  for update;
  if not found then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_NOT_FOUND';
  end if;
  if v_draft.status <> 'draft' then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_NOT_DRAFT';
  end if;

  v_state_values := public._ga_extract_state_values(v_draft.states);

  -- Validate initial_state is in states
  if v_draft.initial_state <> all(v_state_values) then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_INITIAL_STATE_NOT_IN_STATES';
  end if;

  -- Validate all transitions reference known states
  select exists (
    select 1 from jsonb_array_elements(v_draft.transitions) as tr
    where (tr->>'from') <> all(v_state_values)
       or (tr->>'to') <> all(v_state_values)
  ) into v_invalid_transition;
  if v_invalid_transition then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_TRANSITION_STATE_INVALID';
  end if;

  -- Validate terminal states reference known states
  v_terminal_values := public._ga_extract_state_values(v_draft.terminal_states);
  perform 1 from unnest(v_terminal_values) as ts where ts <> all(v_state_values);
  if found then
    raise exception 'GRADUATE_FOLLOWUP_WORKFLOW_TERMINAL_STATE_INVALID';
  end if;

  -- Demote current published workflow (if any)
  select * into v_current
  from public.graduate_followup_workflows
  where followup_type_id = v_draft.followup_type_id
    and is_current
  for update;
  if found then
    update public.graduate_followup_workflows
    set is_current = false,
        superseded_at = now()
    where id = v_current.id;
  end if;

  -- Promote draft to published
  update public.graduate_followup_workflows
  set status = 'published',
      is_current = true,
      published_at = now()
  where id = p_workflow_id;
end;
$$;

revoke all on function public.ga_admin_publish_workflow(uuid) from public, anon;
grant execute on function public.ga_admin_publish_workflow(uuid) to authenticated;

commit;