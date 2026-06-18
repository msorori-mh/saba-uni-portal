CREATE POLICY "Admin staff can insert media"
  ON public.media_library FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer','finance_officer']
    )
  );

CREATE POLICY "Admin staff can update media"
  ON public.media_library FOR UPDATE
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer','finance_officer']
    )
  )
  WITH CHECK (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer','finance_officer']
    )
  );

CREATE POLICY "Admin staff can delete media"
  ON public.media_library FOR DELETE
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer','finance_officer']
    )
  );

-- Restrict faculty email/phone from all authenticated users via column-level
-- privileges. Admin pages must fetch contact fields via service-role server fn.
REVOKE SELECT ON public.faculty FROM authenticated;
GRANT SELECT (
  id, employee_id, full_name_ar, full_name_en,
  degree, specialization, program_id, rank, photo,
  bio_ar, bio_en, sort_order, is_active, category,
  start_year, admin_position, admin_position_order,
  created_at, updated_at
) ON public.faculty TO authenticated;

GRANT ALL ON public.faculty TO service_role;