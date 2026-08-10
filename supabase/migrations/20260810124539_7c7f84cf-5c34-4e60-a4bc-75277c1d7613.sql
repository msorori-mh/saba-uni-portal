do $$ begin
  -- Foundation must be present
  if to_regclass('public.graduate_records') is null then
    raise exception 'GA_COMPLETION_PREFLIGHT_MISSING: graduate_records (foundation) required';
  end if;
  if to_regclass('public.graduate_official_decisions') is null then
    raise exception 'GA_COMPLETION_PREFLIGHT_MISSING: graduate_official_decisions (foundation) required';
  end if;
  if to_regclass('public.graduate_consents') is null then
    raise exception 'GA_COMPLETION_PREFLIGHT_MISSING: graduate_consents (foundation) required';
  end if;
  if to_regclass('public.graduate_contact_points') is null then
    raise exception 'GA_COMPLETION_PREFLIGHT_MISSING: graduate_contact_points (foundation) required';
  end if;
  if to_regclass('public.graduate_employment_events') is null then
    raise exception 'GA_COMPLETION_PREFLIGHT_MISSING: graduate_employment_events (foundation) required';
  end if;

  -- Partial-apply / re-apply guard
  if to_regclass('public.graduate_followups') is not null then
    raise exception 'GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED: graduate_followups already exists';
  end if;
  if to_regclass('public.graduate_communication_events') is not null then
    raise exception 'GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED: graduate_communication_events already exists';
  end if;
  if to_regclass('public.graduate_account_continuity_policies') is not null then
    raise exception 'GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED: graduate_account_continuity_policies already exists';
  end if;
end $$;

CREATE TYPE public.graduate_followup_state AS ENUM ('open','in_progress','completed','cancelled');
CREATE TYPE public.graduate_account_policy_state AS ENUM ('undecided','approved','rejected');

-- Staff follow-up cases: exactly one active assignment per graduate record.
CREATE TABLE public.graduate_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  assignee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose_code text NOT NULL CHECK (btrim(purpose_code) <> ''),
  state public.graduate_followup_state NOT NULL DEFAULT 'open',
  outcome text,
  next_action_at timestamptz,
  notes_protected text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX graduate_followups_one_active_per_graduate
  ON public.graduate_followups(graduate_record_id)
  WHERE state IN ('open','in_progress');

CREATE TABLE public.graduate_communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  contact_point_id uuid NOT NULL REFERENCES public.graduate_contact_points(id) ON DELETE RESTRICT,
  consent_id uuid NOT NULL REFERENCES public.graduate_consents(id) ON DELETE RESTRICT,
  purpose_code text NOT NULL CHECK (btrim(purpose_code) <> ''),
  notice_version text NOT NULL CHECK (btrim(notice_version) <> ''),
  channel text NOT NULL CHECK (channel IN ('email','phone')),
  template_code text NOT NULL CHECK (btrim(template_code) <> ''),
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now(),
  payload_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.graduate_account_continuity_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code text NOT NULL CHECK (btrim(policy_code) <> ''),
  policy_state public.graduate_account_policy_state NOT NULL DEFAULT 'undecided',
  allow_portal_sign_in boolean NOT NULL DEFAULT false,
  allow_university_email_reuse boolean NOT NULL DEFAULT false,
  allowed_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_capabilities) = 'array'),
  valid_from timestamptz,
  expires_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  supersedes_policy_id uuid REFERENCES public.graduate_account_continuity_policies(id) ON DELETE RESTRICT,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from IS NULL OR expires_at IS NULL OR expires_at > valid_from),
  CHECK (policy_state = 'undecided' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (policy_state <> 'rejected' OR (
    NOT allow_portal_sign_in AND NOT allow_university_email_reuse
    AND allowed_capabilities = '[]'::jsonb
  ))
);

CREATE UNIQUE INDEX graduate_account_continuity_policies_one_current
  ON public.graduate_account_continuity_policies(policy_code)
  WHERE is_current;

CREATE OR REPLACE FUNCTION public.enforce_graduate_followup_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.graduate_record_id <> OLD.graduate_record_id
     OR NEW.assignee_user_id <> OLD.assignee_user_id
     OR NEW.purpose_code <> OLD.purpose_code THEN
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.state <> OLD.state
     AND NOT (OLD.state = 'open' AND NEW.state IN ('in_progress','cancelled'))
     AND NOT (OLD.state = 'in_progress' AND NEW.state IN ('completed','cancelled')) THEN
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_INVALID_TRANSITION';
  END IF;
  IF NEW.state = 'completed' AND (NEW.outcome IS NULL OR btrim(NEW.outcome) = '') THEN
    RAISE EXCEPTION 'GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_followup_state_guard
