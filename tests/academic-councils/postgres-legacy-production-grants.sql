-- LEGACY-PRODUCTION-GRANTS-01
-- Reproduce the exact production privilege contract on legacy council tables:
-- authenticated currently holds direct DML (arwDxtm) before C0-C9 re-scopes
-- writes to RPC-only.  This fixture is applied AFTER the predecessor schema
-- chain and BEFORE the data seed, so the preflight sees production-like ACL.
--
-- No production writes.  Source-only replica.

BEGIN;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'academic_councils',
    'academic_council_members',
    'academic_council_meetings',
    'academic_council_agenda_items',
    'academic_council_topics',
    'academic_council_topic_attachments',
    'academic_council_decisions',
    'academic_council_minutes'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.%I TO authenticated',
      v_table
    );
  END LOOP;
END $$;

COMMIT;

SELECT 'LEGACY_PRODUCTION_GRANTS_APPLIED' AS status,
       string_agg(t.tablename, ',' ORDER BY t.tablename) AS tables
FROM (
  SELECT relname AS tablename
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'academic_council%'
    AND c.relkind = 'r'
    AND has_table_privilege('authenticated', c.oid, 'SELECT')
    AND has_table_privilege('authenticated', c.oid, 'INSERT')
    AND has_table_privilege('authenticated', c.oid, 'UPDATE')
) t;
