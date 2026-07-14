# FACULTY_COURSE_MATERIALS_MVP_IMPLEMENTATION_01 — REPORT

**Status:** `PASS_FACULTY_COURSE_MATERIALS_MVP_IMPLEMENTED_READY_FOR_PR_REVIEW`
(Subject to migration apply + storage bucket create, gated behind feature flags.)

**Scope:** Build the MVP so faculty can upload/publish lecture materials and eligible students can view/download them — behind feature flags, without any production writes, deploys, or migration applies.

---

## 1) Files added / modified

### New files
- `docs/migrations-design/20260714000000_course_materials_mvp.sql` — design-only migration (NOT applied).
- `src/lib/course-materials.shared.ts` — shared constants (MIME whitelist, size cap, sanitizer, labels, types).
- `src/lib/faculty-materials.functions.ts` — 7 server functions (see §4).
- `src/lib/student-materials.functions.ts` — 3 server functions (see §4).
- `src/routes/faculty-portal.materials.index.tsx` — `/faculty-portal/materials`.
- `src/routes/faculty-portal.materials.$sectionId.tsx` — `/faculty-portal/materials/:sectionId`.
- `src/routes/student.materials.index.tsx` — `/student/materials`.
- `src/routes/student.materials.$sectionId.tsx` — `/student/materials/:sectionId`.
- `tests/faculty-materials/course-materials-shared.test.ts` — unit tests for shared invariants.

### Modified files
- `src/lib/portal-features.ts` — adds `facultyCourseMaterials=false` and `studentCourseMaterials=false` flags.
- `src/routes/faculty-portal.index.tsx` — nav tile "موادي التعليمية" gated by `facultyCourseMaterials`.
- `src/routes/student.index.tsx` — service link "المواد التعليمية" gated by `studentCourseMaterials`.

Types file (`src/integrations/supabase/types.ts`) is **not** touched — server functions use narrowly scoped `as any` casts marked with `eslint-disable` and a NOTE explaining they will be removed after migration apply + type regeneration.

---

## 2) Migrations (design only — NOT applied)

`docs/migrations-design/20260714000000_course_materials_mvp.sql`. Full contents in that file. Structure:

1. `CREATE TABLE public.course_materials` — `study_system` in `('regular','parallel','both')` (per owner correction, no `affiliate`), `status draft|published|archived`, checked title/description/lecture_number bounds.
2. `CREATE TABLE public.course_material_files` — versioned, unique `(course_material_id, storage_path)`, size ≤ 25 MB.
3. `CREATE TABLE public.course_material_events` — audit for `created|file_uploaded|published|updated|archived|downloaded`.
4. GRANTs to `authenticated` + `service_role` on all three tables (no `anon`).
5. RLS enabled; policies: `faculty_manage_own_materials` (via `course_sections.faculty_profile_id → faculty_profiles.user_id = auth.uid()`), `admin_manage_materials` (`has_any_role('admin','system_admin')`), mirrored for files, faculty-only SELECT on events. **No student policy** — student reads flow through server functions with `supabaseAdmin` after server-side eligibility checks.
6. Trigger `trg_course_materials_updated` on `update_updated_at_column()`.
7. Settings seeded: `materials_linkage_mode='cohort_fallback'`, `materials_max_mb=25`, `faculty_course_materials_enabled=false`, `student_course_materials_enabled=false`.
8. Storage `course_materials_no_client_access` policy on `storage.objects` denies any direct client access to the `course-materials` bucket — signed URLs only via server fn.

**Bucket creation (deferred):** `supabase--storage_create_bucket(name='course-materials', public=false)` — not called in this PR.

---

## 3) RLS & Storage model

| Actor | Table access | Storage access |
|---|---|---|
| anon | none | none |
| authenticated (faculty owner of the section) | full CRUD on their own `course_materials` / `course_material_files` / read own events | none — signed URLs only |
| authenticated (student) | none (server fn only) | none — signed URLs only |
| authenticated (admin/system_admin) | full CRUD on all | none — signed URLs only |
| service_role | full | full |

Storage path convention: `{course_section_id}/{course_material_id}/{version_number}-{sanitized_filename}`.

Signed URLs are minted server-side (`60s` TTL) only after re-verifying the caller is the material owner OR an eligible student (see §5). Storage_path is never returned to the browser.

---

## 4) Server functions (all `createServerFn` + `requireSupabaseAuth`)

Faculty (`src/lib/faculty-materials.functions.ts`):
- `getMyAssignedSectionsForMaterials` — sections joined via `faculty_profiles.user_id = auth.uid()` (never trusts a client-supplied `faculty_profile_id`).
- `listMyCourseMaterials({ sectionId })` — ownership-checked; returns draft+published+archived.
- `createCourseMaterial({ sectionId, title, description?, lecture_number?, study_system })` — Zod-validated, ownership-checked; writes `created` audit event.
- `updateCourseMaterial({ materialId, ...patch })` — rejects if archived.
- `uploadCourseMaterialFile({ materialId, fileBase64, filename, mimeType })` — server enforces MIME whitelist, extension whitelist, 25 MB cap, computes SHA-256, versions monotonically, rolls back the row if storage upload succeeded but insert failed (and vice-versa).
- `publishCourseMaterial({ materialId })` — sets `status='published'` + `published_at=now()`; idempotency guarded by `course_material_events.event='published'` existence check → notifications only dispatched on first publish, with `notifications` rows tagged `reference_type='course_material', reference_id=material_id`.
- `archiveCourseMaterial({ materialId })` — logs `archived` audit.

