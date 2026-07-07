# STUDENT-REQUESTS-P11-STAFF-ACTION-CONTRACT-FOUNDATION-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Decision:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Contract file** | `src/lib/student-requests/staff-action-contract.ts` |
| **Dry-run server fn** | `prepareStudentRequestStaffAction` in `staff-inbox.functions.ts` |
| **Staff UI** | `StaffRequestActionPanel.tsx` — validate button + disabled execute |
| **canValidate** | **true** |
| **canExecute** | **false** (`reason: workflow_runtime_unavailable`) |
| **10 scenarios** | **10/10 PASS** |
| **New DB writes** | **None** |
| **act_on_student_request_step** | **Not called** |
| **updateStudentRequestStatus (new path)** | **Not used** |
| **Build** | **PASS** |

---

## 2. Files Created / Modified

| File | Change |
|------|--------|
| `src/lib/student-requests/staff-action-contract.ts` | **Created** — central contract, validation, dry-run, scenario matrix |
| `src/lib/student-requests/staff-inbox.functions.ts` | **Modified** — `prepareStudentRequestStaffAction` server dry-run |
| `src/components/student-requests/StaffRequestActionPanel.tsx` | **Modified** — theoretical actions, local note, validate button |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | **Modified** — passes request context props to action panel |
| `src/lib/student-requests/staff-inbox-ui.ts` | **Modified** — `forward` → `forward_to_next_step` in action defs |

**Not modified (per constraints):** `supabase/migrations/*`, `StudentRequestsSection.tsx`, `src/routeTree.gen.ts` (manual), seed, publish.

---

## 3. Six Staff Actions

| Action | Validation rules | Status change (dry-run only) |
|--------|------------------|------------------------------|
| `approve` | Actor authorized for step; parallel group must be complete for final transition; no jump to `completed` without final approval | Theoretical forward / step complete |
| `reject` | **Requires note** | Theoretical `rejected` |
| `return_to_student` | **Requires note** | Theoretical return to student step |
| `request_completion` | **Requires note OR completionRequirements** | Theoretical pending completion |
| `forward_to_next_step` | No manual `nextActorId`; actor must match step role | Theoretical next step |
| `add_note` | Note required; **no status change** | Status unchanged |

Aliases accepted in normalization: `forward` → `forward_to_next_step`, `return` → `return_to_student`.

Client-supplied `actorUserId`, `actorRole`, `nextActorId` are typed as `never` and rejected if present.

---

## 4. Capability

```json
{
  "available": false,
  "canValidate": true,
  "canExecute": false,
  "reason": "workflow_runtime_unavailable",
  "messageAr": "تنفيذ إجراءات الموظفين يحتاج تطبيق مخطط دورة الحياة على بيئة آمنة أولاً."
}
```

`validateStaffActionCapability()` is compile-time / pure — no runtime RPC probe.

---

## 5. Server Dry-Run (`prepareStudentRequestStaffAction`)

| Guard | Implementation |
|-------|----------------|
| Session | `requireSupabaseAuth` middleware |
| Staff inbox access | `assertStaffInboxAccess(context.userId)` |
| Actor identity | `context.userId` + `userRoles()` — **never trusts client actor fields** |
| Request context | Read-only `SELECT` on `student_requests` (id, status, request_type, updated_at, current_role_key) |
| Workflow preview | `getCanonicalWorkflowPreview()` for step role / parallel / central signatory |
| Execution | `validateStaffActionInput()` only |

**Explicitly NOT called:** `act_on_student_request_step`, `updateStudentRequestStatus`, insert/update/upsert/delete.

---

## 6. UI Behavior (`StaffRequestActionPanel`)

- Shows theoretical actions from `getAllowedActionsForStepContext()` (fallback to legacy UI defs).
- Local note textarea — not persisted to DB in P11.
- **«التحقق من الإجراء»** — calls `prepareStudentRequestStaffAction` (dry-run).
- **«تنفيذ الإجراء»** — always **disabled** with `workflow_runtime_unavailable` tooltip.
- Persistent message: **«تم التحقق من الإجراء فقط. لم يتم تنفيذ أي تغيير على الطلب.»**
- No success toast implying approval/rejection was applied.
- Dry-run result panel shows `status`, `summaryAr`, and validation issues.

---

## 7. Validation Rules Implemented

