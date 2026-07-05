-- COUNCILS-TOPIC-ATTACHMENTS-DB-01
-- Academic council topic attachments: table, helpers, RLS, private storage bucket.
-- Repo-only migration prep — apply via approved deploy pipeline only.

-- ============================================================================
-- 1) TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.academic_council_topic_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid NOT NULL
                    REFERENCES public.academic_council_topics(id) ON DELETE RESTRICT,
  council_id      uuid NOT NULL
                    REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  uploaded_by     uuid NOT NULL
                    REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_name       text NOT NULL,
  file_path       text NOT NULL,
  file_size       bigint NOT NULL,
  mime_type       text NOT NULL,
  file_ext        text NOT NULL,
  storage_bucket  text NOT NULL DEFAULT 'council-topic-attachments',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT acta_file_size_positive CHECK (file_size > 0),
  CONSTRAINT acta_file_size_max CHECK (file_size <= 10485760),
  CONSTRAINT acta_storage_bucket_fixed CHECK (storage_bucket = 'council-topic-attachments'),
  CONSTRAINT acta_mime_allowlist CHECK (
    mime_type = ANY (ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[])
  ),
  CONSTRAINT acta_ext_allowlist CHECK (
    lower(file_ext) = ANY (ARRAY[
      'jpg', 'jpeg', 'png', 'webp',
      'pdf',
      'doc', 'docx',
      'xls', 'xlsx'
    ]::text[])
  )
);

