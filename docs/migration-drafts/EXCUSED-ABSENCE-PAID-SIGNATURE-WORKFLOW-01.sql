-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- =====================================================================
-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01
-- غياب بعذر: الانتقال من دورة مجانية بثلاث خطوات إلى دورة رسوم وتوقيعات.
--
-- Review artifact only. Promotion to supabase/migrations and any apply are a
-- separate, explicitly authorized gate (see
-- docs/reviews/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.md).
--
-- WHAT THIS DRAFT DOES
--   1. Adds ONE helper: public.b1_excused_absence_student_department(uuid).
--   2. Applies FOUR minimal, anchor-checked, fail-closed function patches
--      (the deployed body is read with pg_get_functiondef, exactly one anchor
--      must match, otherwise the whole transaction aborts):
--        a. initialize_b1_request_workflow_strict        (2 anchors)
--           department scope of `department_head_signature` = the requesting
--           student's own department, on first init and on resubmit.
--        b. assert_b1_runtime_step_row_assignee_effective (1 anchor)
--           the same scope when the step is activated.
--        c. act_on_b1_student_request_step_atomic         (1 anchor)
--           the excuse is recorded when `record_apply` completes and the next
--           step is `archive` (today only file_withdrawal has that shape).
--        d. record_external_university_payment_confirmation (1 anchor)
--           excused_absence joins the external-payment services.
--   3. Creates workflow `excused_absence_external_payment_workflow` (next
--      version of the request type) with 8 steps + 9 transitions, pins its
--      runtime contract snapshot, validates it with the publish validator,
--      retires the currently active `excused_absence_free_workflow` and
--      activates the new one.
--
-- WHAT THIS DRAFT NEVER DOES
--   - no write to student_requests / student_request_workflow_steps /
--     student_request_workflow_events / absence_excuse_details;
--   - no backfill, no cleanup, no delete, no reset;
--   - no change to request_types (student_visible stays as it is);
--   - no accounts, profiles, positions or processing assignments;
--   - no amount, currency, invoice, gateway or fee-assessment row;
--   - no document, PDF or storage artifact (signatures are approvals);
--   - no change to apply_b1_excused_absence_effect or
--     can_current_user_act_on_step.
--
-- In-flight requests keep their own runtime snapshot (workflow_id on every
-- runtime step) and continue on the retired version untouched.
--
-- Idempotent: a second run verifies the existing structure and changes nothing.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Preflight — fail closed before anything is created or replaced
-- ---------------------------------------------------------------------
DO $preflight$
DECLARE
  v_item text;
  v_count integer;
  v_type_id uuid;
  v_type_code text;
  v_unit_id uuid;
  v_role_id uuid;
  v_pair record;
  v_action record;
  v_src text;
