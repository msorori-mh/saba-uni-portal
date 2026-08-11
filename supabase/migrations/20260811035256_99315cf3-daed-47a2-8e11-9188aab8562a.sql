-- 1) Self-service listing of active surveys with the caller's matching consent
CREATE OR REPLACE FUNCTION public.graduate_list_self_surveys(p_graduate_record_id uuid)
 RETURNS TABLE(survey_version_id uuid, survey_id uuid, title text, purpose_code text,
               notice_version text, questions jsonb, consent_id uuid, already_responded boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_current_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  RETURN QUERY
  SELECT sv.id, s.id, s.title, s.purpose_code, sv.notice_version, sv.questions,
         (SELECT c.id FROM public.graduate_consents c
           WHERE c.graduate_record_id = p_graduate_record_id
             AND c.purpose_code = s.purpose_code
             AND c.consent_state = 'granted'
           ORDER BY c.affirmative_action_at DESC LIMIT 1),
         EXISTS (SELECT 1 FROM public.graduate_survey_responses rs
                  WHERE rs.survey_version_id = sv.id
                    AND rs.graduate_record_id = p_graduate_record_id
                    AND rs.withdrawn_at IS NULL)
  FROM public.graduate_survey_versions sv
  JOIN public.graduate_surveys s ON s.id = sv.survey_id
  WHERE s.state = 'active'
    AND sv.published_at IS NOT NULL
  ORDER BY sv.published_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.graduate_list_self_surveys(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.graduate_list_self_surveys(uuid) TO authenticated;

-- 2) Self-service listing of consents
CREATE OR REPLACE FUNCTION public.graduate_my_consents(p_graduate_record_id uuid)
 RETURNS TABLE(id uuid, purpose_code text, notice_version text, consent_state text,
               affirmative_action_at timestamptz, withdrawn_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_current_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  RETURN QUERY
  SELECT c.id, c.purpose_code, c.notice_version, c.consent_state,
         c.affirmative_action_at, c.withdrawn_at
  FROM public.graduate_consents c
  WHERE c.graduate_record_id = p_graduate_record_id
  ORDER BY c.affirmative_action_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.graduate_my_consents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.graduate_my_consents(uuid) TO authenticated;

-- 3) Bind survey responses to a valid, matching consent
CREATE OR REPLACE FUNCTION public.graduate_submit_survey_response(p_survey_version_id uuid, p_graduate_record_id uuid, p_consent_id uuid, p_answers jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_response_id uuid;
  v_active boolean;
  v_purpose text;
  v_consent_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);

  SELECT (s.state = 'active' AND sv.published_at IS NOT NULL), s.purpose_code
    INTO v_active, v_purpose
  FROM public.graduate_survey_versions sv
  JOIN public.graduate_surveys s ON s.id = sv.survey_id
  WHERE sv.id = p_survey_version_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_SURVEY_NOT_ACTIVE';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.graduate_consents c
    WHERE c.id = p_consent_id
      AND c.graduate_record_id = p_graduate_record_id
      AND c.purpose_code = v_purpose
      AND c.consent_state = 'granted'
  ) INTO v_consent_ok;
  IF NOT v_consent_ok THEN
    RAISE EXCEPTION 'GRADUATE_SURVEY_CONSENT_INVALID';
  END IF;

  PERFORM public.graduate_validate_survey_answers(
    (SELECT questions FROM public.graduate_survey_versions WHERE id = p_survey_version_id),
    COALESCE(p_answers, '{}'::jsonb)
  );

  INSERT INTO public.graduate_survey_responses (
    survey_version_id, graduate_record_id, consent_id, answers
  ) VALUES (
    p_survey_version_id, p_graduate_record_id, p_consent_id, COALESCE(p_answers, '{}'::jsonb)
  )
  RETURNING id INTO v_response_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_survey_response_submitted', 'graduate_survey_response', v_response_id,
    'survey_participation', jsonb_build_object('graduate_record_id', p_graduate_record_id));
  RETURN v_response_id;
END;
$function$;