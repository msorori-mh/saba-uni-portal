-- DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY.
-- Graduates affairs MVP foundation. No production activation or data seed.
-- A graduate record can originate only from an explicit approved decision in
-- graduate_official_decisions. student_profiles.status, candidate reports,
-- completion percentages and documents are deliberately not source facts.

CREATE TYPE public.graduate_decision_state AS ENUM ('pending','approved','corrected','revoked');
CREATE TYPE public.graduate_source_kind AS ENUM ('registrar_approved_decision','university_system_of_record_import');
CREATE TYPE public.graduate_employment_status AS ENUM ('employed','self_employed','seeking_work','continuing_education','not_seeking','not_disclosed');
CREATE TYPE public.graduate_specialization_relationship AS ENUM ('directly_related','partially_related','not_related','not_assessed');
CREATE TYPE public.graduate_opportunity_state AS ENUM ('draft','in_review','published','closed','archived');

CREATE TABLE public.graduate_official_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  source_kind public.graduate_source_kind NOT NULL,
  source_reference text NOT NULL CHECK (btrim(source_reference) <> ''),
  decision_state public.graduate_decision_state NOT NULL DEFAULT 'pending',
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  effective_graduation_date date,
  program_id uuid REFERENCES public.programs(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT,
  academic_snapshot jsonb,
  supersedes_decision_id uuid REFERENCES public.graduate_official_decisions(id) ON DELETE RESTRICT,
  source_payload_sha256 text NOT NULL CHECK (source_payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    decision_state <> 'approved' OR
    (approved_at IS NOT NULL AND approved_by IS NOT NULL AND effective_graduation_date IS NOT NULL
      AND program_id IS NOT NULL AND department_id IS NOT NULL
      AND academic_snapshot IS NOT NULL AND academic_snapshot <> '{}'::jsonb)
  ),
  UNIQUE (source_kind, source_reference)
);

CREATE TABLE public.graduate_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_decision_id uuid NOT NULL UNIQUE REFERENCES public.graduate_official_decisions(id) ON DELETE RESTRICT,
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  effective_graduation_date date NOT NULL,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  academic_snapshot jsonb NOT NULL CHECK (academic_snapshot <> '{}'::jsonb),
  record_state public.graduate_decision_state NOT NULL DEFAULT 'approved',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX graduate_records_one_current_award
  ON public.graduate_records(student_profile_id, program_id)
  WHERE record_state = 'approved';

CREATE TABLE public.graduate_profiles (
  graduate_record_id uuid PRIMARY KEY REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  public_display_name text,
  preferred_contact_channel text CHECK (preferred_contact_channel IN ('email','phone','none')),
  career_summary text,
  profile_visibility text NOT NULL DEFAULT 'private' CHECK (profile_visibility IN ('private','graduates_affairs','public_opt_in')),
  row_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.graduate_contact_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  channel_type text NOT NULL CHECK (channel_type IN ('email','phone')),
  protected_value text NOT NULL,
  purpose_code text NOT NULL CHECK (btrim(purpose_code) <> ''),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.graduate_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  purpose_code text NOT NULL,
  notice_version text NOT NULL,
  consent_state text NOT NULL CHECK (consent_state IN ('granted','withdrawn')),
  affirmative_action_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((consent_state = 'withdrawn') = (withdrawn_at IS NOT NULL))
);

CREATE TABLE public.graduate_employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  normalized_name text NOT NULL,
  sector_code text,
  verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','in_review','verified','rejected')),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  archived_at timestamptz
);

CREATE TABLE public.graduate_employment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  employment_status public.graduate_employment_status NOT NULL,
  employer_id uuid REFERENCES public.graduate_employers(id) ON DELETE RESTRICT,
  employer_name_reported text,
  occupation_title text,
  specialization_relationship public.graduate_specialization_relationship NOT NULL DEFAULT 'not_assessed',
  started_on date,
  ended_on date,
  verification_state text NOT NULL DEFAULT 'graduate_reported' CHECK (verification_state IN ('graduate_reported','verified','rejected')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  supersedes_event_id uuid REFERENCES public.graduate_employment_events(id) ON DELETE RESTRICT,
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE public.graduate_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid REFERENCES public.graduate_employers(id) ON DELETE RESTRICT,
  opportunity_type text NOT NULL CHECK (opportunity_type IN ('job','internship','training')),
  title text NOT NULL,
  description text NOT NULL,
  audience_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  state public.graduate_opportunity_state NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  closes_at timestamptz,
  moderated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'published' OR (published_at IS NOT NULL AND moderated_by IS NOT NULL)),
  CHECK (closes_at IS NULL OR published_at IS NULL OR closes_at > published_at)
);

