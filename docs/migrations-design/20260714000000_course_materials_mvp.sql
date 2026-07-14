-- FACULTY_COURSE_MATERIALS_MVP_IMPLEMENTATION_01
-- STATUS: DESIGN ONLY — NOT APPLIED. Owner approval required before running.
-- Target project: wpmicqriltrowwonknox
--
-- Creates: course_materials, course_material_files, course_material_events
-- Storage bucket (course-materials, private) must be created via supabase--storage_create_bucket.
-- Settings: materials_linkage_mode ('cohort_fallback' | 'enrollment_only'), materials_max_mb=25
-- Feature flags: faculty_course_materials_enabled=false, student_course_materials_enabled=false

BEGIN;

-- =========================================================
-- 1) TABLES
-- =========================================================
CREATE TABLE public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  faculty_profile_id uuid NOT NULL REFERENCES public.faculty_profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  lecture_number integer CHECK (lecture_number IS NULL OR (lecture_number BETWEEN 1 AND 200)),
  study_system text NOT NULL CHECK (study_system IN ('regular','parallel','both')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_materials_section_status ON public.course_materials(course_section_id, status);
CREATE INDEX idx_course_materials_faculty ON public.course_materials(faculty_profile_id);

CREATE TABLE public.course_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 25 * 1024 * 1024),
  file_hash text,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_material_id, storage_path)
);
CREATE INDEX idx_material_files_material ON public.course_material_files(course_material_id);

CREATE TABLE public.course_material_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event text NOT NULL CHECK (event IN ('created','file_uploaded','published','updated','archived','downloaded')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_material_events_material ON public.course_material_events(course_material_id, event);

-- =========================================================
-- 2) GRANTs
-- =========================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_materials TO authenticated;
GRANT ALL ON public.course_materials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_material_files TO authenticated;
GRANT ALL ON public.course_material_files TO service_role;
GRANT SELECT, INSERT ON public.course_material_events TO authenticated;
GRANT ALL ON public.course_material_events TO service_role;

-- =========================================================
-- 3) RLS
-- =========================================================
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_material_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_material_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY faculty_manage_own_materials ON public.course_materials
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_sections cs
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE cs.id = course_materials.course_section_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.course_sections cs
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE cs.id = course_materials.course_section_id AND fp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = course_materials.faculty_profile_id AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY admin_manage_materials ON public.course_materials
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY faculty_manage_own_material_files ON public.course_material_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_materials m
      JOIN public.course_sections cs ON cs.id = m.course_section_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE m.id = course_material_files.course_material_id AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.course_materials m
      JOIN public.course_sections cs ON cs.id = m.course_section_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE m.id = course_material_files.course_material_id AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY admin_manage_material_files ON public.course_material_files
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY faculty_read_own_events ON public.course_material_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.course_materials m
      JOIN public.course_sections cs ON cs.id = m.course_section_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE m.id = course_material_events.course_material_id AND fp.user_id = auth.uid()
    )
  );

-- Students read via server function using service role; no student SELECT policy.
-- Anon: no policies -> denied.

-- =========================================================
-- 4) updated_at trigger
-- =========================================================
CREATE TRIGGER trg_course_materials_updated
BEFORE UPDATE ON public.course_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5) Settings & feature flags
-- =========================================================
INSERT INTO public.site_settings (setting_key, setting_value, setting_group) VALUES
  ('materials_linkage_mode', 'cohort_fallback', 'course_materials'),
  ('materials_max_mb', '25', 'course_materials'),
  ('faculty_course_materials_enabled', 'false', 'feature_flags'),
  ('student_course_materials_enabled', 'false', 'feature_flags')
ON CONFLICT (setting_key) DO NOTHING;

-- =========================================================
-- 6) Storage bucket + policies
-- =========================================================
-- Create bucket via: supabase--storage_create_bucket(name='course-materials', public=false)
-- Then apply:
CREATE POLICY course_materials_no_client_access ON storage.objects
  FOR ALL TO authenticated, anon
  USING (bucket_id <> 'course-materials')
  WITH CHECK (bucket_id <> 'course-materials');

COMMIT;
