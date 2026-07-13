-- ENROLLMENT-CERTIFICATE-HIDDEN-DRAFT-AND-SUBMIT-WINDOW-01S-B2
-- Guarded admin E2E helpers for hidden enrollment_certificate drafts + temporary
-- submit window (is_active true, student_visible false).
-- Does NOT modify create_student_request / submit_student_request.
-- Applying this migration does not create requests or change request_types data.

-- =============================================================================
-- Internal auth guard (admin / system_admin only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_admin_enrollment_certificate_e2e()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin']::text[]
  ) THEN
    RAISE EXCEPTION 'غير مصرح بإدارة اختبار شهادة القيد المخفي'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_can_admin_enrollment_certificate_e2e() IS
  'Internal guard for enrollment_certificate hidden E2E admin RPCs. '
  'Allows admin/system_admin only.';

REVOKE ALL ON FUNCTION public.assert_can_admin_enrollment_certificate_e2e()
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- Shared readiness helper (internal)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._assert_enrollment_certificate_e2e_processing_assignments()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair text[];
  v_unit_code text;
  v_role_code text;
  v_unit public.request_processing_units%ROWTYPE;
  v_role public.request_processing_roles%ROWTYPE;
  v_active_count integer;
  v_resolved_user uuid;
  v_required text[][] := ARRAY[
    ARRAY['student_affairs', 'student_affairs_manager'],
    ARRAY['student_affairs', 'student_affairs_specialist'],
    ARRAY['finance', 'revenue_finance_officer'],
    ARRAY['registrar', 'registrar_general'],
    ARRAY['dean', 'dean'],
    ARRAY['archive', 'archive_officer']
  ];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_required
  LOOP
    v_unit_code := v_pair[1];
    v_role_code := v_pair[2];

    SELECT * INTO v_unit
    FROM public.request_processing_units u
    WHERE u.code = v_unit_code;

    IF NOT FOUND OR v_unit.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'وحدة المعالجة % غير موجودة أو غير نشطة لنافذة اختبار شهادة القيد', v_unit_code
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_role
    FROM public.request_processing_roles r
    WHERE r.code = v_role_code
      AND r.unit_id = v_unit.id;

    IF NOT FOUND OR v_role.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'دور المعالجة % غير موجود أو غير نشط ضمن وحدة %', v_role_code, v_unit_code
        USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer INTO v_active_count
    FROM public.request_processing_assignments a
    WHERE a.role_id = v_role.id
      AND a.unit_id = v_unit.id
      AND a.is_active IS TRUE
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at IS NULL OR a.ends_at > now());

    IF v_active_count = 0 THEN
      RAISE EXCEPTION 'لا يوجد إسناد نشط قابل للاستخدام للدور %', v_role_code
        USING ERRCODE = '42501';
    END IF;

    IF v_active_count > 1 THEN
      RAISE EXCEPTION 'يوجد أكثر من إسناد نشط للدور %', v_role_code
        USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(a.user_id, sp.user_id, fp.user_id, pa.user_id)
    INTO v_resolved_user
    FROM public.request_processing_assignments a
    LEFT JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
    LEFT JOIN public.faculty_profiles fp ON fp.id = a.faculty_profile_id
    LEFT JOIN public.position_assignments pa ON pa.id = a.position_assignment_id
    WHERE a.role_id = v_role.id
      AND a.unit_id = v_unit.id
      AND a.is_active IS TRUE
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at IS NULL OR a.ends_at > now())
    LIMIT 1;

    IF v_resolved_user IS NULL OR NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = v_resolved_user
    ) THEN
      RAISE EXCEPTION 'إسناد الدور % لا يشير إلى مستخدم قابل للحل', v_role_code
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public._assert_enrollment_certificate_e2e_processing_assignments() IS
  'Internal: validates the six enrollment_certificate processing assignments by '
  'unit/role codes (exactly one currently-effective resolvable assignment each). '
  'Does not require the global active assignment count to equal 6.';