CREATE TABLE public.graduate_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose_code text NOT NULL,
  title text NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','closed','archived')),
  minimum_report_cell_size integer NOT NULL DEFAULT 5 CHECK (minimum_report_cell_size >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.graduate_survey_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.graduate_surveys(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  notice_version text NOT NULL,
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
  published_at timestamptz,
  UNIQUE (survey_id, version)
);

CREATE TABLE public.graduate_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_version_id uuid NOT NULL REFERENCES public.graduate_survey_versions(id) ON DELETE RESTRICT,
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  consent_id uuid NOT NULL REFERENCES public.graduate_consents(id) ON DELETE RESTRICT,
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE (survey_version_id, graduate_record_id)
);

CREATE TABLE public.graduate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('career','training','networking','survey','quality')),
  purpose_code text NOT NULL,
  notice_version text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  audience_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','completed','cancelled','archived')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE public.graduate_event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.graduate_events(id) ON DELETE RESTRICT,
  graduate_record_id uuid NOT NULL REFERENCES public.graduate_records(id) ON DELETE RESTRICT,
  consent_id uuid NOT NULL REFERENCES public.graduate_consents(id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (event_id, graduate_record_id)
);

CREATE TABLE public.graduate_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose_code text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enforce_official_decision_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.decision_state IN ('approved','corrected','revoked') AND (
    NEW.student_profile_id <> OLD.student_profile_id
    OR NEW.source_kind <> OLD.source_kind
    OR NEW.source_reference <> OLD.source_reference
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.effective_graduation_date IS DISTINCT FROM OLD.effective_graduation_date
    OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.academic_snapshot IS DISTINCT FROM OLD.academic_snapshot
    OR NEW.supersedes_decision_id IS DISTINCT FROM OLD.supersedes_decision_id
    OR NEW.source_payload_sha256 <> OLD.source_payload_sha256
  ) THEN
    RAISE EXCEPTION 'APPROVED_GRADUATION_DECISION_FACT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_official_decision_immutability
BEFORE UPDATE ON public.graduate_official_decisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_official_decision_immutability();

CREATE OR REPLACE FUNCTION public.enforce_graduate_consent_identity_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.graduate_record_id <> OLD.graduate_record_id
     OR NEW.purpose_code <> OLD.purpose_code
     OR NEW.notice_version <> OLD.notice_version
     OR NEW.affirmative_action_at <> OLD.affirmative_action_at
     OR OLD.consent_state = 'withdrawn'
     OR NOT (OLD.consent_state = 'granted' AND NEW.consent_state IN ('granted','withdrawn')) THEN
    RAISE EXCEPTION 'GRADUATE_CONSENT_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_consent_identity_immutability
BEFORE UPDATE ON public.graduate_consents
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_consent_identity_immutability();

CREATE OR REPLACE FUNCTION public.enforce_published_engagement_scope_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'graduate_surveys' AND OLD.state <> 'draft'
     AND ((to_jsonb(NEW)->>'purpose_code') <> (to_jsonb(OLD)->>'purpose_code')
          OR (to_jsonb(NEW)->>'minimum_report_cell_size') <> (to_jsonb(OLD)->>'minimum_report_cell_size')) THEN
    RAISE EXCEPTION 'PUBLISHED_GRADUATE_SURVEY_SCOPE_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'graduate_events' AND OLD.state <> 'draft'
     AND ((to_jsonb(NEW)->>'purpose_code') <> (to_jsonb(OLD)->>'purpose_code')
          OR (to_jsonb(NEW)->>'notice_version') <> (to_jsonb(OLD)->>'notice_version')
          OR (to_jsonb(NEW)->'audience_scope') IS DISTINCT FROM (to_jsonb(OLD)->'audience_scope')) THEN
    RAISE EXCEPTION 'PUBLISHED_GRADUATE_EVENT_SCOPE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_survey_scope_immutability
BEFORE UPDATE ON public.graduate_surveys
FOR EACH ROW EXECUTE FUNCTION public.enforce_published_engagement_scope_immutability();

CREATE TRIGGER graduate_event_scope_immutability
BEFORE UPDATE ON public.graduate_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_published_engagement_scope_immutability();

