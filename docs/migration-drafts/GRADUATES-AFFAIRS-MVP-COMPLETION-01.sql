-- DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY.
-- Graduates affairs MVP completion 01: staff follow-ups, consent-gated
-- communication log, D-13 account continuity policy surface (configurable,
-- fail-closed while the product decision is NEEDS_USER_INPUT), and an
-- aggregate-only employment report RPC with small-cell suppression.
-- Review chain: foundation pg-setup -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
-- -> this draft -> graduates-affairs-completion-01.pg-verify.sql.
-- No production activation, no seed data, no client grants.

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

-- Append-only communication log. A message may be recorded only with an
-- active matching consent and a verified, non-revoked contact point that
-- belongs to the same graduate, channel, and purpose.
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

-- D-13 account continuity policy surface. Default is undecided = deny all.
-- A decided row is immutable; a revised decision is a new row that supersedes.
CREATE TABLE public.graduate_account_continuity_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code text NOT NULL UNIQUE CHECK (btrim(policy_code) <> ''),
  policy_state public.graduate_account_policy_state NOT NULL DEFAULT 'undecided',
  allow_portal_sign_in boolean NOT NULL DEFAULT false,
  allow_university_email_reuse boolean NOT NULL DEFAULT false,
  allowed_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_capabilities) = 'array'),
  valid_from timestamptz,
  expires_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  supersedes_policy_id uuid REFERENCES public.graduate_account_continuity_policies(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from IS NULL OR expires_at IS NULL OR expires_at > valid_from),
  CHECK (policy_state = 'undecided' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (policy_state <> 'rejected' OR (
    NOT allow_portal_sign_in AND NOT allow_university_email_reuse
    AND allowed_capabilities = '[]'::jsonb
  ))
);

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

-- Follow-up history is append-only: states reach terminal by guarded
-- transition and rows are never deleted.
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

-- Fail-closed evaluation of one capability against an approved, in-force
-- policy. Returns false on every ambiguity; never mutates any account.
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
  WHERE policy_code = p_policy_code;
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

-- Aggregate-only cohort report. Every cell smaller than the enforced
-- threshold is suppressed (returned as NULL), not only the population:
-- suppressed=true means the whole cohort is below threshold; a NULL metric
-- in a returned row means that single cell is suppressed. Row-level
-- employment or contact exports remain prohibited.
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

-- Default deny, same contract as the foundation draft: future policies and
-- RPC grants require a separate approved authorization bundle with exact
-- self/direct-assignment ALLOW/DENY tests.
ALTER TABLE public.graduate_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_account_continuity_policies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.evaluate_graduate_account_continuity(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graduate_aggregate_employment_report(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
