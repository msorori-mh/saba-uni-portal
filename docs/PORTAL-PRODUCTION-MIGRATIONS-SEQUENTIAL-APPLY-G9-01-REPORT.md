# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G9-01 — Apply Report

**Decision:** `PASS_G9_APPLIED_READY_FOR_POST_APPLY_REVIEW`

## 1. Source (canonical)

- HEAD: `80114782d18193847d35735bafea464852dc0501`
- G9 merge commit `977dff392440ff458ef9f0ad6edde59eea30f22c` — ancestor of HEAD ✓
- File: `supabase/migrations/20260711020000_student_requests_p1_foundations.sql`
- `git rev-parse HEAD:<path>` blob = `b8c5cdd0435eb4c5fd3716f797037372c70f0b1d` = canonical ✓
- `git status`/`git diff` clean on file ✓
- Content extracted via `git cat-file blob b8c5cdd… > /tmp/g9-canonical.sql`
  - canonical bytes: **25 632**
  - canonical SHA256: `0be3b067c3f2ccfb2177d755c736b83c655526f813bcfb3eda9b5560dbd27943`
- Static security patterns present in canonical:
  - `IF v_study_status IS DISTINCT FROM 'new' THEN` (line 623)
  - `REVOKE ALL … FROM PUBLIC, anon, authenticated;` on internal helper (689)
  - `REVOKE ALL … FROM PUBLIC, anon;` on read RPCs (692, 695)
  - `GRANT EXECUTE … TO authenticated;` only on the two read RPCs (697–701)

## 2. Preflight (production)

- `student_profiles` new columns: 0 rows in `information_schema.columns` ✓
- G9 new tables: 0 rows ✓
- G9 functions: 0 rows ✓
- G7 functions present with expected ACLs; G8 `staff_profiles.email` present.
- Baseline row counts: `student_profiles=503`, `staff_profiles=6`,
  `student_request_workflow_steps=0`, `student_request_workflow_events=0`.
- Migration history read via `supabase_migrations.schema_migrations` denied to
  DB role (RLS/grants — unchanged posture); confirmed indirectly via
  managed migration tool (applied once, no partial artifacts).

## 3. Application

Executed exactly one managed Supabase migration call with the canonical SQL
(no editing, no splitting). Result: **success**.

## 4. Post-apply verification

### 4.1 `student_profiles` columns

| column | type | nullable | default |
|---|---|---|---|
| student_study_status | text | YES | – |
| transferred_current_year | boolean | NO | false |
| previous_suspension_semesters_count | integer | NO | 0 |
| consecutive_suspension_years_count | integer | NO | 0 |

Constraints added:
- `student_profiles_student_study_status_chk`
- `student_profiles_previous_suspension_semesters_count_chk`
- `student_profiles_consecutive_suspension_years_count_chk`

Row count before/after: **503 / 503** (no INSERT/DELETE). Distribution:
`null_study_status=503`, `transferred_false=503`, `prev_zero=503`,
`consecutive_zero=503` — pure defaults on existing rows, as documented.

### 4.2 Five new tables

All present, empty (0 rows), RLS **enabled**, **0 policies**, grants applied
per canonical script (SELECT/INSERT/UPDATE/DELETE to authenticated, ALL to
service_role; anon has no grant). Closed by default (RLS + no policy).

### 4.3 Three functions

All three exist with `SECURITY DEFINER`, `STABLE`, `search_path=public, pg_temp`.

ACL matrix (from `pg_proc.proacl`):

| function | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|
| assert_can_read_student_eligibility_context(uuid) | – | – | – | X |
| get_student_request_eligibility_context(uuid) | – | – | **X** | X |
| check_student_request_basic_eligibility(text, uuid) | – | – | **X** | X |

(Owner `postgres` and platform `sandbox_exec` roles hold X as expected; not
end-user roles.) `anon` and `PUBLIC` have no EXECUTE on any of the three.

NULL logic verified in canonical source: `IS DISTINCT FROM 'new'` → NULL and
`repeat` both mark `enrollment_suspension` ineligible with the required Arabic
reason. Not tested against real students (no operational writes performed).

### 4.4 Integrity of prior phases

- **G7** functions (`get_active_workflow_for_request_type`,
  `initialize_student_request_workflow`, `submit_student_request`)
  unchanged — same ACLs (helpers not granted to anon/authenticated;
  `submit_student_request` granted to authenticated only).
- **G8** `staff_profiles.email` still `text NULL, no default`.
- Legacy tables (`request_types`, `student_requests`,
  `student_service_request_steps`, `student_service_request_events`) — no
  writes performed by G9 (schema-only DDL).
- No workflow runtime rows created (`workflow_steps=0`, `workflow_events=0`).

### 4.5 Linter

- Baseline (post-G8): **222**
- Post-G9: **229** (+7)
- New findings are the expected `RLS Enabled No Policy` (INFO) on the five
  new tables plus function-related INFO items introduced by G9. None
  demonstrate any effective EXECUTE for `anon` on the three functions; ACL
  matrix above is authoritative.

## 5. Not executed (per order)

- No `supabase gen types` run.
- No edit to `src/integrations/supabase/types.ts` or any types file.
- No import template updates, no student importer changes.
- No seed rows into any of the five new tables.
- Eligibility helpers NOT wired into `create_student_request` /
  `submit_student_request`.
- No Publish / Deploy.
- No re-application of G7/G8, no G10.

## 6. Final decision

**`PASS_G9_APPLIED_READY_FOR_POST_APPLY_REVIEW`**
