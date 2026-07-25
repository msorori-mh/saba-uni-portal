-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 16 / POST_VERIFIER
-- Draft: B1-FREE-SERVICE-WORKFLOWS-08.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM public.request_type_workflows WHERE code LIKE ''%free_workflow%'' AND status=''draft'' AND is_active=false)', (EXISTS (SELECT 1 FROM public.request_type_workflows WHERE code LIKE '%free_workflow%' AND status='draft' AND is_active=false))
  UNION ALL SELECT 'CHECK_02', 'NOT EXISTS (SELECT 1 FROM public.request_type_workflows w JOIN public.request_type_workflow_steps s ON s.workflow_id=w.id WHERE w.code LIKE ''%free_workflow%'' AND s.action_type=''confirm_payment'')', (NOT EXISTS (SELECT 1 FROM public.request_type_workflows w JOIN public.request_type_workflow_steps s ON s.workflow_id=w.id WHERE w.code LIKE '%free_workflow%' AND s.action_type='confirm_payment'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM public.request_type_workflows WHERE code LIKE ''%free_workflow%'' AND status=''draft'' AND is_active=false)', (EXISTS (SELECT 1 FROM public.request_type_workflows WHERE code LIKE '%free_workflow%' AND status='draft' AND is_active=false))
        UNION ALL SELECT 'CHECK_02', 'NOT EXISTS (SELECT 1 FROM public.request_type_workflows w JOIN public.request_type_workflow_steps s ON s.workflow_id=w.id WHERE w.code LIKE ''%free_workflow%'' AND s.action_type=''confirm_payment'')', (NOT EXISTS (SELECT 1 FROM public.request_type_workflows w JOIN public.request_type_workflow_steps s ON s.workflow_id=w.id WHERE w.code LIKE '%free_workflow%' AND s.action_type='confirm_payment'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_16_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
