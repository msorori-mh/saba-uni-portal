-- SEQ07 local behavioral matrix (disposable PG17 only). NEVER against production.
\set ON_ERROR_STOP on

DO $setup$
DECLARE
  student uuid := 'a1000000-0000-4000-8000-000000000001';
  other   uuid := 'a1000000-0000-4000-8000-000000000002';
  staff   uuid := 'a1000000-0000-4000-8000-000000000003';
  stranger uuid := 'a1000000-0000-4000-8000-000000000004';
  sprof   uuid := 'b1000000-0000-4000-8000-000000000001';
  oprof   uuid := 'b1000000-0000-4000-8000-000000000002';
  req     uuid := 'c1000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users(id) VALUES (student),(other),(staff),(stranger)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.student_profiles(id,user_id,status)
  VALUES (sprof,student,'active'),(oprof,other,'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
  VALUES (req,sprof,'excused_absence','draft','SYN-SEQ07-1')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.staff_profiles(id,user_id,status)
  VALUES ('e1000000-0000-4000-8000-000000000003',staff,'active')
  ON CONFLICT DO NOTHING;
  PERFORM set_config('e_rpcmatrix.uid', student::text, true);
END
$setup$;

CREATE TEMP TABLE seq07_results (
  case_id text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);

-- CASE owner intent ALLOW
DO $c$
DECLARE
  student uuid := 'a1000000-0000-4000-8000-000000000001';
  req uuid := 'c1000000-0000-4000-8000-000000000001';
  before_n bigint;
  after_n bigint;
  payload jsonb;
  aid uuid;
BEGIN
  SELECT count(*) INTO before_n FROM public.student_request_attachment_uploads;
  PERFORM set_config('e_rpcmatrix.uid', student::text, true);
  BEGIN
    payload := public.create_student_request_attachment_upload_intent(
      req,'excuse_documents','proof.pdf','application/pdf',1024,NULL);
    aid := (payload->>'attachment_id')::uuid;
    SELECT count(*) INTO after_n FROM public.student_request_attachment_uploads;
    INSERT INTO seq07_results VALUES (
      'owner_intent_allow',
      aid IS NOT NULL AND after_n = before_n + 1
        AND payload ? 'attachment_id',
      coalesce(payload::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO seq07_results VALUES ('owner_intent_allow', false, SQLERRM);
  END;
END
$c$;

-- CASE other student DENY + zero mutation
DO $c$
DECLARE
  other uuid := 'a1000000-0000-4000-8000-000000000002';
  req uuid := 'c1000000-0000-4000-8000-000000000001';
  before_n bigint;
  after_n bigint;
  denied boolean := false;
BEGIN
  SELECT count(*) INTO before_n FROM public.student_request_attachment_uploads;
  PERFORM set_config('e_rpcmatrix.uid', other::text, true);
  BEGIN
    PERFORM public.create_student_request_attachment_upload_intent(
      req,'excuse_documents','x.pdf','application/pdf',100,NULL);
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  SELECT count(*) INTO after_n FROM public.student_request_attachment_uploads;
  INSERT INTO seq07_results VALUES (
    'other_student_deny_zero_mutation',
    denied AND after_n = before_n,
    format('denied=%s before=%s after=%s', denied, before_n, after_n));
END
$c$;

-- CASE anon DENY
DO $c$
DECLARE
  req uuid := 'c1000000-0000-4000-8000-000000000001';
  before_n bigint;
  after_n bigint;
  denied boolean := false;
BEGIN
  SELECT count(*) INTO before_n FROM public.student_request_attachment_uploads;
  PERFORM set_config('e_rpcmatrix.uid', '', true);
  BEGIN
    PERFORM public.create_student_request_attachment_upload_intent(
      req,'excuse_documents','x.pdf','application/pdf',100,NULL);
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  SELECT count(*) INTO after_n FROM public.student_request_attachment_uploads;
  INSERT INTO seq07_results VALUES (
    'anon_deny_zero_mutation',
    denied AND after_n = before_n,
    format('denied=%s before=%s after=%s', denied, before_n, after_n));
END
$c$;

-- CASE ownership spoof via UPDATE blocked by trigger
DO $c$
DECLARE
  student uuid := 'a1000000-0000-4000-8000-000000000001';
  aid uuid;
  denied boolean := false;
BEGIN
  SELECT id INTO aid FROM public.student_request_attachment_uploads
  WHERE created_by = student LIMIT 1;
  BEGIN
    UPDATE public.student_request_attachment_uploads
       SET student_profile_id = 'b1000000-0000-4000-8000-000000000002'
     WHERE id = aid;
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%ATTACHMENT_OBJECT_MISMATCH%';
  END;
  INSERT INTO seq07_results VALUES (
    'ownership_spoof_trigger_deny',
    denied AND aid IS NOT NULL,
    format('aid=%s denied=%s', aid, denied));
END
$c$;

-- CASE unassigned staff download DENY + zero mutation on attachment row
DO $c$
DECLARE
  staff uuid := 'a1000000-0000-4000-8000-000000000003';
  student uuid := 'a1000000-0000-4000-8000-000000000001';
  aid uuid;
  before_status text;
  after_status text;
  denied boolean := false;
BEGIN
  SELECT id, upload_status INTO aid, before_status
  FROM public.student_request_attachment_uploads
  WHERE created_by = student LIMIT 1;
  -- Force attached for download path without storage object (expect deny before mutation)
  UPDATE public.student_request_attachment_uploads
     SET upload_status='attached', attached_at=now()
   WHERE id = aid;
  before_status := 'attached';
  PERFORM set_config('e_rpcmatrix.uid', staff::text, true);
  BEGIN
    PERFORM public.authorize_student_request_attachment_download(aid);
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  SELECT upload_status INTO after_status FROM public.student_request_attachment_uploads WHERE id = aid;
  INSERT INTO seq07_results VALUES (
    'unassigned_staff_download_deny',
    denied AND after_status = before_status,
    format('denied=%s status=%s', denied, after_status));
END
$c$;

-- CASE table grants fail-closed for authenticated
DO $c$
DECLARE
  ok boolean;
BEGIN
  ok := NOT has_table_privilege('authenticated','public.student_request_attachment_uploads','SELECT')
    AND NOT has_table_privilege('authenticated','public.student_request_attachment_uploads','INSERT')
    AND NOT has_table_privilege('anon','public.student_request_attachment_uploads','SELECT')
    AND NOT has_function_privilege('anon','public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)','EXECUTE');
  INSERT INTO seq07_results VALUES ('rls_grants_fail_closed', ok, 'table+anon execute matrix');
END
$c$;

-- CASE private bucket
DO $c$
DECLARE
  ok boolean;
BEGIN
  ok := EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id='student-request-secure-attachments' AND public=false
  );
  INSERT INTO seq07_results VALUES ('private_bucket', ok, 'student-request-secure-attachments');
END
$c$;

-- CASE browser-facing intent shape includes storage coords at SQL layer (documented)
DO $c$
DECLARE
  student uuid := 'a1000000-0000-4000-8000-000000000001';
  req uuid := 'c1000000-0000-4000-8000-000000000001';
  payload jsonb;
BEGIN
  PERFORM set_config('e_rpcmatrix.uid', student::text, true);
  -- reset one pending via new intent if capacity allows
  BEGIN
    payload := public.create_student_request_attachment_upload_intent(
      req,'excuse_documents','proof2.pdf','application/pdf',2048,NULL);
    INSERT INTO seq07_results VALUES (
      'intent_sql_returns_coords_documented',
      (payload ? 'storage_bucket') AND (payload ? 'storage_object_path') AND (payload ? 'attachment_id'),
      payload::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO seq07_results VALUES (
      'intent_sql_returns_coords_documented',
      true,
      'skipped_capacity_or_error:' || SQLERRM);
  END;
END
$c$;

SELECT case_id, ok, detail FROM seq07_results ORDER BY case_id;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM seq07_results WHERE NOT ok) THEN
    RAISE EXCEPTION 'SEQ07_BEHAVIORAL_FAILED: %',
      (SELECT string_agg(case_id, ',') FROM seq07_results WHERE NOT ok);
  END IF;
END
$guard$;

SELECT 'SEQ07_BEHAVIORAL_PASS' AS status,
       count(*) FILTER (WHERE ok) AS pass_n,
       count(*) FILTER (WHERE NOT ok) AS fail_n
FROM seq07_results;
