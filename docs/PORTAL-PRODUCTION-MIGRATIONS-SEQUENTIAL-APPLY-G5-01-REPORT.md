# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G5-01 — Report

## 1. Environment

- **Supabase project ref:** `wpmicqriltrowwonknox` (production)
- **Lovable project ID:** `4b291119-790f-4484-9285-c2b774e1ba6f`
- **Repository:** `msorori-mh/saba-uni-portal`
- **Branch:** `main`
- **Execution timestamp (UTC):** 2026-07-09 21:29 (registered as version `20260709212937`)
- **Preceding decision:** G4 → `PASS_G4_APPLIED_READY_FOR_G5`
- **Migration file applied:** `supabase/migrations/20260710170000_student_request_admin_workflow_schema.sql`
- **Local file sha256:** `5580dc4dc9aa319991c00df8ed9d79f9702d83e02eef5e2a6e9cc513d55c7ba3` (21 704 bytes / 586 lines)
- **GitHub blob SHA (reference):** `f6b1a5002954be744d5cd5bbf2f263111c361db8`
- **Modifications to file:** none (applied verbatim)

## 2. Pre-Apply Verification

| Check | Expected | Observed |
|---|---|---|
| G4 tables present (`request_processing_units/roles/assignments`) | 3 | **3** ✅ |
| G5 tables pre-existing | 0 of 5 | **0** ✅ |
| `request_types` rows | 12 | **12** |
| `student_requests` rows | 15 | **15** |
| `request_processing_units` rows | 0 | **0** |
| `request_processing_roles` rows | 0 | **0** |
| `request_processing_assignments` rows | 0 | **0** |
| `student_service_request_steps` rows | baseline | **16** |
| `student_service_request_events` rows | baseline | **26** |
| `request_types.workflow_schema` md5 | baseline | **`75ab59795770eba4d23be171a53ef1b6`** |
| Database Linter baseline | 191 (G4) | **191** |
| G5 not yet registered | true | **true** ✅ |
| G6 (`20260710180000`) not registered | true | **true** ✅ |

No partial-apply state detected. Preconditions satisfied.

## 3. Migration History

**Before G5** (top of `supabase_migrations.schema_migrations`):
```
20260709205552 → 20260709205551_b4f6e1e6-...  (G4)
```

**After G5:**
```
20260709205552 → G4
20260709212937 → G5 (registered as 20260709212936_45460e98-f56c-4fd0-90f3-b824eb6676e2)
```

- G5 registered exactly **once**.
- G6 (`20260710180000_student_request_actor_rpc_rls.sql`) **not** registered.
- No later migration applied.

**Note on version mapping:** Lovable's cloud migration tool assigned the runtime timestamp `20260709212937` for the G5 apply record (source file remains `20260710170000_student_request_admin_workflow_schema.sql`), mirroring the same version-generation pattern documented in G1–G4 reports.

## 4. Execution Method

Applied via managed Supabase migration tool (`supabase--migration`), single call, entire SQL body of the source file executed as one migration. No cherry-picking, no per-statement splits, no seeds, no reset, no repair.

## 5. Post-Apply Object Verification

| Verification | Expected | Observed |
|---|---|---|
| New tables in `public` | 5 | **5** ✅ |
| RLS enabled on all 5 tables | 5 | **5** ✅ |
| Policies on all 5 tables combined | 0 | **0** ✅ |
| `updated_at` triggers (rtw, rtws, srws) | 3 | **3** ✅ |
| Named indexes (`idx_rtw*` + `idx_rtws*` + `idx_rtwt*` + `idx_srw_*` + `idx_srwe_*`) | 27 | **27** ✅ |

### 5.1 Tables and columns (verbatim from applied SQL)

- **`public.request_type_workflows`** — columns as specified: `id (uuid PK, default gen_random_uuid())`, `request_type_id (uuid NOT NULL FK → request_types(id) ON DELETE CASCADE)`, `code (text NOT NULL)`, `name_ar (text NOT NULL)`, `name_en (text)`, `description_ar (text)`, `version (integer NOT NULL DEFAULT 1)`, `status (text NOT NULL DEFAULT 'draft')`, `is_active (boolean NOT NULL DEFAULT false)`, `created_by (uuid FK → auth.users(id) ON DELETE SET NULL)`, `created_at`, `updated_at`.
  - **UNIQUE** `(request_type_id, code, version)` ✅
  - **CHECK** `status IN ('draft','active','retired')` ✅
  - No “single active workflow per request type” constraint — deferred to RPC as specified.

