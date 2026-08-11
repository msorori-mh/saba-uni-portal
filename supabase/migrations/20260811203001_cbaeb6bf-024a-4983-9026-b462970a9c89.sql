CREATE OR REPLACE FUNCTION public.get_student_request_eligibility_context(p_student_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base jsonb;
  v_open jsonb;
BEGIN
  v_base := public.get_student_request_eligibility_context_v1(p_student_profile_id);

  SELECT COALESCE(jsonb_agg(DISTINCT rt.code), '[]'::jsonb)
  INTO v_open
  FROM public.student_requests sr
  JOIN public.request_types rt ON rt.id = sr.request_type_id
  WHERE sr.student_profile_id = p_student_profile_id
    AND sr.status NOT IN ('completed','rejected','cancelled','archived','withdrawn');

  RETURN v_base || jsonb_build_object('open_request_type_codes', v_open);
END;
$function$;