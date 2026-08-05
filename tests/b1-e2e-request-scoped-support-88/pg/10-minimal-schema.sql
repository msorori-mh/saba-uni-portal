-- B1 E2E 88 â€” disposable PG17 minimal schema (LOCAL ONLY)
\set ON_ERROR_STOP on
SET check_function_bodies = off;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('e_rpcmatrix.uid', true), '')::uuid
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  name_ar text
);

CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY,
  code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY,
  unit_id uuid REFERENCES public.request_processing_units(id),
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text DEFAULT 'active'
);

CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  department_id uuid REFERENCES public.departments(id),
  status text DEFAULT 'active'
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date
);

CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  role_id uuid NOT NULL REFERENCES public.request_processing_roles(id),
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid REFERENCES public.staff_profiles(id),
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id),
  position_assignment_id uuid REFERENCES public.position_assignments(id),
  department_id uuid REFERENCES public.departments(id),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text,
  is_active boolean NOT NULL DEFAULT true,
  student_visible boolean NOT NULL DEFAULT false,
  request_audience text NOT NULL DEFAULT 'active_student'
);

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text NOT NULL DEFAULT 'active',
  academic_number text,
  full_name_ar text,
  department_id uuid REFERENCES public.departments(id)
);

CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid REFERENCES public.request_types(id),
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  step_order integer NOT NULL,
  step_name_ar text,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  action_type text,
  can_skip boolean NOT NULL DEFAULT false,
  can_reject boolean NOT NULL DEFAULT true,
  can_return_to_student boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  from_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  to_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  action_result text NOT NULL
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text,
  student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  title text,
  description text,
  status text NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  student_notes text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid REFERENCES public.request_type_workflows(id),
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_key text NOT NULL,
  step_name_ar text,
  step_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  entered_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id),
  current_department_id uuid REFERENCES public.departments(id),
  requested_department_id uuid REFERENCES public.departments(id)
);

CREATE OR REPLACE FUNCTION public.is_b1_stored_request_type(p_request_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT p_request_type IN (
    'enrollment_suspension','excused_absence','absence_excuse',
    'department_transfer','transfer','final_chance','extra_chance','file_withdrawal'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT p_action IN (
    'approve','reject','return','comment','request_attachment',
    'request_payment','sign','archive','issue_document','complete','skip',
    'review','clear','apply_decision','confirm_payment'
  );
$$;

CREATE OR REPLACE FUNCTION public.workflow_action_result_matches(p_action_type text, p_result text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_action_type
    WHEN 'review' THEN p_result='reviewed'
    WHEN 'approve' THEN p_result='approved'
    WHEN 'apply_decision' THEN p_result='applied'
    WHEN 'clear' THEN p_result='cleared'
    WHEN 'archive' THEN p_result='archived'
    WHEN 'confirm_payment' THEN p_result='payment_confirmed'
    ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.is_valid_b1_runtime_step_contract(
  p_request_type text, p_step_key text, p_unit_code text, p_role_code text, p_action_type text
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
    ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','source_department_head_approval','department','department_head','approve'),
    ('department_transfer','target_department_head_approval','department','department_head','approve')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id AND sp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(p_unit_id uuid, p_role_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;

  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_step.assigned_staff_profile_id
        AND sp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = v_step.assigned_faculty_profile_id
        AND fp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid
        AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_has_direct_assignee THEN
    RETURN false;
  END IF;

  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   >  now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        (rpa.assignment_type = 'user'
          AND rpa.user_id IS NOT NULL
          AND rpa.user_id = v_uid)
        OR
        (rpa.assignment_type = 'staff_profile'
          AND rpa.staff_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.staff_profiles sp
            WHERE sp.id = rpa.staff_profile_id AND sp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'faculty_profile'
          AND rpa.faculty_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.faculty_profiles fp
            WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'position_assignment'
          AND rpa.position_assignment_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.position_assignments pa
            WHERE pa.id = rpa.position_assignment_id
              AND pa.user_id = v_uid
              AND pa.is_active = true
              AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
          ))
      )
  );
END;
$function$;



CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    SELECT count(*) = 1
    FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
      AND pa.user_id = auth.uid()
      AND pa.is_active
      AND pa.assigned_from <= CURRENT_DATE
      AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
      AND rpa.assignment_type = 'position_assignment'
      AND rpa.is_active
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = s.processing_unit_id
      AND rpa.role_id = s.processing_role_id
    WHERE s.id = p_step_id
      AND s.step_key = p_step_key
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval'
          AND rpa.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval'
          AND rpa.department_id = d.requested_department_id)
      )
  );
