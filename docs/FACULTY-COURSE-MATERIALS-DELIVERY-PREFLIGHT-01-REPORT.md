# FACULTY_COURSE_MATERIALS_DELIVERY_PREFLIGHT_01

**Mode:** Read-only preflight. No SQL writes, no migration apply, no storage writes, no deploy/publish, no Auth/Roles changes, no changes to requests/workflows or PR #124.

- Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase: `wpmicqriltrowwonknox`
- Repo: `msorori-mh/saba-uni-portal`

---

## 1) Current relational map

### Faculty ↔ Course link
```
faculty (id, program_id, ...)
  └── faculty_profiles (id, user_id → auth.users, faculty_id, department_id, program_id)
        └── course_sections.faculty_profile_id  (nullable, ON DELETE SET NULL)
              └── course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
                    └── courses (id, department_id, ...)
```
- Authoritative faculty→section link exists via `course_sections.faculty_profile_id`.
- A faculty user is provable by joining `auth.uid() → faculty_profiles.user_id → course_sections.faculty_profile_id`.
- Section carries year + semester + program + level via `course_offerings`. Study system is a **student attribute** (`student_profiles.study_system`), not attached to the section — so a section can serve students from multiple study systems unless we scope by enrollment.

### Student ↔ Course link
```
student_profiles (id, user_id, program_id, department_id, study_system, ...)
  └── student_enrollments (student_profile_id, course_section_id, enrollment_status)
        └── course_sections → course_offerings (year, semester, program, level)
student_academic_status (student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)  -- cohort truth
```

### Data readiness
| Signal | Row count |
|---|---|
| `student_enrollments` (total) | **0** |
| `course_sections.faculty_profile_id` populated | 1 |

`student_enrollments` is effectively empty → the section-level authoritative path cannot deliver materials to students today.

---

## 2) Recommended student↔materials linkage

**Primary (target once enrollments are seeded):** `student_enrollments.course_section_id` — highest fidelity, filters by exact section a student registered in.

**Interim cohort fallback (safe fan-out):** join by
`program_id + level_id (student_academic_status) + semester_id + academic_year_id (offering) + study_system (student vs. section's course_offering study system if added, or omit)`.

Because `course_offerings` does **not** carry `study_system`, an interim fallback CANNOT split نظامي vs. انتساب at the section level. Two safe options:
1. Publish materials at the **offering** level and grant to all students whose `student_academic_status` matches `(program_id, level_id, semester_id, academic_year_id)`.
2. Add optional `study_system` column to `course_materials` so the lecturer can tag materials for a specific system; students only see materials whose tag is null OR matches their `student_profiles.study_system`.

**Cross-program/system leak risk with fallback:** medium if all four keys are enforced; **must never** relax any key. Recommendation: gate the fallback behind a server-side setting flag (`materials_fallback_cohort_enabled`) so it can be disabled the moment enrollments are populated.

---

## 3) Existing pages / reusable surfaces

**Faculty portal:** `src/routes/faculty-portal.*` — `index`, `schedule`, `student-progress.$studentId`, `academic-councils`, `change-password`. No materials surface exists. Shell: `src/components/portal/PortalShell.tsx`, `FacultyGradesManager.tsx` pattern is the closest analog (per-section list + edit).

**Student portal:** `src/routes/student.*` (schedule, study-plan, documents, finance, grades, requests). No materials surface exists.

**Reusable:** `PortalShell`, `SectionCard/StandardCard/ActionCard` from `src/components/brand`, `readFileAsBase64` + `uploadAdminStorageFile` pattern from `src/lib/admin-storage.functions.ts` and `src/lib/file-upload.ts`, `NotificationsBell`.

**New routes needed:**
- `src/routes/faculty-portal.materials.tsx` (list of my sections)
- `src/routes/faculty-portal.materials.$sectionId.tsx` (lectures for a section)
- `src/routes/student.materials.tsx` (list courses)
- `src/routes/student.materials.$courseSectionId.tsx` (or offering id under fallback)

