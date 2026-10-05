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
--   1. Creates ONE table: public.excused_absence_fee_decisions — the registrar's
--      per-request fee decision (FEE_REQUIRED | FEE_NOT_REQUIRED + reason).
--      Insert-only through one RPC, never updatable. It stores NO amount and
--      NO currency; the portal processes no payment.
--   2. Creates SEVEN functions (all new, none replaces an existing one):
--        b1_excused_absence_student_department      scope: the student's department
--        b1_excused_absence_paid_cycle_step         "is this step on the new cycle?"
--        b1_excused_absence_step_decision_allowed   may this step reject / return?
--        b1_excused_absence_before_step_action      executor pre-hook (fail closed)
--        guard_excused_absence_fee_decision_write   immutability trigger function
--        record_excused_absence_fee_decision        registrar RPC (authenticated)
--        get_excused_absence_fee_decision           owner/assignee read (authenticated)
--   3. Applies ELEVEN minimal, anchor-checked, fail-closed patches to SIX
--      deployed functions (the deployed body is read with pg_get_functiondef,
--      exactly one anchor must match, otherwise the whole transaction aborts):
--        initialize_b1_request_workflow_strict            (3 anchors)
--           student-department scope on first init and on resubmit; a
--           returned request restarts at the first step of the SAME version.
--        assert_b1_runtime_step_row_assignee_effective    (1 anchor)
--           the same scope when the signature step is activated.
--        act_on_b1_student_request_step_atomic            (4 anchors)
--           record the excuse before `archive`; allow reject / return ONLY
--           where b1_excused_absence_step_decision_allowed says so; run the
--           pre-hook; store the mandatory reason with the status change.
--        record_external_university_payment_confirmation  (1 anchor)
--           excused_absence joins the external-payment services.
--        evaluate_workflow_transition_condition           (1 anchor)
--           implements the catalog condition EXCUSED_ABSENCE_FEE_NOT_REQUIRED.
--        trg_notify_student_request                       (1 anchor)
--           Arabic service label for the canonical code in the reject notice.
--      Every new branch is guarded by request type AND workflow code, so the
--      other four B1 services and the retired free cycle behave exactly as
--      before.
--   4. Creates workflow `excused_absence_external_payment_workflow` (next
--      version of the request type) with 8 steps + 17 transitions (linear
--      path, one conditional fee branch, reject/return exits), pins its
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
--   - no change to apply_b1_excused_absence_effect,
--     can_current_user_act_on_step or get_b1_step_allowed_actions.
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
    'public.student_request_workflow_events',
    'public.absence_excuse_details',
    'public.request_workflow_transition_condition_catalog',
    'public.notifications'
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
    'public.validate_request_workflow_publish(uuid)',
    'public.resolve_b1_workflow_transition(uuid,uuid,text,uuid)',
    'public.evaluate_workflow_transition_condition(uuid,jsonb)',
    'public.create_notification(uuid,text,text,text,text,uuid)',
    'public.trg_notify_student_request()'
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
      ('student_requests','rejection_reason'),
      ('student_requests','request_number'),
      ('request_type_workflow_steps','can_reject'),
      ('request_type_workflow_steps','can_return_to_student'),
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

