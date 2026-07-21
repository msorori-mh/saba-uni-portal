-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-MINIMAL-SCHEMA
-- Local PG 17.10 harness ONLY. NOT a production migration. NOT applied anywhere.
--
-- Minimal schema containing ONLY the tables/columns the audit SQL touches.
-- Column DDL quoted from recon SCHEMA-INVENTORY.md (which quotes
-- supabase/migrations verbatim); constraints/indexes/RLS trimmed to the
-- minimum needed to execute the audit semantics.
--
-- Quoted sources:
--   departments                     20260531210958_82731263  (recon §2.1; NO code column)
--   faculty_profiles                20260531225124_3eba0684  (recon §3.1; employee_number UNIQUE)
--   request_processing_units        20260710160000           (recon §6.1)
--   request_processing_roles        20260710160000           (recon §6.2)
--   request_processing_assignments  20260710160000           (recon §6.3)
--
-- Harness rule: every object lives inside schema b_chairs. Nothing else is touched.
-- ============================================================================

DROP SCHEMA IF EXISTS b_chairs CASCADE;
CREATE SCHEMA b_chairs;
SET search_path TO b_chairs, public;

-- recon §2.1 (20260531210958_82731263): "id UUID ... PRIMARY KEY, name_ar TEXT NOT NULL,
-- is_active BOOLEAN NOT NULL DEFAULT true" — minimal subset; NOTE: no code column exists.
CREATE TABLE b_chairs.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- recon §3.1 (20260531225124_3eba0684): "id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
-- user_id uuid ..., employee_number text UNIQUE, full_name_ar text NOT NULL,
-- department_id uuid REFERENCES public.departments(id) ..., status text NOT NULL DEFAULT 'active'"
CREATE TABLE b_chairs.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  employee_number text UNIQUE,
  full_name_ar text NOT NULL,
  department_id uuid REFERENCES b_chairs.departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
);

-- recon §6.1 (20260710160000): "id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
-- code text NOT NULL, name_ar text NOT NULL, is_active boolean NOT NULL DEFAULT true"
-- + UNIQUE(code)
CREATE TABLE b_chairs.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT request_processing_units_code_key UNIQUE (code)
);

-- recon §6.2 (20260710160000): "id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
-- unit_id uuid NOT NULL REFERENCES ...request_processing_units(id) ON DELETE RESTRICT,
-- code text NOT NULL, name_ar text NOT NULL, is_active boolean NOT NULL DEFAULT true"
-- + UNIQUE(unit_id, code)
CREATE TABLE b_chairs.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES b_chairs.request_processing_units(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT request_processing_roles_unit_code_key UNIQUE (unit_id, code)
);

-- recon §6.3 (20260710160000), quoted verbatim column set:
-- "id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL REFERENCES
--  ... ON DELETE RESTRICT, role_id uuid REFERENCES ... ON DELETE RESTRICT,
--  assignment_type text NOT NULL, user_id uuid, staff_profile_id uuid,
--  faculty_profile_id uuid, position_assignment_id uuid, department_id uuid,
--  is_active boolean NOT NULL DEFAULT true, starts_at timestamptz, ends_at timestamptz,
--  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()"
-- CHECK assignment_type IN ('user','staff_profile','faculty_profile','position_assignment',
-- 'department_position','college_position')
-- NOTE (recon, verbatim): no CHECK requiring an identity link to be non-null.
CREATE TABLE b_chairs.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES b_chairs.request_processing_units(id) ON DELETE RESTRICT,
  role_id uuid REFERENCES b_chairs.request_processing_roles(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid,
  faculty_profile_id uuid,
  position_assignment_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_processing_assignments_type_check
    CHECK (assignment_type IN ('user','staff_profile','faculty_profile',
                               'position_assignment','department_position','college_position'))
);
