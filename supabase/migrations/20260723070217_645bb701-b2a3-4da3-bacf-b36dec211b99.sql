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

CREATE OR REPLACE FUNCTION public.is_current_user_dean_for_student(p_student_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_student_profile_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = p_student_profile_id
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments rpa
    JOIN public.request_processing_roles rpr ON rpr.id = rpa.role_id
    JOIN public.request_processing_units rpu ON rpu.id = rpa.unit_id
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   >  now())
      AND rpr.code = 'dean'
      AND rpu.code = 'dean'
      AND (
        (rpa.assignment_type = 'user'
          AND rpa.user_id IS NOT NULL
          AND rpa.user_id = v_uid)
        OR
        (rpa.assignment_type = 'staff_profile'
          AND rpa.staff_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.staff_profiles sp2
            WHERE sp2.id = rpa.staff_profile_id AND sp2.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'faculty_profile'
          AND rpa.faculty_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.faculty_profiles fp2
            WHERE fp2.id = rpa.faculty_profile_id AND fp2.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'position_assignment'
          AND rpa.position_assignment_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.position_assignments pa2
            WHERE pa2.id = rpa.position_assignment_id
              AND pa2.user_id = v_uid
              AND pa2.is_active = true
              AND (pa2.assigned_to IS NULL OR pa2.assigned_to >= CURRENT_DATE)
          ))
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_request_actor_inbox(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  workflow_step_runtime_id uuid, student_request_id uuid,
  request_type_code text, request_type_name_ar text,
  student_id uuid, student_name text,
  department_id uuid, department_name_ar text,
  step_key text, step_name_ar text, step_status text,
  processing_unit_id uuid, processing_unit_name_ar text,
  processing_role_id uuid, processing_role_name_ar text,
  submitted_at timestamp with time zone, is_actionable boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_safe_limit integer;
  v_safe_offset integer;
  v_status_filter text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  v_safe_limit  := GREATEST(LEAST(COALESCE(p_limit,  50), 200), 1);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_filters ? 'status' THEN
    SELECT array_agg(x::text) INTO v_status_filter
    FROM jsonb_array_elements_text(p_filters -> 'status') AS x;
  ELSE
    v_status_filter := ARRAY['pending', 'active'];
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    sr.id,
    sr.request_type,
    rt.name_ar,
    sp.id,
    sp.full_name_ar,
    sp.department_id,
    d.name_ar,
    s.step_key,
    s.step_name_ar,
    s.status,
    s.processing_unit_id,
    rpu.name_ar,
    s.processing_role_id,
    rpr.name_ar,
    sr.submitted_at,
    (
      s.status = 'active'
      AND public.can_current_user_act_on_step(s.id, 'approve')
    ) AS is_actionable
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests sr ON sr.id = s.student_request_id
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
  LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
  WHERE s.status = ANY(v_status_filter)
    AND public.user_matches_workflow_runtime_step(s.id)
    AND (NOT (p_filters ? 'processing_unit_code') OR rpu.code = p_filters ->> 'processing_unit_code')
    AND (NOT (p_filters ? 'request_type_code')    OR sr.request_type = p_filters ->> 'request_type_code')
    AND (NOT (p_filters ? 'department_id')         OR sp.department_id::text = p_filters ->> 'department_id')
    AND (
      NOT (p_filters ? 'search')
      OR sr.request_number ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.full_name_ar    ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.academic_number ILIKE '%' || (p_filters ->> 'search') || '%'
    )
  ORDER BY COALESCE(sr.submitted_at, s.created_at) DESC, s.step_order ASC
  LIMIT v_safe_limit
  OFFSET v_safe_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(
  p_unit_id uuid, p_role_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = rpa.staff_profile_id AND sp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'faculty_profile' AND EXISTS (
          SELECT 1 FROM public.faculty_profiles fp
          WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid, p_step_key text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.faculty_profiles fp ON fp.id = s.assigned_faculty_profile_id
      AND fp.user_id = auth.uid()
    WHERE s.id = p_step_id
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_position_assignment_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval'
          AND fp.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval'
          AND fp.department_id = d.requested_department_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_b1_runtime_step_contract(
  p_request_type text, p_step_key text, p_unit_code text,
  p_role_code text, p_action_type text
)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
    ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
    ('enrollment_suspension','manager_approval','student_affairs','student_affairs_manager','approve'),
    ('enrollment_suspension','registrar_apply','registrar','registrar_general','apply_decision'),
    ('excused_absence','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('excused_absence','manager_review','student_affairs','student_affairs_manager','approve'),
    ('excused_absence','record_apply','student_affairs','student_affairs_specialist','apply_decision'),
    ('file_withdrawal','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('file_withdrawal','library_clearance','library','library_officer','clear'),
    ('file_withdrawal','labs_clearance','labs','labs_manager','clear'),
    ('file_withdrawal','activities_clearance','student_affairs','student_affairs_manager','clear'),
    ('file_withdrawal','finance_clearance','finance','revenue_finance_officer','clear'),
    ('file_withdrawal','registrar_apply','registrar','registrar_general','apply_decision'),
    ('file_withdrawal','archive','archive','archive_officer','archive'),
    ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','source_department_head_approval','department','department_head','approve'),
    ('department_transfer','target_department_head_approval','department','department_head','approve'),
    ('department_transfer','dean_approval','dean','dean','approve'),
    ('department_transfer','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('department_transfer','registrar_apply','registrar','registrar_general','apply_decision'),
    ('final_chance','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('final_chance','manager_review','student_affairs','student_affairs_manager','approve'),
    ('final_chance','dean_decision','dean','dean','approve'),
    ('final_chance','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('final_chance','registrar_apply','registrar','registrar_general','apply_decision')
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_valid_actor_request_action(p_action) THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  v_is_b1 := v_request_type IN (
    'enrollment_suspension',
    'excused_absence', 'absence_excuse',
    'department_transfer', 'transfer',
    'final_chance', 'extra_chance',
    'file_withdrawal'
  );
  v_canonical_request_type := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  IF v_is_b1 AND (
    v_step.status IS DISTINCT FROM 'active'
    OR num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    ) IS DISTINCT FROM 1
  ) THEN
    RETURN false;
  END IF;

  IF public.is_owner_of_request(v_uid, v_step.student_request_id) THEN
    RETURN false;
  END IF;

  IF v_step.status NOT IN ('active', 'pending') THEN
    IF p_action = 'comment' AND v_step.status = 'completed' THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    RETURN false;
  END IF;

  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN
    RETURN false;
  END IF;

  IF v_is_b1 AND NOT public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id, v_step.processing_role_id
  ) THEN
    RETURN false;
  END IF;

  IF v_canonical_request_type = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval')
     AND NOT public.current_user_matches_transfer_department_scope(p_step_id, v_step.step_key) THEN
    RETURN false;
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  IF v_is_b1 THEN
    SELECT u.code, pr.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
    WHERE u.id = v_step.processing_unit_id;
    IF NOT public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type, v_step.step_key, v_unit_code,
      v_role_code, v_config.action_type
    ) OR v_config.action_type IS DISTINCT FROM p_action THEN
      RETURN false;
    END IF;
  END IF;

  IF p_action = 'skip' THEN
    IF v_config.id IS NULL OR NOT COALESCE(v_config.can_skip, false) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_action = 'reject' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_reject, true) THEN
    RETURN false;
  END IF;

  IF p_action = 'return' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_return_to_student, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;