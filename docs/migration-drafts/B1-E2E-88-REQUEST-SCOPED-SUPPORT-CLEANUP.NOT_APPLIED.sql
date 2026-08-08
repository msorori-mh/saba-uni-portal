-- B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP / DECOMMISSION
-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- NOT_APPLIED. Explicit operator invocation only after dual review.
-- Fully executable: embeds exact base-092ba053 function restores + catalog fingerprints.
-- Base lineage commit: 092ba053d8a0ede536b619c0ff01c39a5ca9ba0a
--
-- Distinguishes:
--   A) Operational cleanup  — close executions, CAS-restore assignees, disable bindings,
--      preserve TEST_ONLY requests + append-only audit evidence.
--   B) Package decommission — restore pre-package production function bodies,
--      revoke operational entry points, fail-closed on fingerprint / open-state drift.
--
-- Never touches: request_processing_assignments rows, 19 fixtures, student_visible,
-- enrollment_certificate content, or append-only audit evidence.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fingerprint helper (session-local; dropped before COMMIT)
-- Catalog-derived: pg_get_functiondef + owner + prosecdef + volatility +
-- strictness + parallel + proconfig + ACL + identity arguments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.b1_e2e_88_fn_fingerprint(p_identity text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fp$
DECLARE
  v_oid oid;
  v_def text;
  v_owner text;
  v_acl text;
  v_vol "char";
  v_strict boolean;
  v_parallel "char";
  v_sec boolean;
  v_config text;
  v_args text;
BEGIN
  IF to_regprocedure(p_identity) IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_FP_IDENTITY_AMBIGUOUS_OR_MISSING:%', p_identity;
  END IF;
  v_oid := to_regprocedure(p_identity);

  SELECT
    regexp_replace(pg_get_functiondef(p.oid), E'[\n\r\t ]+', ' ', 'g'),
    pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.provolatile,
    p.proisstrict,
    p.proparallel,
    coalesce(array_to_string(p.proconfig, ','), ''),
    pg_get_function_identity_arguments(p.oid),
    (
      SELECT coalesce(
        string_agg(grantee::regrole::text || '=' || privilege_type, ',' ORDER BY 1),
        ''
      )
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    )
  INTO v_def, v_owner, v_sec, v_vol, v_strict, v_parallel, v_config, v_args, v_acl
  FROM pg_proc p
  WHERE p.oid = v_oid;

  RETURN md5(
    v_def || '|' || v_owner || '|' || v_sec::text || '|' || v_vol::text || '|' ||
    v_strict::text || '|' || v_parallel::text || '|' || v_config || '|' ||
    v_acl || '|' || v_args
  );
END;
$fp$;

CREATE OR REPLACE FUNCTION pg_temp.b1_e2e_88_rpa_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
AS $r$
  SELECT md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), ''))
  FROM (
    SELECT
      id::text || ':' ||
      unit_id::text || ':' ||
      role_id::text || ':' ||
      assignment_type || ':' ||
      coalesce(user_id::text, '') || ':' ||
      coalesce(staff_profile_id::text, '') || ':' ||
      coalesce(faculty_profile_id::text, '') || ':' ||
      coalesce(position_assignment_id::text, '') || ':' ||
      coalesce(department_id::text, '') || ':' ||
      is_active::text || ':' ||
      coalesce(starts_at::text, '') || ':' ||
      coalesce(ends_at::text, '') AS row_text
    FROM public.request_processing_assignments
  ) q;
$r$;

-- ---------------------------------------------------------------------------
-- 1) Read-only preflight + protected fingerprint capture
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE
  v_open bigint;
  v_active bigint;
  v_rpa text;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
BEGIN
  IF to_regprocedure('public.cleanup_b1_e2e_88_package(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_RPC_MISSING';
  END IF;

  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL AND expires_at > now();

  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  SELECT pg_temp.b1_e2e_88_rpa_fingerprint() INTO v_rpa;
  PERFORM set_config('b1.e2e_88_rpa_fp', v_rpa, true);

  SELECT count(*) INTO v_fix
  FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_five FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types WHERE code = 'enrollment_certificate';

  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;

  RAISE NOTICE 'B1_E2E_88_CLEANUP_PREFLIGHT open=% active=% rpa_fp=%', v_open, v_active, v_rpa;
END;
$pre$;

-- ---------------------------------------------------------------------------
-- A) Operational cleanup (CAS-validated)
-- ---------------------------------------------------------------------------
SELECT public.cleanup_b1_e2e_88_package(NULL, true);

DO $assert_ops$
DECLARE
  v_open bigint;
  v_active bigint;
  v_rpa text;
  v_rpa_expect text;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
  v_audit bigint;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;

  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  IF v_open <> 0 OR v_active <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_STILL_ACTIVE open=% active=%', v_open, v_active;
  END IF;

  v_rpa_expect := current_setting('b1.e2e_88_rpa_fp', true);
  v_rpa := pg_temp.b1_e2e_88_rpa_fingerprint();
  IF v_rpa IS DISTINCT FROM v_rpa_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_RPA_FINGERPRINT_DRIFT';
  END IF;

  SELECT count(*) INTO v_fix
  FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_five FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types WHERE code = 'enrollment_certificate';

  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;

  SELECT count(*) INTO v_audit FROM public.b1_e2e_88_audit_events;
  RAISE NOTICE 'B1_E2E_88_OPS_CLEANUP_OK fixtures=% audit_rows=%', v_fix, v_audit;
END;
$assert_ops$;

-- ---------------------------------------------------------------------------
-- B) Package decommission
-- ---------------------------------------------------------------------------
DO $decommission_guard$
DECLARE
  v_open bigint;
  v_active bigint;
  v_fp text;
  v_expect text;
