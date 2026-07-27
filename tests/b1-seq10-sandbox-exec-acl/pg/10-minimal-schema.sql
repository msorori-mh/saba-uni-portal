-- Minimal local schema for SEQ10 sandbox_exec ACL remediation harness.
-- Not a production migration. Disposable PG17 only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.absence_excuse_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  course_section_id uuid,
  absence_date date,
  reason_type text,
  record_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aed_reason_chk CHECK (
    reason_type = ANY (ARRAY[
      'medical'::text,
      'family'::text,
      'emergency'::text,
      'other'::text,
      'official_assignment'::text,
      'force_majeure'::text
    ])
  )
);

CREATE OR REPLACE FUNCTION public.is_owner_of_request(p_user_id uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.assert_b1_active_course_enrollment(
  p_student_profile_id uuid,
  p_course_section_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN;
END;
$$;

-- Baseline table ACL: owner + authenticated/service_role SELECT.
-- Scenario scripts may additionally grant sandbox_exec or a rogue role.
REVOKE ALL ON TABLE public.absence_excuse_details FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.absence_excuse_details TO authenticated, service_role;
