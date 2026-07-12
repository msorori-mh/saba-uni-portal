# ADMIN-STAFF-SAFE-DELETE-AND-PROCESSING-ROLES-CRUD-UI-01O — Report

## Summary

Admin staff management now supports safe staff hard-delete / deactivate and CRUD for request processing roles, behind `admin` / `system_admin` server functions only. No migrations, no production DB writes, no deploy.

## Files modified / added

### Added
- `src/lib/admin-staff-deletion.core.ts` — pure preflight / confirmation / outcome policy
- `src/lib/admin-staff-deletion.functions.ts` — `getStaffDeletionPreflight`, `deleteStaffProfileSafely`, `deactivateStaffProfile`
- `src/lib/admin-processing-roles.core.ts` — code validation + usage safety wrappers
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
- processing assignments / assigned workflow steps / position assignments / notifications / audit logs
- any dependency query failure (fail-closed)

Owned `staff_profile_departments` are counted and cascaded before profile delete; they alone do not block.

Confirmation requires exact full name + matching employee number. With `user_id`, `deleteAuthUser` must be true. Auth delete uses `supabaseAdmin.auth.admin.deleteUser` only on the server.

### Partial failure
If Auth deletes but staff profile delete fails: `partialFailure=true`, dialog stays open, clear Arabic warning. No automatic Auth re-create. Idempotent when Auth already missing.

### Deactivate
Sets `status=inactive`. Does **not** delete Auth, `user_roles`, or history. UI documents that profile deactivate does not automatically block login (login ban remains via existing `setActive` / «تعطيل الدخول»).

## Processing role rules

- Code: `^[a-z][a-z0-9_]*$`, lowercase, unique, immutable after create
- Create only into existing **active** unit
- Unit change / delete / deactivate blocked when workflow steps or assignments exist
- Protected enrollment-cert role codes listed in `ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES` (cannot deactivate/delete while referenced)

## Audit

Uses existing `audit_logs` insert pattern (`entity_type` string; action types free string):
- `staff_profile_deleted`, `staff_profile_deactivated`
- `processing_role_created|updated|activated|deactivated|deleted`

Metadata includes `source: "admin_staff_management"`. Audit failure after successful delete returns a warning (does not claim delete failed).

## Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `bun test tests/admin` | **46 pass / 0 fail** |
| `bun test` (full) | 152 pass; 2 pre-existing errors in `enrollment-certificate-workflow-round3.test.ts` (migration marker mismatch; unrelated) |
| `git diff --check` | PASS (no whitespace errors in feature files) |
| `bun run lint` (repo-wide) | FAIL — mass pre-existing prettier/CRLF noise across repo |
| Targeted eslint on changed TS/TSX | Run during verification; no blocking issues expected from feature logic |
| Migrations in this branch | **None** |
| Production DB writes | **None** |
| Deploy / Publish | **None** |
| `types.ts` manual edits | **None** |
| `stash@{0}` | **Not used** |

## Enrollment certificate safety

Feature sources do not reference production workflow id `8a0ef6b8-5f51-4d3e-9f25-3b2ba51b74e1`. Protected role codes preserved. Request type `enrollment_certificate` unchanged.

## Remaining risks

1. Hard delete is blocked whenever historical `audit_logs` / notifications exist for the staff/user — many real profiles will only support deactivate.
2. Auth + DB delete are not a single transaction (documented partialFailure path).
3. Profile `inactive` does not ban Auth by itself (intentional; documented in UI).
4. Repo-wide `bun run lint` is currently noisy due to CRLF/prettier baseline, independent of this PR.

## Recommended next step

Review PR → merge after human approval → smoke-test on staging with a disposable staff profile (never production Abdullah / s001 without an explicit ops ticket).
