-- =====================================================================
-- 45-acl-cases.sql - role-level (ACL/RLS) cases, executed as `authenticated`
-- via SET ROLE. Each DO block catches the denial and records it through the
-- SECURITY DEFINER e_rpcmatrix.log_result helper.
-- =====================================================================

SET ROLE authenticated;

-- M36 / X-12a: authenticated direct call of the legacy submit RPC.
-- seq8 revoked EXECUTE from authenticated at the attachment cutover.
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_student_request('ce000000-0000-4000-8000-00000000000a'::uuid);
    PERFORM e_rpcmatrix.log_result('M36','legacy-submit-authenticated-acl','FAIL',
      '42501/permission denied','OK','unexpected: legacy submit executed as authenticated');
  EXCEPTION WHEN OTHERS THEN
    PERFORM e_rpcmatrix.log_result('M36','legacy-submit-authenticated-acl',
      CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END,
      '42501', SQLSTATE || '/' || SQLERRM, 'authenticated EXECUTE revoked by seq8 cutover');
  END;
END $$;

-- X-11a: direct INSERT on absence_excuse_details as authenticated -> ACL deny
DO $$
BEGIN
  BEGIN
    INSERT INTO public.absence_excuse_details(request_id,reason_type)
    VALUES ('ce000000-0000-4000-8000-000000000002','medical');
    PERFORM e_rpcmatrix.log_result('X-11','direct-insert-absence-details','FAIL',
      '42501','OK','unexpected: direct INSERT succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM e_rpcmatrix.log_result('X-11','direct-insert-absence-details',
      CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END,
      '42501', SQLSTATE || '/' || SQLERRM, 'post-cutover detail tables are RPC-write only');
  END;
END $$;

-- X-11c: direct UPDATE on extra_chance_details as authenticated -> ACL deny
DO $$
BEGIN
  BEGIN
    UPDATE public.extra_chance_details SET reason='direct' WHERE true;
    PERFORM e_rpcmatrix.log_result('X-11','direct-update-extra-chance-details','FAIL',
      '42501','OK','unexpected: direct UPDATE succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM e_rpcmatrix.log_result('X-11','direct-update-extra-chance-details',
      CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END,
      '42501', SQLSTATE || '/' || SQLERRM, 'post-cutover detail tables are RPC-write only');
  END;
END $$;

-- X-11d: direct DELETE on file_withdrawal_details as authenticated -> ACL deny
DO $$
BEGIN
  BEGIN
    DELETE FROM public.file_withdrawal_details WHERE true;
    PERFORM e_rpcmatrix.log_result('X-11','direct-delete-withdrawal-details','FAIL',
      '42501','OK','unexpected: direct DELETE succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM e_rpcmatrix.log_result('X-11','direct-delete-withdrawal-details',
      CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END,
      '42501', SQLSTATE || '/' || SQLERRM, 'post-cutover detail tables are RPC-write only');
  END;
END $$;

-- X-15: storage.objects guess-read as authenticated. No SELECT privilege and
-- no SELECT policy exist for the secure bucket (RLS default-deny), so the read
-- either fails with 42501 or returns zero rows. Both are a deny.
DO $$
DECLARE
  v_count integer;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM storage.objects
    WHERE bucket_id='student-request-secure-attachments';
    PERFORM e_rpcmatrix.log_result('X-15','storage-guess-read',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      'deny (42501 or zero visible rows)', v_count || ' rows visible',
      'no SELECT policy/privilege on secure attachment objects; only the audited signed-download RPC can read');
  EXCEPTION WHEN OTHERS THEN
    PERFORM e_rpcmatrix.log_result('X-15','storage-guess-read',
      CASE WHEN SQLSTATE='42501' THEN 'PASS' ELSE 'FAIL' END,
      'deny (42501 or zero visible rows)', SQLSTATE || '/' || SQLERRM,
      'no SELECT policy/privilege on secure attachment objects; only the audited signed-download RPC can read');
  END;
END $$;

RESET ROLE;
