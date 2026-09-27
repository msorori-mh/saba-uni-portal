\set ON_ERROR_STOP on
-- Executed after scripts/b1-safe-rpc-matrix-harness-01/01-runtime-matrix.sql.
-- The caller opened the transaction. This file always ends with ROLLBACK.

SET LOCAL ROLE authenticated;
SELECT set_config('b1.authorization_harness','local-only',true);
RESET ROLE;
CREATE TABLE IF NOT EXISTS public.notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF current_setting('b1.authorization_harness',true) IS DISTINCT FROM 'local-only'
     OR to_regprocedure('public.can_current_user_act_on_step(uuid,text)') IS NULL
     OR to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NULL
  THEN RAISE EXCEPTION 'B1_LOCAL_RPC_HARNESS_PREREQUISITE_MISSING'; END IF;
END
$guard$;

CREATE TEMP TABLE full_rpc_results(
  service text, step_key text, scenario text, expected text, actual text,
  zero_mutation boolean, detail text,
  PRIMARY KEY(service,step_key,scenario)
) ON COMMIT DROP;

-- SEQ23-aligned department_head path: position_assignment only (faculty path removed).
INSERT INTO public.position_assignments(id,user_id,is_active,assigned_from)
VALUES
  ('a1000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,true,current_date),
  ('a2000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-0000-0000-000000000002'::uuid,true,current_date)
ON CONFLICT (id) DO UPDATE
SET user_id=EXCLUDED.user_id, is_active=true, assigned_from=EXCLUDED.assigned_from;

DELETE FROM public.request_processing_assignments rpa
USING public.request_processing_units u, public.request_processing_roles r
WHERE rpa.unit_id=u.id AND rpa.role_id=r.id
  AND u.code='department' AND r.code='department_head'
  AND rpa.user_id='10000000-0000-0000-0000-000000000001';

INSERT INTO public.request_processing_assignments(
  unit_id, role_id, assignment_type, position_assignment_id, department_id, is_active
)
SELECT u.id, r.id, 'position_assignment',
       'a1000000-0000-4000-8000-000000000001'::uuid, d.dept_id, true
FROM public.request_processing_units u
JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code='department_head'
CROSS JOIN (VALUES
  ('60000000-0000-0000-0000-000000000006'::uuid),
  ('70000000-0000-0000-0000-000000000007'::uuid)
) AS d(dept_id)
WHERE u.code='department';

-- Normalize the reusable synthetic fixtures left by 01-runtime-matrix.sql.
UPDATE public.student_request_workflow_steps s
SET status='active', decision=NULL, completed_by=NULL, completed_at=NULL,
    assigned_user_id=CASE WHEN m.role_code='department_head' THEN NULL
      ELSE '10000000-0000-0000-0000-000000000001'::uuid END,
    assigned_faculty_profile_id=NULL,
    assigned_staff_profile_id=NULL,
    assigned_position_assignment_id=CASE WHEN m.role_code='department_head'
      THEN 'a1000000-0000-4000-8000-000000000001'::uuid ELSE NULL END,
    processing_unit_id=m.unit_id,processing_role_id=m.role_id
FROM matrix m WHERE s.id=m.runtime_id;
UPDATE public.student_request_workflow_steps s SET status='completed'
FROM matrix m WHERE s.id=m.predecessor_runtime_id;

CREATE TEMP TABLE payment_next_fixture(
  runtime_id uuid, config_id uuid, request_id uuid, workflow_id uuid
) ON COMMIT DROP;
INSERT INTO payment_next_fixture
SELECT gen_random_uuid(),gen_random_uuid(),m.request_id,m.workflow_id
FROM matrix m WHERE m.step_key='payment_confirmation';
INSERT INTO public.request_type_workflow_steps(
 id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,
 assignment_strategy,action_type,status_on_enter,status_on_complete,is_required,can_skip
)
SELECT p.config_id,p.workflow_id,'harness_next','harness next',3,u.id,r.id,
 'specific_user','apply_decision','in_progress','completed',true,false
FROM payment_next_fixture p
JOIN public.request_processing_units u ON u.code='registrar'
JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code='registrar_general';
INSERT INTO public.student_request_workflow_steps(
 id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,
 processing_unit_id,processing_role_id,status,assigned_user_id
)
SELECT p.runtime_id,p.request_id,p.workflow_id,p.config_id,'harness_next','harness next',3,
 u.id,r.id,'pending','10000000-0000-0000-0000-000000000001'
FROM payment_next_fixture p
JOIN public.request_processing_units u ON u.code='registrar'
JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code='registrar_general';
UPDATE public.request_type_workflow_transitions t SET to_step_id=p.config_id
FROM matrix m JOIN payment_next_fixture p ON p.request_id=m.request_id
WHERE m.step_key='payment_confirmation' AND t.workflow_id=m.workflow_id
 AND t.from_step_id=m.config_id AND t.action_result='payment_confirmed';
SELECT set_config('b1.atomic_init','0',true);

INSERT INTO auth.users(id) VALUES
 ('81000000-0000-4000-8000-000000000001'),
 ('82000000-0000-4000-8000-000000000002'),
 ('83000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;
INSERT INTO public.student_profiles(id,user_id,status)
VALUES
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','active'),
 ('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','active')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.b1_snapshot(p_request_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'request',(SELECT to_jsonb(x) FROM public.student_requests x WHERE x.id=p_request_id),
  'steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_steps x WHERE x.student_request_id=p_request_id),
  'details',jsonb_build_object(
    'suspension',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.request_id),'[]') FROM public.enrollment_suspension_details x WHERE x.request_id=p_request_id),
    'absence',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.request_id),'[]') FROM public.absence_excuse_details x WHERE x.request_id=p_request_id),
    'transfer',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.request_id),'[]') FROM public.transfer_request_details x WHERE x.request_id=p_request_id),
    'chance',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.request_id),'[]') FROM public.extra_chance_details x WHERE x.request_id=p_request_id),
    'withdrawal',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.request_id),'[]') FROM public.file_withdrawal_details x WHERE x.request_id=p_request_id)),
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_attachment_uploads x WHERE x.student_request_id=p_request_id),
  'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_events x WHERE x.student_request_id=p_request_id),
  'revenue',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_events x WHERE x.student_request_id=p_request_id AND x.event_type='payment_confirmed'),
  'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.audit_logs x WHERE x.entity_id=p_request_id),
  'notifications',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.notifications x WHERE x.data->>'student_request_id'=p_request_id::text))
