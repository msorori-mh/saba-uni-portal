-- DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY.
-- Graduates affairs authorization bundle 04: actor-model resolution helpers,
-- audited self-service and staff RPCs, and the minimal RLS SELECT policies.
-- Review chain: graduates-affairs-authorization-04.pg-setup.sql
-- -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
-- -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql -> this draft
-- -> graduates-affairs-authorization-04.pg-verify.sql.
-- No production activation, no seed data.
--
-- Actor model (fixed; no alternatives):
--   * graduate self: auth.uid() -> student_profiles.user_id
--     -> graduate_records.student_profile_id.
--   * graduates-affairs staff: active row in request_processing_assignments
--     (assignment_type 'user' or 'staff_profile' only) joined to an active
--     'graduate_affairs' unit and an active 'graduate_affairs_manager' or
--     'graduate_affairs_specialist' role. Manager = college scope;
--     specialist = department scope from staff_profile_departments of the
--     resolved staff profile (empty scope set = no access, fail-closed).
--   * staff_profile assignments require staff_profiles.user_id = auth.uid()
--     AND staff_profiles.status = 'active'. Inactive/suspended profiles lose
--     all Graduate Affairs authority immediately.
--   * specialist department scope is caller-owned only (never the union of
--     other specialists' staff_profile_departments).
--   * direct case assignee: graduate_followups row with
--     assignee_user_id = auth.uid() and state IN ('open','in_progress'),
--     AND the assignee still holds an active Graduate Affairs staff
--     capability. Revoked/expired assignment or inactive staff profile
--     immediately loses follow-up read/transition authority; the row is
--     retained for audit/history.
--   * opportunity moderation and employer verification are MANAGER-ONLY
--     for MVP (no invented object-to-department scope).
--   * NO admin/registrar/dean/system_admin bypass; app_role plays no part.
--
-- Confidentiality contract: graduate_contact_points.protected_value and
-- graduate_followups.notes_protected are never returned by any RPC and are
-- covered by no policy; only the metadata projections below are readable.
-- Audit payloads carry codes, ids and counts only, never PII values.

-- =====================================================================
-- Internal helpers (never executable by clients)
-- =====================================================================

-- Append one audit event. p_payload must never contain PII values
-- (names, contact values, answers, notes); codes/ids/counts only.
CREATE OR REPLACE FUNCTION public.graduate_affairs_audit(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_purpose_code text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  INSERT INTO public.graduate_domain_events (
    event_type, aggregate_type, aggregate_id, actor_user_id, purpose_code, payload
  ) VALUES (
    p_event_type, p_aggregate_type, p_aggregate_id, auth.uid(), p_purpose_code,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_is_manager()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments a
    JOIN public.request_processing_units u
      ON u.id = a.unit_id AND u.code = 'graduate_affairs' AND u.is_active
    JOIN public.request_processing_roles r
      ON r.id = a.role_id AND r.code = 'graduate_affairs_manager' AND r.is_active
    WHERE a.is_active
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at IS NULL OR a.ends_at > now())
      AND (
        (a.assignment_type = 'user' AND a.user_id = auth.uid())
        OR (a.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = a.staff_profile_id
            AND sp.user_id = auth.uid()
            AND sp.status = 'active'
        ))
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_is_specialist()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments a
    JOIN public.request_processing_units u
      ON u.id = a.unit_id AND u.code = 'graduate_affairs' AND u.is_active
    JOIN public.request_processing_roles r
      ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist' AND r.is_active
    WHERE a.is_active
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at IS NULL OR a.ends_at > now())
      AND (
        (a.assignment_type = 'user' AND a.user_id = auth.uid())
        OR (a.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = a.staff_profile_id
            AND sp.user_id = auth.uid()
            AND sp.status = 'active'
        ))
      )
  );
END;
$$;

-- Department scope of the calling specialist. Fail-closed: a specialist with
-- no staff_profile_departments rows gets an empty set = no department access.
CREATE OR REPLACE FUNCTION public.graduate_affairs_specialist_department_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.graduate_affairs_is_specialist() THEN
    RETURN;
  END IF;
  -- Caller-owned departments only. The is_specialist() gate already proved
  -- the role; never union other specialists' staff_profile_departments.
  RETURN QUERY
  SELECT DISTINCT spd.department_id
  FROM public.staff_profile_departments spd
  JOIN public.staff_profiles sp ON sp.id = spd.staff_profile_id
  WHERE sp.user_id = auth.uid()
    AND sp.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_is_self(p_graduate_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.graduate_records r
    JOIN public.student_profiles sp ON sp.id = r.student_profile_id
    WHERE r.id = p_graduate_record_id
      AND sp.user_id = auth.uid()
  );
END;
$$;

