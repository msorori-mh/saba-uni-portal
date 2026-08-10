-- LONGRUN-08 G13: disposable PG17 minimal schema + stub RPCs for operator simulation.
-- NOT production. SELECT-only operator. Exact denial contracts from live source.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid PRIMARY KEY,
  request_number text NOT NULL UNIQUE,
  request_type text NOT NULL,
  status text NOT NULL,
  student_profile_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_request_workflow_steps (
  id uuid PRIMARY KEY,
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  step_key text NOT NULL,
  step_order int NOT NULL,
  status text NOT NULL,
  processing_unit_id uuid,
  processing_role_id uuid,
  assigned_user_id uuid,
  workflow_step_id uuid,
  workflow_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_runtime_id uuid NOT NULL,
  assigned_user_id uuid,
  processing_unit_id uuid,
  processing_role_id uuid
);

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id uuid PRIMARY KEY,
  user_id uuid,
  status text NOT NULL DEFAULT 'active',
  fingerprint_marker text NOT NULL DEFAULT 'base'
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL DEFAULT 'n'
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL DEFAULT 'a'
);

CREATE TABLE IF NOT EXISTS public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid
);

-- Stub auth.uid()
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Live denial contracts (G4)
CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(
  p_step_id uuid, p_action text, p_comment text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_configured text := 'review';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED';
  END IF;
  -- Authorization uses configured action; unauthorized principal denied first.
  IF v_step.assigned_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_action IS DISTINCT FROM v_configured THEN
    RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  -- If somehow allowed, mutate (should never happen in negative sim).
  UPDATE public.student_request_workflow_steps SET status = 'completed' WHERE id = p_step_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(
  p_step_id uuid, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_step.step_key IS DISTINCT FROM 'payment_confirmation' OR v_step.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP' USING ERRCODE = '22023';
  END IF;
  IF v_step.assigned_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'DIRECT_PAYMENT_ASSIGNEE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.student_request_workflow_steps SET status = 'completed' WHERE id = p_step_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Deterministic fixtures
INSERT INTO public.student_requests(id, request_number, request_type, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'SR-LOCAL-00000001', 'enrollment_suspension', 'in_review'),
  ('22222222-2222-2222-2222-222222222222', 'SR-LOCAL-00000002', 'department_transfer', 'in_review')
ON CONFLICT DO NOTHING;

INSERT INTO public.student_request_workflow_steps(
  id, student_request_id, step_key, step_order, status, assigned_user_id
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'student_affairs_intake', 1, 'active', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'payment_confirmation', 2, 'active', 'dddddddd-dddd-dddd-dddd-dddddddddddd')
ON CONFLICT DO NOTHING;

INSERT INTO public.student_profiles(id, user_id, fingerprint_marker)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'base')
ON CONFLICT DO NOTHING;

-- SELECT-only operator role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') THEN
    CREATE ROLE b1_matrix_operator LOGIN PASSWORD 'local-only-not-a-secret';
  END IF;
END$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, b1_matrix_operator;
GRANT USAGE ON SCHEMA public TO b1_matrix_operator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO b1_matrix_operator;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;
ALTER ROLE b1_matrix_operator NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;

DROP TABLE IF EXISTS public.b1_sim_results;
CREATE TABLE public.b1_sim_results(
  case_id text PRIMARY KEY,
  verdict text NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION public.b1_sim_fp() RETURNS text
LANGUAGE sql STABLE SET search_path TO public AS $$
  SELECT md5(string_agg(x, '|' ORDER BY x))
  FROM (
    SELECT 'requests=' || count(*)::text FROM public.student_requests
    UNION ALL
    SELECT 'steps=' || coalesce(string_agg(id::text || ':' || status, ',' ORDER BY id), '')
      FROM public.student_request_workflow_steps
    UNION ALL
    SELECT 'profiles=' || coalesce(string_agg(fingerprint_marker, ',' ORDER BY id), '')
      FROM public.student_profiles
    UNION ALL
    SELECT 'notifications=' || count(*)::text FROM public.notifications
    UNION ALL
    SELECT 'audit=' || count(*)::text FROM public.audit_logs
    UNION ALL
    SELECT 'fees=' || count(*)::text FROM public.student_fees
    UNION ALL
    SELECT 'payments=' || count(*)::text FROM public.student_payments
    UNION ALL
    SELECT 'receipts=' || count(*)::text FROM public.payment_receipts
  ) s(x);
$$;

CREATE OR REPLACE FUNCTION public.b1_sim_record(p_id text, p_verdict text, p_detail text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  INSERT INTO public.b1_sim_results(case_id, verdict, detail)
  VALUES (p_id, p_verdict, p_detail)
  ON CONFLICT (case_id) DO UPDATE
    SET verdict = EXCLUDED.verdict, detail = EXCLUDED.detail;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b1_sim_results TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_sim_fp() TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_sim_record(text,text,text) TO b1_matrix_operator;