$$;

CREATE OR REPLACE FUNCTION pg_temp.b1_call(p_step uuid,p_action text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE k text; BEGIN
 SELECT step_key INTO k FROM public.student_request_workflow_steps WHERE id=p_step;
 IF k='payment_confirmation' AND p_action='confirm_payment' THEN
   RETURN public.record_external_university_payment_confirmation(p_step,p_note);
 END IF;
 RETURN public.act_on_b1_student_request_step_atomic(p_step,p_action,p_note,'{}'::jsonb);
END $$;

-- 24 real-RPC positive cells. The intentional exception rolls back each
-- successful mutation while proving result, completion and transition.
DO $positive$
DECLARE m matrix%ROWTYPE; r jsonb; passed boolean;
BEGIN
 FOR m IN SELECT * FROM matrix LOOP
  -- SEQ23 scope: keep both source/target department position bindings active.
  UPDATE public.request_processing_assignments SET is_active=true, starts_at=NULL, ends_at=NULL
   WHERE position_assignment_id='a1000000-0000-4000-8000-000000000001'::uuid;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated')::text,true);
  PERFORM set_config('e_rpcmatrix.uid','10000000-0000-0000-0000-000000000001',true);
  passed:=false;
  BEGIN
   r:=pg_temp.b1_call(m.runtime_id,m.action_type,'local positive');
   IF r->>'success'='true' AND r->>'transition_applied'='true'
      AND (SELECT status='completed' FROM public.student_request_workflow_steps WHERE id=m.runtime_id)
   THEN RAISE EXCEPTION 'B1_TEST_ROLLBACK_PASS'; END IF;
   RAISE EXCEPTION 'B1_POSITIVE_RESULT_INVALID';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='B1_TEST_ROLLBACK_PASS' THEN passed:=true; ELSE RAISE; END IF;
  END;
  INSERT INTO full_rpc_results VALUES(m.service,m.step_key,'exact_active_direct_assignee',
   'ALLOW',CASE WHEN passed THEN 'ALLOW' ELSE 'DENY' END,true,'real RPC; mutation rolled back');
 END LOOP;
END
$positive$;

-- All 22 denial classes execute the real RPC. Setup occurs before the
-- before-snapshot; the rejected call is caught; then the complete snapshot is
-- compared. Fixture setup is restored after each cell.
DO $negative$
DECLARE m matrix%ROWTYPE; c text; uid text; act text; sid uuid; before_j jsonb; after_j jsonb;
 denied boolean; original_type text; original_profile uuid; position_id uuid;
 cases constant text[]:=ARRAY[
  'anon','request_owner_student','other_student','user_without_profile',
  'unassigned_employee','same_role_other_unit','other_department_head',
  'previous_step_actor','next_step_actor','unassigned_admin',
  'registrar_outside_step','dean_outside_step','inactive_assignment',
  'expired_assignment','duplicate_assignment','wrong_position_assignment',
  'forged_step_id','other_service_request','illegal_action',
  'incomplete_predecessor','completed_step_replay','direct_rpc_bypass'];
BEGIN
 FOR m IN SELECT * FROM matrix LOOP
  FOR c IN SELECT unnest(cases) LOOP
   PERFORM set_config('b1.atomic_init','1',true);
   UPDATE public.student_request_workflow_steps SET status='active',
    assigned_user_id=CASE WHEN m.role_code='department_head' THEN NULL ELSE '10000000-0000-0000-0000-000000000001'::uuid END,
    assigned_faculty_profile_id=NULL,
    assigned_position_assignment_id=CASE WHEN m.role_code='department_head'
      THEN 'a1000000-0000-4000-8000-000000000001'::uuid ELSE NULL END
    WHERE id=m.runtime_id;
   UPDATE public.student_request_workflow_steps SET status='completed' WHERE id=m.predecessor_runtime_id;
   UPDATE public.request_processing_assignments SET is_active=true,starts_at=NULL,ends_at=NULL
    WHERE (user_id='10000000-0000-0000-0000-000000000001' AND unit_id=m.unit_id AND role_id=m.role_id)
       OR position_assignment_id='a1000000-0000-4000-8000-000000000001'::uuid;
   SELECT request_type,student_profile_id INTO original_type,original_profile
   FROM public.student_requests WHERE id=m.request_id;
   uid:='20000000-0000-0000-0000-000000000002'; act:=m.action_type; sid:=m.runtime_id;

   CASE c
    WHEN 'anon' THEN uid:='';
    WHEN 'request_owner_student' THEN uid:='81000000-0000-4000-8000-000000000001';
      UPDATE public.student_requests SET student_profile_id='81000000-0000-4000-8000-000000000001' WHERE id=m.request_id;
    WHEN 'other_student' THEN uid:='82000000-0000-4000-8000-000000000002';
    WHEN 'user_without_profile' THEN uid:='83000000-0000-4000-8000-000000000003';
    WHEN 'unassigned_employee' THEN uid:='20000000-0000-0000-0000-000000000002';
    WHEN 'same_role_other_unit' THEN uid:='20000000-0000-0000-0000-000000000002';
    WHEN 'other_department_head' THEN uid:='20000000-0000-0000-0000-000000000002';
    WHEN 'previous_step_actor' THEN uid:='20000000-0000-0000-0000-000000000002';
    WHEN 'next_step_actor' THEN uid:='20000000-0000-0000-0000-000000000002';
    WHEN 'unassigned_admin' THEN uid:='30000000-0000-0000-0000-000000000003';
    WHEN 'registrar_outside_step' THEN uid:='40000000-0000-0000-0000-000000000004';
    WHEN 'dean_outside_step' THEN uid:='50000000-0000-0000-0000-000000000005';
    WHEN 'inactive_assignment' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.request_processing_assignments SET is_active=false
       WHERE (user_id=uid::uuid AND unit_id=m.unit_id AND role_id=m.role_id)
          OR (m.role_code='department_head'
              AND position_assignment_id='a1000000-0000-4000-8000-000000000001'::uuid);
    WHEN 'expired_assignment' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.request_processing_assignments SET ends_at=now()-interval '1 day'
       WHERE (user_id=uid::uuid AND unit_id=m.unit_id AND role_id=m.role_id)
          OR (m.role_code='department_head'
              AND position_assignment_id='a1000000-0000-4000-8000-000000000001'::uuid);
    WHEN 'duplicate_assignment' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.student_request_workflow_steps SET assigned_user_id=uid::uuid,
       assigned_faculty_profile_id='10000000-0000-0000-0000-000000000001',
       assigned_position_assignment_id=CASE WHEN m.role_code='department_head'
         THEN 'a1000000-0000-4000-8000-000000000001'::uuid ELSE NULL END
       WHERE id=m.runtime_id;
    WHEN 'wrong_position_assignment' THEN uid:='10000000-0000-0000-0000-000000000001';
      INSERT INTO public.position_assignments(user_id,is_active,assigned_to)
       VALUES('20000000-0000-0000-0000-000000000002',true,current_date+1) RETURNING id INTO position_id;
      UPDATE public.student_request_workflow_steps SET assigned_user_id=NULL,assigned_faculty_profile_id=NULL,
       assigned_position_assignment_id=position_id WHERE id=m.runtime_id;
    WHEN 'forged_step_id' THEN uid:='10000000-0000-0000-0000-000000000001'; sid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
    WHEN 'other_service_request' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.student_requests SET request_type='enrollment_certificate' WHERE id=m.request_id;
    WHEN 'illegal_action' THEN uid:='10000000-0000-0000-0000-000000000001'; act:='comment';
    WHEN 'incomplete_predecessor' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.student_request_workflow_steps SET status='pending' WHERE id=m.predecessor_runtime_id;
    WHEN 'completed_step_replay' THEN uid:='10000000-0000-0000-0000-000000000001';
      UPDATE public.student_request_workflow_steps SET status='completed' WHERE id=m.runtime_id;
   WHEN 'direct_rpc_bypass' THEN uid:='20000000-0000-0000-0000-000000000002';
   END CASE;

   PERFORM set_config('b1.atomic_init','0',true);
   PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role',
    CASE WHEN uid='' THEN 'anon' ELSE 'authenticated' END)::text,true);
   PERFORM set_config('e_rpcmatrix.uid',uid,true);
   before_j:=pg_temp.b1_snapshot(m.request_id); denied:=false;
   BEGIN PERFORM pg_temp.b1_call(sid,act,'local denial');
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
   after_j:=pg_temp.b1_snapshot(m.request_id);
   INSERT INTO full_rpc_results VALUES(m.service,m.step_key,c,'DENY',
    CASE WHEN denied THEN 'DENY' ELSE 'ALLOW' END,after_j IS NOT DISTINCT FROM before_j,NULL);
   IF NOT denied THEN RAISE EXCEPTION 'B1_NEGATIVE_ALLOWED:%:%:%',m.service,m.step_key,c; END IF;
   IF after_j IS DISTINCT FROM before_j THEN RAISE EXCEPTION 'B1_ZERO_MUTATION_FAILED:%:%:%',m.service,m.step_key,c; END IF;
   PERFORM set_config('b1.atomic_init','1',true);
   UPDATE public.student_requests SET request_type=original_type,student_profile_id=original_profile WHERE id=m.request_id;
   DELETE FROM public.position_assignments WHERE id=position_id; position_id:=NULL;
   PERFORM set_config('b1.atomic_init','0',true);
  END LOOP;
 END LOOP;
