\set ON_ERROR_STOP on

DO $$
DECLARE m matrix%ROWTYPE; denied boolean; before_row jsonb; after_row jsonb;
  before_events bigint; after_events bigint; result jsonb;
BEGIN
 FOR m IN SELECT * FROM matrix WHERE step_key='payment_confirmation' LOOP
  SELECT to_jsonb(s) INTO before_row FROM public.student_request_workflow_steps s WHERE id=m.runtime_id;
  SELECT count(*) INTO before_events FROM public.student_request_workflow_events WHERE student_request_id=m.request_id;
  denied:=false;
  PERFORM set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
  BEGIN
    PERFORM public.record_external_university_payment_confirmation(m.runtime_id,'synthetic denial');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  SELECT to_jsonb(s) INTO after_row FROM public.student_request_workflow_steps s WHERE id=m.runtime_id;
  SELECT count(*) INTO after_events FROM public.student_request_workflow_events WHERE student_request_id=m.request_id;
  PERFORM pg_temp.record_result(m.service,m.step_key,'finance_rpc_unassigned_zero_mutation','DENY',
    CASE WHEN denied AND before_row=after_row AND before_events=after_events THEN 'DENY' ELSE 'ALLOW' END,
    format('row_unchanged=%s events_unchanged=%s',before_row=after_row,before_events=after_events));

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  result:=public.record_external_university_payment_confirmation(m.runtime_id,'synthetic local note');
  PERFORM pg_temp.record_result(m.service,m.step_key,'finance_rpc_exact_assignee','ALLOW',
    CASE WHEN result->>'status'='payment_confirmed' THEN 'ALLOW' ELSE 'DENY' END);
 END LOOP;
END $$;

DO $$
DECLARE m matrix%ROWTYPE; attachment_id uuid:=gen_random_uuid(); result jsonb;
  denied boolean; before_row jsonb; after_row jsonb;
BEGIN
 SELECT * INTO m FROM matrix WHERE service='excused_absence' AND step_key='student_affairs_intake';
 INSERT INTO public.student_profiles(id,user_id,status)
 VALUES('80000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','active');
 UPDATE public.student_requests SET student_profile_id='80000000-0000-0000-0000-000000000008' WHERE id=m.request_id;
 INSERT INTO public.student_request_attachment_uploads(
   id,student_request_id,student_profile_id,field_key,original_file_name,mime_type,
   size_bytes,storage_bucket,storage_object_path,upload_status,created_by
 ) VALUES (
   attachment_id,m.request_id,'80000000-0000-0000-0000-000000000008','excuse_documents','synthetic.pdf','application/pdf',
   128,'student-request-secure-attachments','synthetic/object','attached','10000000-0000-0000-0000-000000000001'
 );
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 result:=public.authorize_student_request_attachment_download(attachment_id);
 PERFORM pg_temp.record_result(m.service,m.step_key,'attachment_exact_assignee','ALLOW',
   CASE WHEN result->>'storage_object_path'='synthetic/object' THEN 'ALLOW' ELSE 'DENY' END);

 SELECT to_jsonb(a) INTO before_row FROM public.student_request_attachment_uploads a WHERE id=attachment_id;
 denied:=false;
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
 BEGIN
   PERFORM public.authorize_student_request_attachment_download(attachment_id);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED%' THEN denied:=true; ELSE RAISE; END IF;
 END;
 SELECT to_jsonb(a) INTO after_row FROM public.student_request_attachment_uploads a WHERE id=attachment_id;
 PERFORM pg_temp.record_result(m.service,m.step_key,'attachment_unassigned_zero_mutation','DENY',
   CASE WHEN denied AND before_row=after_row THEN 'DENY' ELSE 'ALLOW' END,
   format('row_unchanged=%s',before_row=after_row));
END $$;

DO $$ DECLARE payment_source text; final_source text; BEGIN
 payment_source:=pg_read_file('/tmp/payment.sql');
 final_source:=pg_read_file('/tmp/final-chance.sql');
 PERFORM pg_temp.record_result('department_transfer','payment_confirmation','external_payment_no_financial_fields','DENY',
   CASE WHEN payment_source !~* 'fee_type\.code|\mamount\M|\mcurrency\M|invoice|gateway_transaction|internal_balance' THEN 'DENY' ELSE 'ALLOW' END);
 PERFORM pg_temp.record_result('final_chance','payment_confirmation','external_payment_no_financial_fields','DENY',
   CASE WHEN payment_source !~* 'fee_type\.code|\mamount\M|\mcurrency\M|invoice|gateway_transaction|internal_balance' THEN 'DENY' ELSE 'ALLOW' END);
 PERFORM pg_temp.record_result('final_chance','canonical_write','final_exam_chance_only','ALLOW',
   CASE WHEN final_source LIKE '%p_chance_type IS DISTINCT FROM ''final_chance''%'
     AND final_source LIKE '%FINAL_CHANCE_TYPE_REQUIRED_FOR_NEW_WRITE%' THEN 'ALLOW' ELSE 'DENY' END);
END $$;

SELECT json_build_object(
 'total',count(*),'passed',count(*) FILTER (WHERE passed),
 'failed',count(*) FILTER (WHERE NOT passed),
 'failures',coalesce(json_agg(json_build_object('service',service,'step',step_key,'scenario',scenario,'expected',expected,'actual',actual,'detail',detail)) FILTER (WHERE NOT passed),'[]'::json)
) AS harness_summary FROM harness_results;
SELECT service,scenario,count(*) AS cases,count(*) FILTER (WHERE passed) AS passed
FROM harness_results GROUP BY service,scenario ORDER BY service,scenario;
