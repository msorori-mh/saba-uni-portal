-- STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01
-- Removes privilege-escalation risk (student_profiles_self_update_no_check):
-- prior "Students can update own profile" policy had USING only and, combined
-- with the broad table-level UPDATE grant to authenticated, theoretically
-- allowed a student to modify academic/administrative columns on their row.
--
-- All existing writes in the codebase go through supabaseAdmin (service_role)
-- or trusted server import engines. No client-side authenticated write exists.
-- Safe self-update column list is therefore EMPTY: revoke UPDATE from
-- anon/authenticated entirely and keep a locked self-update policy as
-- defense-in-depth.

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can update own profile" ON public.student_profiles;

CREATE POLICY "Students can update own profile (locked)"
  ON public.student_profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE UPDATE ON TABLE public.student_profiles FROM PUBLIC;
REVOKE UPDATE ON TABLE public.student_profiles FROM anon;
REVOKE UPDATE ON TABLE public.student_profiles FROM authenticated;

DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT attname
    FROM pg_attribute
    WHERE attrelid = 'public.student_profiles'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON public.student_profiles FROM anon, authenticated, PUBLIC',
      col
    );
  END LOOP;
END $$;