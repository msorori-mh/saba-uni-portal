\set ON_ERROR_STOP on
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments rpa
    JOIN public.position_assignments pa ON pa.id=rpa.position_assignment_id
    JOIN public.organizational_positions op ON op.id=pa.position_id
    WHERE rpa.is_active AND rpa.assignment_type='position_assignment'
      AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01'
      AND op.code IN ('cs_department_head','it_department_head','is_department_head'))
  THEN RAISE EXCEPTION 'SAFE_DISABLE_ACTIVE_CHAIR_PROCESSING_ASSIGNMENT_REMAINS'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_types
    WHERE code IN ('department_transfer','transfer') AND student_visible)
  THEN RAISE EXCEPTION 'SAFE_DISABLE_TRANSFER_REQUEST_TYPE_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id=w.request_type_id
    WHERE rt.code IN ('department_transfer','transfer')
      AND w.status='active' AND w.is_active)
  THEN RAISE EXCEPTION 'SAFE_DISABLE_ACTIVE_TRANSFER_WORKFLOW_EXISTS'; END IF;
  IF EXISTS(SELECT 1 FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id=s.student_request_id
    WHERE r.request_type IN ('department_transfer','transfer')
      AND s.status IN ('active','pending'))
  THEN RAISE EXCEPTION 'SAFE_DISABLE_EXECUTABLE_TRANSFER_RUNTIME_EXISTS'; END IF;
  IF public.current_user_matches_transfer_department_scope(
    gen_random_uuid(),'source_department_head_approval')
  THEN RAISE EXCEPTION 'SAFE_DISABLE_AUTHORIZATION_FUNCTION_NOT_FAIL_CLOSED'; END IF;
END $$;
