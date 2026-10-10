-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — state that production gained AFTER the
-- v2 cut-over (isolated throwaway cluster ONLY).

-- Runtime contract pins exactly as migration 20260811204643 seeded them.
INSERT INTO public.b1_workflow_runtime_contract_snapshot
  (workflow_id, request_type_code, workflow_version, step_key, step_order,
   unit_code, role_code, action_type, action_code)
SELECT s.workflow_id, rt.code, w.version, s.step_key, s.step_order,
       u.code, r.code, s.action_type, s.action_code
FROM public.request_type_workflow_steps s
JOIN public.request_type_workflows w ON w.id = s.workflow_id
JOIN public.request_types rt ON rt.id = w.request_type_id
JOIN public.request_processing_units u ON u.id = s.processing_unit_id
JOIN public.request_processing_roles r ON r.id = s.processing_role_id
WHERE rt.code IN ('department_transfer','final_chance')
ON CONFLICT (workflow_id, step_key) DO NOTHING;

INSERT INTO public.service_platform_runtime_flags (service_code, legacy_fallback_enabled)
VALUES ('department_transfer', true), ('final_chance', true)
ON CONFLICT (service_code) DO NOTHING;

-- Helpers ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hp_step(p_request uuid, p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM public.student_request_workflow_steps
  WHERE student_request_id = p_request AND step_key = p_key $$;

-- Calls one real RPC as p_uid; returns 'OK' or the raised error text.
--   act -> generic atomic executor      pay -> external payment confirmation
--   fee -> record_b1_fee_decision; p_action = 'DECISION:REASON:AMOUNT'
CREATE OR REPLACE FUNCTION public.hp_try(p_uid uuid, p_kind text, p_step uuid, p_action text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('harness.uid', COALESCE(p_uid::text, ''), false);
  BEGIN
    IF p_kind = 'pay' THEN
      PERFORM public.record_external_university_payment_confirmation(p_step, NULL);
    ELSIF p_kind = 'fee' THEN
      EXECUTE 'SELECT public.record_b1_fee_decision($1, $2, $3, NULL, $4)'
        USING p_step, split_part(p_action, ':', 1), NULLIF(split_part(p_action, ':', 2), ''),
              NULLIF(split_part(p_action, ':', 3), '')::numeric;
    ELSE
      PERFORM public.act_on_b1_student_request_step_atomic(p_step, p_action, 'ملاحظة اختبار كافية', '{}'::jsonb);
    END IF;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.hp_gate(p_uid uuid, p_step uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('harness.uid', COALESCE(p_uid::text, ''), false);
  RETURN public.can_current_user_act_on_step(p_step, p_action);
END $$;

CREATE OR REPLACE FUNCTION public.hp_fee_rows(p_request uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  IF to_regclass('public.b1_request_fee_decisions') IS NULL THEN RETURN 'none'; END IF;
  EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(d))::text, ''none'') FROM public.b1_request_fee_decisions d WHERE d.request_id = $1'
    INTO v USING p_request;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.hp_state(p_request uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    public.hp_fee_rows(p_request),
    (SELECT count(*)::text FROM public.notifications n WHERE n.reference_id = p_request),
    (SELECT to_jsonb(r)::text FROM public.student_requests r WHERE r.id = p_request),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_order)::text
       FROM public.student_request_workflow_steps s WHERE s.student_request_id = p_request),
    (SELECT count(*)::text FROM public.student_request_workflow_events e WHERE e.student_request_id = p_request),
    (SELECT jsonb_agg(to_jsonb(d))::text FROM public.transfer_request_details d WHERE d.request_id = p_request),
    (SELECT jsonb_agg(to_jsonb(d))::text FROM public.extra_chance_details d WHERE d.request_id = p_request),
    (SELECT count(*)::text FROM public.student_extra_chances x WHERE x.request_id = p_request),
    (SELECT to_jsonb(sp)::text FROM public.student_profiles sp
       JOIN public.student_requests r ON r.student_profile_id = sp.id WHERE r.id = p_request)));
$$;

