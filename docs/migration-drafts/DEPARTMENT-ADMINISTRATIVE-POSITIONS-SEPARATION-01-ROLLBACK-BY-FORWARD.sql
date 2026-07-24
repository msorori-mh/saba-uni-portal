-- DRAFT SAFE-DISABLE-BY-FORWARD ONLY.
-- This does not restore the semantically invalid faculty-profile chair model.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  'DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01',0
));
LOCK TABLE public.position_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.request_processing_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.request_types IN SHARE MODE;
LOCK TABLE public.request_type_workflows IN SHARE MODE;
LOCK TABLE public.student_requests IN SHARE MODE;
LOCK TABLE public.student_request_workflow_steps IN SHARE MODE;

UPDATE public.request_processing_assignments a
SET is_active=false,ends_at=COALESCE(a.ends_at,now()),updated_at=now()
FROM public.position_assignments pa
JOIN public.organizational_positions op ON op.id=pa.position_id
WHERE a.position_assignment_id=pa.id AND a.assignment_type='position_assignment'
  AND a.is_active
  AND op.code IN ('cs_department_head','it_department_head','is_department_head')
  AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01';
UPDATE public.position_assignments pa
SET is_active=false,assigned_to=COALESCE(pa.assigned_to,CURRENT_DATE),updated_at=now()
FROM public.organizational_positions op
WHERE op.id=pa.position_id AND pa.is_active
  AND op.code IN ('cs_department_head','it_department_head','is_department_head')
  AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01';

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,p_step_key text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT false
$$;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  TO authenticated,service_role;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments rpa
    JOIN public.position_assignments pa ON pa.id=rpa.position_assignment_id
    JOIN public.organizational_positions op ON op.id=pa.position_id
    WHERE rpa.is_active AND rpa.assignment_type='position_assignment'
      AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01'
      AND op.code IN ('cs_department_head','it_department_head','is_department_head'))
  THEN RAISE EXCEPTION 'SAFE_DISABLE_ACTIVE_CHAIR_PROCESSING_ASSIGNMENT_REMAINS'; END IF;
  IF EXISTS(SELECT 1 FROM public.position_assignments pa
    JOIN public.organizational_positions op ON op.id=pa.position_id
    WHERE pa.is_active AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01'
      AND op.code IN ('cs_department_head','it_department_head','is_department_head'))
  THEN RAISE EXCEPTION 'SAFE_DISABLE_ACTIVE_CHAIR_POSITION_ASSIGNMENT_REMAINS'; END IF;
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
COMMIT;
