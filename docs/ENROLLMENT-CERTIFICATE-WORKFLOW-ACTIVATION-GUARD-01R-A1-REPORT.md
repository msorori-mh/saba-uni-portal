# ENROLLMENT-CERTIFICATE-WORKFLOW-ACTIVATION-GUARD-01R-A1 — Report

## Summary

Separated workflow **activation** authorization from **draft save** authorization.

- Activation (`status=active` / `is_active=true`) requires `admin` or `system_admin` in DB RPC + server function.
- Draft save keeps the previous broader policy: `admin`, `system_admin`, `registrar`, `student_affairs`.
- Migration committed for review only — **not applied** to Supabase in this phase.
- No DB writes, no deploy, no changes to enrollment-certificate workflow/steps/assignments.

## Prior authorization

| Action | Roles |
|---|---|
| Draft save (`assert_can_admin_save_request_workflow`) | admin, system_admin, registrar, student_affairs |
| Activate (same helper — no separate gate) | admin, system_admin, registrar, student_affairs |
| Server `saveAdminRequestWorkflowConfig` (all modes) | REQUEST_TYPES_ADMIN_ROLES (same four roles) |

Activation was represented in `p_workflow` by `status='active'` and/or `is_active=true` (normalized to both). Same RPC `admin_save_request_workflow_config` handles draft and activate.

## After this change

| Action | Roles |
|---|---|
| Draft save | **unchanged** — admin, system_admin, registrar, student_affairs |
| Activate | **admin, system_admin only** |

Proof registrar / student_affairs cannot activate:
- DB: `assert_can_activate_request_workflow()` checks only `admin`/`system_admin` and is invoked when `v_is_active OR v_status = 'active'`.
- App: `saveMode === 'activate'` calls `assertRequestWorkflowActivate` with `WORKFLOW_ACTIVATE_ROLES`.
- Unit tests cover role matrix (allow/deny).

Draft remains available to registrar / student_affairs via unchanged `assert_can_admin_save_request_workflow` + `WORKFLOW_DRAFT_SAVE_ROLES`.

## Migration

- File: `supabase/migrations/20260713010000_restrict_workflow_activation_to_admins.sql`
- Applied to production/staging in this phase: **No**
- Functions:
  - **new** `public.assert_can_activate_request_workflow()` (internal; REVOKE from PUBLIC/anon/authenticated)
  - **replaced** `public.admin_save_request_workflow_config(...)` — same signature; adds activate guard after status normalization
  - **unchanged** `public.assert_can_admin_save_request_workflow()`

Preserved RPC behaviors: versioning, fingerprint idempotency, advisory lock, transaction, audit (`workflow_config_activated` / `workflow_config_saved`), retire previous active, no `request_types` updates.

## Application files

- `src/lib/workflow-activation-auth.ts` — pure role policy helpers
- `src/lib/admin-request-workflow.functions.ts` — activate vs draft assert split
- `tests/admin/workflow-activation-admin-guard-01r.test.ts`

## Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `bun test tests/admin/workflow-activation-admin-guard-01r.test.ts` | **11 pass** |
| `bun test tests/admin` | **65 pass** |
| `bun test` | **171 pass** (2 pre-existing errors in enrollment-certificate-workflow-round3 unrelated) |
| `bun test tests/student-requests` | **75 pass** (same 2 pre-existing errors) |
| `git diff --check` | PASS |
| Migration applied | **No** |
| DB writes | **None** |
| Deploy | **None** |
| Merge | **No** |
| Enrollment cert workflow / assignments edited | **No** |

## Remaining risk

Until the migration is applied on Supabase, DB-level activation guard is not live; server-function gate still blocks UI/server callers. Direct RPC activate by registrar would still succeed against old DB until apply.
