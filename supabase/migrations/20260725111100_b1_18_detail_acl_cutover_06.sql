-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 / order 18
-- Source draft: docs/migration-drafts/REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- Atomic final cutover: only after 04, every 05A prerequisite, free/paid inactive
-- workflows, and trustworthy atomic-caller release evidence (order-1 stamp).
BEGIN;

DO $preflight$
DECLARE
  v_atomic text;
  v_dispatcher text;
  v_release text;
  v_table text;
  v_rel regclass;
BEGIN
  IF to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NULL
     OR to_regprocedure('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])') IS NULL
     OR to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NULL
  THEN
    RAISE EXCEPTION 'B1_ACL_CUTOVER_PREREQUISITE_MISSING';
  END IF;

  SELECT p.prosrc INTO v_atomic
  FROM pg_proc p
  WHERE p.oid = 'public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'::regprocedure;
  SELECT p.prosrc INTO v_dispatcher
  FROM pg_proc p
  WHERE p.oid = 'public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure;

  IF v_atomic NOT LIKE '%PERFORM public.persist_validated_b1_request_details(%'
     OR v_dispatcher LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%'
     OR v_dispatcher NOT LIKE '%enrollment_suspension%'
     OR v_dispatcher NOT LIKE '%excused_absence%'
     OR v_dispatcher NOT LIKE '%department_transfer%'
     OR v_dispatcher NOT LIKE '%final_chance%'
     OR v_dispatcher NOT LIKE '%file_withdrawal%'
  THEN
    RAISE EXCEPTION 'B1_ACL_CUTOVER_CALLER_DISPATCHER_MISMATCH';
  END IF;

  v_release := obj_description(
    'public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'::regprocedure,
    'pg_proc'
  );
  IF v_release IS NULL
     OR v_release !~ '^B1_ATOMIC_CALLER_RELEASE_EVIDENCE=[0-9a-f]{40}$'
  THEN
    RAISE EXCEPTION 'B1_ACL_CUTOVER_RELEASE_EVIDENCE_MISSING';
  END IF;

  IF has_function_privilege('anon','public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])','EXECUTE')
     OR has_function_privilege('authenticated','public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])','EXECUTE')
     OR has_function_privilege('service_role','public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])','EXECUTE')
     OR has_function_privilege('authenticated','public.apply_b1_detail_rpc_write_boundaries()','EXECUTE')
     OR has_function_privilege('service_role','public.apply_b1_detail_rpc_write_boundaries()','EXECUTE')
  THEN
    RAISE EXCEPTION 'B1_ACL_CUTOVER_FUNCTION_ACL_MISMATCH';
  END IF;

  -- Five detail-boundary prerequisites: absence and withdrawal must already be
  -- owner-read / RPC-write (05A). The three legacy tables are cut over below.
  FOREACH v_table IN ARRAY ARRAY[
    'absence_excuse_details',
    'file_withdrawal_details'
  ]
  LOOP
    v_rel := to_regclass('public.' || v_table);
    IF v_rel IS NULL
       OR has_table_privilege('anon', v_rel, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_rel, 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role', v_rel, 'INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('authenticated', v_rel, 'SELECT')
       OR NOT has_table_privilege('service_role', v_rel, 'SELECT')
    THEN
      RAISE EXCEPTION 'B1_ACL_CUTOVER_FIVE_BOUNDARY_PREREQUISITE_FAILED:%', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'enrollment_suspension_details',
    'transfer_request_details',
    'extra_chance_details'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'B1_ACL_CUTOVER_LEGACY_DETAIL_MISSING:%', v_table;
    END IF;
  END LOOP;
END
$preflight$;

SELECT public.apply_b1_detail_rpc_write_boundaries();

DO $verify$
DECLARE
  v_table text;
  v_rel regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'enrollment_suspension_details',
    'absence_excuse_details',
    'transfer_request_details',
    'extra_chance_details',
    'file_withdrawal_details'
  ]
  LOOP
    v_rel := to_regclass('public.' || v_table);
    IF v_rel IS NULL
       OR has_table_privilege('anon', v_rel, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_rel, 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role', v_rel, 'INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('authenticated', v_rel, 'SELECT')
       OR NOT has_table_privilege('service_role', v_rel, 'SELECT')
    THEN
      RAISE EXCEPTION 'B1_ACL_CUTOVER_POSTVERIFY_FAILED:%', v_table;
    END IF;
  END LOOP;
END
$verify$;

COMMIT;