REVOKE ALL ON FUNCTION public._assert_enrollment_certificate_e2e_processing_assignments()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._enrollment_certificate_e2e_load_hidden_type(
  p_require_inactive boolean
)
RETURNS public.request_types
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.request_types%ROWTYPE;
  v_type_count integer;
  v_workflow public.request_type_workflows%ROWTYPE;
  v_steps integer;
  v_transitions integer;
BEGIN
  SELECT count(*)::integer INTO v_type_count
  FROM public.request_types rt
  WHERE rt.code = 'enrollment_certificate';

  IF v_type_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'نوع طلب enrollment_certificate غير فريد أو غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = 'enrollment_certificate';

  IF v_type.student_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'نافذة اختبار شهادة القيد تتطلب student_visible=false'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.requires_attachment IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'نافذة اختبار شهادة القيد تتطلب requires_attachment=false'
      USING ERRCODE = '42501';
  END IF;

  IF p_require_inactive THEN
    IF v_type.is_active IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'إنشاء مسودة E2E يتطلب is_active=false وstudent_visible=false'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_workflow
  FROM public.get_active_workflow_for_request_type(v_type.id);

  IF v_workflow.id IS NULL THEN
    RAISE EXCEPTION 'لا توجد workflow نشطة لشهادة القيد'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_workflow.version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'workflow النشطة لشهادة القيد يجب أن تكون version=2'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_steps
  FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = v_workflow.id;

  SELECT count(*)::integer INTO v_transitions
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_workflow.id;

  IF v_steps IS DISTINCT FROM 7 OR v_transitions IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'تكوين workflow شهادة القيد غير مطابق (المتوقع 7 خطوات و9 انتقالات)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._assert_enrollment_certificate_e2e_processing_assignments();

  RETURN v_type;
END;
$$;

COMMENT ON FUNCTION public._enrollment_certificate_e2e_load_hidden_type(boolean) IS
  'Internal helper: loads enrollment_certificate and validates hidden E2E readiness '
  '(workflow v2, 7/9, six coded processing assignments, student_visible=false).';

