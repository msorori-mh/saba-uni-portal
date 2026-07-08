# STUDENT-REQUESTS-P14-RUNTIME-READINESS-GAP-AUDIT-01 Report

**Date:** 2026-07-08
**Repository:** `C:\projects\saba-uni-portal-git`
**Branch / HEAD:** `main` @ `5e4e1e1` (Merge PR #107 — P13 document/archive contract)
**Mode:** Audit only — no migrations, apply, seed, DB writes, workflow activation, publish, commit/push/PR
**Decision:** **READY_WITH_BLOCKERS**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **READY_WITH_BLOCKERS** |
| **Contracts/UI foundation (P9–P13)** | Merged on `main`; dry-run validation operational |
| **All runtime execute flags (effective)** | **false** at current config |
| **`act_on_student_request_step` in app** | **0 calls** in `src` |
| **Student-request migrations** | Authored in repo; **not applied** to live shared DB |
| **Environment gate** | STAGING-ENV-GATE-01 = **NO_GO** (shared Supabase with production) |
| **Build** | **PASS** (2026-07-08, ~43s) |

Contracts and preview UI are foundation-ready. Runtime activation remains blocked by environment safety, unapplied schema, missing seed/config, deferred save RPC, and active legacy write paths.

---

## 2. Merged Phases Status

| Phase | PR | Merge | Key artifacts | Status |
|-------|-----|-------|---------------|--------|
| **P9 Submit** | #103 | ✅ `1c2ffc3` | `student-request-submit-contract.ts`, `submitCanonicalStudentRequest` | Atomic create+submit; `workflowInitialized: false` |
| **P10 Workflow save** | #104 | ✅ `44cfa0e` | `request-workflow-save-contract.ts`, `prepareStudentRequestWorkflowSave` | Dry-run; save/activate disabled |
| **P11 Staff actions** | #105 | ✅ `81b4c3d` | `staff-action-contract.ts`, `prepareStudentRequestStaffAction` | Dry-run; execute disabled |
| **P12 Finance/clearance** | #106 | ✅ `71b4bee` | `request-finance-clearance-contract.ts`, `parallel-clearance-contract.ts`, dry-run server fns | SA amount + revenue confirm model; all execute false |
| **P13 Document/archive** | #107 | ✅ `5e4e1e1` | `request-document-archive-contract.ts`, `RequestDocumentArchivePanel.tsx` | Preview/dry-run; all execute false |

---

## 3. Current Capability Matrix

| Capability function | File | canValidate | Execute flags | Effective values |
|---------------------|------|-------------|---------------|------------------|
| `validateWorkflowSaveCapability()` | `request-workflow-save-contract.ts:410` | `true` | `canSave`, `canActivate` | **`canSave: false`**, **`canActivate: false`** — `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false` |
| `validateStaffActionCapability()` | `staff-action-contract.ts:141` | `true` | `canExecute` | **`false`** (`workflow_runtime_unavailable`) |
| `validateFinanceClearanceCapability()` | `request-finance-clearance-contract.ts:210` | `true` | `canSetStudentAffairsAmount`, `canConfirmRevenueReceipt`, `canExecuteClearance` | **All `false`** |
| `validateClearanceCapability()` | `parallel-clearance-contract.ts:230` | `true` | `canClearMember`, `canCompleteGroup` | **All `false`** (`clearance_schema_unavailable`) |
| `validateDocumentArchiveCapability()` | `request-document-archive-contract.ts:340` | `true` | `canGenerateDocument`, `canRecordSignature`, `canIssueDocument`, `canArchiveRequest` | **All `false`** |

**P10 nuance:** When `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE` is flipped to `true`, `canSave` becomes `true` but `canActivate` remains `false`. Flag is hardcoded `false` in `admin-request-workflow-rpc.ts:9`.

**Grep audit:** No `canExecute: true`, `canActivate: true`, `canGenerateDocument: true`, or `canArchiveRequest: true` in active return paths. Single `canSave: true` exists only in the unreachable branch when save RPC flag is enabled.

---

## 4. Runtime Blockers

| ID | Blocker | Severity |
|----|---------|----------|
| B-1 | Shared Supabase with production — no isolated staging DB | **Critical** |
| B-2 | No confirmed backup/snapshot before apply | **Critical** |
| B-3 | Migrations `20260710130000`–`20260710190000` + P1 foundations **not applied** to live DB | **Critical** |
| B-4 | STAGING-ENV-GATE-01 = **NO_GO** | **Critical** |
| B-5 | `admin_save_request_workflow_config` **DEFERRED** in migration 180000; save RPC stub | **High** |
| B-6 | No workflow/processing-unit seed — empty inboxes after apply | **Medium** |
| B-7 | Dual runtime — legacy JSON workflow still active for some staff actions | **Medium** |
| B-8 | Role gaps: `student_activities`, `department_head` scope, central signatory references | **Medium** |

---

## 5. Database/Migration Status

**Tracked in git (student-request series):**

| Timestamp | File | Purpose |
|-----------|------|---------|
| 20260710130000 | `student_request_types_schema.sql` | Types schema, audience columns |
| 20260710140000 | `student_request_types_rpc_rls.sql` | create/submit RPCs |
| 20260710150000 | `student_request_types_rls_submit_bypass_fix.sql` | RLS fix — **must follow 140000** |
| 20260710160000 | `student_request_processing_units_schema.sql` | Processing units/roles |
| 20260710170000 | `student_request_admin_workflow_schema.sql` | Workflow config tables |
| 20260710180000 | `student_request_actor_rpc_rls.sql` | `act_on_student_request_step`, inbox RPCs |
| 20260710190000 | `student_request_workflow_runtime.sql` | `initialize_student_request_workflow` |
| 20260711000000 | `staff_profiles_university_email.sql` | Staff email column |
| 20260711020000 | `student_requests_p1_foundations.sql` | Service windows, fee assessments, parallel groups, central signatories |

**Apply rule:** Never apply 140000 without 150000 in the same session.

**Live DB:** Student-request migration series not applied (per P8/P14 gate reports).

---

## 6. Seed/Configuration Gaps

| Area | Status |
|------|--------|
| `request_type_workflows` / steps | No seed — admin must configure or dedicated seed phase |
| `request_processing_units` / role assignments | Empty until admin/seed |
| `student_request_service_windows` | Table in P1 migration; no seed |
| `central_signatory_references` | No seed |
| `student_request_fee_assessments` | Schema only; no contract write path |
| Eligibility RPC stubs (P1) | Not wired to canonical submit gate |
| 8-type workflow previews | Code-only (`request-workflow-preview-registry.ts`); not persisted |

---

## 7. Role and Signatory Gaps

| Gap | Location | Impact |
|-----|----------|--------|
| **`student_activities`** | `parallel-clearance-contract.ts`, `staff-action-contract.ts` | `student_activities_role_gap` — no dedicated `app_role` |
| **`department_head` scope** | Dry-run actors use `departmentIds: []` in server fns | Dept-scoped validation incomplete |
| **Central signatory** | Spec in contracts; DB table empty | Central steps cannot execute |
| **`registrar_general` vs university registrar** | Document/archive contract | College vs central separation documented |
| **`student_activities` not in `APPROVED_WORKFLOW_ROLE_KEYS`** | `request-workflow-save-contract.ts` | Workflow save validation gap |

---

## 8. Workflow Runtime Gaps

| Component | Migration | App wiring |
|-----------|-----------|------------|
| `act_on_student_request_step` | ✅ 180000 | ❌ **0 calls in `src`** |
| `get_my_request_actor_inbox` | ✅ 180000 | ✅ Attempt + legacy fallback |
| `initialize_student_request_workflow` | ✅ 190000 | ❌ Submit returns `workflowInitialized: false` |
| `admin_save_request_workflow_config` | ❌ DEFERRED | Stub; flag `false` |
| Legacy `performRequestAction` | N/A | ✅ Still writes via JSON workflow path |

---

## 9. Student/Staff/Admin UI Readiness

| Surface | Readiness | Notes |
|---------|-----------|-------|
| Student submit | **Functional (legacy/canonical path)** | `submitCanonicalStudentRequest` writes DB |
| Staff inbox | **Preview/dry-run** | P11–P13 panels; execute disabled |
| Admin workflow editor | **Validate only** | Save/activate disabled |
| Admin legacy requests | **Legacy writes** | `updateStudentRequestStatus` in `student-requests.lazy.tsx` |
| Dynamic forms / eligibility | **Foundation** | Guards in place; RPC enforcement pending migrations |

---

## 10. Finance/Clearance Readiness

| Capability | Contract | Storage (migration) | Execution |
|------------|----------|---------------------|-----------|
| Set SA amount | ✅ P12 | `student_request_fee_assessments` | ❌ No write fn |
| Confirm revenue receipt | ✅ P12 | Same | ❌ |
| Parallel clearance | ✅ P12 | `student_request_parallel_groups` + members | ❌ |
| Payment gate in workflow RPC | N/A | Not wired | Blocked |

UI: `StaffRequestFinanceClearancePanel.tsx` — dry-run only, execute disabled. No in-portal payment or proof upload.

---

## 11. Document/Archive Readiness

| Capability | Contract | Storage | Execution |
|------------|----------|---------|-----------|
| Generate document | ✅ P13 validate | No dedicated runtime table wired | ❌ |
| Record signature | ✅ Registry | `central_signatory_references` (empty) | ❌ |
| Issue document | ✅ Validate | Legacy `official_documents` (transcript only) | ❌ New types |
| Archive handoff | ✅ Validate | No archive write path | ❌ |

UI: `RequestDocumentArchivePanel.tsx` in `StaffRequestDetailPanel.tsx`. No PDF, upload, or `createSignedUrl` in P13 paths.

---

## 12. Security Review

| Check | Result |
|-------|--------|
| P10–P13 call `act_on_student_request_step` | ✅ None |
| P10–P13 server fns write DB | ✅ None (read-only SELECT for context) |
| Client-trusted fields rejected | ✅ P11–P13 |
| Legacy write paths remain | ⚠️ Intentional pre-cutover |
| Apply to shared prod DB | ❌ Blocked |
| Storage writes in new contract paths | ✅ None |
| Notifications/audit in new paths | ✅ None |

**Legacy writes (pre-cutover):** `submitCanonicalStudentRequest`, `performRequestAction`, `updateStudentRequestStatus`, `cancelStudentServiceRequest`.

**Distinction:** New contract paths = validation only. Legacy paths = still active for existing flows.

---

## 13. Build Result

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (~43s, 2026-07-08) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Restored |
| `git status --short` | Clean (report file only if untracked after write) |

---

## 14. Recommended Next Phases (ordered)

1. **Staging environment gate** — Separate Supabase project or explicit apply gate with confirmed PITR backup.
2. **Migration apply batch** — 130000→150000→160000→170000→180000→190000→110000→11020000 (single controlled session).
3. **Processing units + workflow seed** — Minimal seed for 8 canonical types and role assignments.
4. **Enable save RPC** — Implement `admin_save_request_workflow_config`; flip `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE`.
5. **Workflow init on submit** — Wire `initialize_student_request_workflow`; truthful `workflowInitialized`.
6. **Staff action execution** — Wire `act_on_student_request_step` behind `canExecute`; deprecate legacy for canonical types.
7. **Finance/clearance execution** — Persist SA amounts and parallel clearance to P1 tables.
8. **Document/archive execution** — PDF generation, signatory resolution, archive storage.
9. **Role resolution** — `student_activities` app_role policy, `department_head` scope, central signatory seed.
10. **Service windows + eligibility** — Wire P1 RPCs to submit gate.

---

## 15. Final Decision

### **READY_WITH_BLOCKERS**

Foundation contracts (P9–P13) and preview UI are merged and correctly disable execution. Runtime activation requires safe staging environment, migration apply, seed/config, RPC wiring, and legacy path cutover — none of which were performed in this audit.

---

## Appendix A — Grep Audit (2026-07-08)

### Runtime / execute flags

```
git grep "act_on_student_request_step|updateStudentRequestStatus|canExecute: true|..." -- src
```

| Pattern | Result |
|---------|--------|
| `act_on_student_request_step` | **0 matches** |
| `updateStudentRequestStatus` | Legacy admin only |
| `canSave: true` | Dead branch only (`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE=false`) |
| Other execute flags `: true` | **0 matches** |

### Writes in student-requests paths

| Location | Writes? |
|----------|---------|
| `src/lib/student-requests/*` | **No DB writes** — contracts + dry-run SELECT |
| `src/components/student-requests/*` | **UI only** |
| `src/lib/student-affairs.functions.ts` | **Yes** — P9 submit + legacy actions |
| `src/lib/admin-student-requests.functions.ts` | **Yes** — legacy status updates |

---

## Appendix B — No-Write / No-Activation Assurance

This audit performed:

- ✅ Read-only code and migration review
- ✅ Grep scans for unintended execution
- ✅ Build verification
- ❌ No migration apply
- ❌ No Supabase seed
- ❌ No DB writes
- ❌ No workflow runtime activation
- ❌ No production publish
- ❌ No commit/push/PR

---

*End of P14 Runtime Readiness Gap Audit Report*
