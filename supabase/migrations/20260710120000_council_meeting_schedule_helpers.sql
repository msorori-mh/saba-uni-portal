-- COUNCILS-MEETINGS-RLS-HELPERS-01
-- Split meeting scheduling from agenda write permissions.
-- Scheduling: admin/system_admin or active chair on the same council_id only.
-- Agenda/topics/minutes/decisions: unchanged (can_write_council_agenda still includes secretary).
-- Repo-only migration prep — apply via approved deploy pipeline only.

-- ============================================================================
-- 1) Helper: can_schedule_council_meeting(_user, _council)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_schedule_council_meeting(_user uuid, _council uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_council_admin(_user)
      OR public.has_council_role(
        _user,
        _council,
        'chair'::public.academic_council_member_role
      );
$$;

REVOKE ALL ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 2) academic_council_meetings INSERT/UPDATE: scheduling only (admin + chair)
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'academic_council_meetings'
      AND policyname = 'meetings_insert'
  ) THEN
    EXECUTE $policy$
      ALTER POLICY meetings_insert
      ON public.academic_council_meetings
      WITH CHECK (
        public.can_schedule_council_meeting(auth.uid(), council_id)
        AND created_by = auth.uid()
      )
    $policy$;
  ELSE
    CREATE POLICY meetings_insert
      ON public.academic_council_meetings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.can_schedule_council_meeting(auth.uid(), council_id)
        AND created_by = auth.uid()
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'academic_council_meetings'
      AND policyname = 'meetings_update'
  ) THEN
    EXECUTE $policy$
      ALTER POLICY meetings_update
      ON public.academic_council_meetings
      USING (public.can_schedule_council_meeting(auth.uid(), council_id))
      WITH CHECK (public.can_schedule_council_meeting(auth.uid(), council_id))
    $policy$;
  ELSE
    CREATE POLICY meetings_update
      ON public.academic_council_meetings
      FOR UPDATE
      TO authenticated
      USING (public.can_schedule_council_meeting(auth.uid(), council_id))
      WITH CHECK (public.can_schedule_council_meeting(auth.uid(), council_id));
  END IF;
END
$mig$;