REVOKE ALL ON FUNCTION public._enrollment_certificate_e2e_load_hidden_type(boolean)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- RPC: admin_create_enrollment_certificate_e2e_draft
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_enrollment_certificate_e2e_draft(
  p_student_user_id uuid,
  p_e2e_marker text,
  p_student_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_marker text;
  v_type public.request_types%ROWTYPE;
  v_profile_id uuid;
  v_profile_status text;
  v_profile_count integer;
  v_existing public.student_requests%ROWTYPE;
  v_open_other integer;
  v_request_id uuid;
  v_request_number text;
  v_created_at timestamptz;
  v_form jsonb;
  v_notes text;
BEGIN
  PERFORM public.assert_can_admin_enrollment_certificate_e2e();

  IF p_student_user_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطالب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  v_marker := btrim(COALESCE(p_e2e_marker, ''));
  IF char_length(v_marker) < 8 OR char_length(v_marker) > 100 THEN
    RAISE EXCEPTION 'وسم E2E يجب أن يكون بين 8 و100 حرف'
      USING ERRCODE = '22023';
  END IF;

  IF v_marker !~ '^[A-Z0-9][A-Z0-9_-]{7,99}$' THEN
    RAISE EXCEPTION 'صيغة وسم E2E غير صالحة'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize create/reuse per student + enrollment_certificate (marker excluded).
  PERFORM pg_advisory_xact_lock(
    hashtext(
      'enrollment_cert_e2e_draft:'
      || p_student_user_id::text
      || ':enrollment_certificate'
    )
  );

  v_type := public._enrollment_certificate_e2e_load_hidden_type(true);

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_student_user_id
  ) THEN
    RAISE EXCEPTION 'حساب المستخدم غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_student_user_id
      AND u.banned_until IS NOT NULL
      AND u.banned_until > now()
  ) THEN
    RAISE EXCEPTION 'حساب المستخدم محظور'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.student_profiles sp
  WHERE sp.user_id = p_student_user_id;

  IF v_profile_count = 0 THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بالحساب المحدد'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_profile_count > 1 THEN
    RAISE EXCEPTION 'يوجد أكثر من ملف طالب لنفس الحساب'
      USING ERRCODE = '42501';
  END IF;

  SELECT sp.id, sp.status
  INTO v_profile_id, v_profile_status
  FROM public.student_profiles sp
  WHERE sp.user_id = p_student_user_id;

  IF NOT public.has_any_role(p_student_user_id, ARRAY['student']::text[]) THEN
    RAISE EXCEPTION 'الحساب المستهدف لا يملك دور student'
      USING ERRCODE = '42501';
  END IF;

  -- Same eligibility gate as create_student_request (audience/status only).
  PERFORM public.assert_student_can_use_request_type(
    v_profile_status,
    v_type.request_audience
  );

  SELECT * INTO v_existing
  FROM public.student_requests sr
  WHERE sr.student_profile_id = v_profile_id
    AND sr.request_type = 'enrollment_certificate'
    AND COALESCE(sr.form_data->>'e2e_marker', '') = v_marker
  ORDER BY sr.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'request_id', v_existing.id,
      'request_type_id', v_type.id,
      'student_user_id', p_student_user_id,
      'status', v_existing.status,
      'e2e_marker', v_marker,
      'reused_existing', true,
      'created_at', v_existing.created_at
    );
  END IF;

  SELECT count(*)::integer INTO v_open_other
  FROM public.student_requests sr
  WHERE sr.student_profile_id = v_profile_id
    AND sr.request_type = 'enrollment_certificate'
    AND sr.status NOT IN ('approved', 'rejected', 'cancelled', 'completed')
    AND COALESCE(sr.form_data->>'e2e_marker', '') IS DISTINCT FROM v_marker;

  IF v_open_other > 0 THEN
    RAISE EXCEPTION 'يوجد طلب شهادة قيد مفتوح سابق لهذا الطالب'
      USING ERRCODE = '42501';
  END IF;

  v_form := jsonb_build_object(
    'internal_e2e', true,
    'e2e_scenario', 'zero_fee',
    'e2e_marker', v_marker,
    'created_by_admin_user_id', v_uid::text
  );

  v_notes := NULLIF(btrim(COALESCE(p_student_notes, '')), '');

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number,
    student_profile_id,
    request_type,
    title,
    description,
    status,
    form_data,
    student_notes
  ) VALUES (
    v_request_number,
    v_profile_id,
    v_type.code,
    'اختبار داخلي — شهادة قيد — رسوم صفرية',
    v_notes,
    'draft',
    v_form,
    v_notes
  )
  RETURNING id, created_at INTO v_request_id, v_created_at;

  PERFORM public.log_audit(
    'student_request',
    v_request_id,
    'admin_e2e_request_draft_created',
    NULL,
    jsonb_build_object(
      'student_user_id', p_student_user_id,
      'request_type_code', 'enrollment_certificate',
      'e2e_marker', v_marker,
      'scenario', 'zero_fee',
      'hidden_request_type', true,
      'status', 'draft'
    ),
    'Hidden enrollment_certificate E2E draft created by admin',
    v_uid
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_type_id', v_type.id,
    'student_user_id', p_student_user_id,
    'status', 'draft',
    'e2e_marker', v_marker,
    'reused_existing', false,
    'created_at', v_created_at
  );
END;
$$;

COMMENT ON FUNCTION public.admin_create_enrollment_certificate_e2e_draft(uuid, text, text) IS
  'Admin/system_admin only: create a draft enrollment_certificate request for a '
  'specific student while the type remains inactive+hidden. Idempotent on '
  'student+type+e2e_marker. Does not submit or initialize workflow runtime.';

