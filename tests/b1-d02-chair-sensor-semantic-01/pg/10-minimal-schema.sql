-- ============================================================================
-- B1-D02-CHAIR-SENSOR-SEMANTIC-01 — disposable PG17 harness
-- Mission: PORTAL-B1-GO-LIVE-MIGRATION-DRIFT-TESTONLY-D02-FINAL-CLOSURE
--
-- Local throwaway database only. Never run against production.
-- Proves the fixed D-02 chair sensor counts ONLY active department_head
-- faculty_profile assignments and is not inflated by non-chair roles.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.request_processing_units (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.request_processing_roles (
  id uuid PRIMARY KEY,
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (unit_id, code)
);

CREATE TABLE IF NOT EXISTS public.faculty_profiles (
  id uuid PRIMARY KEY,
  user_id uuid,
  employee_number text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id),
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.request_processing_assignments (
  id uuid PRIMARY KEY,
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  role_id uuid NOT NULL REFERENCES public.request_processing_roles(id),
  assignment_type text NOT NULL,
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id),
  department_id uuid REFERENCES public.departments(id),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);