| Rule | Code / behavior |
|------|-----------------|
| reject requires note | `reject_note_required` → INVALID |
| return_to_student requires note | `return_note_required` → INVALID |
| request_completion requires note or requirements | `completion_input_required` → INVALID |
| add_note no status change | `add_note_no_status_change` (info) |
| forward_to_next_step no manual actor | `manual_next_actor_rejected` |
| central_signatory not by college staff | `central_signatory_staff_blocked` → INVALID |
| department_head scoped to department | `department_head_scope` warning when `departmentIds` empty |
| parallel group incomplete | `parallel_group_incomplete` → warning; blocks final transition |
| no completed without final approval | `final_approval_required` |
| expectedUpdatedAt stale | `stale_request_version` → warning |
| duplicate clientActionId | `duplicate_client_action_id` → warning (foundation) |
| expectedStepStatus mismatch | `stale_step_status` → warning |

Concurrency fields supported in input/result for future optimistic locking: `expectedUpdatedAt`, `expectedStepStatus`, `clientActionId`.

---

## 8. Ten Scenario Results

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

**Matrix runner:** `runStaffActionScenarioMatrix()` in `staff-action-contract.ts` — **10/10 PASS**.

---

## 9. Role Gaps (Notes Only)

| Gap | Handling |
|-----|----------|
| `student_affairs` on student-activities steps | Warning `student_activities_role_gap` — no dedicated `app_role`; future processing assignment needed |
| `student_affairs` preview label vs `student_affairs_manager` / `student_affairs_specialist` | `mapAppRolesToProcessingRoleKeys()` maps `student_affairs` app role to manager/specialist keys |
| `department_head` department scope | `departmentIds` array on actor — empty in P11 dry-run server path → scope warning only |
| Parallel clearance (file_withdrawal) | Validated via preview `isParallel` + `parallelGroupComplete` flag |

No new `app_role` values introduced in P11.

---

## 10. Legacy `updateStudentRequestStatus`

| Location | Status |
|----------|--------|
| `admin-student-requests.functions.ts:573` | **Unchanged** — legacy admin list view |
| `student-requests.lazy.tsx` | **Still uses** legacy update for old admin UI |
| `StaffRequestActionPanel` (P11) | **Does NOT call** `updateStudentRequestStatus` |
| `prepareStudentRequestStaffAction` | **Does NOT call** `updateStudentRequestStatus` |

Dual path intentional: new staff inbox uses contract dry-run; legacy route preserved until P12+ execution phase.

---

## 11. DB Write Audit

```powershell
git diff -U0 | Select-String -Pattern '^\+.*\b(insert|update|upsert|delete)\b|^\+.*act_on_student_request_step|^\+.*updateStudentRequestStatus'
```

**Result:** No matches — **no new DB writes, no workflow RPC, no legacy status update in diff**.

```powershell
git grep -n "act_on_student_request_step\|updateStudentRequestStatus\|prepareStudentRequestStaffAction" -- src
```

| Symbol | Occurrences |
|--------|-------------|
| `prepareStudentRequestStaffAction` | `staff-inbox.functions.ts`, `StaffRequestActionPanel.tsx` |
| `updateStudentRequestStatus` | `admin-student-requests.functions.ts`, `student-requests.lazy.tsx` (legacy only) |
| `act_on_student_request_step` | **None in src** |

---

## 12. Build and Git Checks

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** (no whitespace errors) |
| `git restore --worktree src/routeTree.gen.ts` | Restored (build artifact not committed) |
| `git status --short` | 4 modified + 1 new (contract) |

---

## 13. Confirmation — No Real Execution

- ✅ No `act_on_student_request_step` invocation
- ✅ No `updateStudentRequestStatus` from new staff action panel
- ✅ No insert / update / upsert / delete in new code paths
- ✅ No migrations, seed, Supabase apply, notifications, or audit writes
- ✅ Execute button disabled; capability `canExecute = false`
- ✅ UI message states validation-only outcome

---

## 14. Next Phase (Out of Scope for P11)

1. Wire `act_on_student_request_step` behind `canExecute` gate when workflow runtime is applied.
2. Populate `departmentIds` on server actor context from staff profile / assignment tables.
3. Persist `clientActionId` deduplication server-side.
4. Enable execute button when `validateStaffActionCapability().canExecute === true`.
5. Integration PR after STAGING-ENV-GATE passes.

---

*End of P11 Staff Action Contract Foundation Report*
