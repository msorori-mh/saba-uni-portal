-- PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_D_AUTHORIZATION_E2E_IMPLEMENTATION_01_CORRECTED
-- SQL Fixture Manifest for Safe Test Environments
-- Authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
-- MARKER: TEST_ONLY_GP_MVP_E2E_01

-- WARNING: DO NOT APPLY ON PRODUCTION SYSTEM. FOR LOCAL/TEST CONTAINER ENVIRONMENTS ONLY.

BEGIN;

-- 1. Create TEST_ONLY schema namespace check or tag marker table
CREATE TABLE IF NOT EXISTS public.gp_test_manifest_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_tag text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gp_test_manifest_markers (marker_tag)
VALUES ('TEST_ONLY_GP_MVP_E2E_01')
ON CONFLICT (marker_tag) DO NOTHING;

-- 2. TEST_ONLY Actor Profiles (Synthetic UUIDs with prefix '00000000-0000-4000-a000-')
-- Leader: 00000000-0000-4000-a000-000000000001
-- Member A: 00000000-0000-4000-a000-000000000002
-- Member B: 00000000-0000-4000-a000-000000000003
-- Unrelated Student: 00000000-0000-4000-a000-000000000004
-- Coordinator: 00000000-0000-4000-a000-000000000005
-- Pending Supervisor: 00000000-0000-4000-a000-000000000006
-- Accepted Supervisor: 00000000-0000-4000-a000-000000000007
-- Unrelated Supervisor: 00000000-0000-4000-a000-000000000008
-- Committee Member 1: 00000000-0000-4000-a000-000000000009
-- Committee Member 2: 00000000-0000-4000-a000-000000000010
-- Unauthorized Admin: 00000000-0000-4000-a000-000000000011
-- Unauthorized Dean: 00000000-0000-4000-a000-000000000012
-- Unauthorized Head: 00000000-0000-4000-a000-000000000013
-- Unauthorized Registrar: 00000000-0000-4000-a000-000000000014
-- Administration Viewer: 00000000-0000-4000-a000-000000000015

-- 3. Synthetic Test Department & Project Identifiers
-- Department ID: 00000000-0000-4000-b000-000000000001 (Computer Science)
-- Project ID: 00000000-0000-4000-c000-000000000001 (E2E Test Project)
-- Private Storage Bucket: graduation-projects-files
-- Object Key Format: graduation-projects/00000000-0000-4000-c000-000000000001/e2e-proposal-v1.pdf

COMMIT;
