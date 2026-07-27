-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Installs a locked cutover primitive only; it does not change table access by itself.
-- The future reviewed dispatcher/caller migration must invoke it inside its own transaction.
CREATE OR REPLACE FUNCTION public.apply_b1_detail_rpc_write_boundaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $boundaries$
DECLARE
  v_table text; v_prefix text; v_policy text; v_rel regclass; v_count integer;
BEGIN
  IF to_regprocedure('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_proc
       WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure
         AND prosrc LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%'
     )
  THEN RAISE EXCEPTION 'B1_DETAIL_DISPATCHER_NOT_INSTALLED'; END IF;

  FOR v_table,v_prefix IN VALUES
    ('enrollment_suspension_details','esd'),
    ('transfer_request_details','trd'),
    ('extra_chance_details','ecd')
  LOOP
    v_rel:=to_regclass('public.'||v_table);
    IF v_rel IS NULL THEN RAISE EXCEPTION 'B1_DETAIL_RELATION_MISSING:%',v_table; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',v_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated,service_role',v_table);
    -- Fail-safe for platform default ACL. Fixed role name only; never allowlisted.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM sandbox_exec', v_table);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table
        AND policyname<>ALL(ARRAY[v_prefix||'_select',v_prefix||'_insert',v_prefix||'_update',v_prefix||'_delete',v_table||'_owner_select']))
      THEN RAISE EXCEPTION 'B1_DETAIL_UNEXPECTED_POLICY:%',v_table; END IF;

    FOR v_policy IN SELECT unnest(ARRAY[v_prefix||'_select',v_prefix||'_insert',v_prefix||'_update',v_prefix||'_delete',v_table||'_owner_select'])
    LOOP
      EXECUTE format('%s POLICY IF EXISTS %I ON public.%I','DROP',v_policy,v_table);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_owner_of_request(auth.uid(),request_id))',
      v_table||'_owner_select',v_table);

    SELECT count(*) INTO v_count FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table
        AND policyname=v_table||'_owner_select' AND cmd='SELECT' AND permissive='PERMISSIVE'
        AND roles=ARRAY['authenticated'::name]
        AND qual='is_owner_of_request(auth.uid(), request_id)' AND with_check IS NULL;
    IF v_count<>1 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=v_table)<>1
      THEN RAISE EXCEPTION 'B1_DETAIL_POLICY_INVENTORY_MISMATCH:%',v_table; END IF;

    IF EXISTS (SELECT 1 FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
      LEFT JOIN pg_roles r ON r.oid=x.grantee WHERE c.oid=v_rel
        AND NOT (x.grantee=c.relowner OR
          (r.rolname IN ('authenticated','service_role') AND x.privilege_type='SELECT' AND NOT x.is_grantable)))
      THEN RAISE EXCEPTION 'B1_DETAIL_ACL_INVENTORY_MISMATCH:%',v_table; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=v_rel AND c.relrowsecurity AND NOT c.relforcerowsecurity)
      THEN RAISE EXCEPTION 'B1_DETAIL_RLS_MODE_MISMATCH:%',v_table; END IF;
  END LOOP;
END;
$boundaries$;

REVOKE ALL ON FUNCTION public.apply_b1_detail_rpc_write_boundaries() FROM PUBLIC, anon, authenticated, service_role;