BEGIN
  FOREACH v_item IN ARRAY ARRAY[
    'public.request_types',
    'public.request_type_workflows',
    'public.request_type_workflow_steps',
    'public.request_type_workflow_transitions',
    'public.request_type_workflow_change_log',
    'public.request_workflow_publish_validations',
    'public.request_workflow_action_catalog',
    'public.request_processing_units',
    'public.request_processing_roles',
    'public.request_processing_assignments',
    'public.b1_workflow_runtime_contract_snapshot',
    'public.student_profiles',
    'public.student_requests',
    'public.student_request_workflow_steps',
    'public.absence_excuse_details'
  ] LOOP
    IF to_regclass(v_item) IS NULL THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_RELATION_MISSING:%', v_item;
    END IF;
  END LOOP;

  FOREACH v_item IN ARRAY ARRAY[
    'public.initialize_b1_request_workflow_strict(uuid,text)',
    'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)',
    'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
    'public.record_external_university_payment_confirmation(uuid,text)',
    'public.apply_b1_excused_absence_effect(uuid)',
    'public.apply_b1_academic_effect_for_request(uuid)',
    'public.can_current_user_act_on_step(uuid,text)',
    'public.user_matches_workflow_runtime_step(uuid)',
    'public.is_valid_b1_direct_assignment(uuid,uuid,boolean)',
    'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
    'public.validate_request_workflow_publish(uuid)'
  ] LOOP
    IF to_regprocedure(v_item) IS NULL THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_FUNCTION_MISSING:%', v_item;
    END IF;
  END LOOP;

  FOR v_pair IN
    SELECT * FROM (VALUES
      ('request_type_workflows','published_at'),
      ('request_type_workflows','superseded_at'),
      ('request_type_workflows','change_note'),
      ('request_type_workflow_steps','action_code'),
      ('request_type_workflow_steps','config'),
      ('request_type_workflow_transitions','priority'),
      ('request_type_workflow_transitions','condition_schema'),
      ('request_processing_assignments','department_id'),
      ('request_processing_assignments','position_assignment_id'),
      ('student_profiles','department_id'),
      ('student_requests','student_profile_id'),
      ('student_request_workflow_steps','workflow_id')
    ) AS c(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = v_pair.table_name
        AND ic.column_name = v_pair.column_name
    ) THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_COLUMN_MISSING:%.%',
        v_pair.table_name, v_pair.column_name;
    END IF;
  END LOOP;

  -- Request type: exactly one row, stored under the canonical code.
  SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1], (array_agg(rt.code ORDER BY rt.id))[1]
    INTO v_count, v_type_id, v_type_code
  FROM public.request_types rt
  WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse']);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:%', v_count;
  END IF;
  IF v_type_code IS DISTINCT FROM 'excused_absence' THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_REQUEST_TYPE_CODE_NOT_CANONICAL:%', v_type_code;
  END IF;

  -- Catalog actions used by the eight steps.
  FOR v_action IN
    SELECT * FROM (VALUES
      ('REVIEW','review','neutral',NULL::text,NULL::text),
      ('APPROVE','approve','neutral',NULL,NULL),
      ('PAYMENT_CONFIRMATION','confirm_payment','neutral',NULL,NULL),
      ('ARCHIVE','archive','neutral',NULL,NULL),
      ('REGISTER_EXCUSED_ABSENCE','apply_decision','effect',
        'apply_b1_excused_absence_effect','excused_absence')
    ) AS a(code, action_type, kind, effect_function, restricted)
  LOOP
    SELECT count(*) INTO v_count
    FROM public.request_workflow_action_catalog c
    WHERE c.code = v_action.code
      AND c.is_active = true
      AND c.action_type IS NOT DISTINCT FROM v_action.action_type
      AND c.kind = v_action.kind
      AND c.effect_function IS NOT DISTINCT FROM v_action.effect_function
      AND c.restricted_request_type_code IS NOT DISTINCT FROM v_action.restricted;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_CATALOG_ACTION_MISSING_OR_DRIFTED:%', v_action.code;
    END IF;
  END LOOP;

  -- The effect function is NOT replaced here; this draft relies on the step
  -- key it is bound to. If that binding ever changes, stop.
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = 'public.apply_b1_excused_absence_effect(uuid)'::regprocedure;
  IF position('record_apply' in v_src) = 0 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_EFFECT_STEP_KEY_BINDING_DRIFTED';
  END IF;

  -- Units / roles, and — for every request-scoped step — exactly one
  -- effective direct assignee. Nothing is created to satisfy this guard.
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('dean','dean'),
      ('registrar','registrar_general'),
      ('finance','revenue_finance_officer'),
      ('student_affairs','student_affairs_manager'),
      ('archive','archive_officer'),
      ('department','department_head')
    ) AS p(unit_code, role_code)
  LOOP
    SELECT count(*), (array_agg(u.id ORDER BY u.id))[1] INTO v_count, v_unit_id
    FROM public.request_processing_units u
    WHERE u.code = v_pair.unit_code AND u.is_active = true;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE:%:%',
        v_pair.unit_code, v_count;
    END IF;

    SELECT count(*), (array_agg(r.id ORDER BY r.id))[1] INTO v_count, v_role_id
    FROM public.request_processing_roles r
    WHERE r.code = v_pair.role_code AND r.unit_id = v_unit_id AND r.is_active = true;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE:%:%',
        v_pair.role_code, v_count;
    END IF;

    IF v_pair.role_code <> 'department_head' THEN
      SELECT count(*) INTO v_count
      FROM public.request_processing_assignments a
      WHERE a.unit_id = v_unit_id AND a.role_id = v_role_id
        AND a.is_active = true
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND public.is_valid_b1_direct_assignment(a.id, NULL, false);
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE:%:%:%',
          v_pair.unit_code, v_pair.role_code, v_count;
      END IF;
    ELSE
      -- Department heads are resolved per student department at submit time.
      SELECT count(*) INTO v_count
      FROM public.request_processing_assignments a
      WHERE a.unit_id = v_unit_id AND a.role_id = v_role_id
        AND a.is_active = true
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND a.department_id IS NOT NULL
        AND a.assignment_type = 'position_assignment'
        AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL
        AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false);
      IF v_count < 1 THEN
        RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_NO_DEPARTMENT_SCOPED_HEAD_ASSIGNMENT';
      END IF;

      SELECT count(*) INTO v_count FROM (
        SELECT a.department_id
        FROM public.request_processing_assignments a
        WHERE a.unit_id = v_unit_id AND a.role_id = v_role_id
          AND a.is_active = true
          AND (a.starts_at IS NULL OR a.starts_at <= now())
          AND (a.ends_at IS NULL OR a.ends_at > now())
          AND a.department_id IS NOT NULL
          AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false)
        GROUP BY a.department_id
        HAVING count(*) > 1
      ) duplicated;
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_AMBIGUOUS_DEPARTMENT_HEAD_ASSIGNMENT:%', v_count;
      END IF;

      -- Informational only: students of a department without a head cannot
      -- submit this service after the cut-over (initialization fails closed).
      SELECT count(DISTINCT sp.department_id) INTO v_count
      FROM public.student_profiles sp
      WHERE sp.department_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.request_processing_assignments a
          WHERE a.unit_id = v_unit_id AND a.role_id = v_role_id
            AND a.is_active = true
            AND a.department_id = sp.department_id
            AND a.assignment_type = 'position_assignment'
            AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false));
      IF v_count > 0 THEN
        RAISE WARNING 'EXCUSED_ABSENCE_WF01_STUDENT_DEPARTMENTS_WITHOUT_HEAD:%', v_count;
      END IF;
    END IF;
  END LOOP;

  -- Workflow inventory: either the free cycle is the single active version
  -- (first apply) or the new cycle already is (re-run). Anything else stops.
  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true
    AND w.code IN ('excused_absence_free_workflow','excused_absence_external_payment_workflow');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_UNEXPECTED_ACTIVE_WORKFLOW_CODE';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id
    AND w.code = 'excused_absence_external_payment_workflow';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_DUPLICATE_TARGET_WORKFLOW:%', v_count;
  END IF;
