-- COUNCILS-TOPIC-INTAKE-REVIEW-LIFECYCLE-05
-- Close the broken topic lifecycle and enforce intake rules.
-- Source-only migration; do not apply to production outside approved pipeline.

-- ============================================================================
-- 1) HELPER: can_submit_to_council_meeting_intake
-- Active non-viewer council member, meeting intake_open, now inside window.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_submit_to_council_meeting_intake(_user uuid, _meeting uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_meetings m
    JOIN public.academic_council_members mb
      ON mb.council_id = m.council_id
     AND mb.user_id    = _user
     AND mb.is_active  = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role IN (
       'chair'::public.academic_council_member_role,
       'vice_chair'::public.academic_council_member_role,
       'secretary'::public.academic_council_member_role,
       'member'::public.academic_council_member_role
     )
    WHERE m.id = _meeting
      AND m.status = 'intake_open'::public.academic_council_meeting_status
      AND (
        m.intake_opens_at IS NULL
        OR m.intake_opens_at <= now()
      )
      AND (
        m.intake_closes_at IS NULL
        OR m.intake_closes_at >= now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_submit_to_council_meeting_intake(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_to_council_meeting_intake(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 2) HELPERS: topic review authority split
-- prepare: secretary or chair (under_review / needs_completion)
-- final   : chair only (accepted_for_agenda / rejected)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_review_council_topic_prepare(_user uuid, _topic uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    JOIN public.academic_council_members mb
      ON mb.council_id = t.council_id
     AND mb.user_id    = _user
     AND mb.is_active  = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role IN (
       'chair'::public.academic_council_member_role,
       'secretary'::public.academic_council_member_role
     )
    WHERE t.id = _topic
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_council_topic_final(_user uuid, _topic uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    JOIN public.academic_council_members mb
      ON mb.council_id = t.council_id
     AND mb.user_id    = _user
     AND mb.is_active  = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role = 'chair'::public.academic_council_member_role
    WHERE t.id = _topic
  );
$$;

REVOKE ALL ON FUNCTION public.can_review_council_topic_prepare(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_review_council_topic_final(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_council_topic_prepare(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_council_topic_final(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 3) TRIGGER: enforce canonical topic lifecycle transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_enforce_council_topic_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Canonical transitions only
    IF OLD.status = 'draft'::public.academic_council_topic_status
       AND NEW.status = 'submitted'::public.academic_council_topic_status THEN
      NULL; -- allowed
    ELSIF OLD.status = 'submitted'::public.academic_council_topic_status
       AND NEW.status = 'under_review'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'submitted'::public.academic_council_topic_status
       AND NEW.status = 'needs_completion'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'submitted'::public.academic_council_topic_status
       AND NEW.status = 'rejected'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'under_review'::public.academic_council_topic_status
       AND NEW.status = 'needs_completion'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'under_review'::public.academic_council_topic_status
       AND NEW.status = 'accepted_for_agenda'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'under_review'::public.academic_council_topic_status
       AND NEW.status = 'rejected'::public.academic_council_topic_status THEN
      NULL;
    ELSIF OLD.status = 'needs_completion'::public.academic_council_topic_status
       AND NEW.status = 'submitted'::public.academic_council_topic_status THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid topic status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Owner can only edit title/body when draft or needs_completion
  IF TG_OP = 'UPDATE' THEN
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
      RAISE EXCEPTION 'submitted_by cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.council_id IS DISTINCT FROM OLD.council_id THEN
      RAISE EXCEPTION 'council_id cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.meeting_id IS DISTINCT FROM OLD.meeting_id
       AND OLD.status NOT IN (
         'draft'::public.academic_council_topic_status,
         'submitted'::public.academic_council_topic_status,
         'under_review'::public.academic_council_topic_status,
         'needs_completion'::public.academic_council_topic_status
       ) THEN
      RAISE EXCEPTION 'meeting_id cannot be changed after topic is decided'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_enforce_council_topic_lifecycle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_enforce_council_topic_lifecycle() TO authenticated, service_role;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_actopics_lifecycle'
      AND tgrelid = 'public.academic_council_topics'::regclass
  ) THEN
    CREATE TRIGGER trg_actopics_lifecycle
      BEFORE UPDATE ON public.academic_council_topics
      FOR EACH ROW
      EXECUTE FUNCTION public.tg_enforce_council_topic_lifecycle();
  END IF;
END $mig$;

-- ============================================================================
-- 4) RLS: tighten topic insert/update
-- ============================================================================

DROP POLICY IF EXISTS "topics_insert_member" ON public.academic_council_topics;
CREATE POLICY "topics_insert_member"
  ON public.academic_council_topics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'submitted'::public.academic_council_topic_status
    AND meeting_id IS NOT NULL
    AND public.can_submit_to_council_meeting_intake(auth.uid(), meeting_id)
  );

DROP POLICY IF EXISTS "topics_update_owner_draft" ON public.academic_council_topics;
CREATE POLICY "topics_update_owner_draft"
  ON public.academic_council_topics
  FOR UPDATE
  TO authenticated
  USING (
    (
      submitted_by = auth.uid()
      AND status IN (
        'draft'::public.academic_council_topic_status,
        'needs_completion'::public.academic_council_topic_status
      )
    )
    OR public.can_review_council_topic_prepare(auth.uid(), id)
    OR public.can_review_council_topic_final(auth.uid(), id)
  )
  WITH CHECK (
    (
      submitted_by = auth.uid()
      AND status IN (
        'draft'::public.academic_council_topic_status,
        'needs_completion'::public.academic_council_topic_status,
        'submitted'::public.academic_council_topic_status
      )
    )
    OR public.can_review_council_topic_prepare(auth.uid(), id)
    OR public.can_review_council_topic_final(auth.uid(), id)
  );