CREATE OR REPLACE FUNCTION public.enforce_graduate_record_official_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.graduate_official_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.graduate_official_decisions
  WHERE id = NEW.official_decision_id;

  IF NOT FOUND OR v_decision.decision_state <> 'approved' THEN
    RAISE EXCEPTION 'OFFICIAL_GRADUATION_DECISION_NOT_APPROVED';
  END IF;
  IF v_decision.approved_at IS NULL OR v_decision.approved_by IS NULL
     OR v_decision.effective_graduation_date IS NULL OR v_decision.program_id IS NULL
     OR v_decision.department_id IS NULL OR v_decision.academic_snapshot IS NULL
     OR v_decision.academic_snapshot = '{}'::jsonb THEN
    RAISE EXCEPTION 'OFFICIAL_GRADUATION_DECISION_INCOMPLETE';
  END IF;
  IF NEW.student_profile_id <> v_decision.student_profile_id
     OR NEW.effective_graduation_date <> v_decision.effective_graduation_date
     OR NEW.program_id <> v_decision.program_id
     OR NEW.department_id <> v_decision.department_id
     OR NEW.academic_snapshot IS DISTINCT FROM v_decision.academic_snapshot
     OR NEW.created_by <> v_decision.approved_by
     OR NEW.record_state <> 'approved' THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_records_official_decision_guard
BEFORE INSERT ON public.graduate_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_record_official_decision();

CREATE OR REPLACE FUNCTION public.enforce_graduate_record_state_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_state public.graduate_decision_state;
BEGIN
  IF NEW.official_decision_id <> OLD.official_decision_id
     OR NEW.student_profile_id <> OLD.student_profile_id
     OR NEW.effective_graduation_date <> OLD.effective_graduation_date
     OR NEW.program_id <> OLD.program_id OR NEW.department_id <> OLD.department_id
     OR NEW.academic_snapshot IS DISTINCT FROM OLD.academic_snapshot
     OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_ACADEMIC_FACT_IMMUTABLE';
  END IF;
  SELECT decision_state INTO v_decision_state
  FROM public.graduate_official_decisions
  WHERE id = NEW.official_decision_id;
  IF NEW.record_state <> v_decision_state
     OR NOT (OLD.record_state = 'approved' AND NEW.record_state IN ('corrected','revoked'))
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'GRADUATE_RECORD_STATE_MUST_FOLLOW_OFFICIAL_DECISION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_records_state_update_guard
BEFORE UPDATE ON public.graduate_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_record_state_update();

CREATE OR REPLACE FUNCTION public.propagate_graduate_decision_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  r record;
  v_decision_event text;
BEGIN
  IF OLD.decision_state = 'approved' AND NEW.decision_state IN ('corrected','revoked') THEN
    -- Prefer JWT actor when auth.uid() exists (Auth-04 harness / production);
    -- fall back to decision approver for foundation disposable setups.
    IF to_regprocedure('auth.uid()') IS NOT NULL THEN
      EXECUTE 'SELECT auth.uid()' INTO v_actor;
    END IF;
    v_actor := coalesce(v_actor, NEW.approved_by);
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'GRADUATE_DECISION_PROPAGATION_ACTOR_REQUIRED';
    END IF;

    v_decision_event := CASE
      WHEN NEW.decision_state = 'corrected' THEN 'graduation_decision_corrected'
      ELSE 'graduation_decision_revoked'
    END;

    FOR r IN
      UPDATE public.graduate_records
      SET record_state = NEW.decision_state, version = version + 1
      WHERE official_decision_id = NEW.id AND record_state = 'approved'
      RETURNING id, version, record_state
    LOOP
      INSERT INTO public.graduate_domain_events (
        event_type, aggregate_type, aggregate_id, actor_user_id, purpose_code, payload
      ) VALUES (
        'graduate_record_state_changed',
        'graduate_record',
        r.id,
        v_actor,
        'graduate_fact_lifecycle',
        jsonb_build_object(
          'decision_id', NEW.id,
          'from_state', 'approved',
          'to_state', NEW.decision_state,
          'version', r.version
        )
      );
    END LOOP;

    INSERT INTO public.graduate_domain_events (
      event_type, aggregate_type, aggregate_id, actor_user_id, purpose_code, payload
    ) VALUES (
      v_decision_event,
      'graduate_official_decision',
      NEW.id,
      v_actor,
      'graduate_fact_lifecycle',
      jsonb_build_object(
        'from_state', OLD.decision_state,
        'to_state', NEW.decision_state,
        'student_profile_id', NEW.student_profile_id
      )
    );
  ELSIF OLD.decision_state IS DISTINCT FROM NEW.decision_state THEN
    RAISE EXCEPTION 'INVALID_OFFICIAL_GRADUATION_DECISION_TRANSITION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_decision_state_propagation
AFTER UPDATE OF decision_state ON public.graduate_official_decisions
FOR EACH ROW EXECUTE FUNCTION public.propagate_graduate_decision_state();