REVOKE ALL ON FUNCTION public.admin_create_enrollment_certificate_e2e_draft(uuid, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_enrollment_certificate_e2e_draft(uuid, text, text)
  TO authenticated;

-- =============================================================================
-- RPC: admin_set_enrollment_certificate_e2e_submit_window
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window(
  p_open boolean,
  p_e2e_marker text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_marker text;
  v_type public.request_types%ROWTYPE;
  v_req public.student_requests%ROWTYPE;
  v_match_drafts integer;
  v_open_other integer;
  v_previous_active boolean;
  v_new_active boolean;
  v_profile_status text;
  v_student_user_id uuid;
BEGIN
  PERFORM public.assert_can_admin_enrollment_certificate_e2e();

  IF p_open IS NULL THEN
    RAISE EXCEPTION 'قيمة فتح/إغلاق النافذة مطلوبة'
      USING ERRCODE = '22023';
  END IF;

  v_marker := btrim(COALESCE(p_e2e_marker, ''));
  IF char_length(v_marker) < 8 OR char_length(v_marker) > 100 THEN
    RAISE EXCEPTION 'وسم E2E يجب أن يكون بين 8 و100 حرف'
      USING ERRCODE = '22023';
  END IF;

  IF v_marker !~ '^[A-Z0-9][A-Z0-9_-]{7,99}$' THEN
    RAISE EXCEPTION 'صيغة وسم E2E غير صالحة'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = 'enrollment_certificate'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع طلب enrollment_certificate غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('enrollment_cert_e2e_window:' || v_type.id::text)
  );

  -- Re-read after lock.
  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.id = v_type.id
  FOR UPDATE;

  v_previous_active := COALESCE(v_type.is_active, false);

  IF v_type.student_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'نافذة اختبار شهادة القيد تتطلب student_visible=false'
      USING ERRCODE = '42501';
  END IF;

  -- Matching draft for audits / open gates (historical terminal rows allowed).
  SELECT * INTO v_req
  FROM public.student_requests sr
  WHERE sr.request_type = 'enrollment_certificate'
    AND COALESCE(sr.form_data->>'e2e_marker', '') = v_marker
    AND COALESCE((sr.form_data->>'internal_e2e')::boolean, false) IS TRUE
    AND COALESCE(sr.form_data->>'e2e_scenario', '') = 'zero_fee'
    AND sr.status = 'draft'
  ORDER BY sr.created_at ASC
  LIMIT 1;

  IF p_open IS TRUE THEN
    SELECT count(*)::integer INTO v_match_drafts
    FROM public.student_requests sr
    WHERE sr.request_type = 'enrollment_certificate'
      AND COALESCE(sr.form_data->>'e2e_marker', '') = v_marker
      AND COALESCE((sr.form_data->>'internal_e2e')::boolean, false) IS TRUE
      AND COALESCE(sr.form_data->>'e2e_scenario', '') = 'zero_fee'
      AND sr.status = 'draft';

    IF v_match_drafts = 0 OR v_req.id IS NULL THEN
      RAISE EXCEPTION 'لا توجد مسودة E2E مطابقة لوسم الاختبار'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_match_drafts > 1 THEN
      RAISE EXCEPTION 'يوجد أكثر من مسودة E2E بنفس الوسم'
        USING ERRCODE = '42501';
    END IF;

    -- Opening requires full hidden readiness (inactive+hidden + workflow gates).
    PERFORM public._enrollment_certificate_e2e_load_hidden_type(true);

    SELECT count(*)::integer INTO v_open_other
    FROM public.student_requests sr
    WHERE sr.request_type = 'enrollment_certificate'
      AND sr.status NOT IN ('approved', 'rejected', 'cancelled', 'completed')
      AND sr.id IS DISTINCT FROM v_req.id;

    IF v_open_other > 0 THEN
      RAISE EXCEPTION 'يوجد طلب شهادة قيد غير نهائي آخر يمنع فتح النافذة'
        USING ERRCODE = '42501';
    END IF;

    SELECT sp.user_id, sp.status
    INTO v_student_user_id, v_profile_status
    FROM public.student_profiles sp
    WHERE sp.id = v_req.student_profile_id;

    IF v_student_user_id IS NULL THEN
      RAISE EXCEPTION 'مالك المسودة غير صالح'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_any_role(v_student_user_id, ARRAY['student']::text[]) THEN
      RAISE EXCEPTION 'مالك المسودة لا يملك دور student'
        USING ERRCODE = '42501';
    END IF;

    PERFORM public.assert_student_can_use_request_type(
      v_profile_status,
      v_type.request_audience
    );

    IF v_previous_active IS TRUE THEN
      RAISE EXCEPTION 'نافذة تقديم شهادة القيد مفتوحة مسبقاً'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.request_types
    SET is_active = true
    WHERE id = v_type.id
      AND student_visible IS FALSE
      AND is_active IS FALSE
    RETURNING is_active INTO v_new_active;

    IF v_new_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'تعذر فتح نافذة التقديم مع الإبقاء على student_visible=false'
        USING ERRCODE = '42501';
    END IF;

    -- Hard assert visibility unchanged.
    SELECT student_visible, is_active
    INTO v_type.student_visible, v_type.is_active
    FROM public.request_types
    WHERE id = v_type.id;

    IF v_type.student_visible IS DISTINCT FROM false
       OR v_type.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'حالة نوع الطلب بعد فتح النافذة غير آمنة'
        USING ERRCODE = '42501';
    END IF;

    PERFORM public.log_audit(
      'request_type',
      v_type.id,
      'enrollment_certificate_e2e_submit_window_opened',
      jsonb_build_object(
        'is_active', v_previous_active,
        'student_visible', false
      ),
      jsonb_build_object(
        'is_active', true,
        'student_visible', false,
        'e2e_marker', v_marker,
        'request_type_id', v_type.id,
        'request_id', v_req.id,
        'previous_is_active', v_previous_active,
        'new_is_active', true,
        'actor', v_uid
      ),
      'Temporary enrollment_certificate E2E submit window opened',
      v_uid
    );

    RETURN jsonb_build_object(
      'success', true,
      'window_open', true,
      'request_type_id', v_type.id,
      'request_id', v_req.id,
      'e2e_marker', v_marker,
      'is_active', true,
      'student_visible', false,
      'previous_is_active', v_previous_active,
      'new_is_active', true
    );
  END IF;

  -- Close path: always restore is_active=false; keep student_visible=false.
  -- Idempotent even if submit failed or request remains draft.
  UPDATE public.request_types
  SET is_active = false
  WHERE id = v_type.id
    AND student_visible IS FALSE
  RETURNING is_active INTO v_new_active;

  IF v_new_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'تعذر إغلاق نافذة التقديم مع الإبقاء على student_visible=false'
      USING ERRCODE = '42501';
  END IF;

  SELECT student_visible, is_active
  INTO v_type.student_visible, v_type.is_active
  FROM public.request_types
  WHERE id = v_type.id;

  IF v_type.student_visible IS DISTINCT FROM false
     OR v_type.is_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'حالة نوع الطلب بعد إغلاق النافذة غير آمنة'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.log_audit(
    'request_type',
    v_type.id,
    'enrollment_certificate_e2e_submit_window_closed',
    jsonb_build_object(
      'is_active', v_previous_active,
      'student_visible', false
    ),
    jsonb_build_object(
      'is_active', false,
      'student_visible', false,
      'e2e_marker', v_marker,
      'request_type_id', v_type.id,
      'request_id', v_req.id,
      'previous_is_active', v_previous_active,
      'new_is_active', false,
      'actor', v_uid
    ),
    'Temporary enrollment_certificate E2E submit window closed',
    v_uid
  );

  RETURN jsonb_build_object(
    'success', true,
    'window_open', false,
    'request_type_id', v_type.id,
    'request_id', v_req.id,
    'e2e_marker', v_marker,
    'is_active', false,
    'student_visible', false,
    'previous_is_active', v_previous_active,
    'new_is_active', false
  );
END;
$$;

COMMENT ON FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window(boolean, text) IS
  'Admin/system_admin only: temporarily set enrollment_certificate.is_active for '
  'student submit of a marked E2E draft while keeping student_visible=false. '
  'Close is idempotent and always restores is_active=false.';

REVOKE ALL ON FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window(boolean, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window(boolean, text)
  TO authenticated;
