-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- SUPERSEDED — NEVER APPLIED, MUST NOT BE APPLIED.
-- The owner chose a per-request registrar fee decision instead of mandatory
-- payment: docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql.
-- This file is kept for history only and aborts immediately if executed.
DO $superseded$ BEGIN RAISE EXCEPTION 'B1_PAID_FIX01_SUPERSEDED_DO_NOT_APPLY'; END $superseded$;
-- =====================================================================
-- B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01
-- التحويل بين الأقسام + الفرصة الأخيرة: إصلاح فرع «لا رسوم» الذي يوقف الطلب.
--
-- Review artifact only. Promotion to supabase/migrations and any apply are a
-- separate, explicitly authorized gate (see
-- docs/reviews/B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md).
--
-- THE DEFECT (proven in scripts/b1-paid-services-zero-fee-check-01-pg17)
--   Migration 20260811202824 published version 2 of
--     department_transfer_external_payment_workflow
--     final_chance_external_payment_workflow
--   with a fee branch after the dean step:
--     dean -> payment_confirmation   only when FEE_GREATER_THAN_ZERO
--     dean -> registrar_apply        DEFAULT ("no fee — skip payment")
--   FEE_GREATER_THAN_ZERO reads student_request_fee_assessments. Neither
--   workflow has an `assess_fee` step and assess_student_request_fee refuses
--   every other step, so no assessment can ever exist for these requests:
--   EVERY request takes the default branch and payment_confirmation is marked
--   `skipped`. The payment step has can_skip = false, so
--   workflow_runtime_predecessors_satisfied rejects the now-active
--   registrar_apply step and its exact direct assignee is refused with
--   B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED. The request stays `in_review`
--   forever: finance cannot confirm (INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP)
--   and the registrar cannot apply.
--
-- THE FIX (minimal, restores the applied version-1 contract)
--   Publishes the NEXT version of each of the two workflows as an exact copy
--   of the active one, except for the dean step's exits:
--     dean -> payment_confirmation   unconditional default (always)
--     dean -> registrar_apply        not carried over
--   Payment confirmation is mandatory again, exactly as in version 1 and as
--   AGENTS.md states for paid services. No step, unit, role, action code or
--   authorization rule changes. The active version is retired through the same
--   columns the admin publish path uses.
--
--   Deliberately NOT done: setting can_skip = true on payment_confirmation.
--   That would un-block the default branch, i.e. complete every "paid"
--   request with no payment confirmation at all.
--
-- WHAT THIS DRAFT NEVER DOES
--   - no function is created, replaced or patched;
--   - no write to student_requests / student_request_workflow_steps /
--     student_request_workflow_events / detail tables / fee assessments;
--   - no change to the retired or the superseded workflow definitions;
--   - no change to request_types (student_visible stays as it is);
--   - no backfill, cleanup, delete or reset; no accounts or assignments;
--   - no amount, currency, invoice or gateway.
--   Requests already initialized on version 2 keep their own snapshot and are
--   NOT repaired by this draft (see the review note for the read-only query).
--
-- IDEMPOTENT: a service whose active workflow already routes the dean step
-- unconditionally to payment_confirmation, with no bypass, is left untouched.
-- FAIL CLOSED: any other shape aborts the whole transaction.
-- =====================================================================

BEGIN;

DO $fix$
DECLARE
  v_service record;
  v_relation text;
  v_function text;
  v_count integer;
  v_type_id uuid;
  v_old public.request_type_workflows%ROWTYPE;
  v_new_id uuid;
  v_version integer;
  v_dean uuid;
  v_pay uuid;
  v_apply uuid;
  v_paid public.request_type_workflow_transitions%ROWTYPE;
  v_paid_count integer;
  v_bypass_count integer;
  v_step record;
  v_tr record;
  v_map jsonb;
  v_inserted uuid;
  v_requests_before text;
  v_runtime_before text;
  v_types_before text;
  v_old_defs_before text;
  v_fixed integer := 0;
  v_new_ids uuid[] := '{}'::uuid[];
