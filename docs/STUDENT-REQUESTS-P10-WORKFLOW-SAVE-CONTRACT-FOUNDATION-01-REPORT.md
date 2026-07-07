# STUDENT-REQUESTS-P10-WORKFLOW-SAVE-CONTRACT-FOUNDATION-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Decision:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Contract file** | `src/lib/student-requests/request-workflow-save-contract.ts` |
| **Dry-run server fn** | `prepareStudentRequestWorkflowSave` in `admin-request-workflow.functions.ts` |
| **Admin UI** | `src/routes/admin/request-types.$id.workflow.tsx` — dry-run buttons + disabled save/activate |
| **canSave** | **false** (`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false`) |
| **canValidate** | **true** |
| **canActivate** | **false** (always in P10) |
| **8-type build** | **8/8 buildable** |
| **8-type validation** | **8/8 valid** (warnings documented) |
| **Alias workflows** | **0** |
| **New DB writes** | **None** |
| **Build** | **PASS** |

---

## 2. Existing Save Architecture

| Path | Location | Status | Writes DB? |
|------|----------|--------|------------|
| `admin_get_request_workflow_config` | `admin-request-workflow-rpc.ts` | Read RPC — works when schema applied | Read only |
| `admin_save_request_workflow_config` | **Deferred** in migration 180000 | `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false` | **No** — stub throws |
| `saveAdminRequestWorkflowConfig` | `admin-request-workflow.functions.ts` | Calls stub RPC | **No** (blocked) |
| `rpcAdminSaveRequestWorkflowConfig` | `admin-request-workflow-rpc.ts` | Always throws if called | **No** |
| Direct browser write to workflow tables | Grep `src` | **None** | — |
| Save button in workflow page | `request-types.$id.workflow.tsx` | **Disabled** when `canSave=false` | **No** |
| Fake save toast | Workflow page | **None** — no «تم الحفظ» toast | — |

**Preview only:** P7 `request-workflow-preview-registry.ts`, local draft editor, `RequestWorkflowPreview` component.

**Incomplete save:** `saveAdminRequestWorkflowConfig` exists but delegates to unavailable RPC — intentional P10 guard.

---

## 3. Contract Types

**File:** `src/lib/student-requests/request-workflow-save-contract.ts`

| Type | Fields |
|------|--------|
| `StudentRequestWorkflowSaveInput` | requestTypeId, requestTypeCode, workflowNameAr, isActive, configVersion, expectedUpdatedAt, steps, transitions, parallelGroups |
| `StudentRequestWorkflowStepInput` | stepKey, sequence, labelAr, actorType, roleKey, departmentScope, isParallel, parallelGroupKey, requiresFee, requiresAttachmentReview, producesDocument, isFinalApproval, allowsReject/Return/RequestCompletion, notesAr |
| `StudentRequestWorkflowTransitionInput` | fromStepKey, toStepKey, action, conditionKey, isDefault |
| `StudentRequestWorkflowParallelGroupInput` | groupKey, stepKeys, minSteps |
| `StudentRequestWorkflowValidationIssue` | severity, code, messageAr, stepKey |
| `WorkflowSaveCapability` | available, canValidate, canSave, canActivate, reason, messageAr |
| `StudentRequestWorkflowSaveResult` | status, valid, capability, issues, normalized, summaryAr |

---

## 4. Normalization and Validation

| Function | Purpose |
|----------|---------|
| `normalizeWorkflowSaveInput()` | Trim, normalize type code |
| `validateWorkflowSaveInput()` | Full validation pipeline |
| `buildWorkflowSaveInputFromPreview()` | P7 registry → save payload |
| `buildWorkflowSaveInputFromDraft()` | Local admin draft → save payload |
| `validateWorkflowActors()` | Approved roles, central signatory rules |
| `validateWorkflowTransitions()` | Orphan refs, cycle detection |
| `validateParallelGroups()` | Min 2 steps, shared sequence |
| `validateWorkflowSaveCapability()` | RPC availability gate |
| `validateAllCanonicalWorkflowSaveContracts()` | 8-type matrix |

**Mandatory rules implemented:**
- `normalizeStudentRequestTypeCode()` on all codes
- Alias standalone workflows blocked (`alias_workflow` error)
- Must start with student step
- Unique stepKeys
- Sequence rules for parallel groups
- Transition target existence + cycle detection
- Type-specific: file_withdrawal clearance (4 parallel), grade_statement central signatory, department_transfer target/current dept
- Final approval warning when missing
- Expected path ending per spec
- Central signatories cannot have staff roleKey

---

## 5. Preview-to-Save Mapping

**Single source:** `request-workflow-preview-registry.ts` (P7)

`buildWorkflowSaveInputFromPreview()` maps `CanonicalWorkflowStepDef` → `StudentRequestWorkflowStepInput` without duplicating path definitions.

Generates default transitions and parallel groups from preview structure only.

---

## 6. Capability Detection

Current environment (`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false`):

```json
{
  "available": false,
  "canValidate": true,
  "canSave": false,
  "canActivate": false,
  "reason": "save_rpc_unavailable",
  "messageAr": "حفظ دورة الحياة يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً."
}
```

No browser-side DB probing — capability derived from compile-time flag + server validation.

---

## 7. Dry-Run Server Function

**Name:** `prepareStudentRequestWorkflowSave`  
**File:** `src/lib/admin-request-workflow.functions.ts`

| Check | Result |
|-------|--------|
| `requireSupabaseAuth` | ✓ |
| `assertRequestWorkflowAdmin` (REQUEST_TYPES_ADMIN_ROLES) | ✓ |
| Normalize payload | ✓ |
| `validateWorkflowSaveInput()` | ✓ |
| INSERT/UPDATE/UPSERT/DELETE | **✗ none** |
| `admin_save_request_workflow_config` RPC | **✗ not called** |
| Fake save success log | **✗ none** |

