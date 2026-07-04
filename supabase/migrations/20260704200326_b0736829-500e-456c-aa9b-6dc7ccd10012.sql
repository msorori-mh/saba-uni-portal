-- COUNCILS-FACULTY-HISTORY-RLS-01
-- Helpers + RLS extensions for former-member archive reads and viewer topic-insert lockdown.

-- 1) Helper: was_council_member_on(_user, _council, _date)
CREATE OR REPLACE FUNCTION public.was_council_member_on(_user uuid, _council uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_members m
    WHERE m.council_id = _council
      AND m.user_id    = _user
      AND m.active_from <= _date
      AND (m.active_to IS NULL OR m.active_to >= _date)
  );
$$;

-- 2) Helper: can_submit_council_topic(_user, _council)
-- Active membership with role in (chair, secretary, member). Excludes viewer.
CREATE OR REPLACE FUNCTION public.can_submit_council_topic(_user uuid, _council uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_members m
    WHERE m.council_id = _council
      AND m.user_id    = _user
      AND m.is_active  = true
      AND (m.active_to IS NULL OR m.active_to >= CURRENT_DATE)
      AND m.member_role IN (
        'chair'::public.academic_council_member_role,
        'secretary'::public.academic_council_member_role,
        'member'::public.academic_council_member_role
      )
  );
$$;

-- 3) academic_council_members SELECT: allow user to always read own rows (past + current)
DROP POLICY IF EXISTS "council_members_select" ON public.academic_council_members;
CREATE POLICY "council_members_select"
  ON public.academic_council_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
    OR user_id = auth.uid()
  );

-- 4) academic_council_meetings SELECT: include former members within their tenure
DROP POLICY IF EXISTS "meetings_select" ON public.academic_council_meetings;
CREATE POLICY "meetings_select"
  ON public.academic_council_meetings
  FOR SELECT
  TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
    OR public.was_council_member_on(auth.uid(), council_id, (scheduled_at AT TIME ZONE 'UTC')::date)
  );

-- 5) academic_council_topics INSERT: block viewer role
DROP POLICY IF EXISTS "topics_insert_member" ON public.academic_council_topics;
CREATE POLICY "topics_insert_member"
  ON public.academic_council_topics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      public.is_council_admin(auth.uid())
      OR public.can_submit_council_topic(auth.uid(), council_id)
    )
  );

-- 6) academic_council_topics SELECT: extend to former members for topics tied to a meeting in their tenure
DROP POLICY IF EXISTS "topics_select" ON public.academic_council_topics;
CREATE POLICY "topics_select"
  ON public.academic_council_topics
  FOR SELECT
  TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
    OR submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.academic_council_meetings mt
      WHERE mt.id = academic_council_topics.meeting_id
        AND public.was_council_member_on(
          auth.uid(),
          academic_council_topics.council_id,
          (mt.scheduled_at AT TIME ZONE 'UTC')::date
        )
    )
  );
