# ADMIN-STAFF-SAFE-DELETE-AND-PROCESSING-ROLES-CRUD-UI-01O — Report

## Summary

Admin staff management now supports safe staff hard-delete / deactivate and CRUD for request processing roles, behind `admin` / `system_admin` server functions only. No migrations, no production DB writes, no deploy.

## R1 remediation (2026-07-13)

Synced branch with `origin/main` via merge (`--no-edit`, no rebase / force push). Addressed four review blockers:

1. **`staff_profile_departments` blocks hard delete** — counted in `hardBlockingCount` with clear Arabic reason; hard delete path no longer auto-deletes department junction rows.
2. **Audit failures return success + warning** — `logProcessingRoleAudit` checks insert `{ error }`; create/update/activate/deactivate/delete and staff deactivate use `attachAuditWarning` (UI toast success + warning, no mutation retry).
3. **Removed redundant `user_roles` DELETE** — documented `user_roles.user_id → auth.users ON DELETE CASCADE` from migration `20260531205946_…`; Auth delete proceeds directly to `staff_profiles` delete.
4. **Role DELETE verifies row count** — `.select("id")`; zero rows → idempotent/conflict without fresh deleted audit; exactly one row required for success audit.

## Files modified / added

### Added
- `src/lib/admin-staff-deletion.core.ts` — pure preflight / confirmation / outcome / audit-warning policy
- `src/lib/admin-staff-deletion.functions.ts` — `getStaffDeletionPreflight`, `deleteStaffProfileSafely`, `deactivateStaffProfile`
- `src/lib/admin-processing-roles.core.ts` — code validation + usage safety + delete result helpers
- `src/lib/admin-processing-roles.functions.ts` — processing role list/usage/CRUD/delete
- `src/components/admin/staff-management/StaffDeleteDialog.tsx`
- `src/components/admin/staff-management/ProcessingRolesTab.tsx`
- `tests/admin/staff-deletion-preflight.test.ts`
- `tests/admin/staff-deletion-orchestration.test.ts`
- `tests/admin/processing-roles-crud-policy.test.ts`
- `tests/admin/staff-management-ui-01o.test.ts`
- `docs/ADMIN-STAFF-SAFE-DELETE-AND-PROCESSING-ROLES-CRUD-UI-01O-REPORT.md`

### Modified
- `src/routes/admin/staff-management.tsx` — tabs (الموظفون / الأدوار الوظيفية), delete + profile deactivate actions

## UI routes

- Path unchanged: `/admin/staff-management`
- Tab 1: الموظفون (existing create/edit/account flows preserved)
- Tab 2: الأدوار الوظيفية

## Server functions and permissions

All require authenticated `admin` or `system_admin` via `assertAnyRole` (role read server-side). Reject anonymous / student / faculty / registrar-only.

| Function | Purpose |
|---|---|
| `getStaffDeletionPreflight` | Fail-closed dependency inspection |
| `deleteStaffProfileSafely` | Hard delete staff (+ Auth when linked) |
| `deactivateStaffProfile` | Set `status=inactive` only |
| `listRequestProcessingRolesForAdmin` | Roles + units + usage counts |
| `getRequestProcessingRoleUsage` | Detailed usage + safety |
| `createRequestProcessingRole` | Create with code rules + active unit |
| `updateRequestProcessingRole` | Edit fields; code immutable; unit move gated |
| `setRequestProcessingRoleActive` | Activate/deactivate with usage gates |
| `deleteRequestProcessingRoleSafely` | Delete unused role with code confirmation |

Service role remains in `client.server.ts` only (server functions). Not imported by client routes/components.

## Staff hard-delete rules

`canHardDelete=false` when:
- current user (self-delete)
- `admin` / `system_admin` roles
- linked faculty profile
- processing assignments / assigned workflow steps / **staff_profile_departments** / position assignments / notifications / audit logs
- any dependency query failure (fail-closed)

`staff_profile_departments > 0` adds:
«الموظف مرتبط بأقسام أو نطاقات إدارية؛ عطّل الملف بدل الحذف النهائي.»

Hard delete does **not** auto-delete dependent rows. Re-run preflight on the server; if links appear, fail and suggest deactivate.

Confirmation requires exact full name + matching employee number. With `user_id`, `deleteAuthUser` must be true. Auth delete uses `supabaseAdmin.auth.admin.deleteUser` only on the server. After Auth delete, `user_roles` are removed by FK CASCADE — no separate DELETE.

### Partial failure
If Auth deletes but staff profile delete fails: `partialFailure=true`, dialog stays open, clear Arabic warning. No automatic Auth re-create. Idempotent when Auth already missing.

### Deactivate
Sets `status=inactive`. Does **not** delete Auth, `user_roles`, or history. Audit failure after successful deactivate returns `ok: true` + `warning` (does not claim deactivate failed). UI documents that profile deactivate does not automatically block login.

## Processing role rules

- Code: `^[a-z][a-z0-9_]*$`, lowercase, unique, immutable after create
- Create only into existing **active** unit
- Unit change / delete / deactivate blocked when workflow steps or assignments exist
- Protected enrollment-cert role codes listed in `ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES` (cannot deactivate/delete while referenced)
- Delete uses `.select("id")` and requires exactly one deleted row (or clear idempotent already-missing result without new audit)

## Audit

Uses existing `audit_logs` insert pattern (`entity_type` string; action types free string):
- `staff_profile_deleted`, `staff_profile_deactivated`
- `processing_role_created|updated|activated|deactivated|deleted`

Metadata includes `source: "admin_staff_management"`. Primary mutation success + audit failure → `ok/success` + Arabic `warning`; UI toast success + warning; **no automatic mutation retry**.

## Verification

| Check | Result |
|---|---|
| `git merge --no-edit origin/main` | PASS (merge commit; no conflicts) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `bun test tests/admin` | PASS (54 tests) |
| focused R1 test files | PASS (42 across 4 files in last focused run; full admin suite 54) |
| student-requests suite | 75 pass; 2 pre-existing errors in `enrollment-certificate-workflow-round3.test.ts` (unrelated) |
| `git diff --check` | PASS |
| Migrations in this branch | **None** |
| Production DB writes | **None** |
| Deploy / Publish | **None** |
| New PR | **No** — updates PR #121 only |
| Auto-merge | **No** |

## Enrollment certificate safety

Feature sources do not reference production workflow id `8a0ef6b8-5f51-4d3e-9f25-3b2ba51b74e1`. Protected role codes preserved. Request type `enrollment_certificate` unchanged.

## Remaining risks

1. Hard delete is blocked whenever historical `audit_logs` / notifications / department links exist — many real profiles will only support deactivate.
2. Auth + DB delete are not a single transaction (documented partialFailure path).
3. Profile `inactive` does not ban Auth by itself (intentional; documented in UI).
4. Repo-wide `bun run lint` remains noisy due to CRLF/prettier baseline, independent of this PR.

## Recommended next step

Re-review PR #121 → merge after human approval → smoke-test on staging with a disposable staff profile.
