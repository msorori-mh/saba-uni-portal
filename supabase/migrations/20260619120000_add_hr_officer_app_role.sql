-- RBAC-002: Add hr_officer to app_role enum (used by staff-management & communications).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr_officer';
