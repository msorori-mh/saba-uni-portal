UPDATE public.request_processing_assignments a
SET is_active = s.is_active, updated_at = now()
FROM public.b1_e2e_assignment_snapshot s
WHERE s.tag = 'TEST_ONLY_FIRST_DELIVERY_5_SERVICES'
  AND a.id = s.assignment_id
  AND a.is_active IS DISTINCT FROM s.is_active;

UPDATE public.request_processing_assignments
SET is_active = false, updated_at = now()
WHERE id::text LIKE 'cc0000%' AND is_active = true;