- **`public.request_type_workflow_steps`** — columns: `id`, `workflow_id (NOT NULL FK → request_type_workflows(id) ON DELETE CASCADE)`, `step_key`, `step_name_ar`, `step_name_en`, `description_ar`, `step_order`, `processing_unit_id (FK → request_processing_units(id) ON DELETE RESTRICT)`, `processing_role_id (FK → request_processing_roles(id) ON DELETE RESTRICT)`, `assignment_strategy (default 'role_pool')`, `action_type (default 'review')`, `status_on_enter`, `status_on_complete`, `is_required/can_return_to_student/can_reject/can_skip/notify_on_enter/notify_on_complete/visible_to_student/requires_attachment/requires_payment/produces_document` (booleans with defaults), `form_schema jsonb DEFAULT '{}'`, `config jsonb DEFAULT '{}'`, `created_at`, `updated_at`.
  - **UNIQUE** `(workflow_id, step_key)` ✅
  - **UNIQUE** `(workflow_id, step_order)` ✅
  - **CHECK** `assignment_strategy IN ('role_pool','specific_user','department_position','college_position','requester_department_head','dean','manual')` ✅
  - **CHECK** `action_type IN ('review','approve','reject','comment','return_to_student','request_attachment','request_payment','archive','issue_document','complete')` ✅

- **`public.request_type_workflow_transitions`** — columns: `id`, `workflow_id (NOT NULL FK ON DELETE CASCADE)`, `from_step_id (FK → request_type_workflow_steps(id) ON DELETE CASCADE, nullable)`, `to_step_id (FK → request_type_workflow_steps(id) ON DELETE CASCADE, nullable)`, `action_result (text NOT NULL)`, `label_ar (text)`, `condition_schema jsonb DEFAULT '{}'`, `is_default boolean NOT NULL DEFAULT false`, `created_at`.
  - **CHECK** `action_result IN ('submit','approve','reject','return','request_attachment','request_payment','skip','complete','cancel')` ✅
  - Nullable `from_step_id` for entry, nullable `to_step_id` for terminal states ✅

- **`public.student_request_workflow_steps`** — columns per spec including all runtime + assignment FKs: `student_request_id ON DELETE CASCADE`; `workflow_id`, `workflow_step_id`, `assigned_user_id`, `completed_by`, `assigned_staff_profile_id`, `assigned_faculty_profile_id`, `assigned_position_assignment_id` all `ON DELETE SET NULL`; `processing_unit_id`, `processing_role_id` `ON DELETE RESTRICT`; `status DEFAULT 'pending'`; `decision`; `comment`; `metadata jsonb DEFAULT '{}'`.
  - **UNIQUE** `(student_request_id, step_key)` ✅
  - **CHECK** `status IN ('pending','active','completed','returned','rejected','skipped','cancelled')` ✅
  - **CHECK** `decision IS NULL OR decision IN ('approved','rejected','returned','skipped','completed')` ✅

- **`public.student_request_workflow_events`** — columns per spec: `student_request_id ON DELETE CASCADE`, `workflow_step_runtime_id → student_request_workflow_steps(id) ON DELETE SET NULL`, `actor_user_id → auth.users ON DELETE SET NULL`, `actor_unit_id → request_processing_units ON DELETE SET NULL`, `actor_role_id → request_processing_roles ON DELETE SET NULL`, `event_type`, `message_ar/en`, `payload jsonb DEFAULT '{}'`, `visible_to_student boolean DEFAULT false`, `created_at`.
  - **CHECK** `event_type IN ('created','submitted','step_entered','assigned','commented','approved','rejected','returned','attachment_requested','payment_requested','archived','document_issued','completed','cancelled')` ✅
  - No `updated_at` column and no trigger (as designed) ✅

### 5.2 Triggers

Exactly 3 triggers created, all `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()`:

1. `trg_request_type_workflows_updated_at` on `request_type_workflows`
2. `trg_request_type_workflow_steps_updated_at` on `request_type_workflow_steps`
3. `trg_student_request_workflow_steps_updated_at` on `student_request_workflow_steps`

No triggers on `request_type_workflow_transitions` or `student_request_workflow_events` (matches spec).

### 5.3 Indexes

**27 named indexes** created (verified count = 27):

- `request_type_workflows`: `idx_rtw_request_type_id`, `idx_rtw_status`, `idx_rtw_is_active`
- `request_type_workflow_steps`: `idx_rtws_workflow_id`, `idx_rtws_processing_unit_id`, `idx_rtws_processing_role_id`, `idx_rtws_assignment_strategy`, `idx_rtws_action_type`
- `request_type_workflow_transitions`: `idx_rtwt_workflow_id`, `idx_rtwt_from_step_id`, `idx_rtwt_to_step_id`, `idx_rtwt_action_result`
- `student_request_workflow_steps`: `idx_srw_steps_student_request_id`, `idx_srw_steps_workflow_id`, `idx_srw_steps_workflow_step_id`, `idx_srw_steps_processing_unit_id`, `idx_srw_steps_processing_role_id`, `idx_srw_steps_assigned_user_id`, `idx_srw_steps_assigned_staff_profile_id`, `idx_srw_steps_assigned_faculty_profile_id`, `idx_srw_steps_assigned_position_assignment_id`, `idx_srw_steps_status`
- `student_request_workflow_events`: `idx_srwe_student_request_id`, `idx_srwe_workflow_step_runtime_id`, `idx_srwe_event_type`, `idx_srwe_actor_user_id`, `idx_srwe_created_at`