CREATE OR REPLACE FUNCTION public.hp_steps(p_request uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT string_agg(s.step_key || '=' || s.status, ' > ' ORDER BY s.step_order)
  FROM public.student_request_workflow_steps s WHERE s.student_request_id = p_request $$;

CREATE OR REPLACE FUNCTION public.hp_new_request(p_id uuid, p_student uuid, p_service text, p_number text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.student_requests
    (id, student_profile_id, request_type, request_number, title, status, form_data, submitted_at)
  VALUES (p_id, p_student, p_service, p_number, p_service, 'submitted', '{}'::jsonb, now());
  IF p_service = 'department_transfer' THEN
    INSERT INTO public.transfer_request_details
      (request_id, current_department_id, requested_department_id, requested_program_id)
    VALUES (p_id, '22222222-2222-2222-2222-000000000001', '22222222-2222-2222-2222-000000000002',
            '66666666-6666-6666-6666-0000000000b1');
  ELSE
    INSERT INTO public.extra_chance_details (request_id, academic_year_id, semester_id, chance_type, reason)
    VALUES (p_id, '66666666-6666-6666-6666-000000000001', '66666666-6666-6666-6666-000000000002',
            'final', 'ظرف أكاديمي موثق');
  END IF;
  RETURN public.initialize_b1_request_workflow_strict(p_id, p_service);
END $$;

CREATE OR REPLACE FUNCTION public.hp_check(p_cond boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE_FAIL: %', p_label; END IF;
  RAISE NOTICE 'ok: %', p_label;
END $$;

-- Small deny sample for the ACTIVE step: anonymous, the owning student, an
-- admin with no processing assignment and a staff member of another unit, on
-- the generic executor, the payment RPC and the authorization gate. Every
-- call must be refused and must change nothing.
CREATE OR REPLACE FUNCTION public.hp_deny_sample(p_request uuid, p_step_key text, p_action text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_step uuid := public.hp_step(p_request, p_step_key);
  v_before text := public.hp_state(p_request);
  v_owner uuid;
  v_uid uuid;
  v_n integer := 0;
BEGIN
  SELECT sp.user_id INTO v_owner FROM public.student_requests r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id WHERE r.id = p_request;
  FOREACH v_uid IN ARRAY ARRAY[NULL::uuid, v_owner,
    '11111111-1111-1111-1111-000000000014'::uuid,   -- admin, no assignment
    '11111111-1111-1111-1111-000000000005'::uuid,   -- archive officer
    '11111111-1111-1111-1111-000000000009'::uuid]   -- faculty member
  LOOP
    IF public.hp_try(v_uid, 'act', v_step, p_action) = 'OK'
       OR public.hp_try(v_uid, 'fee', v_step, 'FEE_REQUIRED::5000') = 'OK'
       OR public.hp_try(v_uid, 'fee', v_step, 'FEE_NOT_REQUIRED:EXEMPTION') = 'OK'
       OR public.hp_try(v_uid, 'pay', v_step, '') = 'OK'
       OR public.hp_try(v_uid, 'act', v_step, 'approve') = 'OK'
       OR public.hp_try(v_uid, 'act', v_step, 'apply_decision') = 'OK'
       OR public.hp_gate(v_uid, v_step, p_action) THEN
      RAISE EXCEPTION 'CASE_FAIL: % was allowed on %', COALESCE(v_uid::text, 'anonymous'), p_step_key;
    END IF;
    v_n := v_n + 7;
  END LOOP;
  IF public.hp_state(p_request) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'CASE_FAIL: denied calls mutated the request at %', p_step_key;
  END IF;
  RETURN v_n;
END $$;

-- Walks the request with the single correct assignee of each step up to and
-- including the dean step. Every step must succeed for exactly that assignee.
CREATE OR REPLACE FUNCTION public.hp_walk_to_dean(p_request uuid, p_service text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_row record; v_denials integer := 0; v_result text;
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      ('department_transfer','student_affairs_intake','review','11111111-1111-1111-1111-000000000001'),
      ('department_transfer','source_department_head_approval','approve','11111111-1111-1111-1111-000000000006'),
      ('department_transfer','target_department_head_approval','approve','11111111-1111-1111-1111-000000000007'),
      ('department_transfer','dean_approval','approve','11111111-1111-1111-1111-000000000011'),
      ('final_chance','student_affairs_intake','review','11111111-1111-1111-1111-000000000001'),
      ('final_chance','manager_review','approve','11111111-1111-1111-1111-000000000002'),
      ('final_chance','dean_decision','approve','11111111-1111-1111-1111-000000000011')
    ) AS v(service, step_key, action, actor) WHERE v.service = p_service
  LOOP
    v_denials := v_denials + public.hp_deny_sample(p_request, v_row.step_key, v_row.action);
    v_result := public.hp_try(v_row.actor::uuid, 'act', public.hp_step(p_request, v_row.step_key), v_row.action);
    IF v_result <> 'OK' THEN
      RAISE EXCEPTION 'CASE_FAIL: %/% refused for its exact assignee: %', p_service, v_row.step_key, v_result;
    END IF;
    RAISE NOTICE 'ok: %/% — completed by its exact assignee', p_service, v_row.step_key;
  END LOOP;
  RETURN v_denials;
END $$;

-- Everything the fix draft may change, plus everything it must never touch.
CREATE OR REPLACE FUNCTION public.hp_fingerprint() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id)::text FROM public.request_type_workflows w),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.request_type_workflow_steps s),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_type_workflow_transitions t),
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)::text FROM public.b1_workflow_runtime_contract_snapshot c),
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)::text FROM public.request_type_workflow_change_log l),
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)::text FROM public.request_workflow_publish_validations v),
    (SELECT jsonb_agg(to_jsonb(rt) ORDER BY rt.id)::text FROM public.request_types rt),
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM public.request_processing_assignments a),
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.student_requests r),
    (SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.id)::text FROM public.student_request_workflow_steps rs),
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM public.student_request_workflow_events e),
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)::text FROM public.student_request_fee_assessments f),
    (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.oid::regprocedure::text)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
        AND p.proname NOT LIKE 'h\_%' AND p.proname NOT LIKE 'hp\_%')));
$$;
