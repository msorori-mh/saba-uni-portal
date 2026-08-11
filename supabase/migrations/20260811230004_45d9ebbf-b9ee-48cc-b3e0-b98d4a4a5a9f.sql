-- GA closure: configurable runtime states + pin provenance

-- 1) state becomes workflow-defined text
drop index if exists public.graduate_followups_one_active_per_record_and_type;

alter table public.graduate_followups
  alter column state type text using state::text;

create unique index graduate_followups_one_active_per_record_and_type
  on public.graduate_followups (
    graduate_record_id,
    coalesce(followup_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where not jsonb_exists(coalesce(workflow_snapshot->'terminal_states', '[]'::jsonb), state);

alter table public.graduate_followups
  add constraint graduate_followups_state_not_blank check (btrim(state) <> '');

-- 2) pin provenance
alter table public.graduate_followups
  add column workflow_pinned_at timestamptz,
  add column workflow_pin_source text;

update public.graduate_followups
  set workflow_pinned_at = coalesce(workflow_pinned_at, created_at, now()),
      workflow_pin_source = coalesce(workflow_pin_source, 'LEGACY_V1_AT_CUTOVER');

alter table public.graduate_followups
  alter column workflow_pinned_at set not null,
  alter column workflow_pinned_at set default now(),
  alter column workflow_pin_source set not null,
  add constraint graduate_followups_pin_source_ck
    check (workflow_pin_source in ('LEGACY_V1_AT_CUTOVER','PUBLISHED_WORKFLOW_AT_CREATE'));

-- 3) fail-closed, snapshot-driven update guard (no hardcoded state machine)
create or replace function public.enforce_graduate_followup_update()
returns trigger language plpgsql as $$
declare
  v_snapshot jsonb;
  v_states jsonb;
  v_transitions jsonb;
  v_terminal jsonb;
  v_allowed boolean;
  v_require_outcome boolean;
  v_outcome_states jsonb;
begin
  if new.graduate_record_id <> old.graduate_record_id
     or new.assignee_user_id <> old.assignee_user_id
     or new.followup_type_id is distinct from old.followup_type_id then
    raise exception 'GRADUATE_FOLLOWUP_IDENTITY_IMMUTABLE';
  end if;

  -- pin provenance immutability
  if new.workflow_id is distinct from old.workflow_id
     or new.workflow_snapshot is distinct from old.workflow_snapshot
     or new.workflow_pinned_at is distinct from old.workflow_pinned_at
     or new.workflow_pin_source is distinct from old.workflow_pin_source then
    raise exception 'GRADUATE_FOLLOWUP_PIN_IMMUTABLE';
  end if;

  if new.state <> old.state then
    v_snapshot := coalesce(new.workflow_snapshot, '{}'::jsonb);
    if v_snapshot = '{}'::jsonb
       or jsonb_typeof(v_snapshot->'states') <> 'array'
       or jsonb_typeof(v_snapshot->'transitions') <> 'array' then
      raise exception 'GRADUATE_FOLLOWUP_UNPINNED_WORKFLOW';
    end if;
    v_states := v_snapshot->'states';
    v_transitions := v_snapshot->'transitions';
    v_terminal := coalesce(v_snapshot->'terminal_states', '[]'::jsonb);

    if not exists (
      select 1 from jsonb_array_elements_text(v_states) s where s = old.state
    ) then
      raise exception 'GRADUATE_FOLLOWUP_UNKNOWN_CURRENT_STATE';
    end if;
    if not exists (
      select 1 from jsonb_array_elements_text(v_states) s where s = new.state
    ) then
      raise exception 'GRADUATE_FOLLOWUP_UNKNOWN_TARGET_STATE';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_terminal) s where s = old.state
    ) then
      raise exception 'GRADUATE_FOLLOWUP_TERMINAL_STATE_LOCKED';
    end if;

    select exists (
      select 1 from jsonb_array_elements(v_transitions) as t
      where t->>'from' = old.state and t->>'to' = new.state
    ) into v_allowed;
    if not v_allowed then
      raise exception 'GRADUATE_FOLLOWUP_INVALID_TRANSITION';
    end if;

    v_require_outcome := coalesce(
      (v_snapshot->>'require_outcome_on_complete')::boolean, true);
    if jsonb_typeof(v_snapshot->'require_outcome_states') = 'array' then
      v_outcome_states := v_snapshot->'require_outcome_states';
    elsif v_require_outcome then
      -- compatibility default: terminal states other than an explicit cancellation state
      select coalesce(jsonb_agg(s), '[]'::jsonb) into v_outcome_states
      from jsonb_array_elements_text(v_terminal) s
      where s <> 'cancelled';
    else
      v_outcome_states := '[]'::jsonb;
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(v_outcome_states) s where s = new.state
    ) and (new.outcome is null or btrim(new.outcome) = '') then
      raise exception 'GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED';
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

