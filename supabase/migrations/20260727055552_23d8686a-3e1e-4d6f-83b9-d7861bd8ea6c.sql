-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 / order 11
-- Source draft: docs/migration-drafts/REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- RPC-only detail persistence foundation for file_withdrawal. No activation.

CREATE TABLE IF NOT EXISTS public.file_withdrawal_details (
  request_id uuid CONSTRAINT file_withdrawal_details_pkey PRIMARY KEY,
  withdrawal_reason text NOT NULL,
  impact_ack boolean NOT NULL,
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_withdrawal_details_request_fkey FOREIGN KEY (request_id)
    REFERENCES public.student_requests(id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT file_withdrawal_details_reason_check CHECK (length(btrim(withdrawal_reason)) >= 10),
  CONSTRAINT file_withdrawal_details_impact_check CHECK (impact_ack)
);

DO $catalog$
DECLARE
  v_signature text[];
BEGIN
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   || ':' || a.attnotnull::text ORDER BY a.attnum)
  INTO v_signature
  FROM pg_attribute a
  WHERE a.attrelid='public.file_withdrawal_details'::regclass
    AND a.attnum>0 AND NOT a.attisdropped;

  IF v_signature IS DISTINCT FROM ARRAY[
    'request_id:uuid:true','withdrawal_reason:text:true','impact_ack:boolean:true',
    'library_cleared_at:timestamp with time zone:false','labs_cleared_at:timestamp with time zone:false',
    'activities_cleared_at:timestamp with time zone:false','finance_cleared_at:timestamp with time zone:false',
    'records_transferred_at:timestamp with time zone:false','notes:text:false',
    'created_at:timestamp with time zone:true','updated_at:timestamp with time zone:true'
  ]::text[] THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_DETAILS_SCHEMA_MISMATCH:%', v_signature;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.file_withdrawal_details'::regclass
      AND c.conname='file_withdrawal_details_pkey' AND c.contype='p'
      AND c.conkey=ARRAY[(SELECT attnum::smallint FROM pg_attribute WHERE attrelid=c.conrelid AND attname='request_id')]
      AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated) THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_PRIMARY_KEY_MISMATCH';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.file_withdrawal_details'::regclass
      AND c.conname='file_withdrawal_details_request_fkey' AND c.contype='f'
      AND c.confrelid='public.student_requests'::regclass
      AND c.conkey=ARRAY[(SELECT attnum::smallint FROM pg_attribute WHERE attrelid=c.conrelid AND attname='request_id')]
      AND c.confkey=ARRAY[(SELECT attnum::smallint FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]
      AND c.confmatchtype='s' AND c.confupdtype='a' AND c.confdeltype='r'
      AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated) THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_REQUEST_FK_MISMATCH';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.file_withdrawal_details'::regclass
      AND c.conname='file_withdrawal_details_reason_check' AND c.contype='c' AND c.convalidated
      AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+','','g')='CHECK((length(btrim(withdrawal_reason))>=10))')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.file_withdrawal_details'::regclass
      AND c.conname='file_withdrawal_details_impact_check' AND c.contype='c' AND c.convalidated
      AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+','','g') IN ('CHECK(impact_ack)','CHECK((impact_ack))')) THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_CHECK_CONSTRAINT_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.file_withdrawal_details'::regclass) <> 4 THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_CONSTRAINT_INVENTORY_MISMATCH';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE d.adrelid='public.file_withdrawal_details'::regclass AND a.attname='created_at'
        AND pg_get_expr(d.adbin,d.adrelid)='now()')
    OR NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE d.adrelid='public.file_withdrawal_details'::regclass AND a.attname='updated_at'
        AND pg_get_expr(d.adbin,d.adrelid)='now()') THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_DEFAULT_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM pg_attrdef d WHERE d.adrelid='public.file_withdrawal_details'::regclass) <> 2 THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_DEFAULT_INVENTORY_MISMATCH';
  END IF;
END
$catalog$;

ALTER TABLE public.file_withdrawal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_withdrawal_details NO FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.file_withdrawal_details FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.file_withdrawal_details FROM service_role;
GRANT SELECT ON TABLE public.file_withdrawal_details TO authenticated;
GRANT SELECT ON TABLE public.file_withdrawal_details TO service_role;

-- Fail-safe for Lovable/Supabase platform default ACL (sandbox_exec=ar).
-- Role may be absent on local PG; migration must not fail in that case.
-- Never allowlisted in final ACL inventory.
DO $revoke_sandbox_exec$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    REVOKE ALL ON TABLE public.file_withdrawal_details FROM sandbox_exec;
  END IF;
END
$revoke_sandbox_exec$;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
    LEFT JOIN pg_roles r ON r.oid=x.grantee
    WHERE c.oid='public.file_withdrawal_details'::regclass
      AND NOT (
        x.grantee=c.relowner
        OR (r.rolname IN ('authenticated','service_role') AND x.privilege_type='SELECT' AND NOT x.is_grantable)
      )
  ) THEN RAISE EXCEPTION 'FILE_WITHDRAWAL_ACL_INVENTORY_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.file_withdrawal_details'::regclass
      AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_RLS_MODE_MISMATCH';
  END IF;
END
$acl$;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='file_withdrawal_details'
      AND policyname='file_withdrawal_details_owner_select'
  ) THEN
    CREATE POLICY file_withdrawal_details_owner_select
      ON public.file_withdrawal_details FOR SELECT TO authenticated
      USING (public.is_owner_of_request(auth.uid(), request_id));
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='file_withdrawal_details'
      AND policyname='file_withdrawal_details_owner_select'
      AND cmd='SELECT' AND permissive='PERMISSIVE'
      AND roles=ARRAY['authenticated'::name]
      AND qual='is_owner_of_request(auth.uid(), request_id)' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_OWNER_POLICY_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='file_withdrawal_details') <> 1 THEN
    RAISE EXCEPTION 'FILE_WITHDRAWAL_POLICY_INVENTORY_MISMATCH';
  END IF;
END
$policy$;

COMMENT ON TABLE public.file_withdrawal_details IS
  'B1 file-withdrawal details. Writes are restricted to reviewed SECURITY DEFINER RPCs.';