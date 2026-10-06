-- STUDENT-SERVICES-GLOBAL-SWITCH-01 rehearsal — harness extension.
-- Isolated throwaway cluster only; never production. Adds the production
-- objects the draft depends on (or that the cases need to exercise) which the
-- P1-08 rehearsal chain does not carry.

-- ---------------------------------------------------------------------------
-- 1. Audit: production-shaped audit_logs columns + the canonical single
--    7-argument public.log_audit (body = supabase/migrations/
--    20260624140000_student_requests_workflow_foundation.sql).
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS notes text;

-- Harness role store. Production resolves roles from user_roles /
-- user_role_assignments; the harness keeps the legacy `harness.roles_ok`
-- switch the earlier chain relies on and adds explicit per-user roles.
CREATE TABLE IF NOT EXISTS public.h_user_roles (
  user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));

CREATE OR REPLACE FUNCTION public.has_any_role(p_user uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_setting('harness.roles_ok', true), '') = '1'
      OR EXISTS (SELECT 1 FROM public.h_user_roles r
                 WHERE r.user_id = p_user AND r.role = ANY (p_roles))
$$;

CREATE OR REPLACE FUNCTION public.audit_resolve_role(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT min(r.role) FROM public.h_user_roles r WHERE r.user_id = p_user
$$;

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
REVOKE EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. B1 atomic submit: production body of
--    public.submit_b1_student_request_atomic_core (supabase/migrations/
--    20260811200938_…sql, renamed to *_core by 20260814173946_…sql).
--    The public 5/7-argument wrappers only add the biometric step-up proof and
--    then delegate here, so the cases call the core directly.
--    persist_validated_b1_request_details is a HARNESS STUB (the service
--    validators are out of scope for this package).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid, p_canonical_code text, p_form_data jsonb, p_attachment_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN; -- harness stub
END $$;

CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic_core(p_request_id uuid, p_canonical_code text, p_form_data jsonb, p_expected_updated_at timestamp with time zone, p_attachment_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_request public.student_requests%ROWTYPE;
  v_profile_id uuid;
  v_profile_status text;
  v_init jsonb;
  v_request_type public.request_types%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT c.profile_id,c.profile_status INTO v_profile_id,v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_STUDENT_PROFILE_REQUIRED' USING ERRCODE='42501'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r
  WHERE r.id=p_request_id AND r.student_profile_id=v_profile_id
    AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL OR v_request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'B1_STALE_REQUEST_VERSION' USING ERRCODE='40001';
  END IF;
  SELECT rt.* INTO v_request_type FROM public.request_types rt
  WHERE rt.code=v_request.request_type AND rt.is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_REQUIRED'; END IF;
  PERFORM public.assert_student_can_use_request_type(v_profile_status,v_request_type.request_audience);
  PERFORM public.assert_student_request_eligibility_rules(v_profile_id, v_request.request_type);

  -- This dispatcher validates trusted references, service rules, attachments,
  -- and writes details. Its default implementation above always fails closed.
  PERFORM public.persist_validated_b1_request_details(
    p_request_id,p_canonical_code,COALESCE(p_form_data,'{}'::jsonb),COALESCE(p_attachment_ids,ARRAY[]::uuid[])
  );
  v_init := public.initialize_b1_request_workflow_strict(p_request_id,p_canonical_code);

  PERFORM set_config('b1.atomic_submit','1',true);
  PERFORM set_config('student_request.submit_via_rpc','1',true);
  UPDATE public.student_requests SET status='submitted',submitted_at=COALESCE(submitted_at,now()),
    rejection_reason=NULL,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,event_type,actor_user_id,payload,visible_to_student)
  VALUES(p_request_id,'submitted',v_uid,jsonb_build_object('canonical_code',p_canonical_code),true);
  RETURN jsonb_build_object('success',true,'request_id',p_request_id,'workflow',v_init);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Fixtures: one legacy (generic create + submit) request type and the
--    actors of the switch matrix. Harness-only rows in the throwaway cluster.
-- ---------------------------------------------------------------------------
INSERT INTO public.request_types (code, name_ar, is_active, student_visible, request_audience)
VALUES ('enrollment_certificate', 'إفادة قيد', true, true, 'active_student')
ON CONFLICT (code) DO NOTHING;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),  -- admin
  ('aaaaaaaa-0000-0000-0000-000000000002'),  -- system_admin
  ('aaaaaaaa-0000-0000-0000-000000000003'),  -- dean
  ('aaaaaaaa-0000-0000-0000-000000000004'),  -- registrar
  ('aaaaaaaa-0000-0000-0000-000000000005'),  -- student_affairs
  ('aaaaaaaa-0000-0000-0000-000000000006'),  -- no role at all
  ('aaaaaaaa-0000-0000-0000-000000000007'),  -- second student (P1 atomic, enabled phase)
  ('aaaaaaaa-0000-0000-0000-000000000008')   -- third student  (P1 atomic, disabled phase)