Sidebar entries added to faculty portal ("موادي التعليمية") and student portal ("المواد التعليمية").

---

## 4) Proposed schema (design only — NOT applied)

```sql
CREATE TABLE public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  faculty_profile_id uuid NOT NULL REFERENCES public.faculty_profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  lecture_number int,
  study_system text CHECK (study_system IN ('regular','affiliate') OR study_system IS NULL),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_materials_section ON public.course_materials(course_section_id, status);
CREATE INDEX idx_course_materials_faculty ON public.course_materials(faculty_profile_id);

CREATE TABLE public.course_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  file_hash text,
  version_number int NOT NULL DEFAULT 1,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_material_id, storage_path)
);
CREATE INDEX idx_material_files_material ON public.course_material_files(course_material_id);

-- audit
CREATE TABLE public.course_material_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event text NOT NULL CHECK (event IN ('created','file_uploaded','published','updated','archived','downloaded')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Mandatory GRANTs (per project rule) go to `authenticated` + `service_role` in the same migration.

---

## 5) Storage bucket

**New private bucket:** `course-materials`
- `public = false`
- Allowed MIME (enforced client + server + policy):
  `application/pdf`,
  `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-powerpoint`,
  `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- Max size: setting-backed (`site_settings.materials_max_mb`, default 25 MB).
- Path convention: `{course_section_id}/{course_material_id}/{version}-{sanitized_filename}`.

Downloads via **signed URLs only** (60s TTL) from a server function — never public URL.

---

## 6) RLS & ACL

`ENABLE ROW LEVEL SECURITY` on both tables. No policies for `anon`.

**course_materials:**
- `faculty_manage_own` (ALL) — `USING/CHECK`: `EXISTS (SELECT 1 FROM course_sections cs JOIN faculty_profiles fp ON fp.id = cs.faculty_profile_id WHERE cs.id = course_materials.course_section_id AND fp.user_id = auth.uid())`.
- `student_read_published` (SELECT) — `status='published'` AND student is enrolled in the section (`student_enrollments`) OR (fallback flag on) matches cohort via `student_academic_status` and offering keys, AND `(study_system IS NULL OR study_system = student.study_system)`.
- `admin_manage` — `has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])`.

**course_material_files:** mirror parent policy via `EXISTS (SELECT 1 FROM course_materials m WHERE m.id = course_material_id AND ...)`.

**storage.objects (bucket = 'course-materials'):**
- INSERT/UPDATE/DELETE: only faculty owner of the parent material.
- SELECT: only via signed URL server-function; no direct policy for `authenticated` read from the client.

---

## 7) RPCs / server functions (contracts)

All `createServerFn` + `requireSupabaseAuth`, server-side role & ownership checks.

- `getMyAssignedSectionsForMaterials()` → sections joined via `faculty_profiles.user_id = auth.uid()`.
- `listMyCourseMaterials({ sectionId? })` — faculty view (draft+published+archived).
- `createCourseMaterial({ sectionId, title, description, lecture_number, study_system? })`.
- `uploadCourseMaterialFile({ materialId, fileBase64, filename, mimeType })` — validates MIME + size, writes via `supabaseAdmin.storage`, inserts row.
- `publishCourseMaterial({ materialId })` — sets `published_at=now()`, dispatches notifications (once, guarded by audit row `event='published'`).
- `archiveCourseMaterial({ materialId })`.
- `listStudentCourseMaterials()` → sections/offerings the student can see + material counts.
- `listStudentMaterialsForSection({ sectionId | offeringId })` — published only.
- `getCourseMaterialDownloadUrl({ fileId })` — verifies read entitlement (faculty owner OR eligible student), returns signed URL (60s), logs `downloaded`.

Never accept a `faculty_profile_id` from the client — resolve from `auth.uid()`.

---

## 8) UX MVP

