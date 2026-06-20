DO $mig$
DECLARE
  v_student_user_ids uuid[];
  v_student_profile_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  SELECT array_agg(id), array_agg(user_id) FILTER (WHERE user_id IS NOT NULL)
    INTO v_student_profile_ids, v_student_user_ids
  FROM public.student_profiles;

  IF v_student_profile_ids IS NULL OR array_length(v_student_profile_ids, 1) = 0 THEN
    RAISE NOTICE 'No student profiles to delete.';
    RETURN;
  END IF;

  v_counts := jsonb_set(v_counts, '{student_profiles_targeted}', to_jsonb(array_length(v_student_profile_ids,1)));

  DELETE FROM public.student_request_attachments
    WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_request_attachments}', to_jsonb(v_n));

  DELETE FROM public.absence_excuse_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{absence_excuse_details}', to_jsonb(v_n));

  DELETE FROM public.grade_appeal_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{grade_appeal_details}', to_jsonb(v_n));

  DELETE FROM public.enrollment_suspension_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{enrollment_suspension_details}', to_jsonb(v_n));

  DELETE FROM public.extra_chance_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{extra_chance_details}', to_jsonb(v_n));

  DELETE FROM public.transfer_request_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{transfer_request_details}', to_jsonb(v_n));

  DELETE FROM public.equivalency_request_details WHERE request_id IN (SELECT id FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{equivalency_request_details}', to_jsonb(v_n));

  DELETE FROM public.student_requests WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_requests}', to_jsonb(v_n));

  DELETE FROM public.payment_receipts WHERE student_payment_id IN (
    SELECT id FROM public.student_payments WHERE student_fee_id IN (
      SELECT id FROM public.student_fees WHERE student_profile_id = ANY(v_student_profile_ids)
    )
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{payment_receipts}', to_jsonb(v_n));

  DELETE FROM public.student_payments WHERE student_fee_id IN (
    SELECT id FROM public.student_fees WHERE student_profile_id = ANY(v_student_profile_ids)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_payments}', to_jsonb(v_n));

  DELETE FROM public.student_fee_adjustments WHERE student_fee_id IN (
    SELECT id FROM public.student_fees WHERE student_profile_id = ANY(v_student_profile_ids)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_fee_adjustments}', to_jsonb(v_n));

  DELETE FROM public.student_discounts WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_discounts}', to_jsonb(v_n));

  DELETE FROM public.student_fees WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_fees}', to_jsonb(v_n));

  DELETE FROM public.student_grades WHERE student_enrollment_id IN (
    SELECT id FROM public.student_enrollments WHERE student_profile_id = ANY(v_student_profile_ids)
  );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_grades}', to_jsonb(v_n));

  DELETE FROM public.student_enrollments WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_enrollments}', to_jsonb(v_n));

  DELETE FROM public.official_documents WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{official_documents}', to_jsonb(v_n));

  DELETE FROM public.student_academic_status WHERE student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_academic_status}', to_jsonb(v_n));

  DELETE FROM public.announcement_reads WHERE user_id = ANY(v_student_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{announcement_reads}', to_jsonb(v_n));

  DELETE FROM public.notifications WHERE user_id = ANY(v_student_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{notifications}', to_jsonb(v_n));

  DELETE FROM public.internal_messages
    WHERE sender_user_id = ANY(v_student_user_ids) OR recipient_user_id = ANY(v_student_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{internal_messages}', to_jsonb(v_n));

  DELETE FROM public.student_profiles WHERE id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{student_profiles}', to_jsonb(v_n));

  DELETE FROM public.user_role_assignments WHERE user_id = ANY(v_student_user_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{user_role_assignments}', to_jsonb(v_n));

  DELETE FROM public.user_roles WHERE user_id = ANY(v_student_user_ids) AND role = 'student'::app_role;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{user_roles_student}', to_jsonb(v_n));

  DELETE FROM auth.users u
   WHERE u.id = ANY(v_student_user_ids)
     AND NOT EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles sf WHERE sf.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := jsonb_set(v_counts, '{auth_users}', to_jsonb(v_n));

  PERFORM public.log_audit(
    'pilot', NULL, 'pilot_student_data_cleanup',
    NULL,
    v_counts,
    'PILOT-DATA-CLEANUP-01: removed all pilot/test student data prior to 2026-2027 import. CSV backups stored externally.'
  );

  RAISE NOTICE 'pilot_student_data_cleanup completed: %', v_counts;
END
$mig$;