**Sources:** `preview` (from P7 registry) or `draft` (local editor steps).

**Statuses:** VALID, VALID_WITH_WARNINGS, INVALID, SAVE_UNAVAILABLE

---

## 8. Admin UI Behavior

**File:** `src/routes/admin/request-types.$id.workflow.tsx`

| Element | Behavior |
|---------|----------|
| «التحقق من التكوين» | Dry-run on local draft |
| «التحقق من المرجع المعياري» | Dry-run from P7 preview |
| Results panel | Arabic errors/warnings by step |
| «حفظ دورة الحياة» | **Disabled** (`!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE`) |
| «تفعيل دورة الحياة» | **Always disabled** |
| Local draft label | «مسودة محلية غير محفوظة» |
| Message | «تم التحقق من التكوين فقط. لم يتم حفظ أي تغييرات في قاعدة البيانات.» |
| Schema message | `WORKFLOW_SCHEMA_UNAVAILABLE_MSG` |
| Save success toast | **None** |

---

## 9. Eight-Type Validation Matrix

| Type | Buildable | Valid | Status | Steps | Errors | Warnings |
|------|-----------|-------|--------|-------|--------|----------|
| enrollment_suspension | ✓ | ✓ | SAVE_UNAVAILABLE | 7 | 0 | 0 |
| grade_statement_non_graduate | ✓ | ✓ | VALID_WITH_WARNINGS | 8 | 0 | 1 |
| enrollment_certificate | ✓ | ✓ | VALID_WITH_WARNINGS | 6 | 0 | 2 |
| file_withdrawal | ✓ | ✓ | VALID_WITH_WARNINGS | 10 | 0 | 4 |
| excused_absence | ✓ | ✓ | VALID_WITH_WARNINGS | 6 | 0 | 2 |
| grade_appeal | ✓ | ✓ | VALID_WITH_WARNINGS | 4 | 0 | 1 |
| department_transfer | ✓ | ✓ | VALID_WITH_WARNINGS | 9 | 0 | 2 |
| october_exam_entry_form | ✓ | ✓ | VALID_WITH_WARNINGS | 6 | 0 | 3 |

**Summary:** 8/8 buildable · 8/8 valid · 0 alias workflows

---

## 10. Role Gaps

| Gap | Impact | P10 handling |
|-----|--------|--------------|
| `student_affairs` in P7 preview (not in approved 12 roles) | Warning at save mapping | `preview_role_gap` warning — map to manager/specialist at seed |
| **Student activities** (`parallel_activities` in file_withdrawal) | No dedicated app_role | `student_activities_role_gap` warning — does not block contract build |
| Central signatories | Not college staff | `actorType: central_signatory`, roleKey null — enforced |

**Approved roles enforced:** department_head, dean, student_affairs_manager/specialist, graduate_affairs_*, registrar_general, revenue_finance_officer, archive_officer, library_officer, labs_manager, lab_custodian.

---

## 11. Security Review

| Check | Result |
|-------|--------|
| Server-side admin guard | ✓ `assertRequestWorkflowAdmin` |
| No client userId/actor assignment trust | ✓ |
| No role grant via payload | ✓ |
| No direct browser writes | ✓ |
| No SQL error leakage (generic errors on type load) | ✓ |
| No save fallback to Supabase client from browser | ✓ |
| No workflow runtime activation | ✓ |
| No RLS/grant changes | ✓ |

---

## 12. Validation Results

- **Dry-run contract:** All eight official types produce valid normalized payloads from preview.
- **Warnings are documented and expected** — primarily `isFinalApproval` detection (registrar uses `issue_document` not `approve` in preview) and `student_affairs` label gap.
- **No INVALID types** when built from canonical preview.
- **SAVE_UNAVAILABLE** status correctly returned when `canSave=false`.

---

## 13. No-Write Assurance

- ❌ No migrations applied  
- ❌ No Supabase apply  
- ❌ No seed  
- ❌ No workflow save RPC invoked  
- ❌ No workflow activation  
- ❌ No `act_on_student_request_step`  
- ❌ No production publish  
- ❌ No commit/push/PR  

**DB write audit:** No new `insert`/`update`/`upsert`/`delete` lines for workflow tables in P10 diff.

---

## 14. Final Decision

### **PASS_WITH_NOTES**

**Why PASS:** Contract complete, dry-run wired, UI honest (no fake save), 8/8 types buildable and valid, no DB writes, admin guard intact.

**Notes (non-blocking):**
1. `isFinalApproval` heuristic flags many types — preview uses `issue_document` at registrar; refine at save RPC implementation.
2. `student_affairs` preview shorthand → manager/specialist at operational seed.
3. Student activities parallel step — role gap documented.
4. `canSave` remains false until staging apply + `admin_save_request_workflow_config` migration.

**Not NO_GO:** No contradictory workflows, no fake save, no security bypass, all essential steps representable from P7 preview.

---

## Files Modified / Created (P10 scope)

| File | Change |
|------|--------|
| `src/lib/student-requests/request-workflow-save-contract.ts` | **New** |
| `src/lib/admin-request-workflow.functions.ts` | `prepareStudentRequestWorkflowSave` |
| `src/routes/admin/request-types.$id.workflow.tsx` | Dry-run UI, disabled save/activate |
| `docs/STUDENT-REQUESTS-P10-WORKFLOW-SAVE-CONTRACT-FOUNDATION-01-REPORT.md` | **New** |
