-- Local PG17 harness for COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
-- Minimal schema + stubs so the real migration drafts can be loaded verbatim.
-- Read-only with respect to production: this runs on a throwaway local cluster.

CREATE SCHEMA IF NOT EXISTS public;

CREATE TYPE public.academic_council_member_role AS ENUM
  ('chair','vice_chair','secretary','member','viewer');
CREATE TYPE public.academic_council_meeting_status AS ENUM
  ('scheduled','intake_open','intake_closed','agenda_ready','in_session',
   'minutes_draft','minutes_review','minutes_locked','archived','cancelled');
CREATE TYPE public.academic_council_agenda_item_session_status AS ENUM
  ('pending','in_discussion','voting_open','voting_closed','resolved');
CREATE TYPE public.academic_council_attendance_roll_status AS ENUM ('open','finalized');
CREATE TYPE public.academic_council_attendance_state AS ENUM
  ('present','present_remote','excused','absent');
CREATE TYPE public.academic_council_vote_value AS ENUM ('yes','no','abstain');

CREATE TABLE public.academic_council_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id uuid NOT NULL,
  title text,
  status public.academic_council_meeting_status NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  intake_opens_at timestamptz,
  intake_closes_at timestamptz
);

CREATE TABLE public.academic_council_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.academic_council_meetings(id),
  session_status public.academic_council_agenda_item_session_status NOT NULL DEFAULT 'pending',
  vote_opened_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
);

CREATE TABLE public.academic_council_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role public.academic_council_member_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.academic_council_meeting_attendance_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE,
  status public.academic_council_attendance_roll_status NOT NULL DEFAULT 'open'
);

CREATE TABLE public.academic_council_meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  user_id uuid NOT NULL,
  attendance_state public.academic_council_attendance_state NOT NULL,
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE public.academic_council_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  agenda_item_id uuid NOT NULL,
  council_id uuid NOT NULL,
  voter_user_id uuid NOT NULL,
  vote_value public.academic_council_vote_value NOT NULL,
  UNIQUE (agenda_item_id, voter_user_id)
);

-- ---- stubs for platform helpers the drafts call --------------------------
CREATE TABLE public.harness_current_uid (uid uuid);
INSERT INTO public.harness_current_uid VALUES (NULL);

CREATE FUNCTION public.council_attendance_require_auth_uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT uid FROM public.harness_current_uid LIMIT 1 $$;

CREATE FUNCTION public.harness_set_uid(p uuid) RETURNS void
LANGUAGE sql AS $$ UPDATE public.harness_current_uid SET uid = p $$;

CREATE FUNCTION public.has_council_role(p_uid uuid, p_council uuid, p_role public.academic_council_member_role)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.academic_council_members
                 WHERE user_id = p_uid AND council_id = p_council AND role = p_role AND is_active)
$$;

CREATE FUNCTION public.council_attendance_emit_audit(
  uuid, uuid, uuid, text, text, uuid, jsonb
) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;

CREATE TABLE public.harness_vote_events (agenda_item_id uuid, event_type text, at timestamptz DEFAULT now());

CREATE FUNCTION public.council_dispatch_vote_event(p_item uuid, p_event text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS int LANGUAGE sql AS $$
  INSERT INTO public.harness_vote_events (agenda_item_id, event_type) VALUES (p_item, p_event)
  RETURNING 1
$$;

-- roles referenced by GRANT/REVOKE in the drafts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
