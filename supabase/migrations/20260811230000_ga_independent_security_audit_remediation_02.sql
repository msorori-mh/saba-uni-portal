-- FORWARD-ONLY REMEDIATION MIGRATION — SOURCE ONLY — DO NOT APPLY TO PRODUCTION
-- Mission: PORTAL-GA-INDEPENDENT-SECURITY-AUDIT-FINDINGS-REMEDIATION-02
-- Findings: H-02 event registration audience bypass, M-04 survey arbitrary
--   answers JSON, M-05 ambiguous approved graduate record self context.
-- Precondition: 20260808210200_ga_authorization_04.sql applied.
-- No rewrite of prior migrations. Pinned search_path. No broad EXECUTE.
-- No admin/dean/registrar bypass.

begin;

do $$ begin
  -- This remediation patches functions introduced by AUTH-04; the bundle must
  -- already be present.
  if to_regclass('public.graduate_events') is null then
    raise exception 'GA_REMEDIATION_02_PREFLIGHT_MISSING: graduate_events (AUTH-04) required';
  end if;
  if to_regclass('public.graduate_survey_versions') is null then
    raise exception 'GA_REMEDIATION_02_PREFLIGHT_MISSING: graduate_survey_versions (AUTH-04) required';
  end if;
  if to_regprocedure('public.graduate_register_for_event(uuid,uuid,uuid)') is null then
    raise exception 'GA_REMEDIATION_02_PREFLIGHT_MISSING: graduate_register_for_event (AUTH-04) required';
  end if;
  if to_regprocedure('public.graduate_submit_survey_response(uuid,uuid,uuid,jsonb)') is null then
    raise exception 'GA_REMEDIATION_02_PREFLIGHT_MISSING: graduate_submit_survey_response (AUTH-04) required';
  end if;
  if to_regprocedure('public.graduate_affairs_resolve_self_context(text)') is null then
    raise exception 'GA_REMEDIATION_02_PREFLIGHT_MISSING: graduate_affairs_resolve_self_context (AUTH-04) required';
  end if;
end $$;

