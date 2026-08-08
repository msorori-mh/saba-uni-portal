\set ON_ERROR_STOP on

-- QWEN-FINAL-NOTE-CONTEXT-RPC: functional matrix for runtime context RPCs.
-- Chain: graduates-affairs-authorization-04.pg-setup.sql
--   -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
--   -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql
--   -> GRADUATES-AFFAIRS-AUTHORIZATION-04.sql
--   -> this file.
-- Proves graduate_affairs_resolve_self_context / resolve_staff_record_access
-- derive authority from auth.uid() + database state only (no client-forged
-- ownsGraduateRecord / assignments / departmentIds / appRoles / continuity).
-- Disposable PG17 only. No production contact.

CREATE TEMP TABLE ctx_ids (key text PRIMARY KEY, id uuid NOT NULL);

-- Continuity policy required for approved-self positive continuity_allowed.
INSERT INTO public.graduate_account_continuity_policies (
  policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse,
  allowed_capabilities, decided_by, decided_at, valid_from, is_current
) VALUES (
  'graduate-account-continuity', 'approved', true, false,
  '["portal_sign_in","profile_self_service"]'::jsonb,
  '10000000-0000-4000-8000-00000000000c', now(), now() - interval '1 day', true
);

-- Graduate records: A (approved current), B (will correct), R (will revoke).
INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES
  ('c10d0000-0000-4000-8000-00000000000a',
   '20000000-0000-4000-8000-00000000000a',
   'registrar_approved_decision', 'REG-CTX-A', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', '{"ctx":"a"}',
   repeat('a', 64)),
  ('c10d0000-0000-4000-8000-00000000000b',
   '20000000-0000-4000-8000-00000000000b',
   'registrar_approved_decision', 'REG-CTX-B', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', '{"ctx":"b"}',
   repeat('b', 64));

-- Extra graduate for revocation (dedicated student/auth user).
INSERT INTO auth.users(id) VALUES ('10000000-0000-4000-8000-000000000c10')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_profiles(id, user_id) VALUES
  ('20000000-0000-4000-8000-000000000c10', '10000000-0000-4000-8000-000000000c10')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES (
  'c10d0000-0000-4000-8000-0000000000c1',
  '20000000-0000-4000-8000-000000000c10',
  'registrar_approved_decision', 'REG-CTX-R', 'approved', now(),
  '10000000-0000-4000-8000-00000000000c', '2026-06-30',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', '{"ctx":"r"}',
  repeat('c', 64)
);

INSERT INTO ctx_ids VALUES
  ('record_a', public.create_graduate_record_from_official_decision('c10d0000-0000-4000-8000-00000000000a')),
  ('record_b', public.create_graduate_record_from_official_decision('c10d0000-0000-4000-8000-00000000000b')),
  ('record_r', public.create_graduate_record_from_official_decision('c10d0000-0000-4000-8000-0000000000c1'));

-- Direct-user / multi-profile principals for staff matrix (c01..c05).
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000c01'),
  ('10000000-0000-4000-8000-000000000c02'),
  ('10000000-0000-4000-8000-000000000c03'),
  ('10000000-0000-4000-8000-000000000c04'),
  ('10000000-0000-4000-8000-000000000c05')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_profiles (id, user_id, status) VALUES
  -- c01: direct-user specialist, exactly one active profile (D1)
  ('5f000000-0000-4000-8000-000000000c01', '10000000-0000-4000-8000-000000000c01', 'active'),
  -- c02: zero active profiles (no staff_profiles row)
  -- c03: two active profiles
  ('5f000000-0000-4000-8000-000000000c03', '10000000-0000-4000-8000-000000000c03', 'active'),
  ('5f000000-0000-4000-8000-00000000c03b', '10000000-0000-4000-8000-000000000c03', 'active'),
  -- c04: inactive profile only
  ('5f000000-0000-4000-8000-000000000c04', '10000000-0000-4000-8000-000000000c04', 'inactive'),
  -- c05: active profile but revoked assignment
  ('5f000000-0000-4000-8000-000000000c05', '10000000-0000-4000-8000-000000000c05', 'active');

INSERT INTO public.staff_profile_departments VALUES
  ('5f000000-0000-4000-8000-000000000c01', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000c03', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-00000000c03b', '30000000-0000-4000-8000-000000000002'),
  ('5f000000-0000-4000-8000-000000000c04', '30000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000c05', '30000000-0000-4000-8000-000000000001');