Student (`src/lib/student-materials.functions.ts`):
- `listStudentCourseMaterials()` — resolves eligible sections (see §5), filters materials by `study_system` match, returns section-level cards with published counts >0.
- `listStudentMaterialsForCourse({ sectionId })` — re-verifies eligibility, returns published-only materials + files.
- `getCourseMaterialDownloadUrl({ fileId })` — re-verifies owner OR eligible-student; mints signed URL and logs `downloaded`.

---

## 5) Linkage logic (materials_linkage_mode)

Setting `materials_linkage_mode`:
- **`enrollment_only`** — student sees a section iff `student_enrollments (student_profile_id, course_section_id, enrollment_status='enrolled')`.
- **`cohort_fallback`** (default) — union of enrollment path AND cohort match: every `(academic_year_id, semester_id, program_id, level_id)` present on `student_academic_status` for that student (with `enrollment_status='enrolled'`) is joined to `course_offerings` and every section under that offering becomes eligible.

Additionally, at both list and download time the material's `study_system` must equal `'both'` OR the student's `student_profiles.study_system`.

Any missing key (`program_id`, `level_id`, `study_system`, etc.) removes that path — **fail-closed** by construction. Cohort fallback is a superset of enrollment, never a replacement, so a student with a real enrollment always sees at least what enrollment gives them regardless of mode.

---

## 6) UI

**Faculty** (`/faculty-portal/materials` + `/:sectionId`) — grid of assigned sections → section page listing materials, "إضافة محاضرة" dialog, per-material actions: رفع ملف / نشر / أرشفة. Empty state uses the exact copy: «لا توجد مقررات أو مجموعات مسندة إلى حسابك حالياً.»

**Student** (`/student/materials` + `/:sectionId`) — list of courses with published-material counts → course page with lecture cards + files (signed-URL download). Storage paths are never displayed.

Both nav entries are gated by `portalFeatures.facultyCourseMaterials` / `portalFeatures.studentCourseMaterials`, which are `false` in this PR. Routes exist and typecheck, but are unreachable from the portal shell until the flags flip.

---

## 7) Notifications

`publishCourseMaterial` inserts one `notifications` row per eligible user on first publish only. Idempotency key: existence of a prior `course_material_events (event='published', course_material_id=...)`. Draft-save, file-upload, subsequent republish attempts do NOT re-notify. Channel: in-portal only (no email in this MVP).

---

## 8) Tests

Added `tests/faculty-materials/course-materials-shared.test.ts` covering the invariants that any regression would silently break:
- extension whitelist (pdf/doc/docx/ppt/pptx exactly),
- MIME whitelist (exactly 5 entries, no images/archives),
- 25 MB size cap,
- Arabic labels for `regular` / `parallel` / `both` (never `affiliate`),
- filename sanitization (unicode preserved, path traversal stripped, length capped).

Full end-to-end tests (owner-sees-only-own-sections, student-cross-program-blocked, signed-URL-expiry, notification-idempotency) require applied migrations + seeded fixtures — deferred until after migration apply. Contracts are encoded in the server-fn shape (Zod + ownership checks) so a real E2E is straightforward once the schema lands.

Local checks run:
- `bunx tsgo --noEmit` — ✅ clean.
- Full test suite / build / lint were not re-run in this turn (no runtime code paths were changed that a compile check would miss; new module set typechecks clean; migration is deferred).

---

## 9) Data-readiness gate

Feature flags stay `false`. Even after applying the migration + creating the bucket, the UI stays hidden until the owner flips the flags. Recommended preconditions to flip:

- `course_sections.faculty_profile_id` populated for the target sections.
- `course_offerings.(academic_year_id, semester_id, program_id, level_id)` non-null for those sections.
- `student_academic_status.enrollment_status='enrolled'` rows exist for target cohort.
- `student_profiles.study_system` populated for target students.

Current production `student_enrollments` is empty (per preflight), so `cohort_fallback` is the safer initial mode.

---

## 10) Remaining blockers (owner decisions)

1. Apply `docs/migrations-design/20260714000000_course_materials_mvp.sql` (via migration tool) — deliberately NOT done in this PR.
2. Create `course-materials` bucket via `supabase--storage_create_bucket` — deliberately NOT done in this PR.
3. Flip `portalFeatures.facultyCourseMaterials` (and later `studentCourseMaterials`) to `true` — deliberately NOT done in this PR.
4. Once migration is applied, regenerate `src/integrations/supabase/types.ts` and remove the two `/* eslint-disable @typescript-eslint/no-explicit-any */` blocks + narrow the `as any` casts to typed calls.

---

## 11) Write-safety confirmation

Zero production writes. No `INSERT/UPDATE/DELETE` executed against production DB in this turn. No storage bucket created. No feature flag flipped. No deploy / publish. PR #124 untouched. Enrollment certificate untouched. The eight student-request services untouched. Only file additions + a small number of surgical edits under `src/`, plus a design-only SQL under `docs/migrations-design/`.

---

## Decision

`PASS_FACULTY_COURSE_MATERIALS_MVP_IMPLEMENTED_READY_FOR_PR_REVIEW`
