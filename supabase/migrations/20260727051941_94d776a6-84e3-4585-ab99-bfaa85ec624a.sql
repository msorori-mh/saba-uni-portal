-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 / order 10
-- Source draft: docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- Adds the canonical reason detail without rewriting historical rows.

BEGIN;

ALTER TABLE public.absence_excuse_details
  ADD COLUMN IF NOT EXISTS absence_reason_detail text;

DO $column$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid='public.absence_excuse_details'::regclass
      AND a.attname='absence_reason_detail' AND NOT a.attisdropped
      AND a.atttypid='text'::regtype AND a.atttypmod=-1 AND NOT a.attnotnull
      AND NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum)
  ) THEN RAISE EXCEPTION 'ABSENCE_REASON_DETAIL_COLUMN_MISMATCH'; END IF;
END
$column$;

CREATE OR REPLACE FUNCTION public.enforce_new_absence_reason_detail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (TG_OP='INSERT'
      OR NEW.absence_reason_detail IS DISTINCT FROM OLD.absence_reason_detail
      OR NEW.reason_type IS DISTINCT FROM OLD.reason_type
      OR NEW.course_section_id IS DISTINCT FROM OLD.course_section_id
      OR NEW.absence_date IS DISTINCT FROM OLD.absence_date)
     AND (NEW.absence_reason_detail IS NULL OR length(btrim(NEW.absence_reason_detail)) < 3) THEN
    RAISE EXCEPTION 'ABSENCE_REASON_DETAIL_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enforce_new_absence_reason_detail() FROM PUBLIC,anon,authenticated;

DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.absence_excuse_details'::regclass
      AND tgname='trg_enforce_new_absence_reason_detail' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_enforce_new_absence_reason_detail
      BEFORE INSERT OR UPDATE OF absence_reason_detail,reason_type,course_section_id,absence_date
      ON public.absence_excuse_details
      FOR EACH ROW EXECUTE FUNCTION public.enforce_new_absence_reason_detail();
  ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.absence_excuse_details'::regclass
      AND tgname='trg_enforce_new_absence_reason_detail'
      AND tgfoid='public.enforce_new_absence_reason_detail()'::regprocedure
      AND tgtype=23 AND tgenabled='O' AND tgconstraint=0 AND tgnargs=0 AND tgqual IS NULL
      AND cardinality(tgattr::smallint[])=4
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['absence_reason_detail','reason_type','course_section_id','absence_date']) n
        WHERE (SELECT attnum::smallint FROM pg_attribute WHERE attrelid='public.absence_excuse_details'::regclass
          AND attname=n AND NOT attisdropped)<>ALL(tgattr::smallint[]))
  ) THEN RAISE EXCEPTION 'ABSENCE_REASON_DETAIL_TRIGGER_MISMATCH'; END IF;
END
$trigger$;

ALTER TABLE public.absence_excuse_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_excuse_details NO FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.absence_excuse_details FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.absence_excuse_details TO authenticated,service_role;

-- Fail-safe for Lovable/Supabase platform role. Never allowlisted in final ACL.
-- Role may be absent on local PG; migration must not fail in that case.
DO $revoke_sandbox_exec$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    REVOKE ALL ON TABLE public.absence_excuse_details FROM sandbox_exec;
  END IF;
END
$revoke_sandbox_exec$;

DO $drop_legacy_policies$
DECLARE
  v_table constant text := 'absence_excuse_details';
  v_policy text;
BEGIN
  -- Allowlisted table + policy names only. No client-supplied identifiers.
  IF to_regclass('public.' || v_table) IS NULL THEN
    RAISE EXCEPTION 'ABSENCE_EXCUSE_DETAIL_MISSING';
  END IF;
  FOREACH v_policy IN ARRAY ARRAY[
    'aed_select',
    'aed_insert',
    'aed_update',
    'aed_delete',
    'absence_excuse_details_owner_select'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND policyname = v_policy
    ) THEN
      EXECUTE format('%s POLICY IF EXISTS %I ON public.%I', 'DROP', v_policy, v_table);
    END IF;
  END LOOP;
END
$drop_legacy_policies$;

CREATE POLICY absence_excuse_details_owner_select ON public.absence_excuse_details
  FOR SELECT TO authenticated USING (public.is_owner_of_request(auth.uid(),request_id));

DO $security$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='absence_excuse_details')<>1
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='absence_excuse_details'
      AND policyname='absence_excuse_details_owner_select' AND cmd='SELECT' AND permissive='PERMISSIVE'
      AND roles=ARRAY['authenticated'::name] AND qual='is_owner_of_request(auth.uid(), request_id)' AND with_check IS NULL)
  THEN RAISE EXCEPTION 'ABSENCE_EXCUSE_POLICY_INVENTORY_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
    LEFT JOIN pg_roles r ON r.oid=x.grantee WHERE c.oid='public.absence_excuse_details'::regclass
      AND NOT (x.grantee=c.relowner OR (r.rolname IN ('authenticated','service_role') AND x.privilege_type='SELECT' AND NOT x.is_grantable)))
  THEN RAISE EXCEPTION 'ABSENCE_EXCUSE_ACL_INVENTORY_MISMATCH'; END IF;
END
$security$;

COMMENT ON COLUMN public.absence_excuse_details.absence_reason_detail IS
  'Required for new/changed excused-absence writes; historical null rows are preserved without backfill.';

COMMIT;