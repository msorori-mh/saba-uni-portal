-- LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01
BEGIN;

DO $$
DECLARE
  v_six regprocedure;
  v_seven regprocedure;
  v_overloads integer;
  v_seven_defaults integer;
  v_seven_secdef boolean;
  v_seven_rettype regtype;
  v_six_defaults integer;
  v_six_secdef boolean;
  v_col_matches integer;
  v_notnull_matches integer;
BEGIN
  v_six   := to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)');
  v_seven := to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)');

  IF v_seven IS NULL THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SEVEN_ARG_MISSING';
  END IF;

  SELECT count(*) INTO v_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';

  IF v_six IS NOT NULL AND v_overloads <> 2 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_UNEXPECTED_OVERLOAD_COUNT_%', v_overloads;
  END IF;
  IF v_six IS NULL AND v_overloads <> 1 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_UNEXPECTED_OVERLOAD_COUNT_%', v_overloads;
  END IF;

  SELECT p.pronargdefaults, p.prosecdef, p.prorettype
    INTO v_seven_defaults, v_seven_secdef, v_seven_rettype
  FROM pg_proc p WHERE p.oid = v_seven::oid;
  IF v_seven_defaults <> 4 OR v_seven_rettype <> 'void'::regtype OR NOT v_seven_secdef THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SEVEN_ARG_SHAPE_UNEXPECTED defaults=% secdef=%', v_seven_defaults, v_seven_secdef;
  END IF;

  IF v_six IS NOT NULL THEN
    SELECT p.pronargdefaults, p.prosecdef INTO v_six_defaults, v_six_secdef
    FROM pg_proc p WHERE p.oid = v_six::oid;
    IF v_six_defaults <> 3 OR NOT v_six_secdef THEN
      RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SIX_ARG_SHAPE_UNEXPECTED defaults=% secdef=%', v_six_defaults, v_six_secdef;
    END IF;
  END IF;

  SELECT count(*) INTO v_col_matches
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'audit_logs'
    AND (c.column_name, c.data_type) IN (
      ('id','uuid'),('created_at','timestamp with time zone'),('actor_user_id','uuid'),
      ('actor_role','text'),('entity_type','text'),('entity_id','uuid'),
      ('action_type','text'),('old_values','jsonb'),('new_values','jsonb'),
      ('notes','text'),('ip_address','text'),('user_agent','text'));
  SELECT count(*) INTO v_notnull_matches
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='audit_logs' AND c.is_nullable='NO'
    AND c.column_name IN ('id','created_at','entity_type','action_type');
  IF v_col_matches <> 12 OR v_notnull_matches <> 4 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_AUDIT_LOGS_SHAPE_MISMATCH cols=% nn=%', v_col_matches, v_notnull_matches;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_ROLE_MISSING';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text);

REVOKE EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) TO service_role;

COMMENT ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) IS
  'LOGAUDIT_CLOSURE_01=1; canonical single overload; legacy 6-arg overload dropped; EXECUTE server-only (service_role + owner)';

DO $$
DECLARE
  v_overloads integer;
  v_acl aclitem[];
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='log_audit';
  IF v_overloads <> 1
     OR to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_OVERLOAD_STATE_%', v_overloads;
  END IF;

  SELECT p.proacl INTO v_acl FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')::oid;

  IF v_acl IS NULL OR EXISTS (
    SELECT 1 FROM aclexplode(v_acl) a
    WHERE a.privilege_type='EXECUTE'
      AND (a.grantee=0 OR a.grantee IN (SELECT r.oid FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')))
  ) THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_CLIENT_EXECUTE';
  END IF;

  IF NOT has_function_privilege('service_role','public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_SERVICE_ROLE_MISSING';
  END IF;

  IF has_function_privilege('anon','public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_CLIENT_PRIVILEGE';
  END IF;
END $$;

COMMIT;