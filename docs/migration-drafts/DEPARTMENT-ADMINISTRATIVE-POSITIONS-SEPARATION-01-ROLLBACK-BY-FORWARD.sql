-- DRAFT ONLY. Forward correction; no DELETE and no faculty affiliation changes.
BEGIN;
UPDATE public.request_processing_assignments
SET is_active=false,ends_at=COALESCE(ends_at,now()),updated_at=now()
WHERE assignment_type='position_assignment' AND is_active
  AND department_id IN ('11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
  '22222222-2222-4222-8222-222222222222')
  AND position_assignment_id IN (
    SELECT pa.id FROM public.position_assignments pa
    JOIN public.organizational_positions op ON op.id=pa.position_id
    WHERE op.code IN ('cs_department_head','it_department_head','is_department_head'));
UPDATE public.position_assignments
SET is_active=false,assigned_to=COALESCE(assigned_to,CURRENT_DATE),updated_at=now()
WHERE is_active AND position_id IN (
  SELECT id FROM public.organizational_positions
  WHERE code IN ('cs_department_head','it_department_head','is_department_head'));
COMMIT;