-- Canonical current-self gate: self AND the record is in the approved
-- lifecycle state. Every graduate-facing listing RPC uses this gate so RPC
-- visibility can never exceed RLS policy visibility — the policies resolve
-- through graduate_self_matches_audience, which requires
-- record_state = 'approved' (PR273 REMEDIATION-06).
CREATE OR REPLACE FUNCTION public.graduate_is_current_self(p_graduate_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.graduate_records r
    JOIN public.student_profiles sp ON sp.id = r.student_profile_id
    WHERE r.id = p_graduate_record_id
      AND sp.user_id = auth.uid()
      AND r.record_state = 'approved'
  );
END;
$$;

-- Serialize self-service writes against concurrent correction/revocation.
-- FOR SHARE blocks the propagation UPDATE (ROW EXCLUSIVE) until this
-- transaction commits, and fails closed if the record is no longer approved.
CREATE OR REPLACE FUNCTION public.graduate_require_approved_record_locked(p_graduate_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM public.graduate_records r
  WHERE r.id = p_graduate_record_id
    AND r.record_state = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_NOT_APPROVED';
  END IF;
END;
$$;

-- True when p_user_id holds an active Graduate Affairs staff capability
-- (manager or specialist) with active staff_profile status when applicable.
CREATE OR REPLACE FUNCTION public.graduate_affairs_user_is_active_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments a
    JOIN public.request_processing_units u
      ON u.id = a.unit_id AND u.code = 'graduate_affairs' AND u.is_active
    JOIN public.request_processing_roles r
      ON r.id = a.role_id
     AND r.code IN ('graduate_affairs_manager','graduate_affairs_specialist')
     AND r.is_active
    WHERE a.is_active
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at IS NULL OR a.ends_at > now())
      AND (
        (a.assignment_type = 'user' AND a.user_id = p_user_id)
        OR (a.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = a.staff_profile_id
            AND sp.user_id = p_user_id
            AND sp.status = 'active'
        ))
      )
  );
END;
$$;

