CREATE OR REPLACE FUNCTION public.get_backup_infrastructure_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'system_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية عرض مؤشرات النسخ الاحتياطي';
  END IF;

  SELECT jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'public_table_count', (
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ),
    'buckets', COALESCE((
      SELECT jsonb_agg(b ORDER BY b->>'bucket_id')
      FROM (
        SELECT jsonb_build_object(
          'bucket_id', o.bucket_id,
          'object_count', count(*),
          'total_bytes', COALESCE(sum((o.metadata->>'size')::bigint), 0),
          'last_object_at', max(o.created_at)
        ) AS b
        FROM storage.objects o
        GROUP BY o.bucket_id
      ) s
    ), '[]'::jsonb),
    'latest_migration_version', (
      SELECT max(version) FROM supabase_migrations.schema_migrations
    ),
    'last_audit_event_at', (
      SELECT max(created_at) FROM public.audit_logs
    ),
    'audit_event_count', (
      SELECT count(*) FROM public.audit_logs
    ),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_backup_infrastructure_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_infrastructure_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_backup_infrastructure_stats() TO service_role;