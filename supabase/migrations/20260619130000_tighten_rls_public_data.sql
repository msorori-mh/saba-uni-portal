-- SEC-004: Tighten overly permissive RLS on site_settings and study_plan_courses.

-- 1) site_settings — public read limited to marketing/contact/about groups
DROP POLICY IF EXISTS "Public can view settings" ON public.site_settings;

CREATE POLICY "Anon can view public settings" ON public.site_settings
  FOR SELECT TO anon
  USING (
    setting_group IN ('general', 'contact', 'social', 'about')
    OR setting_key IN ('logo_url', 'college_logo_url', 'university_name', 'college_name')
  );

CREATE POLICY "Authenticated view settings" ON public.site_settings
  FOR SELECT TO authenticated
  USING (
    setting_group IN ('general', 'contact', 'social', 'about')
    OR setting_key IN ('logo_url', 'college_logo_url', 'university_name', 'college_name')
    OR public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'system_admin', 'registrar', 'dean', 'student_affairs']::text[]
    )
  );

-- 2) study_plan_courses — remove anonymous full-catalog read
DROP POLICY IF EXISTS spc_select_anon ON public.study_plan_courses;
REVOKE SELECT ON public.study_plan_courses FROM anon;

-- 3) email_logs — allow operational staff who send notifications to write logs
DROP POLICY IF EXISTS "Admins can insert email logs" ON public.email_logs;
CREATE POLICY "Staff can insert email logs" ON public.email_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY[
        'admin', 'system_admin', 'dean', 'registrar',
        'student_affairs', 'finance_officer'
      ]::text[]
    )
  );