BEGIN
  -- 2) Assert no open execution or active binding
  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;
  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  IF v_open <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_REFUSED_OPEN_EXECUTION open=%', v_open;
  END IF;
  IF v_active <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_REFUSED_ACTIVE_BINDING active=%', v_active;
  END IF;

  -- 3) Operational cleanup already completed (asserted above).
  -- 4) Assert current migration-88 function fingerprints (preimage).
  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.create_student_request(text,text,jsonb,text)');
  v_expect := 'ed11125e55df36b154c432c7e28d7285';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH create_student_request got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.user_matches_workflow_runtime_step(uuid)');
  v_expect := '2fba2db758a2edd42b1c440a36a4aa47';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH user_matches_workflow_runtime_step got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.current_user_matches_transfer_department_scope(uuid,text)');
  v_expect := '396eb3a5f12fb7d46018823930d87851';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH current_user_matches_transfer_department_scope got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.can_current_user_act_on_step(uuid,text)');
  v_expect := '586893beacb33c10a1483b38e8d090fd';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH can_current_user_act_on_step got=% want=%', v_fp, v_expect;
  END IF;

  RAISE NOTICE 'B1_E2E_88_DECOMMISSION_PREIMAGE_OK';
END;
$decommission_guard$;

-- 5/6) Restore exact base-092ba053 definitions + ownership/properties/search_path/ACL
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
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'عنوان الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = p_request_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = '22023';
  END IF;

  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير متاح للطالب'
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

REVOKE ALL ON FUNCTION public.create_student_request(text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_request(text, text, jsonb, text)
  TO authenticated;

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

REVOKE ALL ON FUNCTION public.user_matches_workflow_runtime_step(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid)
  TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text)
  TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text)
  TO authenticated;

-- 7) Revoke/drop only E2E operational entry points proven safe to remove.
-- Evidence helpers remain; client execute stays denied. Audit table untouched.
REVOKE ALL ON FUNCTION public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_b1_e2e_88_execution(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_b1_e2e_88_package(uuid,boolean)
  FROM PUBLIC, anon, authenticated;
-- cleanup remains callable only if later re-granted by mandate; service_role revoked
-- here so decommission leaves no operational entry point.

DO $post_verify$
DECLARE
  v_fp text;
  v_expect text;
  v_rpa text;
  v_rpa_expect text;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
  v_audit_before bigint;
  v_audit_after bigint;
  v_open bigint;
  v_active bigint;
BEGIN
  -- 8) Preserve append-only audit evidence (row count must not decrease).
  SELECT count(*) INTO v_audit_after FROM public.b1_e2e_88_audit_events;

  -- 9) Post-verify exact base function fingerprints
  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.create_student_request(text,text,jsonb,text)');
  v_expect := '9c9090f29458975b197b92dc86b0e587';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_BASE_MISMATCH create_student_request got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.user_matches_workflow_runtime_step(uuid)');
  v_expect := 'e25e7e4f6cb759814857abcd509ae49e';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_BASE_MISMATCH user_matches_workflow_runtime_step got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.current_user_matches_transfer_department_scope(uuid,text)');
  v_expect := '4a3c50af92db046b1571eba0e4073f64';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_BASE_MISMATCH current_user_matches_transfer_department_scope got=% want=%', v_fp, v_expect;
  END IF;

  v_fp := pg_temp.b1_e2e_88_fn_fingerprint('public.can_current_user_act_on_step(uuid,text)');
  v_expect := 'f0bf40897b23c49bfee1044b2ce34e3d';
  IF v_fp IS DISTINCT FROM v_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_BASE_MISMATCH can_current_user_act_on_step got=% want=%', v_fp, v_expect;
  END IF;

  -- Restored bodies must not retain E2E authorization branches
  IF position(
       'b1_e2e_88' IN
       pg_get_functiondef('public.create_student_request(text,text,jsonb,text)'::regprocedure)
     ) > 0
     OR position(
       'b1_e2e_88' IN
       pg_get_functiondef('public.can_current_user_act_on_step(uuid,text)'::regprocedure)
     ) > 0
     OR position(
       'b1_e2e_88' IN
       pg_get_functiondef('public.user_matches_workflow_runtime_step(uuid)'::regprocedure)
     ) > 0
     OR position(
       'b1_e2e_88' IN
       pg_get_functiondef('public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure)
     ) > 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_E2E_AUTH_REMAINS';
  END IF;

  -- Entry points revoked
  IF has_function_privilege('service_role', 'public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_ENTRYPOINTS_STILL_EXECUTABLE';
  END IF;

  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;
  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings WHERE active;
  IF v_open <> 0 OR v_active <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_POST_OPEN_STATE open=% active=%', v_open, v_active;
  END IF;

  -- 10) Protected production fingerprints unchanged
  v_rpa_expect := current_setting('b1.e2e_88_rpa_fp', true);
  v_rpa := pg_temp.b1_e2e_88_rpa_fingerprint();
  IF v_rpa IS DISTINCT FROM v_rpa_expect THEN
    RAISE EXCEPTION 'B1_E2E_88_RPA_FINGERPRINT_DRIFT';
  END IF;

  SELECT count(*) INTO v_fix
  FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_five FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types WHERE code = 'enrollment_certificate';

  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;

  RAISE NOTICE 'B1_E2E_88_DECOMMISSION_OK base_fps_restored audit_rows=%', v_audit_after;
END;
$post_verify$;

-- Drop session helpers (pg_temp vanishes with session; explicit for clarity)
DROP FUNCTION IF EXISTS pg_temp.b1_e2e_88_fn_fingerprint(text);
DROP FUNCTION IF EXISTS pg_temp.b1_e2e_88_rpa_fingerprint();

COMMIT;
