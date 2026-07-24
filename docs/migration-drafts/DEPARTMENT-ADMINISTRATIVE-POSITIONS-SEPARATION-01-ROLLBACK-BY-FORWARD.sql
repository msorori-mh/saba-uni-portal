-- DRAFT SAFE-DISABLE-BY-FORWARD ONLY.
-- This does not restore the semantically invalid faculty-profile chair model.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  'DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01',0
));
LOCK TABLE public.position_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.request_processing_assignments IN SHARE ROW EXCLUSIVE MODE;

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

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT false
$$;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  TO authenticated,service_role;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.position_assignments pa
    JOIN public.organizational_positions op ON op.id=pa.position_id
    WHERE pa.is_active AND pa.notes='DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01'
      AND op.code IN ('cs_department_head','it_department_head','is_department_head'))
    OR public.current_user_matches_transfer_department_scope(gen_random_uuid(),'source_department_head_approval')
  THEN RAISE EXCEPTION 'SAFE_DISABLE_DID_NOT_FAIL_CLOSED'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_types
    WHERE code IN ('department_transfer','transfer') AND (student_visible OR is_active))
  THEN RAISE EXCEPTION 'DEPARTMENT_TRANSFER_MUST_REMAIN_HIDDEN_INACTIVE'; END IF;
END $$;
COMMIT;