CREATE OR REPLACE FUNCTION public.enforce_graduate_survey_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT true INTO v_valid
  FROM public.graduate_consents c
  JOIN public.graduate_survey_versions sv ON sv.id = NEW.survey_version_id
  JOIN public.graduate_surveys s ON s.id = sv.survey_id
  WHERE c.id = NEW.consent_id
    AND c.graduate_record_id = NEW.graduate_record_id
    AND c.purpose_code = s.purpose_code
    AND c.notice_version = sv.notice_version
    AND c.consent_state = 'granted'
    AND c.withdrawn_at IS NULL;
  IF v_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ACTIVE_MATCHING_SURVEY_CONSENT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_survey_response_consent_guard
BEFORE INSERT OR UPDATE ON public.graduate_survey_responses
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_survey_consent();

CREATE OR REPLACE FUNCTION public.enforce_graduate_event_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT true INTO v_valid
  FROM public.graduate_consents c
  JOIN public.graduate_events e ON e.id = NEW.event_id
  WHERE c.id = NEW.consent_id
    AND c.graduate_record_id = NEW.graduate_record_id
    AND c.purpose_code = e.purpose_code
    AND c.notice_version = e.notice_version
    AND c.consent_state = 'granted'
    AND c.withdrawn_at IS NULL;
  IF v_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ACTIVE_MATCHING_EVENT_CONSENT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER graduate_event_registration_consent_guard
BEFORE INSERT OR UPDATE ON public.graduate_event_registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_graduate_event_consent();

CREATE OR REPLACE FUNCTION public.reject_graduate_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GRADUATES_AFFAIRS_APPEND_ONLY_RECORD';
END;
$$;

CREATE TRIGGER graduate_domain_events_append_only
BEFORE UPDATE OR DELETE ON public.graduate_domain_events
FOR EACH ROW EXECUTE FUNCTION public.reject_graduate_immutable_mutation();

CREATE TRIGGER graduate_survey_versions_immutable_after_publish
BEFORE UPDATE OR DELETE ON public.graduate_survey_versions
FOR EACH ROW WHEN (OLD.published_at IS NOT NULL)
EXECUTE FUNCTION public.reject_graduate_immutable_mutation();

CREATE OR REPLACE FUNCTION public.create_graduate_record_from_official_decision(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.graduate_official_decisions%ROWTYPE;
  v_record_id uuid;
BEGIN
  SELECT * INTO v_decision
  FROM public.graduate_official_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR v_decision.decision_state <> 'approved' THEN
    RAISE EXCEPTION 'OFFICIAL_GRADUATION_DECISION_NOT_APPROVED';
  END IF;
  IF v_decision.approved_at IS NULL OR v_decision.approved_by IS NULL
     OR v_decision.effective_graduation_date IS NULL OR v_decision.program_id IS NULL
     OR v_decision.department_id IS NULL OR v_decision.academic_snapshot IS NULL
     OR v_decision.academic_snapshot = '{}'::jsonb THEN
    RAISE EXCEPTION 'OFFICIAL_GRADUATION_DECISION_INCOMPLETE';
  END IF;

  IF v_decision.supersedes_decision_id IS NOT NULL THEN
    UPDATE public.graduate_official_decisions
    SET decision_state = 'corrected'
    WHERE id = v_decision.supersedes_decision_id
      AND student_profile_id = v_decision.student_profile_id
      AND program_id = v_decision.program_id
      AND decision_state = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SUPERSEDED_GRADUATION_DECISION_NOT_CURRENT';
    END IF;
  END IF;

  INSERT INTO public.graduate_records (
    official_decision_id, student_profile_id, effective_graduation_date,
    program_id, department_id, academic_snapshot, created_by
  ) VALUES (
    v_decision.id, v_decision.student_profile_id, v_decision.effective_graduation_date,
    v_decision.program_id, v_decision.department_id, v_decision.academic_snapshot,
    v_decision.approved_by
  )
  ON CONFLICT (official_decision_id) DO NOTHING
  RETURNING id INTO v_record_id;

  IF v_record_id IS NULL THEN
    SELECT id INTO v_record_id FROM public.graduate_records WHERE official_decision_id = p_decision_id;
  END IF;
  RETURN v_record_id;
END;
$$;

-- Default deny. Future policies/RPC grants require a separate approved
-- authorization bundle with exact self/direct-assignment ALLOW/DENY tests.
ALTER TABLE public.graduate_official_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_employment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_survey_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduate_domain_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.create_graduate_record_from_official_decision(uuid) FROM PUBLIC, anon, authenticated;

-- Reporting contract (future RPC only): aggregate by approved program/cohort
-- snapshots; suppress every cell smaller than the survey/report threshold.
-- Row-level contact/employment exports remain prohibited until purpose-scoped,
-- expiring direct assignments and audited export approval are implemented.