**Faculty:** `موادي التعليمية` → grid of assigned sections (`getMyAssignedSectionsForMaterials`) → section page: list lectures + "إضافة محاضرة" dialog (title, رقم المحاضرة، وصف، ملف اختياري نظام دراسة) → row actions: `تعديل / رفع ملف / نشر / أرشفة`.

**Student:** `المواد التعليمية` → list courses (from enrollments or cohort fallback) → course page: lecture cards ordered by `lecture_number`, each with files (download button → signed URL).

---

## 9) Notifications & audit

- On `publishCourseMaterial`: enqueue notifications to eligible students; idempotency key = `('material_published', material_id)` stored in `notifications` or in `course_material_events`. Retry-safe.
- No notification on draft save or file upload.
- Audit rows for `created`, `file_uploaded`, `published`, `updated`, `archived`, `downloaded` in `course_material_events`.

---

## 10) Migration list (design only — NOT applied)

1. `create_course_materials_tables` (2 tables + audit + GRANTs + RLS + policies).
2. `create_course_materials_bucket` (via `supabase--storage_create_bucket`, private; + storage.objects policies).
3. `create_course_materials_rpcs` (SECURITY DEFINER helpers if any; server fns live in code).
4. `add_site_settings_materials_max_mb` (default 25).
5. (optional) `add_materials_fallback_cohort_flag` in `site_settings`.

---

## 11) Files that will change (implementation phase, NOT now)

- New: `src/lib/faculty-materials.functions.ts`, `src/lib/student-materials.functions.ts`.
- New routes: `faculty-portal.materials.tsx`, `faculty-portal.materials.$sectionId.tsx`, `student.materials.tsx`, `student.materials.$sectionId.tsx`.
- New components: `src/components/portal/FacultyMaterialsManager.tsx`, `src/components/portal/StudentMaterialsList.tsx`.
- Edit: `src/components/portal/PortalShell.tsx` (sidebar entries), `src/lib/admin-nav.ts` if admin needs oversight later.

---

## 12) Fast execution plan (two phases)

**Phase 1 — Schema + Storage + RLS + RPCs** (parallelizable):
- Migration for tables + policies.
- Create storage bucket + storage RLS.
- Server functions module (no UI yet) with unit-level tests.

**Phase 2 — UI + E2E:**
- Faculty pages → Student pages → E2E (upload → publish → student sees & downloads → archive hides).
- Blocked-until: Phase 1 merged. Student-side listing depends on the enrollment-data decision below.

---

## 13) Owner-decision blockers

1. **Student linkage strategy for MVP:** enable cohort fallback (given `student_enrollments = 0`) or defer student-side release until enrollments are seeded? Recommendation: enable fallback behind a setting flag, ship faculty side immediately.
2. **`study_system` scoping:** allow lecturer to tag materials by نظامي/انتساب? Recommendation: yes, nullable.
3. **Max file size + allowed types confirmation** (default proposed: 25 MB; PDF/DOC/DOCX/PPT/PPTX only).
4. **Notification channel** (in-app only, or in-app + email via existing `email.functions`).
5. **Retention/versioning:** keep all uploaded versions or replace-in-place? Design supports versions.

---

## 14) Write-safety confirmation

No `INSERT/UPDATE/DELETE/CREATE/ALTER` was executed. Only `SELECT` and `\d` inspections plus filesystem reads. `enrollment_certificate` untouched. PR #124 untouched. Auth/Roles untouched.

---

## Decision

`PASS_FACULTY_COURSE_MATERIALS_PREFLIGHT_READY_FOR_IMPLEMENTATION` — subject to owner decisions #1–#5 above. Faculty-side (Phase 1 + faculty UI) can start immediately; student-side release is `HOLD_FACULTY_COURSE_MATERIALS_STUDENT_LINKAGE_PENDING_OWNER_DECISION` until the enrollment-vs-cohort question is resolved.
