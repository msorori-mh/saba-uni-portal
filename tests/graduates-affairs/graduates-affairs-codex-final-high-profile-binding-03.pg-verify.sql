\set ON_ERROR_STOP on

-- CODEX-FINAL-HIGH-1 / HIGH-2 executable matrix.
-- Chain: graduates-affairs-authorization-04.pg-setup.sql
--   -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
--   -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql
--   -> GRADUATES-AFFAIRS-AUTHORIZATION-04.sql
--   -> this file.
-- Disposable PG17 only. No production contact.

CREATE TEMP TABLE cf_ids (key text PRIMARY KEY, id uuid NOT NULL);

-- Shared graduate records (D1 / D2) for scope and follow-up cases.
INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES
  ('cfd00000-0000-4000-8000-00000000000a',
   '20000000-0000-4000-8000-00000000000a',
   'registrar_approved_decision', 'REG-CF-A', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', '{"cf":"a"}',
   repeat('1', 64)),
  ('cfd00000-0000-4000-8000-00000000000b',
   '20000000-0000-4000-8000-00000000000b',
   'registrar_approved_decision', 'REG-CF-B', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', '{"cf":"b"}',
   repeat('2', 64));

INSERT INTO cf_ids VALUES
  ('record_a', public.create_graduate_record_from_official_decision('cfd00000-0000-4000-8000-00000000000a')),
  ('record_b', public.create_graduate_record_from_official_decision('cfd00000-0000-4000-8000-00000000000b'));

-- Extra principals for the direct-user / multi-profile matrix.
-- Prefix cf1..cf9 under 10000000-0000-4000-8000-000000000cfN / profiles 5fN.
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000cf1'),
  ('10000000-0000-4000-8000-000000000cf2'),
  ('10000000-0000-4000-8000-000000000cf3'),
  ('10000000-0000-4000-8000-000000000cf4'),
  ('10000000-0000-4000-8000-000000000cf5'),
  ('10000000-0000-4000-8000-000000000cf6'),
  ('10000000-0000-4000-8000-000000000cf7'),
  ('10000000-0000-4000-8000-000000000cf8'),
  ('10000000-0000-4000-8000-000000000cf9')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_profiles (id, user_id, status) VALUES
  -- cf1: direct-user specialist, exactly one active profile (D1)
  ('5f000000-0000-4000-8000-000000000cf1', '10000000-0000-4000-8000-000000000cf1', 'active'),
  -- cf2: zero active profiles (no staff_profiles row)
  -- cf3: inactive profile only
  ('5f000000-0000-4000-8000-000000000cf3', '10000000-0000-4000-8000-000000000cf3', 'inactive'),
  -- cf4: suspended profile only
  ('5f000000-0000-4000-8000-000000000cf4', '10000000-0000-4000-8000-000000000cf4', 'suspended'),
  -- cf5: two active profiles (ambiguous)
  ('5f000000-0000-4000-8000-000000000cf5', '10000000-0000-4000-8000-000000000cf5', 'active'),
  ('5f000000-0000-4000-8000-00000000cf5b', '10000000-0000-4000-8000-000000000cf5', 'active'),
  -- cf6: direct-user assignment expired (profile active)
  ('5f000000-0000-4000-8000-000000000cf6', '10000000-0000-4000-8000-000000000cf6', 'active'),
  -- cf7: direct-user assignment revoked/is_active=false
  ('5f000000-0000-4000-8000-000000000cf7', '10000000-0000-4000-8000-000000000cf7', 'active'),
  -- cf8: staff_profile assignment Profile A + unrelated active Profile B
  ('5f000000-0000-4000-8000-000000000cf8', '10000000-0000-4000-8000-000000000cf8', 'active'),
  ('5f000000-0000-4000-8000-00000000cf8b', '10000000-0000-4000-8000-000000000cf8', 'active'),
  -- cf9: follow-up deactivation principal (starts with one active profile)
  ('5f000000-0000-4000-8000-000000000cf9', '10000000-0000-4000-8000-000000000cf9', 'active');

