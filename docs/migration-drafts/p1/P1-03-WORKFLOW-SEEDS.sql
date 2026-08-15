-- PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02
-- P1-03 — real workflow definitions for the P1 services.
-- FORWARD-ONLY. IDEMPOTENT. student_visible is NEVER flipped here.
--
-- Workflows seeded (v1):
--   october_exam_entry_form : student → student affairs → revenue → registrar → archive
--   replacement_student_card: student → student affairs → revenue → card issuance
--   grade_appeal (final)    : registrar intake → dept head → instructor → academic
--                             decision → registrar apply → archive
--   department_transfer     : verified only (already live, untouched)

BEGIN;

-- Missing processing role used by the appeal workflow.
INSERT INTO public.request_processing_roles (unit_id, code, name_ar, is_managerial, sort_order)
SELECT u.id, 'course_instructor', 'أستاذ المقرر', false, 50
FROM public.request_processing_units u
WHERE u.code = 'department'
ON CONFLICT (unit_id, code) DO NOTHING;

-- Request types must exist and be active (visibility untouched).
INSERT INTO public.request_types (code, name_ar, category, is_active, student_visible, request_audience)
VALUES
  ('october_exam_entry_form', 'استمارة دخول دور أكتوبر', 'academic', true, false, 'active_student'),
  ('replacement_student_card', 'بطاقة طالب بدل فاقد', 'student_services', true, false, 'active_student')
ON CONFLICT (code) DO UPDATE SET is_active = true;

CREATE OR REPLACE FUNCTION public.p1_seed_workflow(
  p_type_code text,
  p_wf_code   text,
  p_wf_name   text,
  p_steps     jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type uuid;
  v_wf   uuid;
  v_step jsonb;
BEGIN
  SELECT id INTO v_type FROM public.request_types WHERE code = p_type_code;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'P1_SEED_UNKNOWN_REQUEST_TYPE: %', p_type_code;
  END IF;

  SELECT id INTO v_wf
  FROM public.request_type_workflows
  WHERE request_type_id = v_type AND code = p_wf_code AND version = 1;

  IF v_wf IS NULL THEN
    INSERT INTO public.request_type_workflows
      (request_type_id, code, name_ar, version, status, is_active, published_at, change_note)
    VALUES
      (v_type, p_wf_code, p_wf_name, 1, 'published', true, now(), 'P1 source closure 02 seed')
    RETURNING id INTO v_wf;
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    INSERT INTO public.request_type_workflow_steps (
      workflow_id, step_key, step_name_ar, step_order,
      processing_unit_id, processing_role_id,
      assignment_strategy, action_type, requires_payment, visible_to_student
    )
    SELECT
      v_wf,
      v_step->>'key',
      v_step->>'name_ar',
      (v_step->>'order')::int,
      u.id,
      r.id,
      'role_pool',
      v_step->>'action',
      COALESCE((v_step->>'requires_payment')::boolean, false),
      true
    FROM public.request_processing_units u
    JOIN public.request_processing_roles r
      ON r.unit_id = u.id AND r.code = v_step->>'role'
    WHERE u.code = v_step->>'unit'
    ON CONFLICT DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.request_type_workflow_steps
      WHERE workflow_id = v_wf AND step_key = v_step->>'key'
    ) THEN
      RAISE EXCEPTION 'P1_SEED_MISSING_PROCESSING_BINDING: %/%',
        v_step->>'unit', v_step->>'role';
    END IF;
  END LOOP;

  RETURN v_wf;
END $$;

SELECT public.p1_seed_workflow(
  'october_exam_entry_form',
  'october_exam_entry_form_v1',
  'مسار استمارة دخول دور أكتوبر',
  '[
    {"key":"student_affairs_review","name_ar":"مراجعة شؤون الطلاب","order":1,"unit":"student_affairs","role":"student_affairs_specialist","action":"review"},
    {"key":"payment_confirmation","name_ar":"تأكيد السداد الخارجي","order":2,"unit":"finance","role":"revenue_finance_officer","action":"confirm_payment","requires_payment":true},
    {"key":"registrar_finalize","name_ar":"اعتماد مسجل الكلية","order":3,"unit":"registrar","role":"registrar_general","action":"apply_decision"},
    {"key":"archive","name_ar":"الأرشفة","order":4,"unit":"archive","role":"archive_officer","action":"archive"}
  ]'::jsonb
);

SELECT public.p1_seed_workflow(
  'replacement_student_card',
  'replacement_student_card_v1',
  'مسار بطاقة طالب بدل فاقد',
  '[
    {"key":"student_affairs_review","name_ar":"مراجعة شؤون الطلاب","order":1,"unit":"student_affairs","role":"student_affairs_specialist","action":"review"},
    {"key":"payment_confirmation","name_ar":"تأكيد السداد الخارجي","order":2,"unit":"finance","role":"revenue_finance_officer","action":"confirm_payment","requires_payment":true},
    {"key":"card_issuance","name_ar":"إصدار البطاقة البديلة","order":3,"unit":"student_affairs","role":"student_affairs_manager","action":"apply_decision"}
  ]'::jsonb
);

SELECT public.p1_seed_workflow(
  'grade_appeal',
  'final_result_appeal_v1',
  'مسار التظلم على النتيجة النهائية',
  '[
    {"key":"registrar_intake","name_ar":"استقبال التظلم","order":1,"unit":"registrar","role":"registrar_general","action":"review"},
    {"key":"department_head_review","name_ar":"المراجعة الأكاديمية لرئيس القسم","order":2,"unit":"department","role":"department_head","action":"review"},
    {"key":"instructor_review","name_ar":"مراجعة أستاذ المقرر","order":3,"unit":"department","role":"course_instructor","action":"review"},
    {"key":"academic_decision","name_ar":"القرار الأكاديمي المعتمد","order":4,"unit":"department","role":"department_head","action":"approve"},
    {"key":"registrar_apply_result","name_ar":"تطبيق النتيجة المعتمدة","order":5,"unit":"registrar","role":"registrar_general","action":"apply_decision"},
    {"key":"archive","name_ar":"الأرشفة","order":6,"unit":"archive","role":"archive_officer","action":"archive"}
  ]'::jsonb
);

DROP FUNCTION IF EXISTS public.p1_seed_workflow(text, text, text, jsonb);

COMMIT;