**Constraint-backed indexes** (auto-generated by Postgres, separate from the 27 named): 5 PRIMARY KEYs + 4 UNIQUE constraints = 9 additional. Total physical indexes across the five tables therefore ≈ **36**. Names and definitions match spec.

### 5.4 Grants

For each of the 5 new tables:

- `authenticated`: `SELECT, INSERT, UPDATE, DELETE` ✅
- `service_role`: `ALL` ✅
- No explicit `GRANT ... TO anon` inside G5 ✅

(Project-wide default privileges may still expose table-level rights to `anon`, identical to G2/G3/G4 behaviour. Not addressed here — actual protection is provided by RLS with zero policies, as designed.)

### 5.5 RLS

RLS **enabled** on all 5 new tables with **0 policies each**. Direct access by `authenticated` / `anon` is effectively blocked despite table-level grants — the read/write path is intentionally closed until the ACTOR-RPC-RLS phase (`20260710180000`).

## 6. Data Impact — Zero-Write Confirmation

| Metric | Before | After | Δ |
|---|---|---|---|
| `request_type_workflows` rows | — | **0** | new empty |
| `request_type_workflow_steps` rows | — | **0** | new empty |
| `request_type_workflow_transitions` rows | — | **0** | new empty |
| `student_request_workflow_steps` rows | — | **0** | new empty |
| `student_request_workflow_events` rows | — | **0** | new empty |
| `request_types` rows | 12 | **12** | 0 |
| `student_requests` rows | 15 | **15** | 0 |
| `request_processing_units` rows | 0 | **0** | 0 |
| `request_processing_roles` rows | 0 | **0** | 0 |
| `request_processing_assignments` rows | 0 | **0** | 0 |
| `student_service_request_steps` rows | 16 | **16** | 0 |
| `student_service_request_events` rows | 26 | **26** | 0 |
| `request_types.workflow_schema` md5 | `75ab59795770eba4d23be171a53ef1b6` | **`75ab59795770eba4d23be171a53ef1b6`** | unchanged |

No seed. No workflow rows created. No runtime steps or events generated for any existing student request. Legacy tables and JSON `workflow_schema` untouched.

## 7. Security Smoke Tests (schema/catalog only)

- Confirmed `pg_policies` count = 0 for each of the 5 tables → direct queries by `authenticated`/`anon` are blocked by RLS-with-no-policy (default deny).
- All FK targets, `ON DELETE` behaviours, `CHECK` values and `UNIQUE` constraints verified against `pg_constraint`.
- No transactional write tests were executed (schema-only path preferred, per plan §7.12) — no data or dangling rows introduced.

## 8. Database Linter — Delta vs G4 Baseline

- **Baseline (G4):** 191
- **Post-G5:** **196**
- **Delta:** **+5** entries — all `INFO 0008 RLS Enabled No Policy`, one per new table (`request_type_workflows`, `request_type_workflow_steps`, `request_type_workflow_transitions`, `student_request_workflow_steps`, `student_request_workflow_events`).
- **No new `WARN` or `ERROR`** attributable to G5. Existing warnings (Function Search Path Mutable, Public Bucket Allows Listing, etc.) unchanged and outside the scope of this migration.
- All 5 new INFO entries are **expected and required by design** (RLS closed pending G6 policies/RPCs).

## 9. Prohibited-Action Confirmation

- ❌ G6 (`20260710180000_student_request_actor_rpc_rls.sql`) **not applied**, **not registered**.
- ❌ No other subsequent migration applied.
- ❌ No seed / no workflow rows / no processing units, roles, or assignments inserted.
- ❌ No modifications to existing data or `request_types.workflow_schema`.
- ❌ No RLS policies created; no RPCs created; no changes to `student_service_request_*` legacy tables.
- ❌ No changes to UI, code, or Lovable configuration.
- ❌ No `Publish` / `Deploy` executed.
- ❌ No reset, cleanup, repair, squash, or rollback.

## 10. Errors / Partial-Apply Audit

- No errors during apply (single-statement batch, applied atomically).
- No partial object creation observed: all 5 tables, all constraints, all 3 triggers, all 27 named indexes, all grants, and RLS enable statements present in `pg_catalog` post-apply.
- Migration registered exactly once in `supabase_migrations.schema_migrations`.

## 11. Final Decision

# ✅ `PASS_G5_APPLIED_READY_FOR_G6`

G6 (`20260710180000_student_request_actor_rpc_rls.sql`) is **not** to be applied until an explicit follow-up instruction is issued after review of this report.
