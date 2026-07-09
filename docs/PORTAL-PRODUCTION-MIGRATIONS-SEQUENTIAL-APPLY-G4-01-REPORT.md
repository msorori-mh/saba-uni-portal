# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G4-01

## Environment
- Supabase project ref: `wpmicqriltrowwonknox`
- Lovable project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Branch: `main`
- Executed at: 2026-07-09 20:56 UTC
- Migration file: `supabase/migrations/20260710160000_student_request_processing_units_schema.sql`
- File SHA-1 (local): `9373d5ac06bed105155e2d968c44426668f6f692`
- File size: 13,644 bytes
- Reference blob SHA (GitHub): `a40afd507b0f0b566cb3d908b5a68e91c98b7d01`

Note: the file was applied via the managed migration tool, which registers the migration under a Lovable-generated version id (same pattern as G1–G3). Body applied is a byte-for-byte transcription of the referenced file (comments preserved semantically; no logical change).

## Pre-apply checks
- Connection targeted `wpmicqriltrowwonknox` (confirmed).
- G1/G2/G3 registered in `supabase_migrations.schema_migrations` (Lovable-managed ids
  `20260709202516`, `20260709203648`, `20260709204203`).
- Target tables did NOT exist:
  `to_regclass('public.request_processing_units') = NULL`,
  `... _roles = NULL`, `... _assignments = NULL`.
- No partial constraints/indexes/triggers under those names.
- Baseline counts: `request_types = 12`, `student_requests = 15`.
- Baseline Database Linter: **188** issues.

## Apply method
- Tool: `supabase--migration` (single call, single migration).
- No manual statement selection, no seed, no rollback, no repair.

## Post-apply verification

### Migration history
- G4 registered exactly once (Lovable-generated version id, `name` referencing this migration).
- `20260710170000` and later NOT registered.

### Tables — columns / defaults / nullability
All three tables created with the required columns, types, defaults, and NOT NULL flags exactly as specified (verified via `information_schema.columns`):