INSERT INTO public.staff_profile_departments VALUES
  ('5f000000-0000-4000-8000-000000000cf1', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000cf5', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-00000000cf5b', '30000000-0000-4000-8000-000000000002'),
  ('5f000000-0000-4000-8000-000000000cf6', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000cf7', '30000000-0000-4000-8000-000000000001'),
  -- cf8: Profile A => D1 (authorizing), Profile B => D2 (no GA assignment)
  ('5f000000-0000-4000-8000-000000000cf8', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-00000000cf8b', '30000000-0000-4000-8000-000000000002'),
  ('5f000000-0000-4000-8000-000000000cf9', '30000000-0000-4000-8000-000000000001');

INSERT INTO public.request_processing_assignments (
  id, unit_id, role_id, assignment_type, user_id, staff_profile_id,
  is_active, starts_at, ends_at
) VALUES
  -- cf1: direct-user specialist + one active profile
  ('8f000000-0000-4000-8000-000000000cf1',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf1', NULL, true, NULL, NULL),
  -- cf2: direct-user specialist + zero profiles
  ('8f000000-0000-4000-8000-000000000cf2',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf2', NULL, true, NULL, NULL),
  -- cf3: direct-user + inactive profile only
  ('8f000000-0000-4000-8000-000000000cf3',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf3', NULL, true, NULL, NULL),
  -- cf4: direct-user + suspended profile only
  ('8f000000-0000-4000-8000-000000000cf4',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf4', NULL, true, NULL, NULL),
  -- cf5: direct-user + two active profiles
  ('8f000000-0000-4000-8000-000000000cf5',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf5', NULL, true, NULL, NULL),
  -- cf6: direct-user expired
  ('8f000000-0000-4000-8000-000000000cf6',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf6', NULL, true,
   now() - interval '30 days', now() - interval '1 day'),
  -- cf7: direct-user revoked
  ('8f000000-0000-4000-8000-000000000cf7',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf7', NULL, false, NULL, NULL),
  -- cf8: staff_profile assignment on Profile A only
  ('8f000000-0000-4000-8000-000000000cf8',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'staff_profile', NULL, '5f000000-0000-4000-8000-000000000cf8', true, NULL, NULL),
  -- cf9: direct-user specialist for follow-up deactivation proof
  ('8f000000-0000-4000-8000-000000000cf9',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000cf9', NULL, true, NULL, NULL);

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM cf_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM cf_ids WHERE key = 'record_b');
  v_scope uuid[];
  v_events integer;
  v_followup uuid;
  v_notes text;
BEGIN
  -- 1. direct-user manager + exactly one active profile → ALLOW
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  IF NOT public.graduate_affairs_is_manager() THEN
    RAISE EXCEPTION 'CF1 expected direct-user manager ALLOW';
  END IF;
  IF public.graduate_affairs_resolve_caller_authorized_staff_profile_id('graduate_affairs_manager')
     IS DISTINCT FROM '50000000-0000-4000-8000-00000000000c'::uuid THEN
    RAISE EXCEPTION 'CF1 manager profile resolution mismatch';
  END IF;
  PERFORM public.graduate_affairs_get_graduate_file(v_record_a);

  -- 2. direct-user specialist + exactly one active profile → ALLOW only in that profile's depts
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf1', 'role', 'authenticated')::text, true);
  IF NOT public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF2 expected direct-user specialist ALLOW';
  END IF;
  SELECT array_agg(d ORDER BY d) INTO v_scope
  FROM public.graduate_affairs_specialist_department_ids() d;
  IF v_scope IS DISTINCT FROM ARRAY['30000000-0000-4000-8000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'CF2 specialist scope incorrect: %', v_scope;
  END IF;
  PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_b);
    RAISE EXCEPTION 'CF2 expected D2 denial for D1-only direct-user specialist';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  -- 3. direct-user + zero active profiles → DENY
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf2', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist()
     OR public.graduate_affairs_user_is_active_staff('10000000-0000-4000-8000-000000000cf2') THEN
    RAISE EXCEPTION 'CF3 zero-profile direct-user must DENY';
  END IF;

  -- 4. direct-user + inactive profile only → DENY
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf3', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF4 inactive-only direct-user must DENY';
  END IF;

  -- 5. direct-user + suspended profile only → DENY
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf4', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF5 suspended-only direct-user must DENY';
  END IF;

  -- 6. direct-user + two active profiles → DENY fail-closed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf5', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist()
     OR public.graduate_affairs_resolve_authorized_staff_profile_id(
          '10000000-0000-4000-8000-000000000cf5', 'graduate_affairs_specialist'
        ) IS NOT NULL THEN
    RAISE EXCEPTION 'CF6 ambiguous two-active-profile direct-user must DENY';
  END IF;
  SELECT array_agg(d) INTO v_scope FROM public.graduate_affairs_specialist_department_ids() d;
  IF v_scope IS NOT NULL THEN
    RAISE EXCEPTION 'CF6 ambiguous specialist must have empty scope: %', v_scope;
  END IF;

  -- 7. direct-user assignment expired → DENY
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf6', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF7 expired direct-user must DENY';
  END IF;

  -- 8. direct-user assignment revoked/is_active=false → DENY
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf7', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF8 revoked direct-user must DENY';
  END IF;

  -- 9. staff_profile assignment Profile A + unrelated active Profile B → only A scope
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf8', 'role', 'authenticated')::text, true);
  IF NOT public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'CF9 expected Profile-A staff_profile specialist ALLOW';
  END IF;
  IF public.graduate_affairs_resolve_caller_authorized_staff_profile_id('graduate_affairs_specialist')
     IS DISTINCT FROM '5f000000-0000-4000-8000-000000000cf8'::uuid THEN
    RAISE EXCEPTION 'CF9 must bind to authorizing Profile A only';
  END IF;
  SELECT array_agg(d ORDER BY d) INTO v_scope
  FROM public.graduate_affairs_specialist_department_ids() d;
  IF v_scope IS DISTINCT FROM ARRAY['30000000-0000-4000-8000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'CF9 Profile B must not expand scope: %', v_scope;
  END IF;
  PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_b);
    RAISE EXCEPTION 'CF9 expected D2 denial (Profile B must not expand GA scope)';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  -- Follow-up delegation: assignee cf8 owns Profile A (GA+D1) and Profile B (D2, no GA).
  -- Authorized specialist scope must be D1 only (Profile B must not expand).
  SELECT array_agg(d ORDER BY d) INTO v_scope
  FROM public.graduate_affairs_user_specialist_department_ids(
    '10000000-0000-4000-8000-000000000cf8'
  ) d;
  IF v_scope IS DISTINCT FROM ARRAY['30000000-0000-4000-8000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'CF-DEL assignee scope leaked Profile B: %', v_scope;
  END IF;

  -- Specialist creator (D2) assigning cf8 (authorized D1 only) onto D2 record
  -- → DENY OUT_OF_SCOPE. Profile B must not expand assignee authority.
  -- Manager college-wide assign remains R4; this proves assignee scope binding.
  SELECT count(*) INTO v_events FROM public.graduate_domain_events;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000006', 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_b, '10000000-0000-4000-8000-000000000cf8', 'cf_profile_b_leak');
    RAISE EXCEPTION 'CF-DEL expected D2 assignee denial for Profile-A-only specialist';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'CF-DEL denial mutated audit events';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graduate_followups
    WHERE purpose_code = 'cf_profile_b_leak'
  ) THEN
    RAISE EXCEPTION 'CF-DEL denial inserted follow-up row';
  END IF;

  -- Inverse: legitimate Department A assign (manager creator) → ALLOW.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v_followup := public.graduate_affairs_create_followup(
    v_record_a, '10000000-0000-4000-8000-000000000cf8', 'cf_profile_a_ok');
  IF v_followup IS NULL THEN
    RAISE EXCEPTION 'CF-DEL expected D1 assignee ALLOW';
  END IF;
  PERFORM public.graduate_affairs_transition_followup(v_followup, 'cancelled');

  -- 10. follow-up direct assignee after Profile A deactivation → read DENY + transition DENY
  --     even though direct user assignment remains active. Historical row retained.
  v_followup := public.graduate_affairs_create_followup(
    v_record_a, '10000000-0000-4000-8000-000000000cf9', 'cf_deactivate');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000cf9', 'role', 'authenticated')::text, true);
  PERFORM public.graduate_affairs_get_graduate_file(v_record_a);

  UPDATE public.staff_profiles
  SET status = 'inactive'
  WHERE id = '5f000000-0000-4000-8000-000000000cf9';

  -- Assignment still active.
  IF NOT EXISTS (
    SELECT 1 FROM public.request_processing_assignments
    WHERE id = '8f000000-0000-4000-8000-000000000cf9' AND is_active
  ) THEN
    RAISE EXCEPTION 'CF10 precondition: direct-user assignment must remain active';
  END IF;

  SELECT count(*) INTO v_events FROM public.graduate_domain_events;
  SELECT notes_protected INTO v_notes FROM public.graduate_followups WHERE id = v_followup;

  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
    RAISE EXCEPTION 'CF10 expected deactivated-profile follow-up read DENY';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'CF10 expected deactivated-profile follow-up transition DENY';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;

  -- 11. zero protected-domain side effect on denial
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'CF11 denial mutated audit events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.graduate_followups
    WHERE id = v_followup AND state = 'open'
  ) THEN
    RAISE EXCEPTION 'CF11 follow-up row must remain for audit';
  END IF;
  IF (SELECT notes_protected FROM public.graduate_followups WHERE id = v_followup)
     IS DISTINCT FROM v_notes THEN
    RAISE EXCEPTION 'CF11 protected notes mutated on denial';
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'graduates-affairs-codex-final-high-profile-binding-03 pg-verify: PASS';
END;
$$;