END
$negative$;

CREATE TEMP TABLE specialized_results(name text PRIMARY KEY,passed boolean,detail text)
ON COMMIT DROP;

-- Secure attachments: real owner upload intent, server path, MIME/size denial,
-- forged id denial, exact-assignee download, and non-assignee zero mutation.
DO $attachments$
DECLARE m matrix%ROWTYPE; intent jsonb; aid uuid; path text; snap_before jsonb;
 snap_after jsonb; denied boolean; download_result jsonb;
BEGIN
 SELECT * INTO m FROM matrix
 WHERE service='excused_absence' AND step_key='student_affairs_intake';
 PERFORM set_config('e_rpcmatrix.uid','89000000-0000-4000-8000-000000000009',true);
 UPDATE public.student_requests SET status='draft' WHERE id=m.request_id;
 intent:=public.create_student_request_attachment_upload_intent(
   m.request_id,'excuse_documents','safe.pdf','application/pdf',128,NULL);
 aid:=(intent->>'attachment_id')::uuid;
 SELECT storage_object_path INTO path
 FROM public.student_request_attachment_uploads WHERE id=aid;
 IF path IS NULL OR path LIKE '%..%' OR path NOT LIKE 'student-requests/%' THEN
   RAISE EXCEPTION 'ATTACHMENT_SERVER_PATH_INVALID:%',path;
 END IF;
 INSERT INTO storage.objects(bucket_id,name,owner,metadata)
 VALUES('student-request-secure-attachments',path,
  '89000000-0000-4000-8000-000000000009',
  jsonb_build_object('size',128,'mimetype','application/pdf'));
 PERFORM public.complete_student_request_attachment_upload(aid);
 INSERT INTO specialized_results VALUES('attachment_owner_upload_server_path',true,path);

 snap_before:=pg_temp.b1_snapshot(m.request_id); denied:=false;
 BEGIN
  PERFORM public.create_student_request_attachment_upload_intent(
    m.request_id,'excuse_documents','../traversal.pdf','application/pdf',128,NULL);
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 snap_after:=pg_temp.b1_snapshot(m.request_id);
 IF NOT denied OR snap_after IS DISTINCT FROM snap_before THEN
  RAISE EXCEPTION 'ATTACHMENT_TRAVERSAL_DENIAL_OR_ZERO_MUTATION_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_traversal_zero_mutation',true,NULL);

 denied:=false;
 BEGIN
  PERFORM public.create_student_request_attachment_upload_intent(
    m.request_id,'excuse_documents','bad.exe','application/octet-stream',128,NULL);
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 snap_after:=pg_temp.b1_snapshot(m.request_id);
 IF NOT denied OR snap_after IS DISTINCT FROM snap_before THEN
  RAISE EXCEPTION 'ATTACHMENT_MIME_DENIAL_OR_ZERO_MUTATION_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_mime_zero_mutation',true,NULL);

 denied:=false;
 BEGIN
  PERFORM public.create_student_request_attachment_upload_intent(
    m.request_id,'excuse_documents','large.pdf','application/pdf',5242881,NULL);
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied OR pg_temp.b1_snapshot(m.request_id) IS DISTINCT FROM snap_before THEN
  RAISE EXCEPTION 'ATTACHMENT_SIZE_DENIAL_OR_ZERO_MUTATION_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_size_zero_mutation',true,NULL);

 UPDATE public.student_requests SET status='under_review' WHERE id=m.request_id;
 PERFORM set_config('e_rpcmatrix.uid','10000000-0000-0000-0000-000000000001',true);
 download_result:=public.authorize_student_request_attachment_download(aid);
 IF download_result->>'storage_object_path' IS DISTINCT FROM path THEN
  RAISE EXCEPTION 'ATTACHMENT_ASSIGNEE_DOWNLOAD_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_exact_assignee_download',true,NULL);

 snap_before:=pg_temp.b1_snapshot(m.request_id);
 PERFORM set_config('e_rpcmatrix.uid','20000000-0000-0000-0000-000000000002',true);
 denied:=false;
 BEGIN PERFORM public.authorize_student_request_attachment_download(aid);
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 snap_after:=pg_temp.b1_snapshot(m.request_id);
 IF NOT denied OR snap_after IS DISTINCT FROM snap_before THEN
  RAISE EXCEPTION 'ATTACHMENT_NON_ASSIGNEE_ZERO_MUTATION_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_non_assignee_zero_mutation',true,NULL);

 denied:=false;
 BEGIN
  PERFORM public.authorize_student_request_attachment_download(
   'ffffffff-ffff-4fff-8fff-fffffffffff1');
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied OR pg_temp.b1_snapshot(m.request_id) IS DISTINCT FROM snap_before THEN
  RAISE EXCEPTION 'ATTACHMENT_FORGED_ID_ZERO_MUTATION_FAILED';
 END IF;
 INSERT INTO specialized_results VALUES('attachment_forged_id_zero_mutation',true,NULL);

 IF (SELECT public FROM storage.buckets WHERE id='student-request-secure-attachments')
    IS DISTINCT FROM false THEN RAISE EXCEPTION 'ATTACHMENT_BUCKET_NOT_PRIVATE'; END IF;
 INSERT INTO specialized_results VALUES('attachment_private_bucket_no_public_url',true,NULL);
