INSERT INTO public.request_eligibility_rule_catalog(code,name_ar,description_ar,param_schema,default_message_ar,sort_order) VALUES
('MIN_ACADEMIC_LEVEL','الحد الأدنى للمستوى الدراسي','يشترط أن يكون مستوى الطالب الحالي مساويًا أو أعلى من القيمة المحددة.','{"min":"integer"}','لا يحق تقديم الطلب قبل بلوغ المستوى الدراسي المطلوب.',10),
('ENROLLMENT_STATUS_IN','حالة القيد المسموحة','يشترط أن تكون حالة قيد الطالب ضمن القيم المحددة.','{"values":"text[]"}','حالة القيد الحالية لا تسمح بتقديم هذا الطلب.',11),
('PROFILE_STATUS_IN','حالة الملف المسموحة','يشترط أن تكون حالة ملف الطالب ضمن القيم المحددة.','{"values":"text[]"}','حالة ملف الطالب لا تسمح بتقديم هذا الطلب.',12),
('NO_OPEN_REQUEST_SAME_TYPE','منع الطلب المكرر','لا يسمح بتقديم طلب جديد أثناء وجود طلب قائم لنفس الخدمة.','{}','لديك طلب قائم لنفس الخدمة قيد المعالجة.',13),
('REQUEST_WITHIN_DATE_WINDOW','فترة التقديم النظامية','يسمح بتقديم الطلب داخل فترة محددة بتاريخ بداية ونهاية.','{"start_date":"date","end_date":"date"}','التقديم على هذه الخدمة خارج الفترة النظامية المسموحة.',14)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_request_eligibility_rules(p_request_type_code text, p_context jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reasons text[] := ARRAY[]::text[];
  r RECORD;
  v_ok boolean;
BEGIN
  FOR r IN
    SELECT er.rule_code, er.params, er.message_ar
    FROM public.request_type_eligibility_rules er
    JOIN public.request_types rt ON rt.id = er.request_type_id
    JOIN public.request_eligibility_rule_catalog c ON c.code = er.rule_code
    WHERE rt.code = p_request_type_code
      AND er.is_active = true
      AND c.is_active = true
    ORDER BY er.sort_order, er.created_at
  LOOP
    v_ok := true;

    CASE r.rule_code
      WHEN 'STUDENT_STUDY_STATUS_IN' THEN
        v_ok := COALESCE(p_context->>'student_study_status', '') IN (
          SELECT jsonb_array_elements_text(COALESCE(r.params->'values', '[]'::jsonb))
        );

      WHEN 'MIN_COMPLETED_ACADEMIC_YEARS' THEN
        v_ok := COALESCE((p_context->>'completed_academic_years_count')::integer, 0)
                >= COALESCE((r.params->>'min')::integer, 1);

      WHEN 'MAX_CONSECUTIVE_SUSPENSION_YEARS' THEN
        v_ok := COALESCE((p_context->>'consecutive_suspension_years_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'MAX_SUSPENSION_SEMESTERS' THEN
        v_ok := COALESCE((p_context->>'previous_suspension_semesters_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'NOT_TRANSFERRED_CURRENT_YEAR' THEN
        v_ok := NOT COALESCE((p_context->>'transferred_current_year')::boolean, false);

      WHEN 'MIN_ACADEMIC_LEVEL' THEN
        v_ok := COALESCE((p_context->>'current_level_number')::integer, 0)
                >= COALESCE((r.params->>'min')::integer, 1);

      WHEN 'ENROLLMENT_STATUS_IN' THEN
        v_ok := COALESCE(p_context->>'current_enrollment_status', '') IN (
          SELECT jsonb_array_elements_text(COALESCE(r.params->'values', '[]'::jsonb))
        );

      WHEN 'PROFILE_STATUS_IN' THEN
        v_ok := COALESCE(p_context->>'profile_status', '') IN (
          SELECT jsonb_array_elements_text(COALESCE(r.params->'values', '[]'::jsonb))
        );

      WHEN 'NO_OPEN_REQUEST_SAME_TYPE' THEN
        v_ok := NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            COALESCE(p_context->'open_request_type_codes', '[]'::jsonb)
          ) AS c(code)
          WHERE c.code = p_request_type_code
        );

      WHEN 'REQUEST_WITHIN_DATE_WINDOW' THEN
        v_ok := (
          (r.params->>'start_date' IS NULL OR CURRENT_DATE >= (r.params->>'start_date')::date)
          AND (r.params->>'end_date' IS NULL OR CURRENT_DATE <= (r.params->>'end_date')::date)
        );

      ELSE
        v_ok := false;
    END CASE;

    IF NOT v_ok THEN
      v_reasons := array_append(v_reasons, r.message_ar);
    END IF;
  END LOOP;

  RETURN v_reasons;
END;
$function$;