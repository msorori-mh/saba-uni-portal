-- Execute the receipt policy as a real non-owner PostgreSQL role.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',false);
INSERT INTO payment_receipts(id,student_profile_id,student_fee_id,status) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f8','submitted');
DO $$ BEGIN
 BEGIN
  INSERT INTO payment_receipts(id,student_profile_id,student_fee_id,status) VALUES
   ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f9','submitted');
  RAISE EXCEPTION 'foreign student fee accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  INSERT INTO payment_receipts(id,student_profile_id,student_fee_id,status) VALUES
   ('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f8','approved');
  RAISE EXCEPTION 'pre-approved receipt accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  INSERT INTO payment_receipts(id,student_profile_id,student_fee_id,status,reviewed_by) VALUES
   ('00000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f8','submitted',auth.uid());
  RAISE EXCEPTION 'student reviewer accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
INSERT INTO payment_receipts(id,student_profile_id,student_fee_id,status) VALUES
 ('00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f8','approved');
RESET ROLE;
-- Authenticated RPC execution; fail-closed mutations must roll back all fields.
GRANT EXECUTE ON FUNCTION submit_student_request(uuid) TO authenticated;
DO $$ DECLARE v_result jsonb; BEGIN
 FOREACH v_result IN ARRAY ARRAY[
  NULL::jsonb,'{"initialized":false,"reason":"workflow_not_found"}'::jsonb,
  '{"initialized":false,"reason":"no_steps"}'::jsonb,
  '{"initialized":false,"reason":"already_initialized","existing_steps":0}'::jsonb
 ] LOOP
  UPDATE test_workflow_result SET result=v_result;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',false);
  BEGIN
   PERFORM submit_student_request('00000000-0000-0000-0000-0000000000a9');
   RAISE EXCEPTION 'uninitialized submission accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN
   IF SQLERRM NOT LIKE 'STUDENT_REQUEST_WORKFLOW_INITIALIZATION_FAILED:%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM student_requests WHERE id='00000000-0000-0000-0000-0000000000a9'
   AND (status<>'draft' OR submitted_at IS NOT NULL OR updated_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'submission did not roll back';
  END IF;
 END LOOP;
END $$;
UPDATE test_workflow_result SET result='{"initialized":true}';
SET ROLE authenticated;
SELECT submit_student_request('00000000-0000-0000-0000-0000000000a9');
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM student_requests WHERE id='00000000-0000-0000-0000-0000000000a9' AND status='submitted' AND submitted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'configured submission failed';
 END IF;
END $$;
UPDATE student_requests SET status='returned' WHERE id='00000000-0000-0000-0000-0000000000a9';
UPDATE test_workflow_result SET result='{"initialized":false,"reason":"already_initialized","existing_steps":2}';
SET ROLE authenticated;
SELECT submit_student_request('00000000-0000-0000-0000-0000000000a9');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',false);
DO $$ BEGIN
 BEGIN
  PERFORM submit_student_request('00000000-0000-0000-0000-0000000000a9');
  RAISE EXCEPTION 'other student request accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ DECLARE doc jsonb; BEGIN
 IF (verify_document('000001')->>'valid')::boolean THEN RAISE EXCEPTION 'sequential number accepted'; END IF;
 IF (verify_document('missing-code')->>'valid')::boolean THEN RAISE EXCEPTION 'unknown code accepted'; END IF;
 doc:=verify_document('opaque-verify-code');
 IF (doc->>'valid')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'valid opaque code failed'; END IF;
 IF doc ? 'student_profile_id' OR doc ? 'student_name_ar' OR doc ? 'academic_number' THEN RAISE EXCEPTION 'PII leaked'; END IF;
 IF (verify_document('OPAQUE-ARCHIVED')->>'valid')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'archived document failed'; END IF;
 IF (verify_document('OPAQUE-CANCELLED')->>'valid')::boolean THEN RAISE EXCEPTION 'cancelled document accepted'; END IF;
END $$;
RESET ROLE;