INSERT INTO public.request_processing_assignments (
  id, unit_id, role_id, assignment_type, user_id, staff_profile_id,
  is_active, starts_at, ends_at
) VALUES
  ('8f000000-0000-4000-8000-000000000c01',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000c01', NULL, true, NULL, NULL),
  ('8f000000-0000-4000-8000-000000000c02',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000c02', NULL, true, NULL, NULL),
  ('8f000000-0000-4000-8000-000000000c03',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000c03', NULL, true, NULL, NULL),
  ('8f000000-0000-4000-8000-000000000c04',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000c04', NULL, true, NULL, NULL),
  ('8f000000-0000-4000-8000-000000000c05',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'user', '10000000-0000-4000-8000-000000000c05', NULL, false, NULL, NULL);

-- =====================================================================
-- SELF CONTEXT MATRIX
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM ctx_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM ctx_ids WHERE key = 'record_b');
  v_record_r uuid := (SELECT id FROM ctx_ids WHERE key = 'record_r');
  v_ctx jsonb;
BEGIN
  -- 1. approved current graduate self → expected capability context
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  v_ctx := public.graduate_affairs_resolve_self_context('profile_self_service');
  IF (v_ctx->>'owns_graduate_record')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CTX1 expected owns_graduate_record true: %', v_ctx;
  END IF;
  IF (v_ctx->>'graduate_record_id')::uuid IS DISTINCT FROM v_record_a THEN
    RAISE EXCEPTION 'CTX1 graduate_record_id mismatch: %', v_ctx;
  END IF;
  IF v_ctx->>'graduate_record_state' IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'CTX1 expected approved state: %', v_ctx;
  END IF;
  IF (v_ctx->>'continuity_allowed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CTX1 expected continuity_allowed true: %', v_ctx;
  END IF;
  IF v_ctx->>'capability' IS DISTINCT FROM 'profile_self_service' THEN
    RAISE EXCEPTION 'CTX1 capability echo mismatch: %', v_ctx;
  END IF;

  -- 2. corrected graduate self → fail closed (no approved ownership)
  UPDATE public.graduate_official_decisions
  SET decision_state = 'corrected'
  WHERE id = 'c10d0000-0000-4000-8000-00000000000b';
  IF (SELECT record_state::text FROM public.graduate_records WHERE id = v_record_b) <> 'corrected' THEN
    RAISE EXCEPTION 'CTX2 precondition: record_b must be corrected';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  v_ctx := public.graduate_affairs_resolve_self_context('profile_self_service');
  IF (v_ctx->>'owns_graduate_record')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX2 corrected must not own approved record: %', v_ctx;
  END IF;
  IF v_ctx->>'graduate_record_id' IS NOT NULL THEN
    RAISE EXCEPTION 'CTX2 corrected must not expose record id: %', v_ctx;
  END IF;
  IF (v_ctx->>'continuity_allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX2 corrected continuity must be false: %', v_ctx;
  END IF;

  -- 3. revoked graduate self → fail closed
  UPDATE public.graduate_official_decisions
  SET decision_state = 'revoked'
  WHERE id = 'c10d0000-0000-4000-8000-0000000000c1';
  IF (SELECT record_state::text FROM public.graduate_records WHERE id = v_record_r) <> 'revoked' THEN
    RAISE EXCEPTION 'CTX3 precondition: record_r must be revoked';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c10', 'role', 'authenticated')::text, true);
  v_ctx := public.graduate_affairs_resolve_self_context('profile_self_service');
  IF (v_ctx->>'owns_graduate_record')::boolean IS DISTINCT FROM false
     OR (v_ctx->>'continuity_allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX3 revoked must fail closed: %', v_ctx;
  END IF;

  -- 4. unrelated authenticated user → no ownership authority
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000f', 'role', 'authenticated')::text, true);
  v_ctx := public.graduate_affairs_resolve_self_context('profile_self_service');
  IF (v_ctx->>'owns_graduate_record')::boolean IS DISTINCT FROM false
     OR v_ctx->>'graduate_record_id' IS NOT NULL THEN
    RAISE EXCEPTION 'CTX4 unrelated user must have no ownership: %', v_ctx;
  END IF;

  -- 5. anonymous → denied
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.graduate_affairs_resolve_self_context('profile_self_service');
    RAISE EXCEPTION 'CTX5 anonymous must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_NOT_AUTHENTICATED%' THEN RAISE; END IF;
  END;

  -- 6. invalid capability code → denied / fail closed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.graduate_affairs_resolve_self_context('');
    RAISE EXCEPTION 'CTX6 empty capability must raise invalid input';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_INVALID_INPUT%' THEN RAISE; END IF;
  END;
  v_ctx := public.graduate_affairs_resolve_self_context('not_a_real_capability');
  IF (v_ctx->>'continuity_allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX6 unknown capability must deny continuity: %', v_ctx;
  END IF;
END;
$$;

-- =====================================================================
-- STAFF RECORD ACCESS MATRIX
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM ctx_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM ctx_ids WHERE key = 'record_b');
  v_access jsonb;
  v_missing uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
BEGIN
  -- 7. active manager → allowed per manager policy
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS NOT TRUE OR v_access->>'via' IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'CTX7 manager expected allow via manager: %', v_access;
  END IF;

  -- 8. active specialist in exact authorizing-profile department → allowed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS NOT TRUE OR v_access->>'via' IS DISTINCT FROM 'specialist' THEN
    RAISE EXCEPTION 'CTX8 in-scope specialist expected allow: %', v_access;
  END IF;

  -- 9. active specialist outside scope → denied
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_b);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX9 out-of-scope specialist must deny: %', v_access;
  END IF;

  -- 10. direct-user specialist with exactly one active profile → scope from that profile
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c01', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS NOT TRUE OR v_access->>'via' IS DISTINCT FROM 'specialist' THEN
    RAISE EXCEPTION 'CTX10 single-profile direct-user specialist D1 allow failed: %', v_access;
  END IF;
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_b);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX10 single-profile direct-user must not expand to D2: %', v_access;
  END IF;

  -- 11. direct-user actor with zero active profiles → denied
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c02', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX11 zero-profile direct-user must deny: %', v_access;
  END IF;

  -- 12. direct-user actor with two active profiles → denied fail-closed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c03', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX12 two-profile direct-user must deny: %', v_access;
  END IF;

  -- 13. suspended/inactive staff profile → denied
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000007', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX13 suspended specialist must deny: %', v_access;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c04', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX13 inactive-profile direct-user must deny: %', v_access;
  END IF;

  -- 14. expired/revoked assignment → denied
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX14 expired assignment must deny: %', v_access;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000c05', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_record_a);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CTX14 revoked assignment must deny: %', v_access;
  END IF;

  -- 15. missing graduate record → fail closed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  v_access := public.graduate_affairs_resolve_staff_record_access(v_missing);
  IF (v_access->>'allowed')::boolean IS DISTINCT FROM false
     OR v_access->>'reason' IS DISTINCT FROM 'graduate_record_access_denied' THEN
    RAISE EXCEPTION 'CTX15 missing record must fail closed: %', v_access;
  END IF;

  -- Anonymous staff access denied
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.graduate_affairs_resolve_staff_record_access(v_record_a);
    RAISE EXCEPTION 'CTX-anon staff access must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_NOT_AUTHENTICATED%' THEN RAISE; END IF;
  END;
END;
$$;

-- Prove context RPCs accept only capability / record id — no authority params in signature.
DO $$
DECLARE
  v_self_args text;
  v_staff_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_self_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'graduate_affairs_resolve_self_context';
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_staff_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'graduate_affairs_resolve_staff_record_access';

  IF v_self_args IS DISTINCT FROM 'p_capability text' THEN
    RAISE EXCEPTION 'self context must accept only p_capability, got %', v_self_args;
  END IF;
  IF v_staff_args IS DISTINCT FROM 'p_graduate_record_id uuid' THEN
    RAISE EXCEPTION 'staff access must accept only p_graduate_record_id, got %', v_staff_args;
  END IF;
  IF v_self_args ILIKE '%owns%' OR v_self_args ILIKE '%assignment%'
     OR v_self_args ILIKE '%department%' OR v_self_args ILIKE '%continuity%'
     OR v_self_args ILIKE '%app_role%' THEN
    RAISE EXCEPTION 'self context must not accept client authority fields: %', v_self_args;
  END IF;
  IF v_staff_args ILIKE '%owns%' OR v_staff_args ILIKE '%assignment%'
     OR v_staff_args ILIKE '%department%' OR v_staff_args ILIKE '%followup%'
     OR v_staff_args ILIKE '%app_role%' THEN
    RAISE EXCEPTION 'staff access must not accept client authority fields: %', v_staff_args;
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'graduates-affairs-context-rpc-functional-matrix-04 pg-verify: PASS';
END;
$$;
