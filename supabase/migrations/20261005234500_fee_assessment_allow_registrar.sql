-- Owner rule: the college registrar sets the fee for any student service.
-- Functions only; no data / workflow configuration changes.
-- Role gate now accepts registrar_general (keeps student_affairs_manager for
-- in-flight requests). assess_student_request_fee still requires the caller to
-- match the ACTIVE assess_fee runtime step (user_matches_workflow_runtime_step).
CREATE OR REPLACE FUNCTION public.assert_can_assess_student_request_fee()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000'; END IF;
  IF public.is_current_user_admin_actor() THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.current_user_processing_assignments() a
             WHERE a.role_code IN ('student_affairs_manager', 'registrar_general'))
    OR public.has_any_role(auth.uid(), ARRAY['student_affairs_manager', 'registrar']::text[]) THEN RETURN; END IF;
  RAISE EXCEPTION 'غير مصرح بتقييم الرسوم' USING ERRCODE = '42501';
END;
$function$;
