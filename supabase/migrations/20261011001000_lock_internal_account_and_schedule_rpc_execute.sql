-- Forward-only ACL repair. Supabase projects may grant EXECUTE to anon and
-- authenticated directly through default privileges. Revoking PUBLIC alone
-- does not remove those direct grants from SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.link_faculty_profile_account(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_class_schedule_for_context(uuid[], jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.link_faculty_profile_account(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_class_schedule_for_context(uuid[], jsonb) TO service_role;

DO $$
DECLARE
  v_function regprocedure;
  v_role text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.link_faculty_profile_account(uuid,uuid)'::regprocedure,
    'public.replace_class_schedule_for_context(uuid[],jsonb)'::regprocedure
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'INTERNAL_RPC_EXECUTE_STILL_GRANTED: % / %', v_function, v_role;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'INTERNAL_RPC_SERVICE_ROLE_MISSING: %', v_function;
    END IF;
  END LOOP;
END;
$$;
