BEGIN;
REVOKE SELECT ON TABLE public.faculty FROM PUBLIC;
REVOKE SELECT ON TABLE public.faculty FROM anon;
REVOKE SELECT ON TABLE public.faculty FROM authenticated;
GRANT SELECT (
  id, employee_id, full_name_ar, full_name_en, degree, specialization,
  program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
  category, start_year, admin_position, admin_position_order
) ON TABLE public.faculty TO anon, authenticated;
COMMENT ON COLUMN public.faculty.email IS 'SENSITIVE — server-only via trusted server functions. No SELECT grant to anon or authenticated.';
COMMENT ON COLUMN public.faculty.phone IS 'SENSITIVE — server-only via trusted server functions. No SELECT grant to anon or authenticated.';
COMMENT ON COLUMN public.faculty.created_at IS 'INTERNAL — no SELECT grant to anon or authenticated.';
COMMENT ON COLUMN public.faculty.updated_at IS 'INTERNAL — no SELECT grant to anon or authenticated.';
COMMIT;