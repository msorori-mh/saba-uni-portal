-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Five-service detail dispatcher installation. Caller/ACL cutover remains separate and fail-closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid,p_canonical_code text,p_form_data jsonb,p_attachment_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_profile public.student_profiles%ROWTYPE;
  v_allowed text[];
  v_year uuid; v_semester uuid; v_section uuid; v_target_program uuid; v_target_department uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF p_canonical_code NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
    THEN RAISE EXCEPTION 'B1_CANONICAL_CODE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_form_data IS NULL OR jsonb_typeof(p_form_data)<>'object'
    THEN RAISE EXCEPTION 'B1_FORM_OBJECT_REQUIRED' USING ERRCODE='22023'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r WHERE r.id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT sp.* INTO v_profile FROM public.student_profiles sp
    WHERE sp.id=v_request.student_profile_id AND sp.user_id=auth.uid() AND sp.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_ACTIVE_REQUEST_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF v_request.status NOT IN ('draft','returned','returned_for_completion')
    THEN RAISE EXCEPTION 'B1_REQUEST_NOT_WRITABLE' USING ERRCODE='42501'; END IF;
  IF CASE v_request.request_type WHEN 'absence_excuse' THEN 'excused_absence'
       WHEN 'transfer' THEN 'department_transfer' WHEN 'extra_chance' THEN 'final_chance'
       ELSE v_request.request_type END IS DISTINCT FROM p_canonical_code
    THEN RAISE EXCEPTION 'B1_REQUEST_TYPE_MISMATCH' USING ERRCODE='42501'; END IF;

  v_allowed:=CASE p_canonical_code
    WHEN 'enrollment_suspension' THEN ARRAY['target_academic_year','target_semester','suspension_reason','suspension_duration_type','notes','terms_acknowledgment']
    WHEN 'excused_absence' THEN ARRAY['course_section_id','absence_date','reason_type','absence_reason_detail','excuse_documents']
    WHEN 'department_transfer' THEN ARRAY['target_department_id','target_program_id','transfer_reason','secondary_certificate_file']
    WHEN 'final_chance' THEN ARRAY['target_academic_year','target_semester','reason','chance_type']
    WHEN 'file_withdrawal' THEN ARRAY['withdrawal_reason','impact_acknowledgment'] END;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_form_data) k WHERE k<>ALL(v_allowed))
    THEN RAISE EXCEPTION 'B1_UNEXPECTED_FORM_FIELD' USING ERRCODE='22023'; END IF;

  IF p_canonical_code='enrollment_suspension' THEN
    IF COALESCE(cardinality(p_attachment_ids),0)<>0 OR p_form_data->'terms_acknowledgment'<>'true'::jsonb
      OR p_form_data->>'suspension_duration_type' NOT IN ('one_semester','full_year')
      OR length(btrim(COALESCE(p_form_data->>'suspension_reason','')))<3
      THEN RAISE EXCEPTION 'B1_SUSPENSION_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    v_year:=(p_form_data->>'target_academic_year')::uuid; v_semester:=(p_form_data->>'target_semester')::uuid;
    PERFORM public.assert_b1_academic_period_reference(v_year,v_semester);
    INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id,suspension_reason,suspension_duration_type,notes)
      VALUES(p_request_id,v_year,v_semester,btrim(p_form_data->>'suspension_reason'),p_form_data->>'suspension_duration_type',nullif(btrim(p_form_data->>'notes'),''))
      ON CONFLICT(request_id) DO UPDATE SET requested_from_academic_year_id=EXCLUDED.requested_from_academic_year_id,
        requested_from_semester_id=EXCLUDED.requested_from_semester_id,suspension_reason=EXCLUDED.suspension_reason,
        suspension_duration_type=EXCLUDED.suspension_duration_type,notes=EXCLUDED.notes,updated_at=now();

  ELSIF p_canonical_code='excused_absence' THEN
    IF EXISTS (SELECT 1 FROM public.absence_excuse_details d
      WHERE d.request_id=p_request_id AND d.record_applied_at IS NOT NULL)
      THEN RAISE EXCEPTION 'B1_ABSENCE_EFFECT_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    v_section:=(p_form_data->>'course_section_id')::uuid;
    IF p_form_data->>'reason_type' NOT IN ('medical','family_emergency','official','other')
      OR length(btrim(COALESCE(p_form_data->>'absence_reason_detail','')))<3
      OR (p_form_data->>'absence_date')::date>current_date
      THEN RAISE EXCEPTION 'B1_ABSENCE_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    PERFORM public.assert_b1_active_course_enrollment(v_profile.id,v_section);
    PERFORM public.assert_required_student_request_attachments(p_request_id,p_attachment_ids);
    INSERT INTO public.absence_excuse_details(request_id,course_section_id,absence_date,reason_type,absence_reason_detail)
      VALUES(p_request_id,v_section,(p_form_data->>'absence_date')::date,p_form_data->>'reason_type',btrim(p_form_data->>'absence_reason_detail'))
      ON CONFLICT(request_id) DO UPDATE SET course_section_id=EXCLUDED.course_section_id,absence_date=EXCLUDED.absence_date,
        reason_type=EXCLUDED.reason_type,absence_reason_detail=EXCLUDED.absence_reason_detail,updated_at=now();

  ELSIF p_canonical_code='department_transfer' THEN
    v_target_department:=(p_form_data->>'target_department_id')::uuid;
    v_target_program:=(p_form_data->>'target_program_id')::uuid;
    IF v_profile.program_id IS NULL OR v_profile.department_id IS NULL
      OR v_target_department=v_profile.department_id OR length(btrim(COALESCE(p_form_data->>'transfer_reason','')))<3
      THEN RAISE EXCEPTION 'B1_TRANSFER_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    PERFORM public.assert_b1_target_program_department(v_target_program,v_target_department);
    PERFORM public.assert_required_student_request_attachments(p_request_id,p_attachment_ids);
    INSERT INTO public.transfer_request_details(request_id,current_program_id,requested_program_id,current_department_id,requested_department_id,transfer_reason)
      VALUES(p_request_id,v_profile.program_id,v_target_program,v_profile.department_id,v_target_department,btrim(p_form_data->>'transfer_reason'))
      ON CONFLICT(request_id) DO UPDATE SET current_program_id=EXCLUDED.current_program_id,requested_program_id=EXCLUDED.requested_program_id,
        current_department_id=EXCLUDED.current_department_id,requested_department_id=EXCLUDED.requested_department_id,
        transfer_reason=EXCLUDED.transfer_reason,updated_at=now();

  ELSIF p_canonical_code='final_chance' THEN
    IF EXISTS (SELECT 1 FROM public.extra_chance_details d
      WHERE d.request_id=p_request_id AND d.chance_applied_at IS NOT NULL)
      THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    IF COALESCE(cardinality(p_attachment_ids),0)<>0 OR COALESCE(p_form_data->>'chance_type','final_chance')<>'final_chance'
      OR length(btrim(COALESCE(p_form_data->>'reason','')))<3
      THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    v_year:=(p_form_data->>'target_academic_year')::uuid; v_semester:=(p_form_data->>'target_semester')::uuid;
    PERFORM public.assert_b1_academic_period_reference(v_year,v_semester);
    INSERT INTO public.extra_chance_details(request_id,academic_year_id,semester_id,reason,chance_type)
      VALUES(p_request_id,v_year,v_semester,btrim(p_form_data->>'reason'),'final_chance')
      ON CONFLICT(request_id) DO UPDATE SET academic_year_id=EXCLUDED.academic_year_id,semester_id=EXCLUDED.semester_id,
        reason=EXCLUDED.reason,chance_type='final_chance',updated_at=now();

  ELSE
    IF EXISTS (SELECT 1 FROM public.file_withdrawal_details d WHERE d.request_id=p_request_id
      AND num_nonnulls(d.library_cleared_at,d.labs_cleared_at,d.activities_cleared_at,
        d.finance_cleared_at,d.records_transferred_at)>0)
      THEN RAISE EXCEPTION 'B1_WITHDRAWAL_CLEARANCE_ALREADY_APPLIED' USING ERRCODE='55000'; END IF;
    IF COALESCE(cardinality(p_attachment_ids),0)<>0 OR p_form_data->'impact_acknowledgment'<>'true'::jsonb
      OR length(btrim(COALESCE(p_form_data->>'withdrawal_reason','')))<10
      THEN RAISE EXCEPTION 'B1_WITHDRAWAL_INPUT_INVALID' USING ERRCODE='23514'; END IF;
    INSERT INTO public.file_withdrawal_details(request_id,withdrawal_reason,impact_ack)
      VALUES(p_request_id,btrim(p_form_data->>'withdrawal_reason'),true)
      ON CONFLICT(request_id) DO UPDATE SET withdrawal_reason=EXCLUDED.withdrawal_reason,impact_ack=true,updated_at=now();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
