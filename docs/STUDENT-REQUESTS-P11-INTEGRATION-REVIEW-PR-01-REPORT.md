# STUDENT-REQUESTS-P11-INTEGRATION-REVIEW-PR-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Review task:** STUDENT-REQUESTS-P11-INTEGRATION-REVIEW-PR-01

---

## 1. Decision

**PASS_WITH_NOTES** — No blockers for draft PR. Staff action contract foundation is validation-only; execution remains disabled; no new DB writes, workflow RPC, migrations, or production publish in scope.

---

## 2. Base commit

| Item | Value |
|------|--------|
| Branch at review start | `main` |
| Base commit | `44cfa0e4ec454280285a3b1c1259a4aa3d219bde` |
| Latest main | Merge PR **#104** — workflow save contract foundation (P10) |

Preflight: no `supabase/migrations/*` changes; working tree limited to P11 staff-action files and reports; `src/routeTree.gen.ts` restored after build (not staged).

---

## 3. Files included (PR scope)

| # | Path |
|---|------|
| 1 | `src/lib/student-requests/staff-action-contract.ts` |
| 2 | `src/lib/student-requests/staff-inbox.functions.ts` |
| 3 | `src/components/student-requests/StaffRequestActionPanel.tsx` |
| 4 | `src/components/student-requests/StaffRequestDetailPanel.tsx` |
| 5 | `src/lib/student-requests/staff-inbox-ui.ts` |
| 6 | `docs/STUDENT-REQUESTS-P11-STAFF-ACTION-CONTRACT-FOUNDATION-01-REPORT.md` |
| 7 | `docs/STUDENT-REQUESTS-P11-INTEGRATION-REVIEW-PR-01-REPORT.md` |

**Excluded (verified not staged):** `src/routeTree.gen.ts`, `supabase/migrations/*`, `StudentRequestsSection.tsx`, other phase reports.

---

## 4. Six staff actions

`STAFF_ACTION_TYPES`: `approve`, `reject`, `return_to_student`, `request_completion`, `forward_to_next_step`, `add_note`.

- Client cannot supply `actorUserId`, `actorRole`, `nextActorId` (`never` on input type).
- Note required: `reject`, `return_to_student`, `request_completion` (note or completion requirements).
- Aliases: `forward` → `forward_to_next_step`, `return` → `return_to_student`.

---

## 5. Ten scenario results

| # | Scenario | Expected | Actual | Pass |
|---|----------|----------|--------|------|
| 1 | approve على خطوة مراجعة | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 2 | reject بلا ملاحظة | INVALID | INVALID | ✅ |
| 3 | reject مع ملاحظة | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 4 | return_to_student بلا ملاحظة | INVALID | INVALID | ✅ |
| 5 | add_note دون تغيير status | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 6 | actor غير مخول | UNAUTHORIZED | UNAUTHORIZED | ✅ |
| 7 | stale expectedUpdatedAt | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |
| 8 | duplicate clientActionId | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |
| 9 | central_signatory بواسطة موظف كلية | INVALID | INVALID | ✅ |
| 10 | parallel group غير مكتمل | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |

**Matrix:** `runStaffActionScenarioMatrix()` — **10/10 PASS** (`PASS true`).

---

## 6. canValidate / canExecute

From `validateStaffActionCapability()`:

| Field | Value |
|-------|--------|
| `available` | `false` |
| `canValidate` | **`true`** |
| `canExecute` | **`false`** |
| `reason` | `workflow_runtime_unavailable` |

Dry-run results always set `executed: false`.

---

## 7. DB write audit

**Diff audit** (`git diff -U0` + insert/update/upsert/delete/act_on/updateStudentRequestStatus/audit/notification on added lines):

- **No matches** — no new write paths or workflow/legacy status calls in the diff.

**Symbol grep (`src`):**

| Symbol | Result |
|--------|--------|
| `prepareStudentRequestStaffAction` | `staff-inbox.functions.ts`, `StaffRequestActionPanel.tsx` |
| `updateStudentRequestStatus` | Legacy only: `admin-student-requests.functions.ts`, `student-requests.lazy.tsx` |
| `act_on_student_request_step` | **Not present in `src`** |

**Note:** `prepareStudentRequestStaffAction` performs a **read-only** `SELECT` on `student_requests` for actor/request context; validation is pure after load. No insert/update/upsert/delete, audit, or notifications.

---

## 8. Legacy `updateStudentRequestStatus`

| Path | Status |
|------|--------|
| `admin-student-requests.functions.ts` | Unchanged export; legacy admin |
| `student-requests.lazy.tsx` | Still wired to legacy UI |
| P11 `StaffRequestActionPanel` | Does **not** call legacy update |
| `prepareStudentRequestStaffAction` | Does **not** call legacy update |

---

## 9. Role gaps (notes only)

| Gap | P11 handling |
|-----|----------------|
| Student activities steps vs `student_affairs` app role | Warning `student_activities_role_gap`; no new `app_role` |
| `student_affairs` → processing keys | `mapAppRolesToProcessingRoleKeys()` maps to manager/specialist |
| `department_head` department scope | `departmentIds` empty on server dry-run → scope warning |
| Parallel clearance (`file_withdrawal`) | Preview parallel flags + `parallel_group_incomplete` warning |

---

## 10. Build result

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (built ~25s, exit 0) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Applied; not committed |

---

## 11. Confirmations (no production / DB impact from P11 PR)

- ✅ No migrations modified or staged  
- ✅ No seed changes  
- ✅ No new DB **writes** in P11 code paths (read-only request lookup for dry-run context only)  
- ✅ No workflow runtime execution (`act_on_student_request_step` not called)  
- ✅ No notifications or audit writes  
- ✅ No production publish  
- ✅ Execute UI disabled; no approval/rejection success toasts implying applied changes  

---

## 12. PR outcome

Draft PR to `main` on branch `codex/student-requests-p11-staff-action-contract` — **not merged** (per task).

---

*End of P11 Integration Review PR-01 Report*