BEFORE UPDATE ON public.graduate_followups
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_followup_update();

CREATE TRIGGER graduate_followups_append_only
BEFORE DELETE ON public.graduate_followups
FOR EACH ROW EXECUTE FUNCTION public.reject_graduate_immutable_mutation();

CREATE OR REPLACE FUNCTION public.enforce_graduate_communication_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid boolean;
  v_record_state public.graduate_decision_state;
BEGIN
  SELECT record_state INTO v_record_state
  FROM public.graduate_records
  WHERE id = NEW.graduate_record_id;
  IF v_record_state IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_NOT_CURRENT';
  END IF;
  SELECT true INTO v_valid
  FROM public.graduate_consents c
  WHERE c.id = NEW.consent_id
    AND c.graduate_record_id = NEW.graduate_record_id
    AND c.purpose_code = NEW.purpose_code
    AND c.notice_version = NEW.notice_version
    AND c.consent_state = 'granted'
    AND c.withdrawn_at IS NULL;
  IF v_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_COMMUNICATION_CONSENT_REQUIRED';
  END IF;
  SELECT true INTO v_valid
  FROM public.graduate_contact_points p
  WHERE p.id = NEW.contact_point_id
    AND p.graduate_record_id = NEW.graduate_record_id
    AND p.channel_type = NEW.channel
    AND p.purpose_code = NEW.purpose_code
    AND p.verified_at IS NOT NULL
    AND p.revoked_at IS NULL;
  IF v_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GRADUATE_CONTACT_POINT_NOT_USABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_communication_consent_guard
BEFORE INSERT ON public.graduate_communication_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_communication_consent();

CREATE TRIGGER graduate_communication_events_append_only
BEFORE UPDATE OR DELETE ON public.graduate_communication_events
FOR EACH ROW EXECUTE FUNCTION public.reject_graduate_immutable_mutation();

CREATE OR REPLACE FUNCTION public.enforce_graduate_account_policy_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.policy_state <> 'undecided' THEN
    IF NEW.policy_code IS DISTINCT FROM OLD.policy_code
       OR NEW.policy_state IS DISTINCT FROM OLD.policy_state
       OR NEW.allow_portal_sign_in IS DISTINCT FROM OLD.allow_portal_sign_in
       OR NEW.allow_university_email_reuse IS DISTINCT FROM OLD.allow_university_email_reuse
       OR NEW.allowed_capabilities IS DISTINCT FROM OLD.allowed_capabilities
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.supersedes_policy_id IS DISTINCT FROM OLD.supersedes_policy_id THEN
      RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_DECIDED_IMMUTABLE';
    END IF;
    IF OLD.is_current IS TRUE AND NEW.is_current IS FALSE THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_DECIDED_IMMUTABLE';
  END IF;
  IF NEW.policy_code <> OLD.policy_code
     OR NEW.supersedes_policy_id IS DISTINCT FROM OLD.supersedes_policy_id THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.policy_state = 'approved' AND (NEW.decided_by IS NULL OR NEW.decided_at IS NULL) THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_PROVENANCE_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_account_policy_decided_immutable
BEFORE UPDATE ON public.graduate_account_continuity_policies
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_account_policy_update();

CREATE TRIGGER graduate_account_policy_append_only
BEFORE DELETE ON public.graduate_account_continuity_policies
FOR EACH ROW EXECUTE FUNCTION public.reject_graduate_immutable_mutation();

