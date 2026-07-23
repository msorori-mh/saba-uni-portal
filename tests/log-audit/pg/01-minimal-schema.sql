-- LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01 — PG17 minimal schema (harness)
--
-- Mirrors the production dual-overload state using DDL quoted verbatim from
-- the applied migrations (recon at main 45148e09):
--   * public.audit_logs            quoted from 20260601013349 (Phase 6A)
--   * 6-arg public.log_audit       quoted from 20260601013349
--   * 6-arg grant history          GRANT (20260601013349) then REVOKE
--                                  (20260611211954) -> service_role-only
--   * 7-arg public.log_audit       quoted from 20260621022558 (SR-A1/A2/B2)
--                                  (no GRANT ever -> default PUBLIC EXECUTE)
-- Minimal stand-ins (documented, not production-quoted):
--   * auth.uid()          -> returns NULL (no JWT context in harness)
--   * audit_resolve_role  -> returns NULL (public.user_roles is out of scope)
-- This file is self-cleaning at the start so a failed previous run cannot
-- poison a re-run. Roles anon/authenticated/service_role are created if
-- missing and intentionally left in place (inert NOLOGIN roles shared with
-- other harness tracks).

SET client_min_messages = warning;

-- ---- reset of any prior run leftovers ----
DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.audit_resolve_role(uuid);
DROP TABLE IF EXISTS public.audit_logs;
DROP FUNCTION IF EXISTS auth.uid();
DROP SCHEMA IF EXISTS auth;

-- ---- supabase built-in roles (harness stand-ins) ----
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- minimal auth schema stand-in ----
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULL::uuid $$;

-- ---- public.audit_logs (DDL quoted verbatim from 20260601013349) ----
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text,
  entity_type text NOT NULL,
  entity_id uuid,
  action_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  notes text,
  ip_address text,
  user_agent text
);

-- ---- audit_resolve_role (minimal stand-in; production body resolves via
--      public.user_roles, out of scope for this harness) ----
CREATE OR REPLACE FUNCTION public.audit_resolve_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT NULL::text $$;

-- ---- LEGACY 6-arg overload (DDL quoted verbatim from 20260601013349) ----
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text,
  _entity_id uuid,
  _action_type text,
  _old jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs(actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
  VALUES (v_uid, public.audit_resolve_role(v_uid), _entity_type, _entity_id, _action_type, _old, _new, _notes);
END;
$$;

-- grant history, replayed in order:
--   20260601013349: GRANT ... TO authenticated, service_role
--   20260611211954: REVOKE ... FROM anon, public, authenticated
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_audit(_entity_type text, _entity_id uuid, _action_type text, _old jsonb, _new jsonb, _notes text) FROM anon, public, authenticated;

-- ---- CANONICAL 7-arg overload (DDL quoted verbatim from 20260621022558) ----
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text,
  _entity_id uuid,
  _action_type text,
  _old jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(_actor_user_id, auth.uid());
BEGIN
  INSERT INTO public.audit_logs(actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
  VALUES (v_uid, public.audit_resolve_role(v_uid), _entity_type, _entity_id, _action_type, _old, _new, _notes);
END;
$$;
-- (no GRANT issued for the 7-arg overload, exactly as in the applied
--  migrations -> default PUBLIC EXECUTE persists here, as in production)

-- ---- seed pre-existing audit rows (legacy data that must survive) ----
INSERT INTO public.audit_logs (id, actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NULL, 'admin', 'document', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'document_cancelled', '{"status":"issued"}'::jsonb, '{"status":"cancelled"}'::jsonb, 'pre-existing row 1'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', NULL, NULL, 'finance', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'fee_created', NULL, '{"amount":100}'::jsonb, NULL),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', NULL, 'system_admin', 'security', NULL, 'rate_limit_triggered', NULL, '{"key":"login"}'::jsonb, 'pre-existing row 3');