-- ============================================================================
-- 2) INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_acta_file_path
  ON public.academic_council_topic_attachments(file_path)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acta_topic
  ON public.academic_council_topic_attachments(topic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acta_council
  ON public.academic_council_topic_attachments(council_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acta_uploader
  ON public.academic_council_topic_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_acta_created_at
  ON public.academic_council_topic_attachments(created_at);

CREATE INDEX IF NOT EXISTS idx_acta_deleted_at
  ON public.academic_council_topic_attachments(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- 3) HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.council_topic_attachment_count(_topic_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.academic_council_topic_attachments a
  WHERE a.topic_id = _topic_id
    AND a.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_add_council_topic_attachment(_topic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.council_topic_attachment_count(_topic_id) < 5;
$$;

CREATE OR REPLACE FUNCTION public.can_read_council_topic_attachment(
  _user uuid, _topic_id uuid, _council_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    WHERE t.id = _topic_id
      AND t.council_id = _council_id
      AND (
        public.is_council_admin(_user)
        OR public.is_council_member(_user, t.council_id)
        OR t.submitted_by = _user
        OR EXISTS (
          SELECT 1
          FROM public.academic_council_meetings mt
          WHERE mt.id = t.meeting_id
            AND public.was_council_member_on(
              _user,
              t.council_id,
              (mt.scheduled_at AT TIME ZONE 'UTC')::date
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_upload_council_topic_attachment(
  _user uuid, _topic_id uuid, _council_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    WHERE t.id = _topic_id
      AND t.council_id = _council_id
      AND t.submitted_by = _user
      AND t.status IN (
        'draft'::public.academic_council_topic_status,
        'needs_completion'::public.academic_council_topic_status,
        'submitted'::public.academic_council_topic_status
      )
      AND (
        public.is_council_admin(_user)
        OR public.can_submit_council_topic(_user, t.council_id)
      )
  );
$$;

-- ============================================================================
-- 4) TRIGGER — council/topic integrity, max count, path format
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_enforce_council_topic_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic_council   uuid;
  v_submitted_by    uuid;
  v_status          public.academic_council_topic_status;
  v_expected_prefix text;
BEGIN
  NEW.file_ext := lower(trim(NEW.file_ext));

  SELECT t.council_id, t.submitted_by, t.status
    INTO v_topic_council, v_submitted_by, v_status
    FROM public.academic_council_topics t
   WHERE t.id = NEW.topic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'academic_council_topic not found for topic_id %', NEW.topic_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.council_id IS DISTINCT FROM v_topic_council THEN
    RAISE EXCEPTION 'council_id must match academic_council_topics.council_id'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.uploaded_by IS DISTINCT FROM v_submitted_by THEN
    RAISE EXCEPTION 'uploaded_by must match topic submitted_by'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status NOT IN (
    'draft'::public.academic_council_topic_status,
    'needs_completion'::public.academic_council_topic_status,
    'submitted'::public.academic_council_topic_status
  ) THEN
    RAISE EXCEPTION 'topic status does not allow attachments'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.council_topic_attachment_count(NEW.topic_id) >= 5 THEN
    RAISE EXCEPTION 'maximum 5 active attachments per topic'
      USING ERRCODE = 'check_violation';
  END IF;

  v_expected_prefix := 'council-topics/'
    || NEW.council_id::text || '/'
    || NEW.topic_id::text || '/'
    || NEW.id::text || '-';

  IF NEW.file_path IS NULL OR left(NEW.file_path, length(v_expected_prefix)) <> v_expected_prefix THEN
    RAISE EXCEPTION 'file_path must match council-topics/{council_id}/{topic_id}/{attachment_id}-{filename}'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'deleted_at must be null on insert'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acta_enforce ON public.academic_council_topic_attachments;
CREATE TRIGGER trg_acta_enforce
  BEFORE INSERT ON public.academic_council_topic_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enforce_council_topic_attachment();

-- ============================================================================
-- 5) GRANTS
-- ============================================================================

REVOKE ALL ON TABLE public.academic_council_topic_attachments FROM anon;

GRANT SELECT, INSERT ON public.academic_council_topic_attachments TO authenticated;
GRANT ALL ON public.academic_council_topic_attachments TO service_role;
REVOKE DELETE ON public.academic_council_topic_attachments FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.council_topic_attachment_count(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_add_council_topic_attachment(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_council_topic_attachment(uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_upload_council_topic_attachment(uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_enforce_council_topic_attachment() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.council_topic_attachment_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_add_council_topic_attachment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_council_topic_attachment(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_council_topic_attachment(uuid, uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 6) TABLE RLS
-- ============================================================================

ALTER TABLE public.academic_council_topic_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acta_select ON public.academic_council_topic_attachments;
CREATE POLICY acta_select
  ON public.academic_council_topic_attachments
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.can_read_council_topic_attachment(auth.uid(), topic_id, council_id)
  );

DROP POLICY IF EXISTS acta_insert ON public.academic_council_topic_attachments;
CREATE POLICY acta_insert
  ON public.academic_council_topic_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND deleted_at IS NULL
    AND public.can_upload_council_topic_attachment(auth.uid(), topic_id, council_id)
    AND public.can_add_council_topic_attachment(topic_id)
  );

-- No UPDATE or DELETE policies in MVP.

-- ============================================================================
-- 7) STORAGE BUCKET (private)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'council-topic-attachments',
  'council-topic-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: council-topics/{council_id}/{topic_id}/{attachment_id}-{safe_filename}

DROP POLICY IF EXISTS acta_storage_select ON storage.objects;
CREATE POLICY acta_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'council-topic-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.academic_council_topic_attachments att
      WHERE att.file_path = storage.objects.name
        AND att.deleted_at IS NULL
        AND att.storage_bucket = 'council-topic-attachments'
        AND public.can_read_council_topic_attachment(
          auth.uid(), att.topic_id, att.council_id
        )
    )
  );

DROP POLICY IF EXISTS acta_storage_insert ON storage.objects;
CREATE POLICY acta_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'council-topic-attachments'
    AND (storage.foldername(name))[1] = 'council-topics'
    AND coalesce(array_length(storage.foldername(name), 1), 0) = 4
    AND public.can_upload_council_topic_attachment(
      auth.uid(),
      ((storage.foldername(name))[3])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

-- No storage UPDATE or DELETE policies in MVP.
