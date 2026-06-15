
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'successRate', COALESCE((
      SELECT round((100.0 * count(*) FILTER (WHERE percentage >= 60)) / NULLIF(count(*), 0), 1)
      FROM public.student_course_grade_summary
    ), 0),
    'totalFees', COALESCE((SELECT sum(amount) FROM public.student_fees), 0),
    'totalPaid', COALESCE((SELECT sum(amount) FROM public.student_payments), 0),
    'outstanding', GREATEST(
      0,
      COALESCE((SELECT sum(amount) FROM public.student_fees), 0)
      - COALESCE((SELECT sum(amount) FROM public.student_payments), 0)
    ),
    'openRequests', (
      SELECT count(*) FROM public.student_requests
      WHERE status IN ('submitted', 'under_review')
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() TO authenticated;