ON CONFLICT (id) DO NOTHING;

-- The fixture student of the chain already holds an open replacement-card
-- request, and that service allows one open request per student, so the P1
-- atomic path gets two fresh students: one proves "enabled works", the other
-- proves "disabled is refused by the switch" (not by the duplicate rule).
INSERT INTO public.student_profiles (id, user_id, academic_number, full_name_ar, department_id, program_id, status)
SELECT v.id::uuid, v.user_id::uuid, v.academic_number, v.full_name_ar, sp.department_id, sp.program_id, 'active'
FROM (VALUES
  ('77777777-7777-7777-7777-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000007', 'TESTONLY-SSGS-2', 'طالب اختبار المفتاح 2'),
  ('77777777-7777-7777-7777-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000008', 'TESTONLY-SSGS-3', 'طالب اختبار المفتاح 3')
) AS v(id, user_id, academic_number, full_name_ar)
CROSS JOIN (SELECT department_id, program_id FROM public.student_profiles
            WHERE id = '77777777-7777-7777-7777-000000000001') sp
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.h_user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'system_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'dean'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'registrar'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'student_affairs'),
  ('11111111-1111-1111-1111-000000000010', 'student')
ON CONFLICT DO NOTHING;

-- Fingerprint of everything the draft must leave untouched on a re-apply and
-- everything a refused student write must leave untouched.
CREATE OR REPLACE FUNCTION public.h_ssgs_fingerprint() RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_switch text := 'absent';
BEGIN
  IF to_regclass('public.student_services_switch') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(string_agg(md5(w::text), '','' ORDER BY w.id), '''') FROM public.student_services_switch w'
      INTO v_switch;
  END IF;
  RETURN md5(concat_ws('|',
    (SELECT coalesce(string_agg(md5(r::text), ',' ORDER BY r.id), '') FROM public.student_requests r),
    (SELECT coalesce(string_agg(md5(s::text), ',' ORDER BY s.id), '') FROM public.student_request_workflow_steps s),
    (SELECT count(*)::text FROM public.student_request_workflow_events),
    v_switch,
    (SELECT count(*)::text FROM public.audit_logs),
    (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.oid::regprocedure::text)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname NOT LIKE 'h\_%'),
    (SELECT string_agg(t.tgname || ':' || t.tgtype::text || ':' || t.tgenabled::text, ',' ORDER BY t.tgrelid::regclass::text, t.tgname)
       FROM pg_trigger t WHERE NOT t.tgisinternal)
  ));
END $$;

-- Harness-only: the P1 atomic service is exercised through its public RPC, so
-- it has to be visible to the fixture student in THIS throwaway cluster (the
-- same thing scripts/p1-atomic-submit-07a-pg17/01-cases.sql does). The draft
-- itself never touches request_types.
UPDATE public.request_types SET student_visible = true WHERE code = 'replacement_student_card';
