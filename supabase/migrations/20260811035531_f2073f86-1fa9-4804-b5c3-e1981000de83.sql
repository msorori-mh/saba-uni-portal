CREATE OR REPLACE FUNCTION public.graduate_register_for_event(p_event_id uuid, p_graduate_record_id uuid, p_consent_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_registration_id uuid;
  v_open boolean;
  v_matches boolean;
  v_consent_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);

  SELECT (e.state = 'published' AND e.starts_at > now()) INTO v_open
  FROM public.graduate_events e
  WHERE e.id = p_event_id;
  IF v_open IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_EVENT_NOT_OPEN';
  END IF;

  SELECT public.graduate_audience_matches(e.audience_scope, r.program_id, r.department_id) INTO v_matches
  FROM public.graduate_events e
  JOIN public.graduate_records r ON r.id = p_graduate_record_id
  WHERE e.id = p_event_id;
  IF v_matches IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_EVENT_AUDIENCE_DENIED';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.graduate_consents c
    WHERE c.id = p_consent_id
      AND c.graduate_record_id = p_graduate_record_id
      AND c.purpose_code = 'events'
      AND c.consent_state = 'granted'
  ) INTO v_consent_ok;
  IF NOT v_consent_ok THEN
    RAISE EXCEPTION 'GRADUATE_EVENT_CONSENT_INVALID';
  END IF;

  INSERT INTO public.graduate_event_registrations (
    event_id, graduate_record_id, consent_id
  ) VALUES (
    p_event_id, p_graduate_record_id, p_consent_id
  )
  RETURNING id INTO v_registration_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_event_registration_created', 'graduate_event_registration', v_registration_id,
    'event_participation', jsonb_build_object('graduate_record_id', p_graduate_record_id));
  RETURN v_registration_id;
END;
$function$;