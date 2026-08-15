-- DEMO-ONLY persona alignment for the university presentation rehearsal.
-- Scope: a single demo faculty profile (DEMO-F-003). No schema changes.
DO $$
BEGIN
  PERFORM set_config('app.bypass_faculty_lock', '1', true);
  UPDATE public.faculty_profiles
     SET academic_rank = 'أستاذ مساعد',
         position_title = 'رئيس قسم تكنولوجيا المعلومات'
   WHERE employee_number = 'DEMO-F-003';
END $$;