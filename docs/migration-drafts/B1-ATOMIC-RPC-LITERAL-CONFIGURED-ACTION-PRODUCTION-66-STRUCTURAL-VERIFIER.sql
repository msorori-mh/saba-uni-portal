-- PORTAL-B1-...-66 — STRUCTURAL VERIFIER (source-side, read-only)
-- Verifies the shape of the migration file itself before it is scheduled.
-- Run with: psql -f (against any scratch DB) OR read as documentation; it makes
-- no schema reference and performs no writes.

-- The authoritative structural assertions are executed by
-- tests/b1-five-services-rpc-authorization-preflight-01/atomic-rpc-literal-configured-action-package-66.test.ts
-- This file states them in SQL-comment form for operator review:
--
--   S1  exactly one BEGIN; and one COMMIT; (single transaction, no partial apply)
--   S2  exactly four CREATE OR REPLACE FUNCTION statements, no CREATE TABLE,
--       no DROP, no ALTER, no GRANT/REVOKE, no INSERT/UPDATE/DELETE/TRUNCATE
--   S3  the executor keeps signature (uuid, text, text, jsonb) RETURNS jsonb,
--       SECURITY DEFINER, SET search_path TO 'public'
--   S4  the readers keep SECURITY DEFINER + SET search_path TO 'public', 'pg_temp'
--   S5  b1_map_ui_staff_action is not referenced by any replaced function body
--   S6  the literal guard `p_action IS DISTINCT FROM v_config.action_type` is present
--       and raises with ERRCODE 42501
--   S7  no reference to student_visible mutation, no protected request numbers
--       (SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8,
--        USR-2026-000001, USR-2026-000002)
--   S8  enrollment_certificate is never named as a mutated object
--   S9  the pre-condition and post-condition DO blocks exist and abort the
--       transaction on owner / search_path / ACL / visibility drift

SELECT 'STRUCTURAL_VERIFIER_66' AS id,
       'assertions S1..S9 are enforced by the package test suite' AS note;