END
$attachments$;

-- Enrollment certificate compatibility: invoke the real legacy submit RPC
-- under its owner identity and intentionally roll the success back.
DO $enrollment$
DECLARE rid uuid:=gen_random_uuid(); passed boolean:=false;
BEGIN
 INSERT INTO public.student_requests(
  id,request_number,student_profile_id,request_type,status,form_data
 ) VALUES(
  rid,'LOCAL-EC-REGRESSION',
  '89000000-0000-4000-8000-000000000009',
  'enrollment_certificate','draft','{}'::jsonb);
 PERFORM set_config('e_rpcmatrix.uid','89000000-0000-4000-8000-000000000009',true);
 BEGIN
  PERFORM public.submit_student_request(rid);
  IF (SELECT status FROM public.student_requests WHERE id=rid)='submitted'
  THEN RAISE EXCEPTION 'B1_TEST_ROLLBACK_PASS'; END IF;
  RAISE EXCEPTION 'ENROLLMENT_CERTIFICATE_SUBMIT_STATUS_INVALID';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='B1_TEST_ROLLBACK_PASS' THEN passed:=true; ELSE RAISE; END IF;
 END;
 IF NOT passed THEN RAISE EXCEPTION 'ENROLLMENT_CERTIFICATE_SUBMIT_REGRESSION'; END IF;
 INSERT INTO specialized_results VALUES(
  'enrollment_certificate_legacy_submit_rpc',true,
  'real submit succeeded; subtransaction intentionally rolled back');