$$;



CREATE OR REPLACE FUNCTION public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT true
$$;

create or replace function public.can_current_user_act_on_step(p_step_id uuid,p_action text)
returns boolean language plpgsql stable security definer set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_request_type text;
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
begin
  if v_uid is null or p_step_id is null then return false; end if;
  if not public.is_valid_actor_request_action(p_action) then return false; end if;

  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found then return false; end if;

  select r.request_type into v_request_type from public.student_requests r
    where r.id=v_step.student_request_id;
  if not found then return false; end if;
  -- B1 scope via the shared stored-code predicate so both the legacy aliases
  -- (absence_excuse, transfer, extra_chance) and the canonical stored codes
  -- (excused_absence, department_transfer, final_chance) are covered. Every
  -- strict check below lives inside the B1 branch only; the non-B1 path keeps
  -- the applied lenient contract for every non-B1 request type, including
  -- enrollment_certificate.
  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
  v_canonical_request_type := case v_request_type
    when 'absence_excuse' then 'excused_absence'
    when 'transfer' then 'department_transfer'
    when 'extra_chance' then 'final_chance'
    else v_request_type
  end;

  -- Every B1 staff step is active-only and directly assigned. A role-pool
  -- assignment, including admin/registrar/dean, can never substitute for the
  -- exact runtime assignee on these services.
  if v_is_b1 and (
    v_step.status is distinct from 'active'
    or num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    ) is distinct from 1
  ) then return false; end if;

  if public.is_owner_of_request(v_uid,v_step.student_request_id) then return false; end if;

  if v_step.status not in ('active','pending') then
    if p_action='comment' and v_step.status='completed' then
      return public.user_matches_workflow_runtime_step(p_step_id);
    end if;
    return false;
  end if;

  -- Strict assignee match ALWAYS required (no admin/registrar/dean bypass).
  if not public.user_matches_workflow_runtime_step(p_step_id) then return false; end if;

  -- B1-ONLY: a direct runtime assignee proves identity, not current
  -- authority. F2 stays closed for B1 steps only.
  if v_is_b1 and not public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id,v_step.processing_role_id
  ) then return false; end if;

  if v_canonical_request_type='department_transfer'
     and v_step.step_key in ('source_department_head_approval','target_department_head_approval')
     and not public.current_user_matches_transfer_department_scope(p_step_id,v_step.step_key) then
    return false;
  end if;

  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id;

  if v_is_b1 then
    -- B1-ONLY strict runtime/config correspondence: re-align the config lookup
    -- with workflow_id and step_order for B1 steps only. The non-B1 path below
    -- keeps the applied lookup.
    select * into v_config from public.request_type_workflow_steps
      where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
    if not found
      or v_config.step_key is distinct from v_step.step_key
      or v_config.step_order is distinct from v_step.step_order
      or v_config.processing_unit_id is distinct from v_step.processing_unit_id
      or v_config.processing_role_id is distinct from v_step.processing_role_id then
      return false;
    end if;

    -- B1-ONLY predecessor guard: a successor step may never execute while any
    -- required predecessor runtime is missing, pending, or unreachable.
    if not public.workflow_runtime_predecessors_satisfied(p_step_id) then return false; end if;

    select u.code, pr.code into v_unit_code, v_role_code
    from public.request_processing_units u
    join public.request_processing_roles pr on pr.id=v_step.processing_role_id
    where u.id=v_step.processing_unit_id;
    if not public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type,v_step.step_key,v_unit_code,v_role_code,v_config.action_type
    ) then return false; end if;

    -- B1-ONLY action gate: the executed action must equal the configured
    -- action_type with exactly one outgoing transition whose action_result
    -- matches workflow_action_result_matches, or be 'skip' on a skippable step
    -- with exactly one skip transition.
    if p_action=v_config.action_type then
      select count(*) into v_transition_count from public.request_type_workflow_transitions t
        where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id
          and public.workflow_action_result_matches(v_config.action_type,t.action_result);
      return v_transition_count=1;
    elsif p_action='skip' then
      select count(*) into v_transition_count from public.request_type_workflow_transitions t
        where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id
          and t.action_result='skip';
      return coalesce(v_config.can_skip,false) and v_transition_count=1;
    end if;
    return false;
  end if;

  -- Non-B1 path: applied lenient contract preserved EXACTLY (status
  -- active/pending and comment-on-completed above; skip/reject/return flag
  -- checks and the final RETURN true below).
  if p_action='skip' then
    if v_config.id is null or not coalesce(v_config.can_skip,false) then return false; end if;
    return true;
  end if;

  if p_action='reject' and v_config.id is not null and not coalesce(v_config.can_reject,true) then return false; end if;

  if p_action='return' and v_config.id is not null and not coalesce(v_config.can_return_to_student,true) then return false; end if;

  return true;
