# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G6-01 — REPORT

## 1. Environment

- Repository: `msorori-mh/saba-uni-portal`
- Branch: `main`
- Supabase project ref (production): `wpmicqriltrowwonknox`
- Lovable project ID: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Executed at: 2026-07-09 (single migration, single call)
- Staging: frozen — not used.
- Prior gate: `PASS_G5_APPLIED_READY_FOR_G6` (per
  `docs/PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G5-01-REPORT.md`).

## 2. Migration file applied (only one)

- Path: `supabase/migrations/20260710180000_student_request_actor_rpc_rls.sql`
- Local file: 1125 lines, 35 401 bytes, md5 `8937530d760f28b17aaa075affa56636`
- GitHub blob SHA reference: `88c85241fc46e88d794afb6c081f48ac8c52cf30`
- No local modification (file untouched; SQL body applied verbatim to production).
- Registered in migration history as `20260709213935_a5b6ecfc-a2f1-4a2a-bf3c-004a521097f4.sql`
  (mirror created by the managed migration tool with identical SQL body — file present in
  `supabase/migrations/`).

Explicitly NOT applied in G6:
- `supabase/migrations/20260710190000_student_request_workflow_runtime.sql` (G7)
- Any migration after 20260710180000

## 3. Preflight verification

### 3.1 Migration history
- Only migrations up to G5 registered before this apply.
- G6 not previously registered.
- G7 (`20260710190000_...`) not registered.

### 3.2 G4 / G5 tables (before apply)

| Table | RLS enabled | Policies | Rows |
|-------|-------------|----------|------|
| `request_processing_units` | ✅ | 0 | 0 |
| `request_processing_roles` | ✅ | 0 | 0 |
| `request_processing_assignments` | ✅ | 0 | 0 |
| `request_type_workflows` | ✅ | 0 | 0 |
| `request_type_workflow_steps` | ✅ | 0 | 0 |
| `request_type_workflow_transitions` | ✅ | 0 | 0 |
| `student_request_workflow_steps` | ✅ | 0 | 0 |
| `student_request_workflow_events` | ✅ | 0 | 0 |

### 3.3 Dependency functions (present with expected signatures)

- `public.has_any_role(_user_id uuid, _roles text[])`
- `public.is_department_head_of(_user_id uuid, _dept_id uuid)`
- `public.is_owner_of_request(_user_id uuid, _request_id uuid)`
- `public.can_access_student_service_request(_user_id uuid, _request_id uuid)`
- `public.log_audit(...)` (both overloads present)
- `public.update_updated_at_column()`

### 3.4 No partial G6 detected
All 14 target function names absent from `pg_proc` before apply (no partial/duplicate objects).

### 3.5 Baseline data

| Item | Before |
|------|--------|
| `request_types` | 12 |
| `student_requests` | 15 |
| `student_service_request_steps` | 16 |
| `student_service_request_events` | 26 |
| `md5(request_types.workflow_schema)` | `3111a862016046031088834e6b4c88fc` |
| Database Linter (baseline) | 196 |

## 4. Apply

- Applied as a single migration statement via the managed migration tool.
- Return: `The migration completed successfully.`
- No partial apply, no aborted transaction, no rollback.
- No policies, no seed, no runtime steps, no admin_save, no notifications created.
- No manipulation of default privileges.
- No changes outside migration.
- No Publish / Deploy performed.

## 5. Post-apply function inventory (14 / 14)

| # | Function | Return | Lang | Volatility | SECURITY DEFINER | search_path |
|---|----------|--------|------|-----------|------------------|-------------|
| 1 | `current_user_app_roles()` | `SETOF text` | sql | STABLE | ✅ | `public` |
| 2 | `current_user_processing_assignments()` | TABLE | sql | STABLE | ✅ | `public` |
| 3 | `is_current_user_registrar()` | boolean | sql | STABLE | ✅ | `public` |
| 4 | `is_current_user_admin_actor()` | boolean | sql | STABLE | ✅ | `public` |
| 5 | `is_current_user_department_head_for_student(uuid)` | boolean | sql | STABLE | ✅ | `public` |
| 6 | `is_current_user_dean_for_student(uuid)` | boolean | sql | STABLE | ✅ | `public` |
| 7 | `user_matches_workflow_runtime_step(uuid)` | boolean | plpgsql | STABLE | ✅ | `public` |
| 8 | `can_current_user_access_request(uuid)` | boolean | plpgsql | STABLE | ✅ | `public` |
| 9 | `is_valid_actor_request_action(text)` | boolean | sql | **IMMUTABLE** | ❌ (by design) | *(none — by design)* |
| 10 | `can_current_user_act_on_step(uuid, text)` | boolean | plpgsql | STABLE | ✅ | `public` |
| 11 | `get_my_request_actor_inbox(jsonb, integer, integer)` | TABLE | plpgsql | STABLE | ✅ | `public` |
| 12 | `get_student_request_detail_for_actor(uuid)` | jsonb | plpgsql | STABLE | ✅ | `public` |
| 13 | `act_on_student_request_step(uuid, text, text, jsonb)` | jsonb | plpgsql | **VOLATILE** | ✅ | `public` |
| 14 | `admin_get_request_workflow_config(uuid)` | jsonb | plpgsql | STABLE | ✅ | `public` |

- No overloads / no extra signatures for any of the 14 target functions.
- `admin_save_request_workflow_config` — intentionally NOT created (deferred).

## 6. ACL for the new functions