END;
$preflight$;

-- Read-only invariants captured before any write and re-checked at the end.
CREATE TEMP TABLE eawf01_invariants ON COMMIT DROP AS
SELECT
  (SELECT jsonb_agg(to_jsonb(rt) ORDER BY rt.id)
     FROM public.request_types rt
    WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse'])) AS request_type_rows,
  (SELECT count(*)
     FROM public.request_type_workflow_steps s
     JOIN public.request_type_workflows w ON w.id = s.workflow_id
     JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = 'excused_absence'
      AND w.code <> 'excused_absence_external_payment_workflow') AS legacy_step_count,
  (SELECT count(*)
     FROM public.request_type_workflow_transitions t
     JOIN public.request_type_workflows w ON w.id = t.workflow_id
     JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = 'excused_absence'
      AND w.code <> 'excused_absence_external_payment_workflow') AS legacy_transition_count,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count;

-- ---------------------------------------------------------------------
-- 1. Department scope helper: the requesting student's own department
-- ---------------------------------------------------------------------
-- `config.department_scope` on a workflow step is descriptive metadata only;
-- no engine function reads it. The effective scope is resolved in code, and
-- today only for department_transfer (source/target) and grade_appeal.
-- This helper is the single authority for the excused-absence scope.
CREATE OR REPLACE FUNCTION public.b1_excused_absence_student_department(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT sp.department_id
  FROM public.student_requests r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE r.id = p_request_id
    AND r.request_type IN ('excused_absence', 'absence_excuse');
$function$;

-- Internal resolver: only SECURITY DEFINER engine functions call it.
REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM authenticated;

-- ---------------------------------------------------------------------
-- 2. Minimal engine patches (anchor-checked, fail-closed, idempotent)
-- ---------------------------------------------------------------------
-- Same technique as the applied migrations 20260811204806 and
-- 20260817000415: the DEPLOYED definition is the base, so owner, ACL,
-- volatility, SECURITY DEFINER and search_path are preserved verbatim.
DO $patches$
DECLARE
  v_patch record;
  v_def text;
  v_hits integer;
BEGIN
  FOR v_patch IN
    SELECT * FROM (VALUES
      -- a1. first initialization: scope the department-head signature step.
      (1,
       'public.initialize_b1_request_workflow_strict(uuid,text)',
       'EAWF01:init-student-department-scope',
       'ELSIF v_is_p1 THEN',
       'ELSIF p_canonical_code=''excused_absence'' AND v_config.step_key=''department_head_signature'' THEN' || E'\n' ||
       '      /* EAWF01:init-student-department-scope */' || E'\n' ||
       '      v_department_id := public.b1_excused_absence_student_department(p_request_id);' || E'\n' ||
       '      IF v_department_id IS NULL THEN' || E'\n' ||
       '        RAISE EXCEPTION ''B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_SCOPE_MISSING:%'', v_config.step_key' || E'\n' ||
       '          USING ERRCODE=''42501'';' || E'\n' ||
       '      END IF;' || E'\n' ||
       '    ELSIF v_is_p1 THEN'),
      -- a2. resubmit after a return: the stored assignment must still be the
      --     head of the student's department.
      (2,
       'public.initialize_b1_request_workflow_strict(uuid,text)',
       'EAWF01:resubmit-student-department-scope',
       'ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END',
       'WHEN p_canonical_code=''excused_absence'' AND s.step_key=''department_head_signature'' THEN' || E'\n' ||
       '                   /* EAWF01:resubmit-student-department-scope */' || E'\n' ||
       '                   public.b1_excused_absence_student_department(p_request_id)' || E'\n' ||
       '                 ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END'),
      -- b. activation guard: re-resolve the same scope when the step becomes active.
      (3,
       'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)',
       'EAWF01:activation-student-department-scope',
       'IF v_canonical = ''department_transfer''',
       'IF v_canonical = ''excused_absence'' AND v_step.step_key = ''department_head_signature'' THEN' || E'\n' ||
       '    /* EAWF01:activation-student-department-scope */' || E'\n' ||
       '    v_department_id := public.b1_excused_absence_student_department(v_step.student_request_id);' || E'\n' ||
       '    IF v_department_id IS NULL THEN' || E'\n' ||
       '      RAISE EXCEPTION ''B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_SCOPE_MISSING:%'', v_step.step_key' || E'\n' ||
       '        USING ERRCODE = ''42501'';' || E'\n' ||
       '    END IF;' || E'\n' ||
       '  ELSIF v_canonical = ''department_transfer'''),
      -- c. record the excuse when `record_apply` completes before `archive`.
      (4,
       'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
       'EAWF01:effect-before-archive',
       'v_action=''apply_decision'' AND v_canonical=''file_withdrawal''',
       'v_action=''apply_decision'' AND v_canonical IN (''file_withdrawal'',''excused_absence'') /* EAWF01:effect-before-archive */'),
      -- d. excused_absence becomes an external-payment service.
      (5,
       'public.record_external_university_payment_confirmation(uuid,text)',
       'EAWF01:external-payment-service',
       '''october_exam_entry_form'',''replacement_student_card'')',
       '''october_exam_entry_form'',''replacement_student_card'',' || E'\n' ||
       '                            ''excused_absence'',''absence_excuse'' /* EAWF01:external-payment-service */)')
    ) AS p(ord, fn, marker, anchor, replacement)
    ORDER BY ord
  LOOP
    v_def := pg_get_functiondef(v_patch.fn::regprocedure);
    IF v_def IS NULL THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PATCH_SOURCE_MISSING:%', v_patch.marker;
    END IF;

    IF position(v_patch.marker in v_def) > 0 THEN
      CONTINUE; -- already applied by an earlier run
    END IF;

    v_hits := (length(v_def) - length(replace(v_def, v_patch.anchor, '')))
              / length(v_patch.anchor);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:%:%',
        v_patch.marker, v_hits;
    END IF;

    v_def := replace(v_def, v_patch.anchor, v_patch.replacement);
    IF position(v_patch.marker in v_def) = 0 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PATCH_MARKER_NOT_WRITTEN:%', v_patch.marker;
    END IF;

    EXECUTE v_def;
  END LOOP;

  -- Every marker must now be present in the deployed definitions.
  FOR v_patch IN
    SELECT * FROM (VALUES
      ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:init-student-department-scope'),
      ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-student-department-scope'),
      ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', 'EAWF01:activation-student-department-scope'),
      ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:effect-before-archive'),
      ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service')
    ) AS m(fn, marker)
  LOOP
    IF position(v_patch.marker in pg_get_functiondef(v_patch.fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PATCH_NOT_EFFECTIVE:%', v_patch.marker;
    END IF;
  END LOOP;
END;
$patches$;

-- ---------------------------------------------------------------------
-- 3. Workflow definition, runtime contract pin, publish
-- ---------------------------------------------------------------------
-- Modelled on 20260725111000_b1_17_external_university_payment_workflows_02
-- (structure) and 20260811202824 (action_code + publish). No fee branch:
-- payment confirmation is mandatory on every request of this service.
DO $workflow$
DECLARE
  v_request_type_id uuid;
  v_request_type_code text;
  v_workflow_id uuid;
  v_previous_workflow_id uuid;
  v_previous_version integer;
  v_version integer;
  v_count integer;
  v_unit_id uuid;
  v_role_id uuid;
  v_step record;
  v_transition record;
  v_step_ids jsonb := '{}'::jsonb;
  v_step_id uuid;
  v_from_id uuid;
  v_to_id uuid;
  v_is_active boolean;
  v_contract_marker constant text :=
    'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION/excused-absence-signature-workflow-v1';
  v_workflow_code constant text := 'excused_absence_external_payment_workflow';
  v_change_note constant text :=
    'غياب بعذر: مراجعة العميد ← إحالة المسجل لسداد الرسوم ← تأكيد السداد الخارجي ← توقيع رئيس القسم ← توقيع العميد ← توقيع مدير شؤون الطلاب ← تسجيل العذر لدى المسجل ← الأرشفة';
  v_steps constant jsonb := jsonb_build_array(
    jsonb_build_object('key','dean_review','name_ar','مراجعة العميد وإحالة الطلب','unit','dean','role','dean','action','review','action_code','REVIEW','scope','request'),
    jsonb_build_object('key','registrar_fee_referral','name_ar','إحالة الطلب لسداد الرسوم','unit','registrar','role','registrar_general','action','review','action_code','REVIEW','scope','request'),
    jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','action_code','PAYMENT_CONFIRMATION','scope','request'),
    jsonb_build_object('key','department_head_signature','name_ar','توقيع رئيس القسم على استمارة الغياب','unit','department','role','department_head','action','approve','action_code','APPROVE','scope','student_department'),
    jsonb_build_object('key','dean_signature','name_ar','توقيع العميد','unit','dean','role','dean','action','approve','action_code','APPROVE','scope','request'),
    jsonb_build_object('key','student_affairs_manager_signature','name_ar','توقيع مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve','action_code','APPROVE','scope','request'),
    jsonb_build_object('key','record_apply','name_ar','تسجيل العذر لدى مسجل الكلية','unit','registrar','role','registrar_general','action','apply_decision','action_code','REGISTER_EXCUSED_ABSENCE','scope','request'),
    jsonb_build_object('key','archive','name_ar','الأرشفة','unit','archive','role','archive_officer','action','archive','action_code','ARCHIVE','scope','request')
  );
  v_transitions constant jsonb := jsonb_build_array(
    jsonb_build_object('from',NULL,'to','dean_review','result','submit','label_ar','إرسال الطلب مع المرفقات'),
    jsonb_build_object('from','dean_review','to','registrar_fee_referral','result','reviewed','label_ar','بعد مراجعة العميد وإحالته'),
    jsonb_build_object('from','registrar_fee_referral','to','payment_confirmation','result','reviewed','label_ar','بعد إحالة المسجل لسداد الرسوم'),
    jsonb_build_object('from','payment_confirmation','to','department_head_signature','result','payment_confirmed','label_ar','بعد تأكيد السداد الخارجي'),
    jsonb_build_object('from','department_head_signature','to','dean_signature','result','approved','label_ar','بعد توقيع رئيس القسم'),
    jsonb_build_object('from','dean_signature','to','student_affairs_manager_signature','result','approved','label_ar','بعد توقيع العميد'),
    jsonb_build_object('from','student_affairs_manager_signature','to','record_apply','result','approved','label_ar','بعد توقيع مدير شؤون الطلاب'),
    jsonb_build_object('from','record_apply','to','archive','result','applied','label_ar','بعد تسجيل العذر'),
    jsonb_build_object('from','archive','to',NULL,'result','archived','label_ar','إغلاق الطلب بالأرشفة')
  );
BEGIN
  SELECT rt.id, rt.code INTO v_request_type_id, v_request_type_code
  FROM public.request_types rt
  WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse']);

  -- Same serialization key as admin_save_request_workflow_config.
  PERFORM pg_advisory_xact_lock(hashtext('request_type_workflows:' || v_request_type_id::text));

  SELECT w.id, w.is_active INTO v_workflow_id, v_is_active
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_request_type_id AND w.code = v_workflow_code;

  IF v_workflow_id IS NULL THEN
    SELECT COALESCE(max(w.version), 0) + 1 INTO v_version
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_request_type_id;

    INSERT INTO public.request_type_workflows (
      request_type_id, code, name_ar, description_ar, version, status, is_active, change_note
    ) VALUES (
      v_request_type_id, v_workflow_code, 'غياب بعذر', v_contract_marker,
      v_version, 'draft', false, v_change_note
    ) RETURNING id INTO v_workflow_id;
    v_is_active := false;

    FOR v_step IN
      SELECT value, ordinality
      FROM jsonb_array_elements(v_steps) WITH ORDINALITY
      ORDER BY ordinality
    LOOP
      SELECT count(*), (array_agg(u.id ORDER BY u.id))[1] INTO v_count, v_unit_id
      FROM public.request_processing_units u
      WHERE u.code = v_step.value ->> 'unit' AND u.is_active = true;
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE:%:%',
          v_step.value ->> 'unit', v_count;
      END IF;

      SELECT count(*), (array_agg(r.id ORDER BY r.id))[1] INTO v_count, v_role_id
      FROM public.request_processing_roles r
      WHERE r.code = v_step.value ->> 'role'
        AND r.unit_id = v_unit_id
        AND r.is_active = true;
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE:%:%',
          v_step.value ->> 'role', v_count;
      END IF;

      INSERT INTO public.request_type_workflow_steps (
        workflow_id, step_key, step_name_ar, step_order,
        processing_unit_id, processing_role_id, assignment_strategy,
        action_type, action_code, status_on_enter, status_on_complete,
        is_required, can_return_to_student, can_reject, can_skip,
        visible_to_student, requires_attachment, requires_payment, produces_document, config
      ) VALUES (
        v_workflow_id,
        v_step.value ->> 'key',
        v_step.value ->> 'name_ar',
        v_step.ordinality,
        v_unit_id,
        v_role_id,
        'specific_user',
        v_step.value ->> 'action',
        v_step.value ->> 'action_code',
        CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
          THEN 'awaiting_payment_confirmation' ELSE 'in_progress' END,
        CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
          THEN 'payment_confirmed' ELSE 'completed' END,
        true,
        true,
        true,
        false,
        true,
        false,
        false,
        false,
        jsonb_build_object(
          'authorization', 'exactly_one_direct_assignee',
          'department_scope', v_step.value ->> 'scope',
          'payment_policy', CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
            THEN 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION' ELSE NULL END
        )
      ) RETURNING id INTO v_step_id;
      v_step_ids := v_step_ids || jsonb_build_object(v_step.value ->> 'key', v_step_id);
    END LOOP;

    FOR v_transition IN SELECT value FROM jsonb_array_elements(v_transitions)
    LOOP
      v_from_id := CASE WHEN v_transition.value ->> 'from' IS NULL THEN NULL
        ELSE (v_step_ids ->> (v_transition.value ->> 'from'))::uuid END;
      v_to_id := CASE WHEN v_transition.value ->> 'to' IS NULL THEN NULL
        ELSE (v_step_ids ->> (v_transition.value ->> 'to'))::uuid END;

      INSERT INTO public.request_type_workflow_transitions (
        workflow_id, from_step_id, to_step_id, action_result, label_ar,
        condition_schema, is_default, priority
      ) VALUES (
        v_workflow_id, v_from_id, v_to_id, v_transition.value ->> 'result',
        v_transition.value ->> 'label_ar', '{}'::jsonb, true, 0
      );
    END LOOP;
  END IF;

  -- Whether just created or found from an earlier run, the full structure
  -- must equal the declared contract. A partial or edited workflow stops here.
  SELECT count(*) INTO v_count
  FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = v_workflow_id;
  IF v_count <> jsonb_array_length(v_steps) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_steps) WITH ORDINALITY expected(value, ordinality)
    LEFT JOIN public.request_type_workflow_steps s
      ON s.workflow_id = v_workflow_id
     AND s.step_key = expected.value ->> 'key'
    LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
    LEFT JOIN public.request_processing_roles r
      ON r.id = s.processing_role_id AND r.unit_id = u.id
    WHERE s.id IS NULL
       OR s.step_order <> expected.ordinality
       OR u.code IS DISTINCT FROM expected.value ->> 'unit'
       OR r.code IS DISTINCT FROM expected.value ->> 'role'
       OR s.action_type IS DISTINCT FROM expected.value ->> 'action'
       OR s.action_code IS DISTINCT FROM expected.value ->> 'action_code'
       OR s.assignment_strategy IS DISTINCT FROM 'specific_user'
       OR s.is_required IS DISTINCT FROM true
       OR s.can_skip IS DISTINCT FROM false
       OR s.requires_payment IS DISTINCT FROM false
       OR s.produces_document IS DISTINCT FROM false
       OR s.config ->> 'authorization' IS DISTINCT FROM 'exactly_one_direct_assignee'
       OR s.config ->> 'department_scope' IS DISTINCT FROM expected.value ->> 'scope'
       OR (expected.value ->> 'key' = 'payment_confirmation' AND (
            s.status_on_enter IS DISTINCT FROM 'awaiting_payment_confirmation'
            OR s.status_on_complete IS DISTINCT FROM 'payment_confirmed'
            OR s.config ->> 'payment_policy' IS DISTINCT FROM 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION'
          ))
       OR (expected.value ->> 'key' <> 'payment_confirmation' AND (
            s.status_on_enter IS DISTINCT FROM 'in_progress'
            OR s.status_on_complete IS DISTINCT FROM 'completed'
            OR s.config ->> 'payment_policy' IS NOT NULL
          ))
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_STEP_STRUCTURE_MISMATCH';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_workflow_id;
  IF v_count <> jsonb_array_length(v_transitions) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_transitions) expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.request_type_workflow_transitions t
      LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = v_workflow_id
        AND fs.step_key IS NOT DISTINCT FROM expected.value ->> 'from'
        AND ts.step_key IS NOT DISTINCT FROM expected.value ->> 'to'
        AND t.action_result = expected.value ->> 'result'
        AND t.is_default = true
        AND COALESCE(t.condition_schema, '{}'::jsonb) = '{}'::jsonb
    )
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_TRANSITION_STRUCTURE_MISMATCH';
  END IF;

  -- Payments stay outside the portal: no fee-assessment step, no ledger flag,
  -- exactly one unconditional payment_confirmed edge.
  IF EXISTS (
    SELECT 1 FROM public.request_type_workflow_steps s
    WHERE s.workflow_id = v_workflow_id
      AND (s.step_key = 'fee_assessment'
        OR s.action_type IN ('assess_fee','request_payment','sign','issue_document')
        OR s.requires_payment = true
        OR s.produces_document = true)
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_FORBIDDEN_STEP_SHAPE';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflow_transitions t
  JOIN public.request_type_workflow_steps s ON s.id = t.from_step_id
  WHERE t.workflow_id = v_workflow_id
    AND s.step_key = 'payment_confirmation'
    AND t.action_result = 'payment_confirmed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED:%', v_count;
  END IF;

  -- Runtime contract pin (append-only table: INSERT is the only legal write).
  INSERT INTO public.b1_workflow_runtime_contract_snapshot (
    workflow_id, request_type_code, workflow_version, step_key, step_order,
    unit_code, role_code, action_type, action_code
  )
  SELECT s.workflow_id, v_request_type_code, w.version, s.step_key, s.step_order,
         u.code, r.code, s.action_type, s.action_code
  FROM public.request_type_workflow_steps s
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
  WHERE s.workflow_id = v_workflow_id
    AND NOT EXISTS (
      SELECT 1 FROM public.b1_workflow_runtime_contract_snapshot existing
      WHERE existing.workflow_id = s.workflow_id AND existing.step_key = s.step_key
    );

  SELECT count(*) INTO v_count
  FROM public.request_type_workflow_steps s
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles r ON r.id = s.processing_role_id
  WHERE s.workflow_id = v_workflow_id
    AND public.b1_runtime_step_contract_ok(
      'excused_absence', s.workflow_id, s.step_key, u.code, r.code, s.action_type);
  IF v_count <> jsonb_array_length(v_steps) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_RUNTIME_CONTRACT_PIN_INCOMPLETE:%', v_count;
  END IF;

  IF v_is_active IS DISTINCT FROM true THEN
    -- Same gate the admin publish path uses.
    PERFORM public.validate_request_workflow_publish(v_workflow_id);

    SELECT w.id, w.version INTO v_previous_workflow_id, v_previous_version
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_request_type_id
      AND w.status = 'active' AND w.is_active = true
      AND w.code = 'excused_absence_free_workflow';
    IF v_previous_workflow_id IS NULL THEN
      RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_PREVIOUS_ACTIVE_FREE_WORKFLOW_NOT_FOUND';
    END IF;

    -- Supersede: identical columns/values to 20260811202824 and
    -- admin_save_request_workflow_config. superseded_at / published_at are
    -- stamped by trg_stamp_workflow_version_lifecycle.
    UPDATE public.request_type_workflows
       SET status = 'retired', is_active = false, updated_at = now()
     WHERE request_type_id = v_request_type_id
       AND id <> v_workflow_id
       AND is_active = true;

    UPDATE public.request_type_workflows
       SET status = 'active', is_active = true, updated_at = now()
     WHERE id = v_workflow_id;

    INSERT INTO public.request_workflow_publish_validations (
      workflow_id, request_type_code, is_valid, message
    )
    SELECT v_workflow_id, v_request_type_code, true,
           'PUBLISHED_V' || w.version || '_EXCUSED_ABSENCE_PAID_SIGNATURE_WORKFLOW_01'
    FROM public.request_type_workflows w WHERE w.id = v_workflow_id;

    INSERT INTO public.request_type_workflow_change_log (
      request_type_id, workflow_id, version, change_kind, change_note, snapshot, changed_by
    )
    SELECT v_request_type_id, v_workflow_id, w.version, 'workflow_published', v_change_note,
           jsonb_build_object(
             'package', 'EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01',
             'workflow_code', v_workflow_code,
             'superseded_workflow_id', v_previous_workflow_id,
             'superseded_workflow_code', 'excused_absence_free_workflow',
             'superseded_version', v_previous_version,
             'payment_policy', 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION',
             'steps', v_steps,
             'transitions', v_transitions
           ),
           NULL
    FROM public.request_type_workflows w WHERE w.id = v_workflow_id;
  END IF;
END;
$workflow$;

-- ---------------------------------------------------------------------
-- 4. Post-conditions — any violation rolls the whole transaction back
-- ---------------------------------------------------------------------
DO $postconditions$
DECLARE
  v_count integer;
  v_inv record;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE rt.code = 'excused_absence' AND w.status = 'active' AND w.is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_ACTIVE_WORKFLOW_COUNT:%', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE rt.code = 'excused_absence'
    AND w.code = 'excused_absence_external_payment_workflow'
    AND w.status = 'active' AND w.is_active = true
    AND w.published_at IS NOT NULL AND w.superseded_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_TARGET_WORKFLOW_NOT_ACTIVE';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE rt.code = 'excused_absence'
    AND w.code = 'excused_absence_free_workflow'
    AND (w.status <> 'retired' OR w.is_active);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_FREE_WORKFLOW_NOT_RETIRED:%', v_count;
  END IF;

  SELECT * INTO v_inv FROM eawf01_invariants;

  IF v_inv.request_type_rows IS DISTINCT FROM (
    SELECT jsonb_agg(to_jsonb(rt) ORDER BY rt.id)
    FROM public.request_types rt
    WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse'])
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_REQUEST_TYPE_ROW_CHANGED';
  END IF;

  IF v_inv.legacy_step_count IS DISTINCT FROM (
    SELECT count(*)
    FROM public.request_type_workflow_steps s
    JOIN public.request_type_workflows w ON w.id = s.workflow_id
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = 'excused_absence'
      AND w.code <> 'excused_absence_external_payment_workflow'
  ) OR v_inv.legacy_transition_count IS DISTINCT FROM (
    SELECT count(*)
    FROM public.request_type_workflow_transitions t
    JOIN public.request_type_workflows w ON w.id = t.workflow_id
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = 'excused_absence'
      AND w.code <> 'excused_absence_external_payment_workflow'
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_LEGACY_WORKFLOW_DEFINITION_CHANGED';
  END IF;

  IF v_inv.processing_assignment_count IS DISTINCT FROM (
    SELECT count(*) FROM public.request_processing_assignments
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_POST_PROCESSING_ASSIGNMENTS_CHANGED';
  END IF;
END;
$postconditions$;

COMMIT;