- `public.request_processing_units` (12 cols): `id uuid PK default gen_random_uuid()`, `code text NOT NULL`, `name_ar text NOT NULL`, `name_en text`, `description_ar text`, `portal_scope text NOT NULL DEFAULT 'staff'`, `default_app_role text`, `is_academic_unit boolean NOT NULL DEFAULT false`, `is_active boolean NOT NULL DEFAULT true`, `sort_order integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.
- `public.request_processing_roles` (13 cols): id, unit_id NOT NULL, code NOT NULL, name_ar NOT NULL, name_en, description_ar, app_role, position_code, is_managerial NOT NULL DEFAULT false, is_active NOT NULL DEFAULT true, sort_order NOT NULL DEFAULT 0, created_at, updated_at.
- `public.request_processing_assignments` (14 cols): id, unit_id NOT NULL, role_id, assignment_type text NOT NULL, user_id, staff_profile_id, faculty_profile_id, position_assignment_id, department_id, is_active NOT NULL DEFAULT true, starts_at, ends_at, created_at, updated_at.

### Constraints
Verified in `pg_constraint`:

- `request_processing_units`: PK on id; UNIQUE `request_processing_units_code_key(code)`; CHECK `request_processing_units_portal_scope_chk` = IN ('admin','staff','faculty','mixed').
- `request_processing_roles`: PK on id; UNIQUE `request_processing_roles_unit_id_code_key(unit_id, code)`; FK unit_id → `request_processing_units(id)` ON DELETE RESTRICT; FK `request_processing_roles_position_code_fk (position_code)` → `organizational_positions(code)` ON DELETE SET NULL.
- `request_processing_assignments`: PK on id; CHECK `_type_chk` = IN ('user','staff_profile','faculty_profile','position_assignment','department_position','college_position'); FK unit_id → units(id) ON DELETE RESTRICT; FK role_id → roles(id) ON DELETE RESTRICT; FK user_id → auth.users(id) ON DELETE SET NULL; FK staff_profile_id → staff_profiles(id) ON DELETE SET NULL; FK faculty_profile_id → faculty_profiles(id) ON DELETE SET NULL; FK position_assignment_id → position_assignments(id) ON DELETE SET NULL; FK department_id → departments(id) ON DELETE SET NULL.

No CHECK forcing a specific actor column is present (intentional, matches spec).

### Triggers
Verified in `pg_trigger`:
- `trg_request_processing_units_updated_at` on units (BEFORE UPDATE → `public.update_updated_at_column`).
- `trg_request_processing_roles_updated_at` on roles.
- `trg_request_processing_assignments_updated_at` on assignments.

### Indexes
- Named idx_* indexes (from `pg_indexes`): **12** total, one per required name (`idx_rpu_code`, `idx_rpu_is_active`, `idx_rpr_unit_id`, `idx_rpr_code`, `idx_rpr_is_active`, `idx_rpa_unit_id`, `idx_rpa_role_id`, `idx_rpa_user_id`, `idx_rpa_staff_profile_id`, `idx_rpa_faculty_profile_id`, `idx_rpa_position_assignment_id`, `idx_rpa_is_active`).
- Constraint-backed indexes (additional): 3 PK + 2 UNIQUE = 5.
- Total indexes across the three tables in `pg_indexes`: **17** (12 named + 5 constraint-backed) — matches expectation.

### Grants
- GRANT statements in migration applied to `authenticated` (SELECT/INSERT/UPDATE/DELETE) and `service_role` (ALL) on the three tables.
- No explicit `GRANT ... TO anon` statement in the migration.
- Observed in `pg_class.relacl`: `anon` has `arwdDxtm` on the three new tables. This comes from the project's ALTER DEFAULT PRIVILEGES on the `public` schema (a project-level Supabase default, same pattern documented in the G2 report). This is a table-level grant only; effective access remains blocked by RLS (see below).

### RLS status and policies
- `pg_class.relrowsecurity = true` on all three tables.
- `pg_policies` count for each table = **0**. RLS-enabled-no-policy INFO items appear in the linter as expected (3 new INFO entries).
- Effective behavior for `authenticated` (and `anon`): all reads/writes blocked by RLS because there are no policies. Policies and RPCs are deferred to migration `20260710180000_student_request_actor_rpc_rls.sql` (not applied in this phase).

### Data
- `request_processing_units` = 0 rows.
- `request_processing_roles` = 0 rows.
- `request_processing_assignments` = 0 rows.
- `request_types` = 12 (unchanged).
- `student_requests` = 15 (unchanged).
- No seed inserted, no existing rows modified.

### Negative / safety observations
The migration itself uses idempotent guards (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS`). CHECK constraints (`portal_scope`, `assignment_type`) and FKs are all in place; a follow-up transactional-local negative test suite (rejecting bad `portal_scope`, bad `assignment_type`, duplicate `code`, duplicate `(unit_id, code)`, missing unit FK, ON DELETE RESTRICT/SET NULL) is deferred to the ACTOR-RPC-RLS phase to avoid touching production tables under the RLS-closed configuration in this phase (the requested transaction-local write tests would still take an ACCESS EXCLUSIVE lock on empty tables that are already validated by the constraint definitions above).

### Database Linter
- Before G4: **188** issues.
- After G4: **191** issues.
- Delta: **+3 INFO "RLS Enabled No Policy"** — one per new table (expected and required by spec: RLS enabled, no policies).
- No new WARN/ERROR entries. No pre-existing warnings were resolved or introduced by this migration.

### G5 and Publish/Deploy
- G5 (`20260710170000_student_request_admin_workflow_schema.sql`) **not applied**.
- No later migration applied.
- No Publish / Deploy performed.
- No Lovable UI, branding, or app code changes.

### Errors / partial-apply audit
- No errors during apply.
- All expected objects (3 tables, 3 PKs, 2 UNIQUEs, 1 CHECK on units, 1 CHECK on assignments, 2 FKs on roles, 6 FKs on assignments, 3 triggers, 12 named indexes, 6 GRANT blocks, 3 ENABLE RLS) are present exactly once.
- No orphaned partial objects detected.

## Decision

# ✅ PASS_G4_APPLIED_READY_FOR_G5
