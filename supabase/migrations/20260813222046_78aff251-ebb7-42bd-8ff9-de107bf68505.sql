BEGIN;

REVOKE SELECT ON public.course_session_executions FROM authenticated;

GRANT SELECT (
  id,
  plan_session_id,
  status,
  execution_date,
  compensation_date,
  recorded_at
) ON public.course_session_executions TO authenticated;

GRANT ALL ON public.course_session_executions TO service_role;

COMMIT;