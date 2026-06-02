
-- =========================================================
-- Phase 11G — Internal Communication Center
-- =========================================================

-- =====================  ANNOUNCEMENTS  =====================
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar text NOT NULL CHECK (length(title_ar) BETWEEN 1 AND 200),
  content_ar text NOT NULL CHECK (length(content_ar) BETWEEN 1 AND 5000),
  announcement_type text NOT NULL DEFAULT 'general'
    CHECK (announcement_type IN ('general','academic','finance','urgent')),
  target_audience text NOT NULL DEFAULT 'all'
    CHECK (target_audience IN ('all','students','faculty','staff','admins')),
  target_program_ids    uuid[] NOT NULL DEFAULT '{}',
  target_department_ids uuid[] NOT NULL DEFAULT '{}',
  target_level_ids      uuid[] NOT NULL DEFAULT '{}',
  publish_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_active_publish ON public.announcements (is_active, is_archived, publish_at DESC);
CREATE INDEX idx_announcements_audience ON public.announcements (target_audience);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- =====================  ANNOUNCEMENT READS  =====================
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX idx_ann_reads_user ON public.announcement_reads (user_id);
CREATE INDEX idx_ann_reads_announcement ON public.announcement_reads (announcement_id);

GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- =====================  INTERNAL MESSAGES  =====================
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  message_body text NOT NULL CHECK (length(message_body) BETWEEN 1 AND 5000),
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_user_id <> recipient_user_id)
);

CREATE INDEX idx_msg_recipient ON public.internal_messages (recipient_user_id, sent_at DESC);
CREATE INDEX idx_msg_sender ON public.internal_messages (sender_user_id, sent_at DESC);
CREATE INDEX idx_msg_unread ON public.internal_messages (recipient_user_id, is_read);

GRANT SELECT, INSERT, UPDATE ON public.internal_messages TO authenticated;
GRANT ALL ON public.internal_messages TO service_role;

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- =====================  HELPER FUNCTIONS  =====================
CREATE OR REPLACE FUNCTION public.user_can_see_announcement(_uid uuid, _ann_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.announcements a
    WHERE a.id = _ann_id
      AND a.is_active = true
      AND a.is_archived = false
      AND a.publish_at <= now()
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND (
        a.target_audience = 'all'
        OR (a.target_audience = 'admins'   AND public.has_any_role(_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs','finance_officer','hr_officer']))
        OR (a.target_audience = 'students' AND EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = _uid))
        OR (a.target_audience = 'faculty'  AND EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = _uid))
        OR (a.target_audience = 'staff'    AND EXISTS (SELECT 1 FROM public.staff_profiles st WHERE st.user_id = _uid))
      )
      AND (
        COALESCE(array_length(a.target_program_ids, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = _uid AND sp.program_id = ANY(a.target_program_ids))
        OR EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = _uid AND fp.program_id = ANY(a.target_program_ids))
      )
      AND (
        COALESCE(array_length(a.target_department_ids, 1), 0) = 0
        OR EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = _uid AND sp.department_id = ANY(a.target_department_ids))
        OR EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = _uid AND fp.department_id = ANY(a.target_department_ids))
      )
      AND (
        COALESCE(array_length(a.target_level_ids, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM public.student_profiles sp
          JOIN public.student_academic_status sas ON sas.student_profile_id = sp.id
          JOIN public.semesters s ON s.id = sas.semester_id AND s.is_current = true
          WHERE sp.user_id = _uid AND sas.level_id = ANY(a.target_level_ids)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_internal_message(_sender uuid, _recipient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _sender IS NOT NULL
    AND _recipient IS NOT NULL
    AND _sender <> _recipient
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _recipient)
    AND (
      public.has_any_role(_sender, ARRAY['admin','system_admin','dean','registrar','student_affairs','finance_officer','hr_officer'])
      OR (
        EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = _sender)
        AND EXISTS (
          SELECT 1
          FROM public.faculty_profiles fp
          JOIN public.course_sections cs ON cs.faculty_profile_id = fp.id
          JOIN public.student_enrollments se ON se.course_section_id = cs.id
          JOIN public.student_profiles sp ON sp.id = se.student_profile_id
          WHERE fp.user_id = _sender AND sp.user_id = _recipient
        )
      )
    );
$$;

-- =====================  RLS POLICIES  =====================
-- Announcements
CREATE POLICY ann_select_visible ON public.announcements
  FOR SELECT TO authenticated
  USING (
    public.user_can_see_announcement(auth.uid(), id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean'])
  );

CREATE POLICY ann_insert_admin ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']));

CREATE POLICY ann_update_admin ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']));

CREATE POLICY ann_delete_admin ON public.announcements
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Announcement reads
CREATE POLICY ann_reads_select_own ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean'])
  );

CREATE POLICY ann_reads_insert_own ON public.announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_see_announcement(auth.uid(), announcement_id)
  );

-- Internal messages
CREATE POLICY msg_select_participants ON public.internal_messages
  FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR recipient_user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE POLICY msg_insert_allowed ON public.internal_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.can_send_internal_message(auth.uid(), recipient_user_id)
  );

CREATE POLICY msg_update_recipient_read ON public.internal_messages
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_internal_message_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_user_id    IS DISTINCT FROM OLD.sender_user_id
  OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
  OR NEW.subject           IS DISTINCT FROM OLD.subject
  OR NEW.message_body      IS DISTINCT FROM OLD.message_body
  OR NEW.sent_at           IS DISTINCT FROM OLD.sent_at
  THEN
    RAISE EXCEPTION 'Only is_read/read_at can be updated on internal_messages';
  END IF;
  IF NEW.is_read AND NOT OLD.is_read THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_internal_messages_protect
  BEFORE UPDATE ON public.internal_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_internal_message_fields();