-- True only for a runtime step of an excused-absence request that runs on the
-- NEW cycle. Every behaviour added by this package is gated on it, so the
-- other four B1 services and the retired free cycle are never affected.
CREATE OR REPLACE FUNCTION public.b1_excused_absence_paid_cycle_step(p_step_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.step_key
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests r ON r.id = s.student_request_id
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  JOIN public.request_type_workflow_steps c
    ON c.id = s.workflow_step_id AND c.workflow_id = s.workflow_id AND c.step_key = s.step_key
  WHERE s.id = p_step_id
    AND r.request_type IN ('excused_absence', 'absence_excuse')
    AND w.code = 'excused_absence_external_payment_workflow';
$function$;

REVOKE ALL ON FUNCTION public.b1_excused_absence_paid_cycle_step(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_excused_absence_paid_cycle_step(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.b1_excused_absence_paid_cycle_step(uuid) FROM authenticated;

-- May the ACTIVE step be closed with `reject` / `return`? Purely a shape
-- question (cycle + per-step flag + exactly one exit transition). WHO may do
-- it is decided by the executor with the very same check it uses for the
-- configured action: can_current_user_act_on_step(step, configured action).
CREATE OR REPLACE FUNCTION public.b1_excused_absence_step_decision_allowed(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_action IN ('reject', 'return')
    AND public.b1_excused_absence_paid_cycle_step(p_step_id) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_request_workflow_steps s
      JOIN public.request_type_workflow_steps c ON c.id = s.workflow_step_id
      WHERE s.id = p_step_id
        AND s.status = 'active'
        AND CASE p_action
              WHEN 'reject' THEN c.can_reject IS TRUE
              WHEN 'return' THEN c.can_return_to_student IS TRUE
              ELSE false
            END
        AND (
          SELECT count(*)
          FROM public.request_type_workflow_transitions t
          WHERE t.workflow_id = s.workflow_id
            AND t.from_step_id = s.workflow_step_id
            AND t.to_step_id IS NULL
            AND t.action_result = p_action
        ) = 1
    );
$function$;

REVOKE ALL ON FUNCTION public.b1_excused_absence_step_decision_allowed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_excused_absence_step_decision_allowed(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.b1_excused_absence_step_decision_allowed(uuid, text) FROM authenticated;

-- ---------------------------------------------------------------------
-- 1b. Registrar fee decision (no amount, no currency, no payment record)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.excused_absence_fee_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE
    REFERENCES public.student_requests(id) ON DELETE CASCADE,
  runtime_step_id uuid NOT NULL UNIQUE
    REFERENCES public.student_request_workflow_steps(id) ON DELETE CASCADE,
  decision text NOT NULL,
  exemption_reason text,
  note text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT excused_absence_fee_decisions_decision_chk
    CHECK (decision IN ('FEE_REQUIRED', 'FEE_NOT_REQUIRED')),
  CONSTRAINT excused_absence_fee_decisions_reason_chk
    CHECK (
      (decision = 'FEE_REQUIRED' AND exemption_reason IS NULL)
      OR (decision = 'FEE_NOT_REQUIRED' AND exemption_reason IN ('FREE_SERVICE', 'EXEMPTION'))
    ),
  CONSTRAINT excused_absence_fee_decisions_note_chk
    CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.excused_absence_fee_decisions IS
  'غياب بعذر: قرار مسجل الكلية بشأن الرسوم لكل طلب. إدراج فقط عبر record_excused_absence_fee_decision، غير قابل للتعديل. لا مبلغ ولا عملة.';

-- Reached only through the SECURITY DEFINER RPCs below.
ALTER TABLE public.excused_absence_fee_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.excused_absence_fee_decisions FROM PUBLIC;
REVOKE ALL ON TABLE public.excused_absence_fee_decisions FROM anon;
REVOKE ALL ON TABLE public.excused_absence_fee_decisions FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_excused_absence_fee_decision_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('eawf01.fee_decision_write', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_RPC_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Only the cascade of a deleted request may remove its decision.
    IF EXISTS (SELECT 1 FROM public.student_requests r WHERE r.id = OLD.request_id) THEN
      RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_IS_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_IS_IMMUTABLE' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_excused_absence_fee_decision_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_excused_absence_fee_decision_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_excused_absence_fee_decision_write() FROM authenticated;

DO $guard_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.excused_absence_fee_decisions'::regclass
      AND tgname = 'trg_guard_excused_absence_fee_decision_write'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_guard_excused_absence_fee_decision_write
      BEFORE INSERT OR UPDATE OR DELETE ON public.excused_absence_fee_decisions
      FOR EACH ROW EXECUTE FUNCTION public.guard_excused_absence_fee_decision_write();
  END IF;
END;
$guard_trigger$;

-- Closed-catalog routing condition: "the registrar decided no fee is due".
INSERT INTO public.request_workflow_transition_condition_catalog (code, name_ar, description_ar, sort_order)
VALUES (
  'EXCUSED_ABSENCE_FEE_NOT_REQUIRED',
  'غياب بعذر: لا رسوم مستحقة',
  'ينطبق عندما يسجّل مسجل الكلية أن طلب الغياب بعذر مجاني أو معفى من الرسوم',
  60
)
ON CONFLICT (code) DO NOTHING;

DO $condition_guard$
BEGIN
  IF (SELECT count(*) FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND c.is_active) <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_FEE_CONDITION_MUST_BE_ACTIVE_IN_CATALOG';
  END IF;
END;
$condition_guard$;

-- Executor pre-hook. Runs AFTER the executor has authorized the caller as the
-- exact direct assignee and BEFORE any state change. No-op outside the new
-- cycle. Fail closed:
--   * reject / return need a real reason;
--   * the registrar step cannot be completed without a recorded fee decision.
CREATE OR REPLACE FUNCTION public.b1_excused_absence_before_step_action(
  p_step_id uuid, p_action text, p_comment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step_key text;
  v_request_id uuid;
  v_request_number text;
  v_student_user uuid;
  v_reason text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  IF current_setting('b1.atomic_action', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_step_key := public.b1_excused_absence_paid_cycle_step(p_step_id);
  IF v_step_key IS NULL THEN
    RETURN;
  END IF;

  SELECT s.student_request_id, r.request_number, sp.user_id
    INTO v_request_id, v_request_number, v_student_user
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests r ON r.id = s.student_request_id
  LEFT JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE s.id = p_step_id;

  IF p_action IN ('reject', 'return') THEN
    IF NOT public.b1_excused_absence_step_decision_allowed(p_step_id, p_action) THEN
      RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR char_length(v_reason) < 5 OR char_length(v_reason) > 2000 THEN
      RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_DECISION_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'return' THEN
      -- `rejected` is announced by trg_notify_student_request; the executor's
      -- return status (returned_for_completion) is not, so it is announced here.
      PERFORM public.create_notification(
        v_student_user,
        'طلب غياب بعذر يحتاج استكمال',
        'أُعيد طلبك رقم ' || COALESCE(v_request_number, '') ||
          ' لاستكماله. الملاحظات: ' || v_reason ||
          ' — عدّل الطلب ثم أعد إرساله ليبدأ من مراجعة العميد.',
        'request', 'student_request', v_request_id);
    END IF;
    RETURN;
  END IF;

  IF v_step_key = 'registrar_fee_referral' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.excused_absence_fee_decisions d
      WHERE d.request_id = v_request_id AND d.runtime_step_id = p_step_id
    ) THEN
      RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.b1_excused_absence_before_step_action(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_excused_absence_before_step_action(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.b1_excused_absence_before_step_action(uuid, text, text) FROM authenticated;

-- The registrar's fee decision. One call = decision + completion of the
-- registrar step + routing + student notification, or nothing at all.
CREATE OR REPLACE FUNCTION public.record_excused_absence_fee_decision(
  p_step_id uuid,
  p_decision text,
  p_exemption_reason text DEFAULT NULL,
  p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_request_number text;
  v_student_user uuid;
  v_result jsonb;
  v_payment_status text;
  v_signature_status text;
  v_reason_ar text;
  v_title text;
  v_message text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF p_step_id IS NULL THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:step' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('FEE_REQUIRED', 'FEE_NOT_REQUIRED') THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'FEE_REQUIRED' AND p_exemption_reason IS NOT NULL THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:exemption_reason' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'FEE_NOT_REQUIRED'
     AND (p_exemption_reason IS NULL OR p_exemption_reason NOT IN ('FREE_SERVICE', 'EXEMPTION')) THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:exemption_reason' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:note' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
  FOR UPDATE OF s;
  IF NOT FOUND
     OR v_step.status IS DISTINCT FROM 'active'
     OR public.b1_excused_absence_paid_cycle_step(p_step_id) IS DISTINCT FROM 'registrar_fee_referral' THEN
    RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Identical authorization to acting on the step: the single direct assignee
  -- holding the step's exact unit and role. No admin / registrar / dean bypass.
  IF NOT public.can_current_user_act_on_step(p_step_id, 'review') THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('eawf01.fee_decision_write', '1', true);
  INSERT INTO public.excused_absence_fee_decisions (
    request_id, runtime_step_id, decision, exemption_reason, note, decided_by
  ) VALUES (
    v_step.student_request_id, p_step_id, p_decision, p_exemption_reason, v_note, v_uid
  );
  PERFORM set_config('eawf01.fee_decision_write', '0', true);

  -- The generic executor completes the step and resolves the route through the
  -- catalog condition; it re-checks authorization, predecessors and the hook.
  v_result := public.act_on_b1_student_request_step_atomic(p_step_id, 'review', v_note, '{}'::jsonb);
  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'B1_ACTION_FAILED';
  END IF;

  -- The route must agree with the decision, or nothing is kept.
  SELECT
    (SELECT s.status FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_step.student_request_id AND s.step_key = 'payment_confirmation'),
    (SELECT s.status FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_step.student_request_id AND s.step_key = 'department_head_signature')
    INTO v_payment_status, v_signature_status;
  IF (p_decision = 'FEE_REQUIRED'
        AND (v_payment_status IS DISTINCT FROM 'active' OR v_signature_status IS DISTINCT FROM 'pending'))
     OR (p_decision = 'FEE_NOT_REQUIRED'
        AND (v_payment_status IS DISTINCT FROM 'skipped' OR v_signature_status IS DISTINCT FROM 'active')) THEN
    RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_FEE_DECISION_ROUTING_MISMATCH';
  END IF;

  SELECT r.request_number, sp.user_id INTO v_request_number, v_student_user
  FROM public.student_requests r
  LEFT JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE r.id = v_step.student_request_id;

  IF p_decision = 'FEE_REQUIRED' THEN
    v_title := 'رسوم مستحقة على طلب غياب بعذر';
    v_message := 'قرّر مسجل الكلية أن طلبك رقم ' || COALESCE(v_request_number, '') ||
      ' يستلزم سداد رسوم الخدمة. سدّد الرسوم في النظام الجامعي الرئيسي، وبعد أن يؤكد موظف الإيرادات الاستلام يُستكمل الطلب. لا يتم أي سداد داخل البوابة.';
  ELSE
    v_reason_ar := CASE p_exemption_reason WHEN 'FREE_SERVICE' THEN 'خدمة مجانية' ELSE 'إعفاء' END;
    v_title := 'لا يلزم سداد رسوم لطلب غياب بعذر';
    v_message := 'قرّر مسجل الكلية أن طلبك رقم ' || COALESCE(v_request_number, '') ||
      ' لا يستلزم سداد رسوم (' || v_reason_ar || ')، وانتقل الطلب إلى توقيع رئيس القسم.';
  END IF;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, p_step_id, 'fee_decision_recorded', v_uid,
    v_step.processing_unit_id, v_step.processing_role_id, v_message,
    jsonb_build_object('decision', p_decision, 'exemption_reason', p_exemption_reason), true
  );

  PERFORM public.create_notification(
    v_student_user, v_title, v_message, 'request', 'student_request', v_step.student_request_id);

  RETURN jsonb_build_object(
    'success', true,
    'step_id', p_step_id,
    'request_id', v_step.student_request_id,
    'decision', p_decision,
    'exemption_reason', p_exemption_reason,
    'next_step_id', v_result -> 'next_step_id'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_excused_absence_fee_decision(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_excused_absence_fee_decision(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_excused_absence_fee_decision(uuid, text, text, text) TO authenticated;

-- Read side: the owning student, or a staff member who is the direct assignee
-- of a runtime step of that same request. Anyone else gets NULL.
CREATE OR REPLACE FUNCTION public.get_excused_absence_fee_decision(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'requestId', d.request_id,
    'decision', d.decision,
    'exemptionReason', d.exemption_reason,
    'decidedAt', d.decided_at
  )
  FROM public.excused_absence_fee_decisions d
  JOIN public.student_requests r ON r.id = d.request_id
  WHERE d.request_id = p_request_id
    AND auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.student_profiles sp
        WHERE sp.id = r.student_profile_id AND sp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.student_request_workflow_steps s
        WHERE s.student_request_id = d.request_id
          AND public.user_matches_workflow_runtime_step(s.id)
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.get_excused_absence_fee_decision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_excused_absence_fee_decision(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_excused_absence_fee_decision(uuid) TO authenticated;

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
      --     A student without a department gets a student-facing Arabic
      --     eligibility message; a department without exactly one effective
      --     head gets a staff-facing one. Never a fallback to another head.
      (1,
       'public.initialize_b1_request_workflow_strict(uuid,text)',
       'EAWF01:init-student-department-scope',
       'ELSIF v_is_p1 THEN',
       'ELSIF p_canonical_code=''excused_absence'' AND v_config.step_key=''department_head_signature'' THEN' || E'\n' ||
       '      /* EAWF01:init-student-department-scope */' || E'\n' ||
       '      v_department_id := public.b1_excused_absence_student_department(p_request_id);' || E'\n' ||
       '      IF v_department_id IS NULL THEN' || E'\n' ||
       '        RAISE EXCEPTION ''B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED: لا يمكن تقديم طلب غياب بعذر قبل تسجيل قسمك العلمي في ملفك الطلابي. راجع شؤون الطلاب لاستكمال بيانات القسم ثم أعد المحاولة.''' || E'\n' ||
       '          USING ERRCODE=''P0001'';' || E'\n' ||
       '      END IF;' || E'\n' ||
       '      IF (SELECT count(*) FROM public.request_processing_assignments a' || E'\n' ||
       '          WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id' || E'\n' ||
       '            AND a.is_active=true AND a.department_id=v_department_id' || E'\n' ||
       '            AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)) <> 1 THEN' || E'\n' ||
       '        RAISE EXCEPTION ''B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED: لا يوجد رئيس قسم واحد فعّال معيّن لقسم الطالب على معالجة الطلبات. عيّنوا رئيس القسم من لوحة تعيينات المعالجة قبل قبول طلبات غياب بعذر لهذا القسم.''' || E'\n' ||
       '          USING ERRCODE=''P0001'';' || E'\n' ||
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
       '      RAISE EXCEPTION ''B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED:%'', v_step.step_key' || E'\n' ||
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
       '                            ''excused_absence'',''absence_excuse'' /* EAWF01:external-payment-service */)'),
      -- e. reject / return: the executor only ever accepted the configured
      --    action. It now also accepts `reject` / `return` where — and only
      --    where — the new cycle's step allows it. Authorization is the
      --    executor's own, unchanged check made a few lines earlier.
      (6,
       'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
       'EAWF01:step-decision-gate',
       'IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN',
       'IF v_config.action_type IS NULL OR (p_action IS DISTINCT FROM v_config.action_type' || E'\n' ||
       '      /* EAWF01:step-decision-gate */' || E'\n' ||
       '      AND NOT public.b1_excused_absence_step_decision_allowed(v_step.id, p_action)) THEN'),
      -- f. pre-hook: mandatory reason for reject / return, mandatory fee
      --    decision before the registrar step can complete.
      (7,
       'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
       'EAWF01:before-step-action-hook',
       'IF COALESCE(p_payload,''{}''::jsonb)<>''{}''::jsonb THEN RAISE EXCEPTION ''B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN''; END IF;',
       'IF COALESCE(p_payload,''{}''::jsonb)<>''{}''::jsonb THEN RAISE EXCEPTION ''B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN''; END IF;' || E'\n' ||
       '  /* EAWF01:before-step-action-hook */' || E'\n' ||
       '  PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);'),
      -- g. keep the reason on the request together with the terminal status,
      --    so the existing reject notification carries it. Unreachable for the
      --    other services (they cannot pass the gate with reject / return).
      (8,
       'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
       'EAWF01:decision-reason-on-request',
       'UPDATE public.student_requests SET status=CASE v_action WHEN ''reject'' THEN ''rejected''',
       'UPDATE public.student_requests SET /* EAWF01:decision-reason-on-request */' || E'\n' ||
       '      rejection_reason=CASE WHEN v_action IN (''reject'',''return'') THEN NULLIF(btrim(p_comment),'''') ELSE rejection_reason END,' || E'\n' ||
       '      status=CASE v_action WHEN ''reject'' THEN ''rejected'''),
      -- h. catalog condition used by the fee branch. Fail closed: no decision
      --    row, or FEE_REQUIRED, means the payment step is NOT bypassed.
      (9,
       'public.evaluate_workflow_transition_condition(uuid,jsonb)',
       'EAWF01:fee-not-required-condition',
       'IF v_code = ''FEE_IS_ZERO'' THEN',
       'IF v_code = ''EXCUSED_ABSENCE_FEE_NOT_REQUIRED'' THEN' || E'\n' ||
       '    /* EAWF01:fee-not-required-condition */' || E'\n' ||
       '    RETURN EXISTS (SELECT 1 FROM public.excused_absence_fee_decisions d' || E'\n' ||
       '                   WHERE d.request_id = p_request_id AND d.decision = ''FEE_NOT_REQUIRED'');' || E'\n' ||
       '  ELSIF v_code = ''FEE_IS_ZERO'' THEN'),
      -- i. resubmission after a return restarts at the first step of the SAME
      --    workflow version (owner decision), instead of resuming mid-cycle.
      (10,
       'public.initialize_b1_request_workflow_strict(uuid,text)',
       'EAWF01:resubmit-restart-at-first-step',
       'RETURN jsonb_build_object(''initialized'',false,''resumed'',true,''active_step_id'',v_active_step_id);',
       'IF p_canonical_code=''excused_absence''' || E'\n' ||
       '       AND public.b1_excused_absence_paid_cycle_step(v_active_step_id) IS NOT NULL THEN' || E'\n' ||
       '      /* EAWF01:resubmit-restart-at-first-step */' || E'\n' ||
       '      UPDATE public.student_request_workflow_steps' || E'\n' ||
       '      SET status=''pending'',entered_at=NULL,completed_at=NULL,completed_by=NULL,' || E'\n' ||
       '        decision=NULL,comment=NULL,updated_at=now()' || E'\n' ||
       '      WHERE student_request_id=p_request_id AND status<>''pending'';' || E'\n' ||
       '      UPDATE public.student_request_workflow_steps' || E'\n' ||
       '      SET status=''active'',entered_at=now(),updated_at=now()' || E'\n' ||
       '      WHERE student_request_id=p_request_id AND status=''pending''' || E'\n' ||
       '        AND step_order=(SELECT min(c.step_order) FROM public.request_type_workflow_steps c' || E'\n' ||
       '                        WHERE c.workflow_id=v_workflow.id)' || E'\n' ||
       '      RETURNING id INTO v_active_step_id;' || E'\n' ||
       '      IF (SELECT count(*) FROM public.student_request_workflow_steps s' || E'\n' ||
       '          WHERE s.student_request_id=p_request_id AND s.status=''active'') <> 1 THEN' || E'\n' ||
       '        RAISE EXCEPTION ''B1_EXACTLY_ONE_ACTIVE_STEP_REQUIRED'';' || E'\n' ||
       '      END IF;' || E'\n' ||
       '    END IF;' || E'\n' ||
       '    RETURN jsonb_build_object(''initialized'',false,''resumed'',true,''active_step_id'',v_active_step_id);'),
      -- j. the reject notification names the service in Arabic for the
      --    canonical stored code as well (label only).
      (11,
       'public.trg_notify_student_request()',
       'EAWF01:notification-service-label',
       'WHEN ''absence_excuse'' THEN ''عذر غياب''',
       'WHEN ''absence_excuse'' THEN ''عذر غياب''' || E'\n' ||
       '    WHEN ''excused_absence'' THEN ''غياب بعذر'' /* EAWF01:notification-service-label */')
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
      ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service'),
      ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:step-decision-gate'),
      ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook'),
      ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:decision-reason-on-request'),
      ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition'),
      ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-restart-at-first-step'),
      ('public.trg_notify_student_request()', 'EAWF01:notification-service-label')
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
-- (structure) and 20260811202824 (action_code + publish + fee branch).
-- Fee branch (owner decision): the registrar decides per request. The DEFAULT
-- edge leads to payment confirmation; only a recorded FEE_NOT_REQUIRED
-- decision takes the conditional edge that bypasses it (the executor then
-- marks payment_confirmation as `skipped`). Reject / return exits exist only
-- on the steps whose flags allow them.
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
    'غياب بعذر: مراجعة العميد ← قرار المسجل بشأن الرسوم ← تأكيد السداد الخارجي (عند لزوم الرسوم فقط) ← توقيع رئيس القسم ← توقيع العميد ← توقيع مدير شؤون الطلاب ← تسجيل العذر لدى المسجل ← الأرشفة';
  v_steps constant jsonb := jsonb_build_array(
    jsonb_build_object('key','dean_review','name_ar','مراجعة العميد وإحالة الطلب','unit','dean','role','dean','action','review','action_code','REVIEW','scope','request','can_reject',true,'can_return',true),
    jsonb_build_object('key','registrar_fee_referral','name_ar','قرار مسجل الكلية بشأن الرسوم','unit','registrar','role','registrar_general','action','review','action_code','REVIEW','scope','request','can_reject',true,'can_return',true),
    jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','action_code','PAYMENT_CONFIRMATION','scope','request','can_reject',false,'can_return',false),
    jsonb_build_object('key','department_head_signature','name_ar','توقيع رئيس القسم على استمارة الغياب','unit','department','role','department_head','action','approve','action_code','APPROVE','scope','student_department','can_reject',true,'can_return',false),
    jsonb_build_object('key','dean_signature','name_ar','توقيع العميد','unit','dean','role','dean','action','approve','action_code','APPROVE','scope','request','can_reject',true,'can_return',false),
    jsonb_build_object('key','student_affairs_manager_signature','name_ar','توقيع مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve','action_code','APPROVE','scope','request','can_reject',true,'can_return',false),
    jsonb_build_object('key','record_apply','name_ar','تسجيل العذر لدى مسجل الكلية','unit','registrar','role','registrar_general','action','apply_decision','action_code','REGISTER_EXCUSED_ABSENCE','scope','request','can_reject',false,'can_return',false),
    jsonb_build_object('key','archive','name_ar','الأرشفة','unit','archive','role','archive_officer','action','archive','action_code','ARCHIVE','scope','request','can_reject',false,'can_return',false)
  );
  v_transitions constant jsonb := jsonb_build_array(
    jsonb_build_object('from',NULL,'to','dean_review','result','submit','label_ar','إرسال الطلب مع المرفقات'),
    jsonb_build_object('from','dean_review','to','registrar_fee_referral','result','reviewed','label_ar','بعد مراجعة العميد وإحالته'),
    jsonb_build_object('from','registrar_fee_referral','to','payment_confirmation','result','reviewed','label_ar','قرار المسجل: رسوم مستحقة — السداد في النظام الجامعي الرئيسي'),
    jsonb_build_object('from','registrar_fee_referral','to','department_head_signature','result','reviewed','label_ar','قرار المسجل: لا رسوم (خدمة مجانية أو إعفاء) — تخطي تأكيد السداد','condition','EXCUSED_ABSENCE_FEE_NOT_REQUIRED'),
    jsonb_build_object('from','payment_confirmation','to','department_head_signature','result','payment_confirmed','label_ar','بعد تأكيد السداد الخارجي'),
    jsonb_build_object('from','department_head_signature','to','dean_signature','result','approved','label_ar','بعد توقيع رئيس القسم'),
    jsonb_build_object('from','dean_signature','to','student_affairs_manager_signature','result','approved','label_ar','بعد توقيع العميد'),
    jsonb_build_object('from','student_affairs_manager_signature','to','record_apply','result','approved','label_ar','بعد توقيع مدير شؤون الطلاب'),
    jsonb_build_object('from','record_apply','to','archive','result','applied','label_ar','بعد تسجيل العذر'),
    jsonb_build_object('from','archive','to',NULL,'result','archived','label_ar','إغلاق الطلب بالأرشفة'),
    jsonb_build_object('from','dean_review','to',NULL,'result','return','label_ar','إعادة الطلب إلى الطالب للاستكمال'),
    jsonb_build_object('from','registrar_fee_referral','to',NULL,'result','return','label_ar','إعادة الطلب إلى الطالب للاستكمال'),
    jsonb_build_object('from','dean_review','to',NULL,'result','reject','label_ar','رفض الطلب'),
    jsonb_build_object('from','registrar_fee_referral','to',NULL,'result','reject','label_ar','رفض الطلب'),
    jsonb_build_object('from','department_head_signature','to',NULL,'result','reject','label_ar','رفض الطلب'),
    jsonb_build_object('from','dean_signature','to',NULL,'result','reject','label_ar','رفض الطلب'),
    jsonb_build_object('from','student_affairs_manager_signature','to',NULL,'result','reject','label_ar','رفض الطلب')
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
        (v_step.value ->> 'can_return')::boolean,
        (v_step.value ->> 'can_reject')::boolean,
        -- can_skip is true ONLY on payment_confirmation: the deployed
        -- predecessor check accepts a `skipped` step only when it is skippable.
        -- No `skip` transition exists, so nobody can ever skip it by hand; the
        -- only way it becomes skipped is the registrar's no-fee branch.
        v_step.value ->> 'key' = 'payment_confirmation',
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
        v_transition.value ->> 'label_ar',
        CASE WHEN v_transition.value ->> 'condition' IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('code', v_transition.value ->> 'condition', 'params', '{}'::jsonb) END,
        v_transition.value ->> 'condition' IS NULL,
        CASE WHEN v_transition.value ->> 'condition' IS NULL THEN 0 ELSE 100 END
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
       OR s.can_skip IS DISTINCT FROM (expected.value ->> 'key' = 'payment_confirmation')
       OR s.can_reject IS DISTINCT FROM (expected.value ->> 'can_reject')::boolean
       OR s.can_return_to_student IS DISTINCT FROM (expected.value ->> 'can_return')::boolean
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
        AND t.is_default = (expected.value ->> 'condition' IS NULL)
        AND t.priority = CASE WHEN expected.value ->> 'condition' IS NULL THEN 0 ELSE 100 END
        AND COALESCE(t.condition_schema ->> 'code', '') = COALESCE(expected.value ->> 'condition', '')
    )
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_TRANSITION_STRUCTURE_MISMATCH';
  END IF;

  -- Payments stay outside the portal: no fee-assessment step, no ledger flag,
  -- exactly one unconditional payment_confirmed edge, and exactly ONE
  -- conditional edge in the whole cycle (the registrar's no-fee branch).
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

  SELECT count(*) INTO v_count
  FROM public.request_type_workflow_transitions t
  LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = v_workflow_id
    AND (NOT t.is_default OR COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb)
    AND NOT (
      fs.step_key = 'registrar_fee_referral'
      AND ts.step_key = 'department_head_signature'
      AND t.action_result = 'reviewed'
      AND t.condition_schema ->> 'code' = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED'
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_UNEXPECTED_CONDITIONAL_TRANSITION:%', v_count;
  END IF;

  -- Nobody may skip a step by hand: no `skip` edge exists anywhere.
  IF EXISTS (
    SELECT 1 FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_workflow_id AND t.action_result = 'skip'
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_MANUAL_SKIP_TRANSITION_FORBIDDEN';
  END IF;

  -- Exit edges exist exactly where the step flags allow them, nowhere else.
  IF EXISTS (
    SELECT 1
    FROM public.request_type_workflow_steps st
    CROSS JOIN (VALUES ('reject'), ('return')) AS x(result)
    WHERE st.workflow_id = v_workflow_id
      AND (CASE x.result WHEN 'reject' THEN st.can_reject ELSE st.can_return_to_student END)
          IS DISTINCT FROM EXISTS (
            SELECT 1 FROM public.request_type_workflow_transitions t
            WHERE t.workflow_id = v_workflow_id AND t.from_step_id = st.id
              AND t.to_step_id IS NULL AND t.action_result = x.result)
  ) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_EXIT_TRANSITIONS_DO_NOT_MATCH_STEP_FLAGS';
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