CREATE OR REPLACE FUNCTION public.evaluate_graduate_account_continuity(
  p_policy_code text,
  p_capability text,
  p_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_policy public.graduate_account_continuity_policies%ROWTYPE;
BEGIN
  IF p_at IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_policy
  FROM public.graduate_account_continuity_policies
  WHERE policy_code = p_policy_code
    AND is_current;
  IF NOT FOUND OR v_policy.policy_state <> 'approved' THEN
    RETURN false;
  END IF;
  IF v_policy.decided_by IS NULL OR v_policy.decided_at IS NULL THEN
    RETURN false;
  END IF;
  IF v_policy.valid_from IS NOT NULL AND v_policy.valid_from > p_at THEN
    RETURN false;
  END IF;
  IF v_policy.expires_at IS NOT NULL AND v_policy.expires_at <= p_at THEN
    RETURN false;
  END IF;
  IF NOT (v_policy.allowed_capabilities ? p_capability) THEN
    RETURN false;
  END IF;
  IF p_capability = 'portal_sign_in' AND NOT v_policy.allow_portal_sign_in THEN
    RETURN false;
  END IF;
  IF p_capability = 'university_email_reuse' AND NOT v_policy.allow_university_email_reuse THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.graduate_supersede_account_continuity_policy(
  p_policy_code text,
  p_policy_state public.graduate_account_policy_state,
  p_allow_portal_sign_in boolean,
  p_allow_university_email_reuse boolean,
  p_allowed_capabilities jsonb,
  p_valid_from timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_decided_by uuid DEFAULT NULL,
  p_decided_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.graduate_account_continuity_policies%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_policy_code IS NULL OR btrim(p_policy_code) = '' THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_INVALID_INPUT';
  END IF;
  IF p_policy_state IS NULL OR p_policy_state = 'undecided' THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_INVALID_INPUT';
  END IF;
  IF p_decided_by IS NULL OR p_decided_at IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_PROVENANCE_REQUIRED';
  END IF;

  SELECT * INTO v_old
  FROM public.graduate_account_continuity_policies
  WHERE policy_code = p_policy_code
    AND is_current
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_CURRENT_NOT_FOUND';
  END IF;
  IF NOT v_old.is_current THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_SUPERSESSION_CONFLICT';
  END IF;

  UPDATE public.graduate_account_continuity_policies
  SET is_current = false
  WHERE id = v_old.id
    AND is_current;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADUATE_ACCOUNT_POLICY_SUPERSESSION_CONFLICT';
  END IF;

  INSERT INTO public.graduate_account_continuity_policies (
    policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse,
    allowed_capabilities, valid_from, expires_at, decided_by, decided_at,
    supersedes_policy_id, is_current
  ) VALUES (
    p_policy_code, p_policy_state, COALESCE(p_allow_portal_sign_in, false),
    COALESCE(p_allow_university_email_reuse, false),
    COALESCE(p_allowed_capabilities, '[]'::jsonb),
    p_valid_from, p_expires_at, p_decided_by, p_decided_at,
    v_old.id, true
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.graduate_supersede_account_continuity_policy(
  text, public.graduate_account_policy_state, boolean, boolean, jsonb,
  timestamptz, timestamptz, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.graduate_aggregate_employment_report(
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
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold integer;
  v_population bigint;
  v_employed bigint;
  v_related bigint;
  v_verified bigint;
BEGIN
  v_threshold := GREATEST(COALESCE(p_minimum_cell_size, 5), 3);
  SELECT count(*),
         count(*) FILTER (WHERE e.employment_status IN ('employed','self_employed')),
         count(*) FILTER (WHERE e.employment_status IN ('employed','self_employed')
                            AND e.specialization_relationship IN ('directly_related','partially_related')),
         count(*) FILTER (WHERE e.verification_state = 'verified')
  INTO v_population, v_employed, v_related, v_verified
  FROM public.graduate_records r
  JOIN public.graduate_employment_events e
    ON e.graduate_record_id = r.id
  WHERE r.record_state = 'approved'
    AND r.program_id = p_program_id
    AND EXTRACT(YEAR FROM r.effective_graduation_date) = p_graduation_year
    AND NOT EXISTS (
      SELECT 1 FROM public.graduate_employment_events newer
      WHERE newer.supersedes_event_id = e.id
    );
  IF v_population < v_threshold THEN
    RETURN QUERY SELECT NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, true;
    RETURN;
  END IF;
  RETURN QUERY SELECT
    v_population,
    CASE WHEN v_employed < v_threshold THEN NULL::bigint ELSE v_employed END,
    CASE WHEN v_related < v_threshold THEN NULL::bigint ELSE v_related END,
    CASE WHEN v_verified < v_threshold THEN NULL::bigint ELSE v_verified END,
    false;
END;
$$;

ALTER TABLE public.graduate_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_account_continuity_policies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.evaluate_graduate_account_continuity(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_aggregate_employment_report(uuid, integer, integer) FROM PUBLIC, anon, authenticated;