-- 4) create RPC: text state, snapshot-driven active count, pin provenance
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
as $function$
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
  v_terminal jsonb;
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
  v_terminal := coalesce(v_snapshot->'terminal_states', '[]'::jsonb);
  if v_initial_state is null
     or not exists (
       select 1 from jsonb_array_elements_text(v_snapshot->'states') s
       where s = v_initial_state) then
    raise exception 'GRADUATE_FOLLOWUP_INVALID_WORKFLOW_SNAPSHOT';
  end if;
  v_max_active := coalesce((v_snapshot->>'max_active_per_graduate')::int, 1);

  select count(*) into v_active_count
  from public.graduate_followups f
  where f.graduate_record_id = p_graduate_record_id
    and f.followup_type_id = p_followup_type_id
    and not exists (
      select 1
      from jsonb_array_elements_text(
             coalesce(f.workflow_snapshot->'terminal_states', v_terminal)) s
      where s = f.state
    );
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
    followup_type_id, workflow_id, workflow_snapshot, state, next_action_at,
    workflow_pinned_at, workflow_pin_source
  ) values (
    p_graduate_record_id, p_assignee_user_id, v_type.code,
    p_followup_type_id, v_workflow_id, v_snapshot, v_initial_state, p_next_action_at,
    now(), 'PUBLISHED_WORKFLOW_AT_CREATE'
  )
  returning id into v_followup_id;

  perform public.graduate_affairs_audit(
    'graduate_followup_created', 'graduate_followup', v_followup_id,
    v_type.code, jsonb_build_object(
      'graduate_record_id', p_graduate_record_id,
      'assignee_user_id', p_assignee_user_id,
      'followup_type_id', p_followup_type_id,
      'workflow_id', v_workflow_id,
      'initial_state', v_initial_state,
      'workflow_pin_source', 'PUBLISHED_WORKFLOW_AT_CREATE'));
  return v_followup_id;
end;
$function$;

revoke all on function public.graduate_affairs_create_followup(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.graduate_affairs_create_followup(uuid, uuid, uuid, timestamptz) to authenticated;

-- 5) transition RPC takes a workflow-defined text state
drop function if exists public.graduate_affairs_transition_followup(uuid, graduate_followup_state, text, timestamptz);

create or replace function public.graduate_affairs_transition_followup(
  p_followup_id uuid,
  p_target_state text,
  p_outcome text default null,
  p_next_action_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_followup public.graduate_followups%rowtype;
  v_manager_profile uuid;
  v_specialist_profile uuid;
  v_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;
  select * into v_followup
  from public.graduate_followups f
  where f.id = p_followup_id
  for update;
  if not found then
    raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  end if;

  v_manager_profile := public.graduate_affairs_lock_caller_authorized_staff_profile(
    'graduate_affairs_manager'
  );
  if v_manager_profile is not null then
    null;
  elsif v_followup.assignee_user_id = auth.uid() then
    v_specialist_profile := public.graduate_affairs_lock_caller_authorized_staff_profile(
      'graduate_affairs_specialist'
    );
    if v_specialist_profile is null then
      raise exception 'GRADUATE_FOLLOWUP_NOT_ASSIGNEE';
    end if;
  else
    raise exception 'GRADUATE_FOLLOWUP_NOT_ASSIGNEE';
  end if;

  v_snapshot := coalesce(v_followup.workflow_snapshot, '{}'::jsonb);
  if v_snapshot = '{}'::jsonb
     or jsonb_typeof(v_snapshot->'states') <> 'array'
     or jsonb_typeof(v_snapshot->'transitions') <> 'array' then
    raise exception 'GRADUATE_FOLLOWUP_UNPINNED_WORKFLOW';
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(v_snapshot->'states') s
    where s = p_target_state
  ) then
    raise exception 'GRADUATE_FOLLOWUP_UNKNOWN_TARGET_STATE';
  end if;

  update public.graduate_followups f
  set state = p_target_state,
      outcome = coalesce(p_outcome, f.outcome),
      next_action_at = p_next_action_at
  where f.id = p_followup_id;

  perform public.graduate_affairs_audit(
    'graduate_followup_transitioned', 'graduate_followup', p_followup_id,
    v_followup.purpose_code, jsonb_build_object(
      'graduate_record_id', v_followup.graduate_record_id,
      'from_state', v_followup.state,
      'to_state', p_target_state,
      'workflow_id', v_followup.workflow_id));
end;
$function$;

revoke all on function public.graduate_affairs_transition_followup(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.graduate_affairs_transition_followup(uuid, text, text, timestamptz) to authenticated;