-- =====================================================================
-- H-02: graduate_register_for_event must enforce the same audience
-- boundary used by graduate_list_visible_events.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.graduate_register_for_event(
  p_event_id uuid,
  p_graduate_record_id uuid,
  p_consent_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_registration_id uuid;
  v_open boolean;
  v_matches boolean;
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

  -- H-02: direct RPC must match the canonical audience predicate used by the
  -- listing RPC and the RLS policy. Hidden, unpublished, or out-of-audience
  -- events result in zero insert.
  SELECT public.graduate_audience_matches(e.audience_scope, r.program_id, r.department_id) INTO v_matches
  FROM public.graduate_events e
  JOIN public.graduate_records r ON r.id = p_graduate_record_id
  WHERE e.id = p_event_id;
  IF v_matches IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_EVENT_AUDIENCE_DENIED';
  END IF;

  -- Foundation trigger enforces the consent binding.
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
$$;

-- =====================================================================
-- M-04: canonical server-side survey answer validator.
-- =====================================================================

-- Validates p_answers against the exact question contract of one survey
-- version. Fail-closed: any deviation raises. No mutation occurs here.
CREATE OR REPLACE FUNCTION public.graduate_validate_survey_answers(
  p_questions jsonb,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_question jsonb;
  v_key text;
  v_kind text;
  v_required boolean;
  v_options jsonb;
  v_max_length integer;
  v_value jsonb;
  v_value_text text;
  v_answered boolean;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'GRADUATE_SURVEY_ANSWERS_INVALID';
  END IF;

  -- First pass: validate every question contract and the answer shape/type.
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    IF jsonb_typeof(v_question) IS DISTINCT FROM 'object' THEN
      CONTINUE;
    END IF;

    v_key := v_question->>'key';
    v_kind := v_question->>'kind';
    v_required := COALESCE((v_question->>'required')::boolean, false);
    v_options := v_question->'options';
    v_max_length := COALESCE((v_question->>'maxLength')::integer, 2000);

    IF v_key IS NULL OR btrim(v_key) = '' THEN
      CONTINUE;
    END IF;

    v_value := p_answers->v_key;

    -- "Answered" means a non-null, non-empty-string value.
    v_answered := v_value IS NOT NULL
                  AND jsonb_typeof(v_value) IS DISTINCT FROM 'null'
                  AND NOT (jsonb_typeof(v_value) = 'string' AND v_value#>>'{}' = '');

    IF NOT v_answered THEN
      IF v_required THEN
        RAISE EXCEPTION 'GRADUATE_SURVEY_REQUIRED_MISSING:%', v_key;
      END IF;
      CONTINUE;
    END IF;

    IF v_kind = 'single_choice' THEN
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'GRADUATE_SURVEY_WRONG_TYPE:%', v_key;
      END IF;
      v_value_text := v_value#>>'{}';
      IF v_options IS NULL
         OR jsonb_typeof(v_options) IS DISTINCT FROM 'array'
         OR NOT (v_options ? v_value_text) THEN
        RAISE EXCEPTION 'GRADUATE_SURVEY_INVALID_OPTION:%', v_key;
      END IF;
    ELSIF v_kind = 'free_text' THEN
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'GRADUATE_SURVEY_WRONG_TYPE:%', v_key;
      END IF;
      v_value_text := v_value#>>'{}';
      IF length(v_value_text) > v_max_length THEN
        RAISE EXCEPTION 'GRADUATE_SURVEY_FREE_TEXT_TOO_LONG:%', v_key;
      END IF;
    END IF;
  END LOOP;

  -- Second pass: every answer key must correspond to a known question.
  FOR v_key IN SELECT jsonb_object_keys(p_answers)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_questions) q
      WHERE jsonb_typeof(q) = 'object' AND (q->>'key') = v_key
    ) THEN
      RAISE EXCEPTION 'GRADUATE_SURVEY_UNKNOWN_KEY:%', v_key;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_submit_survey_response(
  p_survey_version_id uuid,
  p_graduate_record_id uuid,
  p_consent_id uuid,
  p_answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_response_id uuid;
  v_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);

  SELECT (s.state = 'active' AND sv.published_at IS NOT NULL) INTO v_active
  FROM public.graduate_survey_versions sv
  JOIN public.graduate_surveys s ON s.id = sv.survey_id
  WHERE sv.id = p_survey_version_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_SURVEY_NOT_ACTIVE';
  END IF;

  -- M-04: server-authoritative validation against the exact version contract.
  PERFORM public.graduate_validate_survey_answers(
    (SELECT questions FROM public.graduate_survey_versions WHERE id = p_survey_version_id),
    COALESCE(p_answers, '{}'::jsonb)
  );

  -- Foundation trigger enforces the consent binding (purpose + notice +
  -- granted + not withdrawn) before the row is accepted.
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
$$;

-- =====================================================================
-- M-05: resolve_self_context must fail closed when the approved graduate
-- record is ambiguous (zero or >1 approved records -> no self mutation).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.graduate_affairs_resolve_self_context(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record_count integer;
  v_record_id uuid;
  v_record_state public.graduate_decision_state;
  v_continuity boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF p_capability IS NULL OR btrim(p_capability) = '' THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_INVALID_INPUT';
  END IF;

  -- M-05: exactly one approved record is allowed. Ambiguity (including the
  -- previously silent "newest" selection) is treated as absent for self
  -- mutation purposes.
  SELECT count(*),
         (array_agg(r.id))[1],
         (array_agg(r.record_state))[1]
    INTO v_record_count, v_record_id, v_record_state
  FROM public.graduate_records r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE sp.user_id = auth.uid()
    AND r.record_state = 'approved';

  IF v_record_count = 1 THEN
    v_continuity := public.evaluate_graduate_account_continuity(
      'graduate-account-continuity', p_capability, now());
  ELSE
    v_record_id := NULL;
    v_continuity := false;
  END IF;

  RETURN jsonb_build_object(
    'owns_graduate_record', v_record_count = 1,
    'graduate_record_id', v_record_id,
    'graduate_record_state', CASE WHEN v_record_count = 1 THEN v_record_state::text ELSE 'absent' END,
    'continuity_allowed', COALESCE(v_continuity, false),
    'capability', p_capability
  );
END;
$$;

-- =====================================================================
-- Privileges: validator is internal; never executable by clients.
-- =====================================================================

REVOKE ALL ON FUNCTION public.graduate_validate_survey_answers(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

commit;