END
$enrollment$;

-- Protected identities are absent from fixtures, and enrollment_certificate
-- remains outside the strict B1 branch.
DO $protected$
DECLARE src text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.student_requests WHERE request_number IN(
  'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8',
  'USR-2026-000001','USR-2026-000002')) THEN
  RAISE EXCEPTION 'B1_PROTECTED_ID_USED_AS_FIXTURE';
 END IF;
 SELECT pg_get_functiondef('public.can_current_user_act_on_step(uuid,text)'::regprocedure) INTO src;
 IF src NOT LIKE '%v_is_b1%' OR src NOT LIKE '%Non-B1%' THEN
  RAISE EXCEPTION 'ENROLLMENT_CERTIFICATE_COMPATIBILITY_BRANCH_MISSING';
 END IF;
 IF NOT has_function_privilege('authenticated','public.submit_student_request(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'ENROLLMENT_CERTIFICATE_SUBMIT_ACL_REGRESSION';
 END IF;
END
$protected$;

SELECT json_build_object(
 'postgres_version',current_setting('server_version'),
 'positive_cells',count(*) FILTER(WHERE scenario='exact_active_direct_assignee'),
 'negative_cells',count(*) FILTER(WHERE scenario<>'exact_active_direct_assignee'),
 'zero_mutation_assertions',count(*) FILTER(WHERE scenario<>'exact_active_direct_assignee' AND zero_mutation),
 'failures',count(*) FILTER(WHERE expected<>actual OR NOT zero_mutation),
 'specialized_passes',(SELECT count(*) FROM specialized_results WHERE passed),
 'specialized_failures',(SELECT count(*) FROM specialized_results WHERE NOT passed)
) AS full_matrix_summary FROM full_rpc_results;

ROLLBACK;
