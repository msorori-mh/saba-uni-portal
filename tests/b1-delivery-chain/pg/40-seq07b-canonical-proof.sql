-- LOCAL DISPOSABLE ONLY — prove SEQ07-B canonical bootstrap (no original SEQ07).
-- Never run against Production/Staging.

DO $$
DECLARE
  v_orig integer;
  v_7b integer;
  v_uploads boolean;
  v_bucket_private boolean;
BEGIN
  SELECT count(*) INTO v_orig
  FROM b1_delivery_chain.apply_log
  WHERE migration_path ILIKE '%20260725110000_b1_07_secure_attachments_source_01%';

  IF v_orig <> 0 THEN
    RAISE EXCEPTION 'ORIGINAL_SEQ07_PRESENT_IN_APPLY_LOG:%', v_orig;
  END IF;

  SELECT count(*) INTO v_7b
  FROM b1_delivery_chain.apply_log
  WHERE order_label IN ('7B', '7.5')
     OR migration_path ILIKE '%20260725110050_b1_07b_secure_attachments_sql_only_01%';

  IF v_7b <> 1 THEN
    RAISE EXCEPTION 'SEQ07B_APPLY_LOG_COUNT:%', v_7b;
  END IF;

  v_uploads := to_regclass('public.student_request_attachment_uploads') IS NOT NULL;
  IF NOT v_uploads THEN
    RAISE EXCEPTION 'SEQ07B_UPLOADS_TABLE_MISSING';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'student-request-secure-attachments'
      AND public IS FALSE
  ) INTO v_bucket_private;
  IF NOT v_bucket_private THEN
    RAISE EXCEPTION 'SEQ07B_PRIVATE_BUCKET_MISSING';
  END IF;

  INSERT INTO b1_delivery_chain.proofs(key, value) VALUES
    ('original_seq07_absent', 'PASS'),
    ('seq07b_objects_present', 'PASS'),
    ('auth_matrix_same_chain', 'SEQ07B_THEN_SEQ08_TO_24')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, recorded_at = now();
END $$;

SELECT key, value FROM b1_delivery_chain.proofs ORDER BY key;
SELECT order_label, migration_path FROM b1_delivery_chain.apply_log ORDER BY applied_at;