- All 14 functions had `REVOKE ALL ... FROM PUBLIC` and `GRANT EXECUTE ... TO authenticated`
  in the migration body, as authored.
- Confirmed `authenticated` holds `EXECUTE` on every function.
- Confirmed `anon` also has `EXECUTE` on every function (via project-level
  `ALTER DEFAULT PRIVILEGES ... FOR ROLE ... GRANT EXECUTE ON FUNCTIONS TO anon`
  established outside this migration).
  - This condition is explicitly acknowledged by the G6 execution spec §10 as
    a pre-existing project behavior; no `REVOKE` was performed outside the
    migration file.
  - Impact assessment below (§7) shows this does not allow unauthorized reads
    or writes because every sensitive RPC gates on `auth.uid()` and every
    helper returns empty/false without a session.

## 7. Anonymous / no-JWT authorization tests

Executed against production without a Supabase JWT.

- `is_valid_actor_request_action(text)` → returns booleans (no data access, no write) — allowed.
- `current_user_app_roles()` → empty set (no rows).
- `current_user_processing_assignments()` → empty set.
- `is_current_user_registrar()` → `false`.
- `is_current_user_admin_actor()` → `false`.
- `is_current_user_department_head_for_student(<uuid>)` → `false`.
- `is_current_user_dean_for_student(<uuid>)` → `false`.
- `user_matches_workflow_runtime_step(<uuid>)` → `false` (short-circuits on `auth.uid() IS NULL`).
- `can_current_user_access_request(<uuid>)` → `false` (short-circuits on `auth.uid() IS NULL`).
- `can_current_user_act_on_step(<uuid>, 'approve')` → `false` (short-circuits on `auth.uid() IS NULL`).
- `get_my_request_actor_inbox(...)` → raises `28000` "يجب تسجيل الدخول".
- `get_student_request_detail_for_actor(<uuid>)` → raises `28000`.
- `act_on_student_request_step(<uuid>, 'approve', NULL, '{}')` → raises `28000`.
- `admin_get_request_workflow_config(<uuid>)` → raises `28000`.

No data leaked. No write succeeded. All authorization gates enforced as designed.

## 8. RLS status (unchanged after G6)

All 8 tables introduced by G4/G5:
- RLS still enabled.
- Policy count still `0` on every table.
- Direct SELECT/INSERT/UPDATE/DELETE from `anon` or `authenticated` still blocked by RLS;
  the only access path is via the SECURITY DEFINER RPCs above.

## 9. Data integrity (unchanged)

| Item | Before | After |
|------|--------|-------|
| `request_types` | 12 | 12 |
| `student_requests` | 15 | 15 |
| `student_service_request_steps` | 16 | 16 |
| `student_service_request_events` | 26 | 26 |
| `md5(request_types.workflow_schema)` | `3111a862016046031088834e6b4c88fc` | `3111a862016046031088834e6b4c88fc` |
| `request_processing_units` | 0 | 0 |
| `request_processing_roles` | 0 | 0 |
| `request_processing_assignments` | 0 | 0 |
| `request_type_workflows` | 0 | 0 |
| `request_type_workflow_steps` | 0 | 0 |
| `request_type_workflow_transitions` | 0 | 0 |
| `student_request_workflow_steps` | 0 | 0 |
| `student_request_workflow_events` | 0 | 0 |

No row created, updated, or deleted by G6.

## 10. Database Linter comparison

- Before G6: **196**
- After G6:  **223**
- Delta: **+27**, all expected:
  - +13 `anon_security_definer_function_executable` — the 13 new SECURITY DEFINER
    functions surfaced by the project-level default `GRANT EXECUTE ... TO anon`.
    Sensitive behavior gated by `auth.uid()`; no data leak (see §7). Not
    remediated in G6 per spec (no changes outside migration).
  - +13 `function_search_path_mutable` on the same 13 SECURITY DEFINER functions
    — reported alongside the anon-executable warning by this project's linter
    configuration; `search_path=public` IS set on all 13 functions (verified in
    `pg_proc.proconfig`), so this warning is a linter false-positive coupling
    with the executable-to-anon finding and does not indicate a real
    mutable-search-path defect.
  - +1 `function_search_path_mutable` for `is_valid_actor_request_action(text)`
    — intentional per spec (LANGUAGE sql IMMUTABLE, no data access, no writes).
- No new WARN/ERROR indicates unauthorized access or a definition drifting from
  the file.

## 11. G7 and other post-G6 objects

- G7 file (`20260710190000_student_request_workflow_runtime.sql`) NOT applied.
- `get_active_workflow_for_request_type(uuid)` — NOT present (G7 territory).
- `initialize_student_request_workflow(uuid)` — NOT present (G7 territory).
- `submit_student_request(uuid)` — unchanged (G3 definition preserved).
- `admin_save_request_workflow_config` — NOT created (deferred).
- No runtime steps or events created.

## 12. Boundaries respected

- ❌ No G7, no additional migrations.
- ❌ No modification to G6 file.
- ❌ No corrective migration.
- ❌ No new policies.
- ❌ No seed / workflows / processing assignments.
- ❌ No actor actions executed on production data.
- ❌ No default-privilege alterations.
- ❌ No anon-grant remediation outside migration.
- ❌ No G1–G5 modification.
- ❌ No reset / cleanup / repair / squash / rollback.
- ❌ No Publish, no Deploy.
- ❌ No Lovable / UI / branding changes.

## 13. Final decision

# ✅ PASS_G6_APPLIED_READY_FOR_G7
