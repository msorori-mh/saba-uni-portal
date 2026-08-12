-- PORTAL-COURSE-MATERIALS-PRODUCTION-SAFE-MIGRATION-01
-- Forward-only canonical course materials schema (supersedes the DESIGN-ONLY
-- docs/migrations-design/20260714000000_course_materials_mvp.sql, whose
-- PERMISSIVE storage.objects policy is intentionally NOT applied).

BEGIN;

-- =========================================================
-- 1) TABLES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  faculty_profile_id uuid NOT NULL REFERENCES public.faculty_profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  week_number integer CHECK (week_number IS NULL OR (week_number BETWEEN 1 AND 20)),
  lecture_number integer CHECK (lecture_number IS NULL OR (lecture_number BETWEEN 1 AND 200)),
  study_system text NOT NULL CHECK (study_system IN ('regular','parallel','both')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_materials_published_at_contract
    CHECK ((status = 'published' AND published_at IS NOT NULL) OR (status <> 'published'))
);
CREATE INDEX IF NOT EXISTS idx_course_materials_section_status
  ON public.course_materials(course_section_id, status);
CREATE INDEX IF NOT EXISTS idx_course_materials_faculty
  ON public.course_materials(faculty_profile_id);

CREATE TABLE IF NOT EXISTS public.course_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 25 * 1024 * 1024),
  file_hash text,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  scan_state text NOT NULL DEFAULT 'pending'
    CHECK (scan_state IN ('pending','clean','infected','failed')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_material_id, storage_path),
  UNIQUE (course_material_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_material_files_material
  ON public.course_material_files(course_material_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_storage_path
  ON public.course_material_files(storage_path);

CREATE TABLE IF NOT EXISTS public.course_material_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event text NOT NULL CHECK (event IN ('created','file_uploaded','published','updated','archived','downloaded')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_material_events_material
  ON public.course_material_events(course_material_id, event);
CREATE INDEX IF NOT EXISTS idx_material_events_created
  ON public.course_material_events(created_at DESC);

-- =========================================================
-- 2) LEAST-PRIVILEGE GRANTS
--    All mutations run through trusted server functions (service_role).
--    Authenticated clients get READ ONLY, further narrowed by RLS.
--    anon gets nothing.
-- =========================================================
REVOKE ALL ON public.course_materials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.course_material_files FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.course_material_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.course_materials TO authenticated;
GRANT SELECT ON public.course_material_files TO authenticated;
GRANT SELECT ON public.course_material_events TO authenticated;
GRANT ALL ON public.course_materials TO service_role;
GRANT ALL ON public.course_material_files TO service_role;
GRANT ALL ON public.course_material_events TO service_role;

-- =========================================================
-- 3) RLS
-- =========================================================
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_material_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_material_events ENABLE ROW LEVEL SECURITY;

-- Faculty: own assigned section only (read).
CREATE POLICY course_materials_faculty_read_own_section
  ON public.course_materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_sections cs
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE cs.id = course_materials.course_section_id
        AND fp.user_id = auth.uid()
    )
  );

-- Admin/system_admin: approved management fallback (read).
CREATE POLICY course_materials_admin_read
  ON public.course_materials
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY course_material_files_faculty_read_own_section
  ON public.course_material_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_materials m
      JOIN public.course_sections cs ON cs.id = m.course_section_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE m.id = course_material_files.course_material_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY course_material_files_admin_read
  ON public.course_material_files
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY course_material_events_faculty_read_own_section
  ON public.course_material_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_materials m
      JOIN public.course_sections cs ON cs.id = m.course_section_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE m.id = course_material_events.course_material_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY course_material_events_admin_read
  ON public.course_material_events
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

-- Students: NO direct table access. Entitlement is enforced exclusively by the
-- trusted server-side path (exact student_enrollments -> course_section_id).
-- anon: no policies and no grants -> denied.

-- =========================================================
-- 4) updated_at
-- =========================================================
DROP TRIGGER IF EXISTS trg_course_materials_updated ON public.course_materials;
CREATE TRIGGER trg_course_materials_updated
  BEFORE UPDATE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5) Settings (secure defaults)
--    Linkage mode is enrollment_only: no cohort inference.
-- =========================================================
INSERT INTO public.site_settings (setting_key, setting_value, setting_group) VALUES
  ('materials_linkage_mode', 'enrollment_only', 'course_materials'),
  ('materials_max_mb', '25', 'course_materials'),
  ('materials_allowed_mime_types',
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'course_materials'),
  ('materials_allowed_extensions', 'pdf,doc,docx,ppt,pptx', 'course_materials')
ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = EXCLUDED.setting_value,
      setting_group = EXCLUDED.setting_group;

-- =========================================================
-- 6) STORAGE: narrowly-scoped RESTRICTIVE denial for the new bucket only.
--    RESTRICTIVE (not PERMISSIVE) so unrelated buckets keep their exact
--    previous effective authorization. Mirrors the existing, proven
--    official_documents_deny_client_select pattern.
-- =========================================================
DROP POLICY IF EXISTS course_materials_deny_client_select ON storage.objects;
DROP POLICY IF EXISTS course_materials_deny_client_insert ON storage.objects;
DROP POLICY IF EXISTS course_materials_deny_client_update ON storage.objects;
DROP POLICY IF EXISTS course_materials_deny_client_delete ON storage.objects;

CREATE POLICY course_materials_deny_client_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (bucket_id <> 'course-materials');

CREATE POLICY course_materials_deny_client_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'course-materials');

CREATE POLICY course_materials_deny_client_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'course-materials')
  WITH CHECK (bucket_id <> 'course-materials');

CREATE POLICY course_materials_deny_client_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id <> 'course-materials');

COMMIT;