end;
$function$;



CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE (profile_id uuid, profile_status text, academic_number text, full_name_ar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT sp.id, sp.status, sp.academic_number, sp.full_name_ar
  FROM public.student_profiles sp WHERE sp.user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(
  _profile_status text, _request_audience text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _profile_status IS DISTINCT FROM 'active' AND _profile_status IS DISTINCT FROM 'graduated' THEN
    RAISE EXCEPTION 'ineligible' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
  v_request_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'ظ†ظˆط¹ ط§ظ„ط·ظ„ط¨ ظ…ط·ظ„ظˆط¨'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'ط¹ظ†ظˆط§ظ† ط§ظ„ط·ظ„ط¨ ظ…ط·ظ„ظˆط¨'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ظ„ظپ ط·ط§ظ„ط¨ ظ…ط±طھط¨ط· ط¨ط­ط³ط§ط¨ظƒ'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = p_request_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ظ†ظˆط¹ ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯'
      USING ERRCODE = '22023';
  END IF;

  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ظ†ظˆط¹ ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…ظپط¹ظ„'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ظ†ظˆط¹ ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…طھط§ط­ ظ„ظ„ط·ط§ظ„ط¨'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number,
    student_profile_id,
    request_type,
    title,
    description,
    status,
    form_data,
    student_notes
  ) VALUES (
    v_request_number,
    v_profile_id,
    v_type.code,
    btrim(p_title),
    p_student_notes,
    'draft',
    COALESCE(p_form_data, '{}'::jsonb),
    p_student_notes
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;



CREATE OR REPLACE FUNCTION public.guard_b1_runtime_mutation_boundary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_request_id uuid:=COALESCE(NEW.student_request_id,OLD.student_request_id); v_type text;
BEGIN
  SELECT r.request_type INTO v_type FROM public.student_requests r WHERE r.id=v_request_id;
  IF public.is_b1_stored_request_type(v_type)
     AND current_setting('b1.atomic_init',true) IS DISTINCT FROM '1'
     AND current_setting('b1.atomic_action',true) IS DISTINCT FROM '1'
     AND current_setting('b1.specialized_action',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER trg_guard_b1_runtime_mutation_boundary
  BEFORE INSERT OR UPDATE OR DELETE ON public.student_request_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.guard_b1_runtime_mutation_boundary();

REVOKE ALL ON FUNCTION public.create_student_request(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_request(text, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.user_matches_workflow_runtime_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_student_request(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_request(text, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.user_matches_workflow_runtime_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text) TO authenticated;
