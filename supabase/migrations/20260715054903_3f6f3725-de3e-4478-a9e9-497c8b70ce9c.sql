BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_faculty_directory()
RETURNS TABLE (
  id uuid,
  employee_id text,
  full_name_ar text,
  full_name_en text,
  degree text,
  specialization text,
  program_id uuid,
  rank text,
  photo text,
  bio_ar text,
  bio_en text,
  sort_order integer,
  is_active boolean,
  category text,
  start_year integer,
  admin_position text,
  admin_position_order integer,
  programs jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.id,
    f.employee_id,
    f.full_name_ar,
    f.full_name_en,
    f.degree,
    f.specialization,
    f.program_id,
    f.rank,
    f.photo,
    f.bio_ar,
    f.bio_en,
    f.sort_order,
    f.is_active,
    f.category,
    f.start_year,
    f.admin_position,
    f.admin_position_order,
    CASE WHEN p.id IS NULL THEN NULL
         ELSE jsonb_build_object('code', p.code, 'name_ar', p.name_ar)
    END AS programs
  FROM public.faculty f
  LEFT JOIN public.programs p ON p.id = f.program_id
  WHERE f.is_active = true
  ORDER BY f.admin_position_order ASC NULLS LAST, f.sort_order ASC, f.full_name_ar ASC, f.id ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_faculty_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint FROM public.faculty WHERE is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_faculty_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_faculty_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_faculty_directory() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_faculty_count() TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_faculty_directory() IS 'Public-safe faculty directory: returns only non-sensitive columns for active faculty. Excludes email, phone, created_at, updated_at.';
COMMENT ON FUNCTION public.get_public_faculty_count() IS 'Public-safe count of active faculty members. Returns bigint only.';

REVOKE SELECT ON TABLE public.faculty FROM PUBLIC;
REVOKE SELECT (
  id, employee_id, full_name_ar, full_name_en, degree, specialization,
  program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
  category, start_year, admin_position, admin_position_order
) ON TABLE public.faculty FROM anon, authenticated;
REVOKE SELECT ON TABLE public.faculty FROM anon, authenticated;

DROP POLICY IF EXISTS "Public can view active faculty" ON public.faculty;

COMMIT;