-- SECURITY-RLS-REMEDIATION-01
-- 1) FACULTY: stop exposing email/phone to anonymous users.
--    Drop the public anon SELECT policy on the base table and expose a
--    safe-columns-only view for public consumption.
DROP POLICY IF EXISTS "Public can view active faculty" ON public.faculty;

CREATE OR REPLACE VIEW public.faculty_directory AS
SELECT
  f.id, f.employee_id, f.full_name_ar, f.full_name_en,
  f.degree, f.specialization, f.program_id, f.rank, f.photo,
  f.bio_ar, f.bio_en, f.sort_order, f.is_active, f.category,
  f.start_year, f.admin_position, f.admin_position_order,
  p.code        AS program_code,
  p.name_ar     AS program_name_ar
FROM public.faculty f
LEFT JOIN public.programs p ON p.id = f.program_id
WHERE f.is_active = true;

GRANT SELECT ON public.faculty_directory TO anon, authenticated;

-- 2) AUDIT LOGS: writes must only happen via SECURITY DEFINER log_audit().
--    Make sure no client can INSERT/UPDATE/DELETE directly.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- 3) MEDIA LIBRARY: was world-readable. Restrict to admin staff only.
DROP POLICY IF EXISTS "Public can view media" ON public.media_library;

CREATE POLICY "Admin staff can view media library"
  ON public.media_library FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer','finance_officer']
    )
  );

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.media_library FROM anon;

-- 4) NOTIFICATIONS: inserts must only come from SECURITY DEFINER triggers
--    (create_notification) or service_role (admin server fns). Block any
--    direct client INSERT/DELETE. UPDATE is still allowed by the existing
--    notif_update_own_read policy so users can mark as read.
REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;
REVOKE SELECT, UPDATE ON public.notifications FROM anon;