BEGIN
  -- ---- preflight: every object this draft relies on must exist ------------
  FOREACH v_relation IN ARRAY ARRAY[
    'public.request_types',
    'public.request_type_workflows',
    'public.request_type_workflow_steps',
    'public.request_type_workflow_transitions',
    'public.request_workflow_publish_validations',
    'public.request_type_workflow_change_log',
    'public.b1_workflow_runtime_contract_snapshot',
    'public.student_requests',
    'public.student_request_workflow_steps'
  ] LOOP
    IF to_regclass(v_relation) IS NULL THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_REQUIRED_RELATION_MISSING:%', v_relation;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.validate_request_workflow_publish(uuid)',
    'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
    'public.workflow_runtime_predecessors_satisfied(uuid)',
    'public.evaluate_workflow_transition_condition(uuid,jsonb)'
  ] LOOP
    IF to_regprocedure(v_function) IS NULL THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_REQUIRED_FUNCTION_MISSING:%', v_function;
    END IF;
  END LOOP;

  -- ---- what must stay byte-identical --------------------------------------
  SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text, ''))
    INTO v_requests_before FROM public.student_requests r;
  SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text, ''))
    INTO v_runtime_before FROM public.student_request_workflow_steps s;
  SELECT md5(COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.id)::text, ''))
    INTO v_types_before FROM public.request_types rt;
  SELECT md5(concat_ws('|',
      (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text, '')
         FROM public.request_type_workflow_steps s),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text, '')
         FROM public.request_type_workflow_transitions t)))
    INTO v_old_defs_before;

  FOR v_service IN
    SELECT * FROM (VALUES
      ('department_transfer'::text, 'dean_approval'::text),
      ('final_chance'::text, 'dean_decision'::text)
    ) AS services(code, dean_key)
  LOOP
    SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1] INTO v_count, v_type_id
    FROM public.request_types rt WHERE rt.code = v_service.code;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:%:%', v_service.code, v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%:%', v_service.code, v_count;
    END IF;
    SELECT w.* INTO v_old
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true
    FOR UPDATE;
    IF v_old.code IS DISTINCT FROM v_service.code || '_external_payment_workflow' THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_UNEXPECTED_ACTIVE_WORKFLOW_CODE:%:%', v_service.code, v_old.code;
    END IF;

    -- The three steps the fee branch connects must each exist exactly once.
    SELECT count(*), (array_agg(s.id))[1] INTO v_count, v_dean
    FROM public.request_type_workflow_steps s
    WHERE s.workflow_id = v_old.id AND s.step_key = v_service.dean_key AND s.action_type = 'approve';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_STEP_MUST_RESOLVE_EXACTLY_ONCE:%:%:%', v_service.code, v_service.dean_key, v_count;
    END IF;
    SELECT count(*), (array_agg(s.id))[1] INTO v_count, v_pay
    FROM public.request_type_workflow_steps s
    WHERE s.workflow_id = v_old.id AND s.step_key = 'payment_confirmation' AND s.action_type = 'confirm_payment';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_STEP_MUST_RESOLVE_EXACTLY_ONCE:%:payment_confirmation:%', v_service.code, v_count;
    END IF;
    SELECT count(*), (array_agg(s.id))[1] INTO v_count, v_apply
    FROM public.request_type_workflow_steps s
    WHERE s.workflow_id = v_old.id AND s.step_key = 'registrar_apply' AND s.action_type = 'apply_decision';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_STEP_MUST_RESOLVE_EXACTLY_ONCE:%:registrar_apply:%', v_service.code, v_count;
    END IF;

    SELECT count(*) INTO v_paid_count
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_old.id AND t.from_step_id = v_dean AND t.to_step_id = v_pay
      AND t.action_result = 'approved';
    SELECT count(*) INTO v_bypass_count
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_old.id AND t.from_step_id = v_dean AND t.to_step_id IS DISTINCT FROM v_pay
      AND t.action_result = 'approved';
    IF v_paid_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_DEAN_TO_PAYMENT_TRANSITION_MUST_EXIST_ONCE:%:%', v_service.code, v_paid_count;
    END IF;
    SELECT t.* INTO v_paid
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_old.id AND t.from_step_id = v_dean AND t.to_step_id = v_pay
      AND t.action_result = 'approved';

    -- Already correct (version 1 shape, or this draft was applied before).
    IF v_bypass_count = 0
       AND COALESCE(v_paid.condition_schema, '{}'::jsonb) = '{}'::jsonb
       AND v_paid.is_default = true THEN
      CONTINUE;
    END IF;

    -- Exactly the defective shape published by 20260811202824 — nothing else.
    IF v_bypass_count <> 1
       OR v_paid.is_default IS DISTINCT FROM false
       OR v_paid.condition_schema ->> 'code' IS DISTINCT FROM 'FEE_GREATER_THAN_ZERO'
       OR NOT EXISTS (
         SELECT 1 FROM public.request_type_workflow_transitions t
         WHERE t.workflow_id = v_old.id AND t.from_step_id = v_dean AND t.to_step_id = v_apply
           AND t.action_result = 'approved' AND t.is_default = true
           AND COALESCE(t.condition_schema, '{}'::jsonb) = '{}'::jsonb)
       OR (SELECT count(*) FROM public.request_type_workflow_transitions t
           WHERE t.workflow_id = v_old.id
             AND COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_UNEXPECTED_FEE_BRANCH_SHAPE:%', v_service.code;
    END IF;

    -- If fees could be assessed, or the payment step could legally be skipped,
    -- the branch is a deliberate configuration and must not be rewritten here.
    IF EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
               WHERE s.workflow_id = v_old.id AND s.action_type = 'assess_fee') THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_WORKFLOW_HAS_A_FEE_ASSESSMENT_STEP:%', v_service.code;
    END IF;
    IF EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
               WHERE s.id = v_pay AND s.can_skip IS DISTINCT FROM false) THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_PAYMENT_STEP_IS_SKIPPABLE:%', v_service.code;
    END IF;

    SELECT max(w.version) + 1 INTO v_version
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type_id AND w.code = v_old.code;
    IF v_version IS DISTINCT FROM v_old.version + 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_ACTIVE_VERSION_IS_NOT_THE_LATEST:%:%', v_service.code, v_old.version;
    END IF;

    INSERT INTO public.request_type_workflows (
      request_type_id, code, name_ar, name_en, description_ar, version, status, is_active, change_note
    ) VALUES (
      v_type_id, v_old.code, v_old.name_ar, v_old.name_en, v_old.description_ar, v_version,
      'draft', false,
      'B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01: تأكيد السداد الخارجي إلزامي بعد موافقة العميد (إزالة فرع «لا رسوم» غير القابل للتنفيذ)'
    ) RETURNING id INTO v_new_id;
    v_new_ids := v_new_ids || v_new_id;

    v_map := '{}'::jsonb;
    FOR v_step IN
      SELECT * FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id ORDER BY s.step_order
    LOOP
      INSERT INTO public.request_type_workflow_steps (
        workflow_id, step_key, step_name_ar, step_name_en, description_ar, step_order,
        processing_unit_id, processing_role_id, assignment_strategy, action_type, action_code,
        status_on_enter, status_on_complete, is_required, can_return_to_student, can_reject, can_skip,
        notify_on_enter, notify_on_complete, visible_to_student, requires_attachment, requires_payment,
        produces_document, form_schema, config
      ) VALUES (
        v_new_id, v_step.step_key, v_step.step_name_ar, v_step.step_name_en, v_step.description_ar, v_step.step_order,
        v_step.processing_unit_id, v_step.processing_role_id, v_step.assignment_strategy, v_step.action_type, v_step.action_code,
        v_step.status_on_enter, v_step.status_on_complete, v_step.is_required, v_step.can_return_to_student,
        v_step.can_reject, v_step.can_skip, v_step.notify_on_enter, v_step.notify_on_complete,
        v_step.visible_to_student, v_step.requires_attachment, v_step.requires_payment,
        v_step.produces_document, v_step.form_schema, v_step.config
      ) RETURNING id INTO v_inserted;
      v_map := v_map || jsonb_build_object(v_step.id::text, v_inserted);
    END LOOP;

    FOR v_tr IN
      SELECT * FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_old.id
    LOOP
      -- the un-executable "no fee" bypass is the one edge that is not carried over
      CONTINUE WHEN v_tr.from_step_id = v_dean AND v_tr.to_step_id = v_apply;
      INSERT INTO public.request_type_workflow_transitions (
        workflow_id, from_step_id, to_step_id, action_result, label_ar, condition_schema, is_default, priority
      ) VALUES (
        v_new_id,
        CASE WHEN v_tr.from_step_id IS NULL THEN NULL ELSE (v_map ->> v_tr.from_step_id::text)::uuid END,
        CASE WHEN v_tr.to_step_id IS NULL THEN NULL ELSE (v_map ->> v_tr.to_step_id::text)::uuid END,
        v_tr.action_result,
        CASE WHEN v_tr.id = v_paid.id THEN 'بعد موافقة العميد — تأكيد السداد الخارجي' ELSE v_tr.label_ar END,
        CASE WHEN v_tr.id = v_paid.id THEN '{}'::jsonb ELSE COALESCE(v_tr.condition_schema, '{}'::jsonb) END,
        CASE WHEN v_tr.id = v_paid.id THEN true ELSE v_tr.is_default END,
        CASE WHEN v_tr.id = v_paid.id THEN 0 ELSE v_tr.priority END
      );
    END LOOP;

    -- Runtime contract pin (append-only table: INSERT is the only legal write).
    INSERT INTO public.b1_workflow_runtime_contract_snapshot (
      workflow_id, request_type_code, workflow_version, step_key, step_order,
      unit_code, role_code, action_type, action_code
    )
    SELECT s.workflow_id, v_service.code, v_version, s.step_key, s.step_order,
           u.code, r.code, s.action_type, s.action_code
    FROM public.request_type_workflow_steps s
    JOIN public.request_processing_units u ON u.id = s.processing_unit_id
    JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
    WHERE s.workflow_id = v_new_id;

    IF (SELECT count(*) FROM public.request_type_workflow_steps s
        JOIN public.request_processing_units u ON u.id = s.processing_unit_id
        JOIN public.request_processing_roles r ON r.id = s.processing_role_id
        WHERE s.workflow_id = v_new_id
          AND public.b1_runtime_step_contract_ok(
            v_service.code, s.workflow_id, s.step_key, u.code, r.code, s.action_type))
       <> (SELECT count(*) FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id) THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_RUNTIME_CONTRACT_PIN_INCOMPLETE:%', v_service.code;
    END IF;

    -- Same gate the admin publish path uses.
    PERFORM public.validate_request_workflow_publish(v_new_id);

    UPDATE public.request_type_workflows
       SET status = 'retired', is_active = false, updated_at = now()
     WHERE request_type_id = v_type_id AND id <> v_new_id AND is_active = true;
    UPDATE public.request_type_workflows
       SET status = 'active', is_active = true, updated_at = now()
     WHERE id = v_new_id;

    INSERT INTO public.request_workflow_publish_validations (workflow_id, request_type_code, is_valid, message)
    VALUES (v_new_id, v_service.code, true,
            'PUBLISHED_V' || v_version || '_B1_PAID_SERVICES_ZERO_FEE_SKIP_FIX_01');

    INSERT INTO public.request_type_workflow_change_log (
      request_type_id, workflow_id, version, change_kind, change_note, snapshot, changed_by
    ) VALUES (
      v_type_id, v_new_id, v_version, 'workflow_published',
      'تأكيد السداد الخارجي إلزامي بعد موافقة العميد؛ أُزيل فرع «لا رسوم» الذي كان يوقف الطلب عند خطوة المسجل.',
      jsonb_build_object(
        'package', 'B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01',
        'workflow_code', v_old.code,
        'superseded_workflow_id', v_old.id,
        'superseded_version', v_old.version,
        'removed_transition', jsonb_build_object('from', v_service.dean_key, 'to', 'registrar_apply', 'result', 'approved'),
        'payment_policy', 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION'),
      NULL);

    v_fixed := v_fixed + 1;
  END LOOP;

  -- ---- post-conditions: any violation rolls the whole transaction back -----
  FOR v_service IN
    SELECT * FROM (VALUES
      ('department_transfer'::text, 'dean_approval'::text),
      ('final_chance'::text, 'dean_decision'::text)
    ) AS services(code, dean_key)
  LOOP
    SELECT count(*), (array_agg(w.id))[1] INTO v_count, v_new_id
    FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_service.code AND w.status = 'active' AND w.is_active = true;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_POST_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%:%', v_service.code, v_count;
    END IF;
    -- registrar_apply is reachable ONLY through payment_confirmation
    IF EXISTS (
      SELECT 1 FROM public.request_type_workflow_transitions t
      JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      WHERE t.workflow_id = v_new_id AND ts.step_key = 'registrar_apply'
        AND fs.step_key IS DISTINCT FROM 'payment_confirmation'
    ) OR (SELECT count(*) FROM public.request_type_workflow_transitions t
          JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
          JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
          WHERE t.workflow_id = v_new_id AND fs.step_key = v_service.dean_key
            AND ts.step_key = 'payment_confirmation' AND t.action_result = 'approved'
            AND t.is_default = true AND COALESCE(t.condition_schema, '{}'::jsonb) = '{}'::jsonb) <> 1
      OR EXISTS (SELECT 1 FROM public.request_type_workflow_transitions t
                 WHERE t.workflow_id = v_new_id
                   AND COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) THEN
      RAISE EXCEPTION 'B1_PAID_FIX01_POST_PAYMENT_IS_NOT_MANDATORY:%', v_service.code;
    END IF;
  END LOOP;

  IF v_requests_before IS DISTINCT FROM
       (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text, '')) FROM public.student_requests r)
     OR v_runtime_before IS DISTINCT FROM
       (SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text, '')) FROM public.student_request_workflow_steps s) THEN
    RAISE EXCEPTION 'B1_PAID_FIX01_POST_REQUEST_ROWS_CHANGED';
  END IF;
  IF v_types_before IS DISTINCT FROM
       (SELECT md5(COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.id)::text, '')) FROM public.request_types rt) THEN
    RAISE EXCEPTION 'B1_PAID_FIX01_POST_REQUEST_TYPES_CHANGED';
  END IF;
  -- every pre-existing step / transition definition row is still identical
  IF v_old_defs_before IS DISTINCT FROM (
       SELECT md5(concat_ws('|',
         (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text, '')
            FROM public.request_type_workflow_steps s
            WHERE s.workflow_id <> ALL (v_new_ids)),
         (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text, '')
            FROM public.request_type_workflow_transitions t
            WHERE t.workflow_id <> ALL (v_new_ids))))) THEN
    RAISE EXCEPTION 'B1_PAID_FIX01_POST_EXISTING_WORKFLOW_DEFINITIONS_CHANGED';
  END IF;

  RAISE NOTICE 'B1_PAID_FIX01: % workflow(s) republished with mandatory payment confirmation', v_fixed;
END;
$fix$;

COMMIT;
