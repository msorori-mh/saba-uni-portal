RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
INSERT INTO student_profiles VALUES ('00000000-0000-0000-0000-0000000000a8','00000000-0000-0000-0000-000000000022');
CREATE TABLE student_fees(id uuid PRIMARY KEY,student_profile_id uuid);
INSERT INTO student_fees VALUES
 ('00000000-0000-0000-0000-0000000000f8','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000f9','00000000-0000-0000-0000-0000000000a8');
CREATE TABLE payment_receipts(id uuid PRIMARY KEY,student_profile_id uuid,student_fee_id uuid,
 status text,reviewed_by uuid,reviewed_at timestamptz,student_payment_id uuid,rejection_reason text);
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_insert_student ON payment_receipts FOR INSERT TO authenticated WITH CHECK(true);
GRANT SELECT ON student_fees TO authenticated;
GRANT INSERT ON payment_receipts TO authenticated;
ALTER TABLE student_requests ADD submitted_at timestamptz, ADD updated_at timestamptz, ADD rejection_reason text;
CREATE TABLE request_types(code text PRIMARY KEY,is_active boolean,request_audience text);
INSERT INTO request_types VALUES ('fixture_service',true,'active');
CREATE FUNCTION current_student_profile_for_auth() RETURNS TABLE(profile_id uuid,profile_status text)
 LANGUAGE sql AS $$ SELECT id,'active'::text FROM student_profiles WHERE user_id=auth.uid() $$;
CREATE FUNCTION p1_is_atomic_submit_service(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION p1_request_has_canonical_detail(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION assert_student_can_use_request_type(text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE TABLE test_workflow_result(result jsonb);
INSERT INTO test_workflow_result VALUES ('{"initialized":true}');
-- Isolate the submit transaction from workflow-template provisioning.
CREATE FUNCTION initialize_student_request_workflow(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT result FROM test_workflow_result LIMIT 1 $$;
INSERT INTO student_requests(id,student_profile_id,request_type,status) VALUES
 ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000a1','fixture_service','draft');
ALTER TABLE official_documents ADD verification_code text, ADD document_number text, ADD document_type text, ADD issued_at timestamptz;
INSERT INTO official_documents VALUES
 ('00000000-0000-0000-0000-0000000000d9','issued','OPAQUE-VERIFY-CODE','000001','enrollment',now()),
 ('00000000-0000-0000-0000-0000000000d8','archived','OPAQUE-ARCHIVED','000002','enrollment',now()),
 ('00000000-0000-0000-0000-0000000000d7','cancelled','OPAQUE-CANCELLED','000003','enrollment',now());