-- Department ids authorized for a specific specialist user (not the caller).
CREATE OR REPLACE FUNCTION public.graduate_affairs_user_specialist_department_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.graduate_affairs_user_is_active_staff(p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT DISTINCT spd.department_id
  FROM public.staff_profile_departments spd
  JOIN public.staff_profiles sp ON sp.id = spd.staff_profile_id
  WHERE sp.user_id = p_user_id
    AND sp.status = 'active';
END;
$$;

-- Record read access: current-self OR manager OR specialist-in-scope OR
-- active follow-up assignee who still holds GA staff capability. Missing record = false.
CREATE OR REPLACE FUNCTION public.graduate_affairs_can_access_record(p_graduate_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_department_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT r.department_id INTO v_department_id
  FROM public.graduate_records r
  WHERE r.id = p_graduate_record_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.graduate_is_current_self(p_graduate_record_id) THEN
    RETURN true;
  END IF;
  IF public.graduate_affairs_is_manager() THEN
    RETURN true;
  END IF;
  IF public.graduate_affairs_is_specialist()
     AND v_department_id IN (SELECT public.graduate_affairs_specialist_department_ids()) THEN
    RETURN true;
  END IF;
  -- Direct assignee access requires ongoing GA staff capability (R3).
  -- Historical follow-up rows remain for audit; authority does not.
  RETURN EXISTS (
    SELECT 1
    FROM public.graduate_followups f
    WHERE f.graduate_record_id = p_graduate_record_id
      AND f.assignee_user_id = auth.uid()
      AND f.state IN ('open','in_progress')
  ) AND (
    public.graduate_affairs_is_manager()
    OR public.graduate_affairs_is_specialist()
  );
END;
$$;

-- Audience matcher. Never throws on unexpected jsonb shapes: a non-object,
-- NULL, or '{}'::jsonb scope simply matches nothing.
CREATE OR REPLACE FUNCTION public.graduate_audience_matches(
  p_scope jsonb,
  p_program_id uuid,
  p_department_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_scope IS NULL OR jsonb_typeof(p_scope) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_scope->'all_graduates') = 'boolean'
     AND (p_scope->>'all_graduates')::boolean IS TRUE THEN
    RETURN true;
  END IF;
  IF p_program_id IS NOT NULL
     AND jsonb_typeof(p_scope->'program_ids') = 'array'
     AND p_scope->'program_ids' ? p_program_id::text THEN
    RETURN true;
  END IF;
  IF p_department_id IS NOT NULL
     AND jsonb_typeof(p_scope->'department_ids') = 'array'
     AND p_scope->'department_ids' ? p_department_id::text THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- True when the caller owns an approved graduate record whose program or
-- department matches the audience scope. Runs as the function owner so the
-- opportunity and event policies can evaluate it without a policy on
-- graduate_records (a policy EXISTS subquery would itself be default-denied).
CREATE OR REPLACE FUNCTION public.graduate_self_matches_audience(p_scope jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.graduate_records r
    JOIN public.student_profiles sp ON sp.id = r.student_profile_id
    WHERE r.record_state = 'approved'
      AND sp.user_id = auth.uid()
      AND public.graduate_audience_matches(p_scope, r.program_id, r.department_id)
  );
END;
$$;

-- =====================================================================
-- Graduate self-service RPCs (audited; the only self write paths)
-- =====================================================================

-- Full-replacement semantics: every parameter is written as-is, so an
-- explicit NULL clears that column. Only these four profile columns are
-- self-mutable; this RPC is the only self write path (no direct INSERT or
-- UPDATE policy exists on graduate_profiles).
CREATE OR REPLACE FUNCTION public.graduate_update_own_profile(
  p_graduate_record_id uuid,
  p_public_display_name text,
  p_preferred_contact_channel text,
  p_career_summary text,
  p_profile_visibility text,
  p_expected_row_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version integer;
  v_new_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);
  IF p_preferred_contact_channel IS NOT NULL
     AND p_preferred_contact_channel NOT IN ('email','phone','none') THEN
    RAISE EXCEPTION 'GRADUATE_PROFILE_INVALID_CHANNEL';
  END IF;
  IF p_profile_visibility IS NULL
     OR p_profile_visibility NOT IN ('private','graduates_affairs','public_opt_in') THEN
    RAISE EXCEPTION 'GRADUATE_PROFILE_INVALID_VISIBILITY';
  END IF;

  SELECT p.row_version INTO v_current_version
  FROM public.graduate_profiles p
  WHERE p.graduate_record_id = p_graduate_record_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_current_version IS DISTINCT FROM p_expected_row_version THEN
      RAISE EXCEPTION 'GRADUATE_PROFILE_VERSION_CONFLICT';
    END IF;
    UPDATE public.graduate_profiles p
    SET public_display_name = p_public_display_name,
        preferred_contact_channel = p_preferred_contact_channel,
        career_summary = p_career_summary,
        profile_visibility = p_profile_visibility,
        row_version = p.row_version + 1,
        updated_at = now()
    WHERE p.graduate_record_id = p_graduate_record_id
    RETURNING p.row_version INTO v_new_version;
  ELSE
    IF p_expected_row_version IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'GRADUATE_PROFILE_VERSION_CONFLICT';
    END IF;
    INSERT INTO public.graduate_profiles (
      graduate_record_id, public_display_name, preferred_contact_channel,
      career_summary, profile_visibility
    ) VALUES (
      p_graduate_record_id, p_public_display_name, p_preferred_contact_channel,
      p_career_summary, p_profile_visibility
    )
    RETURNING row_version INTO v_new_version;
  END IF;

  PERFORM public.graduate_affairs_audit(
    'graduate_profile_self_updated', 'graduate_record', p_graduate_record_id,
    'profile_self_service', '{}'::jsonb);
  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_grant_consent(
  p_graduate_record_id uuid,
  p_purpose_code text,
  p_notice_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consent_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);
  IF p_purpose_code IS NULL OR btrim(p_purpose_code) = ''
     OR p_notice_version IS NULL OR btrim(p_notice_version) = '' THEN
    RAISE EXCEPTION 'GRADUATE_CONSENT_INVALID_INPUT';
  END IF;

  INSERT INTO public.graduate_consents (
    graduate_record_id, purpose_code, notice_version, consent_state, affirmative_action_at
  ) VALUES (
    p_graduate_record_id, p_purpose_code, p_notice_version, 'granted', now()
  )
  RETURNING id INTO v_consent_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_consent_granted', 'graduate_consent', v_consent_id,
    p_purpose_code, jsonb_build_object('graduate_record_id', p_graduate_record_id));
  RETURN v_consent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_withdraw_consent(p_consent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT c.graduate_record_id INTO v_record_id
  FROM public.graduate_consents c
  WHERE c.id = p_consent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  IF NOT public.graduate_is_self(v_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(v_record_id);

  UPDATE public.graduate_consents c
  SET consent_state = 'withdrawn', withdrawn_at = now()
  WHERE c.id = p_consent_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_consent_withdrawn', 'graduate_consent', p_consent_id,
    'consent_self_service', jsonb_build_object('graduate_record_id', v_record_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_add_contact_point(
  p_graduate_record_id uuid,
  p_channel_type text,
  p_value text,
  p_purpose_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_point_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);
  IF p_channel_type IS NULL OR p_channel_type NOT IN ('email','phone')
     OR p_value IS NULL OR btrim(p_value) = ''
     OR p_purpose_code IS NULL OR btrim(p_purpose_code) = '' THEN
    RAISE EXCEPTION 'GRADUATE_CONTACT_POINT_INVALID_INPUT';
  END IF;

  INSERT INTO public.graduate_contact_points (
    graduate_record_id, channel_type, protected_value, purpose_code, verified_at
  ) VALUES (
    p_graduate_record_id, p_channel_type, p_value, p_purpose_code, NULL
  )
  RETURNING id INTO v_contact_point_id;

  -- Audit metadata only: channel and purpose, NEVER the contact value.
  PERFORM public.graduate_affairs_audit(
    'graduate_contact_point_added', 'graduate_contact_point', v_contact_point_id,
    p_purpose_code, jsonb_build_object(
      'graduate_record_id', p_graduate_record_id,
      'channel_type', p_channel_type));
  RETURN v_contact_point_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_revoke_contact_point(p_contact_point_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT cp.graduate_record_id INTO v_record_id
  FROM public.graduate_contact_points cp
  WHERE cp.id = p_contact_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  IF NOT public.graduate_is_self(v_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(v_record_id);

  UPDATE public.graduate_contact_points cp
  SET revoked_at = now()
  WHERE cp.id = p_contact_point_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_contact_point_revoked', 'graduate_contact_point', p_contact_point_id,
    'contact_point_self_service', jsonb_build_object('graduate_record_id', v_record_id));
END;
$$;

-- Metadata projection only; the contact value column is never selected.
CREATE OR REPLACE FUNCTION public.graduate_my_contact_points(p_graduate_record_id uuid)
RETURNS TABLE (
  id uuid,
  channel_type text,
  purpose_code text,
  is_verified boolean,
  is_revoked boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_current_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  RETURN QUERY
  SELECT cp.id, cp.channel_type, cp.purpose_code,
         (cp.verified_at IS NOT NULL), (cp.revoked_at IS NOT NULL), cp.created_at
  FROM public.graduate_contact_points cp
  WHERE cp.graduate_record_id = p_graduate_record_id
  ORDER BY cp.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_report_employment(
  p_graduate_record_id uuid,
  p_employment_status public.graduate_employment_status,
  p_employer_name_reported text,
  p_occupation_title text,
  p_specialization_relationship public.graduate_specialization_relationship,
  p_started_on date,
  p_ended_on date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(p_graduate_record_id);

  INSERT INTO public.graduate_employment_events (
    graduate_record_id, employment_status, employer_name_reported,
    occupation_title, specialization_relationship, started_on, ended_on,
    verification_state
  ) VALUES (
    p_graduate_record_id, p_employment_status, p_employer_name_reported,
    p_occupation_title, p_specialization_relationship, p_started_on, p_ended_on,
    'graduate_reported'
  )
  RETURNING id INTO v_event_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_employment_self_reported', 'graduate_employment_event', v_event_id,
    'employment_self_report', jsonb_build_object('graduate_record_id', p_graduate_record_id));
  RETURN v_event_id;
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

CREATE OR REPLACE FUNCTION public.graduate_withdraw_survey_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT sr.graduate_record_id INTO v_record_id
  FROM public.graduate_survey_responses sr
  WHERE sr.id = p_response_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  IF NOT public.graduate_is_self(v_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(v_record_id);

  UPDATE public.graduate_survey_responses sr
  SET withdrawn_at = now()
  WHERE sr.id = p_response_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_survey_response_withdrawn', 'graduate_survey_response', p_response_id,
    'survey_participation', jsonb_build_object('graduate_record_id', v_record_id));
END;
$$;

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

CREATE OR REPLACE FUNCTION public.graduate_cancel_event_registration(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT er.graduate_record_id INTO v_record_id
  FROM public.graduate_event_registrations er
  WHERE er.id = p_registration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  IF NOT public.graduate_is_self(v_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  PERFORM public.graduate_require_approved_record_locked(v_record_id);

  UPDATE public.graduate_event_registrations er
  SET cancelled_at = now()
  WHERE er.id = p_registration_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_event_registration_cancelled', 'graduate_event_registration', p_registration_id,
    'event_participation', jsonb_build_object('graduate_record_id', v_record_id));
END;
$$;

-- Visible opportunities for one self record. Employer identity is disclosed
-- only for verified employers.
CREATE OR REPLACE FUNCTION public.graduate_list_visible_opportunities(p_graduate_record_id uuid)
RETURNS TABLE (
  id uuid,
  opportunity_type text,
  title text,
  description text,
  published_at timestamptz,
  closes_at timestamptz,
  employer_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  -- Approved-lifecycle gate (REMEDIATION-06): a corrected/revoked record
  -- loses listing visibility exactly as it loses RLS policy visibility.
  IF NOT public.graduate_is_current_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_NOT_CURRENT';
  END IF;
  RETURN QUERY
  SELECT o.id, o.opportunity_type, o.title, o.description, o.published_at, o.closes_at,
         CASE WHEN e.verification_state = 'verified' THEN e.legal_name ELSE NULL END
  FROM public.graduate_opportunities o
  LEFT JOIN public.graduate_employers e ON e.id = o.employer_id
  JOIN public.graduate_records r ON r.id = p_graduate_record_id
  WHERE o.state = 'published'
    AND (o.closes_at IS NULL OR o.closes_at > now())
    AND public.graduate_audience_matches(o.audience_scope, r.program_id, r.department_id)
  ORDER BY o.published_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_list_visible_events(p_graduate_record_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_is_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  -- Approved-lifecycle gate (REMEDIATION-06): identical to the opportunity
  -- listing gate; both paths stay in lockstep with the RLS policies.
  IF NOT public.graduate_is_current_self(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_NOT_CURRENT';
  END IF;
  RETURN QUERY
  SELECT e.id, e.title, e.event_type, e.starts_at, e.ends_at
  FROM public.graduate_events e
  JOIN public.graduate_records r ON r.id = p_graduate_record_id
  WHERE e.state = 'published'
    AND public.graduate_audience_matches(e.audience_scope, r.program_id, r.department_id)
  ORDER BY e.starts_at;
END;
$$;

-- =====================================================================
-- Staff RPCs (capability re-checked inside; every call audited, reads too)
-- =====================================================================

-- Comprehensive read-only graduate file. Contact points and follow-ups are
-- metadata projections only: contact values and protected notes are never
-- selected here (or anywhere else in this bundle).
CREATE OR REPLACE FUNCTION public.graduate_affairs_get_graduate_file(p_graduate_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_affairs_can_access_record(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;

  SELECT jsonb_build_object(
    'record', jsonb_build_object(
      'id', r.id,
      'record_state', r.record_state,
      'program_id', r.program_id,
      'department_id', r.department_id,
      'graduation_year', EXTRACT(YEAR FROM r.effective_graduation_date)::integer,
      'version', r.version),
    'profile', to_jsonb(p),
    'counts', jsonb_build_object(
      'employment_events', (SELECT count(*) FROM public.graduate_employment_events ee
                            WHERE ee.graduate_record_id = r.id),
      'consents', (SELECT count(*) FROM public.graduate_consents c
                   WHERE c.graduate_record_id = r.id),
      'followups', (SELECT count(*) FROM public.graduate_followups f
                    WHERE f.graduate_record_id = r.id)),
    'contact_points', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'channel_type', cp.channel_type,
        'purpose_code', cp.purpose_code,
        'is_verified', (cp.verified_at IS NOT NULL),
        'is_revoked', (cp.revoked_at IS NOT NULL))
        ORDER BY cp.created_at)
      FROM public.graduate_contact_points cp
      WHERE cp.graduate_record_id = r.id), '[]'::jsonb),
    'followups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'state', f.state,
        'assignee_user_id', f.assignee_user_id,
        'purpose_code', f.purpose_code,
        'next_action_at', f.next_action_at)
        ORDER BY f.created_at)
      FROM public.graduate_followups f
      WHERE f.graduate_record_id = r.id), '[]'::jsonb)
  ) INTO v_result
  FROM public.graduate_records r
  LEFT JOIN public.graduate_profiles p ON p.graduate_record_id = r.id
  WHERE r.id = p_graduate_record_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_file_staff_read', 'graduate_record', p_graduate_record_id,
    'staff_file_read', '{}'::jsonb);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_search_records(
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_graduation_year integer DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  program_id uuid,
  department_id uuid,
  graduation_year integer,
  record_state public.graduate_decision_state
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_manager boolean;
  v_is_specialist boolean;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  v_is_manager := public.graduate_affairs_is_manager();
  v_is_specialist := public.graduate_affairs_is_specialist();
  IF NOT (v_is_manager OR v_is_specialist) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  IF v_is_specialist AND NOT v_is_manager
     AND p_department_id IS NOT NULL
     AND p_department_id NOT IN (SELECT public.graduate_affairs_specialist_department_ids()) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_OUT_OF_SCOPE';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  PERFORM public.graduate_affairs_audit(
    'graduate_records_search', 'graduate_record_search',
    COALESCE(p_program_id, p_department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'staff_record_search', jsonb_build_object(
      'department_id', p_department_id,
      'program_id', p_program_id,
      'graduation_year', p_graduation_year,
      'limit', v_limit));

  RETURN QUERY
  SELECT r.id, r.program_id, r.department_id,
         EXTRACT(YEAR FROM r.effective_graduation_date)::integer, r.record_state
  FROM public.graduate_records r
  WHERE (p_program_id IS NULL OR r.program_id = p_program_id)
    AND (p_graduation_year IS NULL
         OR EXTRACT(YEAR FROM r.effective_graduation_date) = p_graduation_year)
    AND (p_department_id IS NULL OR r.department_id = p_department_id)
    AND (v_is_manager
         OR r.department_id IN (SELECT public.graduate_affairs_specialist_department_ids()))
  ORDER BY r.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_create_followup(
  p_graduate_record_id uuid,
  p_assignee_user_id uuid,
  p_purpose_code text,
  p_next_action_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_department_id uuid;
  v_followup_id uuid;
  v_assignee_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT r.department_id INTO v_department_id
  FROM public.graduate_records r
  WHERE r.id = p_graduate_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  IF NOT (
    public.graduate_affairs_is_manager()
    OR (public.graduate_affairs_is_specialist()
        AND v_department_id IN (SELECT public.graduate_affairs_specialist_department_ids()))
  ) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  IF p_purpose_code IS NULL OR btrim(p_purpose_code) = '' THEN
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_INVALID_INPUT';
  END IF;

  -- Assignee must be active GA staff (active staff_profile when typed).
  IF NOT public.graduate_affairs_user_is_active_staff(p_assignee_user_id) THEN
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF';
  END IF;

  -- Manager may assign college-wide. Specialist may assign only to an
  -- assignee whose independent authorized scope already includes the
  -- target record's department (or an active manager). Creating a
  -- follow-up must not manufacture out-of-scope authority.
  IF public.graduate_affairs_is_manager() THEN
    NULL;
  ELSIF public.graduate_affairs_is_specialist() THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u
        ON u.id = a.unit_id AND u.code = 'graduate_affairs' AND u.is_active
      JOIN public.request_processing_roles r
        ON r.id = a.role_id AND r.code = 'graduate_affairs_manager' AND r.is_active
      WHERE a.is_active
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND (
          (a.assignment_type = 'user' AND a.user_id = p_assignee_user_id)
          OR (a.assignment_type = 'staff_profile' AND EXISTS (
            SELECT 1 FROM public.staff_profiles sp
            WHERE sp.id = a.staff_profile_id
              AND sp.user_id = p_assignee_user_id
              AND sp.status = 'active'
          ))
        )
    ) INTO v_assignee_ok;
    IF NOT v_assignee_ok
       AND v_department_id NOT IN (
         SELECT public.graduate_affairs_user_specialist_department_ids(p_assignee_user_id)
       ) THEN
      RAISE EXCEPTION 'GRADUATE_FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE';
    END IF;
  ELSE
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;

  -- Foundation partial unique index enforces one active follow-up per record.
  INSERT INTO public.graduate_followups (
    graduate_record_id, assignee_user_id, purpose_code, next_action_at
  ) VALUES (
    p_graduate_record_id, p_assignee_user_id, p_purpose_code, p_next_action_at
  )
  RETURNING id INTO v_followup_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_followup_created', 'graduate_followup', v_followup_id,
    p_purpose_code, jsonb_build_object(
      'graduate_record_id', p_graduate_record_id,
      'assignee_user_id', p_assignee_user_id));
  RETURN v_followup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_transition_followup(
  p_followup_id uuid,
  p_target_state public.graduate_followup_state,
  p_outcome text DEFAULT NULL,
  p_next_action_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_followup public.graduate_followups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  SELECT * INTO v_followup
  FROM public.graduate_followups f
  WHERE f.id = p_followup_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;
  -- Manager may always transition. Direct assignee may transition only while
  -- still holding active GA staff capability (revocation fails closed).
  IF public.graduate_affairs_is_manager() THEN
    NULL;
  ELSIF v_followup.assignee_user_id = auth.uid()
        AND public.graduate_affairs_is_specialist() THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_NOT_ASSIGNEE';
  END IF;

  -- Foundation trigger enforces transition legality and outcome-on-complete.
  UPDATE public.graduate_followups f
  SET state = p_target_state,
      outcome = COALESCE(p_outcome, f.outcome),
      next_action_at = p_next_action_at
  WHERE f.id = p_followup_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_followup_transitioned', 'graduate_followup', p_followup_id,
    v_followup.purpose_code, jsonb_build_object(
      'graduate_record_id', v_followup.graduate_record_id,
      'from_state', v_followup.state,
      'to_state', p_target_state));
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_moderate_opportunity(
  p_opportunity_id uuid,
  p_target_state public.graduate_opportunity_state
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_state public.graduate_opportunity_state;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  -- MVP: manager-only until an enforceable object-to-scope model exists.
  IF NOT public.graduate_affairs_is_manager() THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  SELECT o.state INTO v_current_state
  FROM public.graduate_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;

  v_allowed := (v_current_state = 'draft' AND p_target_state IN ('in_review','archived'))
    OR (v_current_state = 'in_review' AND p_target_state IN ('draft','published','archived'))
    OR (v_current_state = 'published' AND p_target_state = 'closed')
    OR (v_current_state = 'closed' AND p_target_state = 'archived');
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'GRADUATE_OPPORTUNITY_INVALID_TRANSITION';
  END IF;

  -- Foundation CHECK requires published_at and moderated_by on publish.
  UPDATE public.graduate_opportunities o
  SET state = p_target_state,
      published_at = CASE WHEN p_target_state = 'published' THEN now() ELSE o.published_at END,
      moderated_by = CASE WHEN p_target_state = 'published' THEN auth.uid() ELSE o.moderated_by END
  WHERE o.id = p_opportunity_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_opportunity_moderated', 'graduate_opportunity', p_opportunity_id,
    'opportunity_moderation', jsonb_build_object(
      'from_state', v_current_state,
      'to_state', p_target_state));
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_affairs_set_employer_verification(
  p_employer_id uuid,
  p_target_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_state text;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  -- MVP: manager-only until an enforceable object-to-scope model exists.
  IF NOT public.graduate_affairs_is_manager() THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  SELECT e.verification_state INTO v_current_state
  FROM public.graduate_employers e
  WHERE e.id = p_employer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
  END IF;

  v_allowed := (v_current_state = 'unverified' AND p_target_state = 'in_review')
    OR (v_current_state = 'in_review' AND p_target_state IN ('verified','rejected'));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'GRADUATE_EMPLOYER_INVALID_TRANSITION';
  END IF;

  UPDATE public.graduate_employers e
  SET verification_state = p_target_state,
      verified_by = CASE WHEN p_target_state = 'verified' THEN auth.uid() ELSE e.verified_by END,
      verified_at = CASE WHEN p_target_state = 'verified' THEN now() ELSE e.verified_at END
  WHERE e.id = p_employer_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_employer_verification_changed', 'graduate_employer', p_employer_id,
    'employer_verification', jsonb_build_object(
      'from_state', v_current_state,
      'to_state', p_target_state));
END;
$$;

-- Aggregate-only cohort report with small-cell suppression (delegates to the
-- completion-draft aggregate function). No row-level data ever leaves it.
CREATE OR REPLACE FUNCTION public.graduate_affairs_cohort_employment_report(
  p_program_id uuid,
  p_graduation_year integer,
  p_minimum_cell_size integer DEFAULT 5
)
RETURNS TABLE (
  population bigint,
  employed bigint,
  specialization_related bigint,
  verified bigint,
  suppressed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_manager boolean;
  v_is_specialist boolean;
  v_program_department_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  v_is_manager := public.graduate_affairs_is_manager();
  v_is_specialist := public.graduate_affairs_is_specialist();
  IF NOT (v_is_manager OR v_is_specialist) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  IF v_is_specialist AND NOT v_is_manager THEN
    SELECT p.department_id INTO v_program_department_id
    FROM public.programs p
    WHERE p.id = p_program_id;
    IF v_program_department_id IS NULL
       OR v_program_department_id NOT IN (SELECT public.graduate_affairs_specialist_department_ids()) THEN
      RAISE EXCEPTION 'GRADUATE_AFFAIRS_OUT_OF_SCOPE';
    END IF;
  END IF;

  PERFORM public.graduate_affairs_audit(
    'graduate_cohort_report_read', 'graduate_program', p_program_id,
    'cohort_report', jsonb_build_object(
      'program_id', p_program_id,
      'graduation_year', p_graduation_year,
      'minimum_cell_size', p_minimum_cell_size));

  RETURN QUERY
  SELECT *
  FROM public.graduate_aggregate_employment_report(
    p_program_id, p_graduation_year, p_minimum_cell_size);
END;
$$;

-- =====================================================================
-- RLS policies: the ONLY policies in the bundle. Everything else on these
-- tables, and every other graduate_* table, stays policy-less = default deny.
-- =====================================================================

CREATE POLICY graduate_profiles_select_self ON public.graduate_profiles
  FOR SELECT TO authenticated
  USING (public.graduate_is_current_self(graduate_record_id));

CREATE POLICY graduate_consents_select_self ON public.graduate_consents
  FOR SELECT TO authenticated
  USING (public.graduate_is_current_self(graduate_record_id));

CREATE POLICY graduate_survey_responses_select_self ON public.graduate_survey_responses
  FOR SELECT TO authenticated
  USING (public.graduate_is_current_self(graduate_record_id));

CREATE POLICY graduate_event_registrations_select_self ON public.graduate_event_registrations
  FOR SELECT TO authenticated
  USING (public.graduate_is_current_self(graduate_record_id));

CREATE POLICY graduate_employment_events_select_self ON public.graduate_employment_events
  FOR SELECT TO authenticated
  USING (public.graduate_is_current_self(graduate_record_id));

-- Published, in-window opportunities/events are visible to an authenticated
-- caller only when an approved self record matches the audience scope.
CREATE POLICY graduate_opportunities_select_audience ON public.graduate_opportunities
  FOR SELECT TO authenticated
  USING (
    graduate_opportunities.state = 'published'
    AND (graduate_opportunities.closes_at IS NULL OR graduate_opportunities.closes_at > now())
    AND public.graduate_self_matches_audience(graduate_opportunities.audience_scope)
  );

CREATE POLICY graduate_events_select_audience ON public.graduate_events
  FOR SELECT TO authenticated
  USING (
    graduate_events.state = 'published'
    AND public.graduate_self_matches_audience(graduate_events.audience_scope)
  );


-- =====================================================================
-- Read-only runtime context RPCs (server adapters derive auth facts here)
-- =====================================================================

-- Client supplies only the requested capability code. Ownership, lifecycle,
-- and continuity are derived from the database for auth.uid().
CREATE OR REPLACE FUNCTION public.graduate_affairs_resolve_self_context(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  SELECT r.id, r.record_state
    INTO v_record_id, v_record_state
  FROM public.graduate_records r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE sp.user_id = auth.uid()
    AND r.record_state = 'approved'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_record_id IS NOT NULL THEN
    v_continuity := public.evaluate_graduate_account_continuity(
      'graduate-account-continuity', p_capability, now());
  END IF;

  RETURN jsonb_build_object(
    'owns_graduate_record', v_record_id IS NOT NULL,
    'graduate_record_id', v_record_id,
    'graduate_record_state', COALESCE(v_record_state::text, 'absent'),
    'continuity_allowed', COALESCE(v_continuity, false),
    'capability', p_capability
  );
END;
$$;

-- Client supplies only the target record id. Staff assignments, department
-- scope, and follow-up authority are derived server-side.
CREATE OR REPLACE FUNCTION public.graduate_affairs_resolve_staff_record_access(p_graduate_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_department_id uuid;
  v_via text := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF p_graduate_record_id IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_INVALID_INPUT';
  END IF;

  SELECT r.department_id INTO v_department_id
  FROM public.graduate_records r
  WHERE r.id = p_graduate_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'via', NULL, 'reason', 'graduate_record_access_denied');
  END IF;

  IF public.graduate_affairs_is_manager() THEN
    v_via := 'manager';
  ELSIF public.graduate_affairs_is_specialist()
        AND v_department_id IN (SELECT public.graduate_affairs_specialist_department_ids()) THEN
    v_via := 'specialist';
  ELSIF EXISTS (
    SELECT 1 FROM public.graduate_followups f
    WHERE f.graduate_record_id = p_graduate_record_id
      AND f.assignee_user_id = auth.uid()
      AND f.state IN ('open','in_progress')
  ) AND (public.graduate_affairs_is_manager() OR public.graduate_affairs_is_specialist()) THEN
    v_via := 'direct_assignee';
  END IF;

  IF v_via IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'via', NULL, 'reason', 'graduate_record_access_denied');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'via', v_via, 'reason', NULL);
END;
$$;

-- =====================================================================
-- Privileges: helpers are internal; the client RPCs are the only entry points.
-- =====================================================================

REVOKE ALL ON FUNCTION public.graduate_affairs_audit(text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_is_manager() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_is_specialist() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_specialist_department_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_can_access_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_require_approved_record_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_user_is_active_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_affairs_user_specialist_department_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_is_self(uuid) FROM PUBLIC, anon, authenticated;

-- graduate_is_current_self, graduate_audience_matches and
-- graduate_self_matches_audience are referenced by RLS policy expressions;
-- policy expressions execute with the querying user's privileges, so these
-- pure boolean STABLE helpers must stay executable by authenticated.
REVOKE ALL ON FUNCTION public.graduate_is_current_self(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_audience_matches(jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_self_matches_audience(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.graduate_is_current_self(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_audience_matches(jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_self_matches_audience(jsonb) TO authenticated;

-- The client RPCs below are the only mutation/read entry points. CREATE FUNCTION
-- grants EXECUTE to PUBLIC by default, so every RPC is first revoked from
-- PUBLIC/anon and then granted to authenticated only; each RPC re-checks the
-- actor capability internally and raises on failure.
REVOKE ALL ON FUNCTION public.graduate_update_own_profile(uuid, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_grant_consent(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_withdraw_consent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_add_contact_point(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_revoke_contact_point(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_my_contact_points(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_report_employment(uuid, public.graduate_employment_status, text, text, public.graduate_specialization_relationship, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_submit_survey_response(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_withdraw_survey_response(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_register_for_event(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_cancel_event_registration(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_list_visible_opportunities(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_list_visible_events(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_get_graduate_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_search_records(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_create_followup(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_transition_followup(uuid, public.graduate_followup_state, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_moderate_opportunity(uuid, public.graduate_opportunity_state) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_set_employer_verification(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_cohort_employment_report(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_resolve_self_context(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.graduate_affairs_resolve_staff_record_access(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.graduate_update_own_profile(uuid, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_grant_consent(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_withdraw_consent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_add_contact_point(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_revoke_contact_point(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_my_contact_points(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_report_employment(uuid, public.graduate_employment_status, text, text, public.graduate_specialization_relationship, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_submit_survey_response(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_withdraw_survey_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_register_for_event(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_cancel_event_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_list_visible_opportunities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_list_visible_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_get_graduate_file(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_search_records(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_create_followup(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_transition_followup(uuid, public.graduate_followup_state, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_moderate_opportunity(uuid, public.graduate_opportunity_state) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_set_employer_verification(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_cohort_employment_report(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_resolve_self_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_resolve_staff_record_access(uuid) TO authenticated;
