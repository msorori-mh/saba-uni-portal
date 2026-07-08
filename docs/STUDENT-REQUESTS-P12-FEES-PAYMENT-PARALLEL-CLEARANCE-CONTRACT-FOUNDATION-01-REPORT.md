# STUDENT-REQUESTS-P12 — Student Affairs Amount, Revenue Receipt Confirmation & Parallel Clearance Foundation

**Task ID:** STUDENT-REQUESTS-P12-STUDENT-AFFAIRS-AMOUNT-REVENUE-CONFIRMATION-ALIGNMENT-01  
**Date:** 2026-07-08  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Decision:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Finance contract** | `src/lib/student-requests/request-finance-clearance-contract.ts` |
| **Clearance contract** | `src/lib/student-requests/parallel-clearance-contract.ts` |
| **Dry-run server fn** | `prepareStudentRequestFinanceClearanceAction`, `prepareStudentRequestParallelClearance` |
| **Staff UI** | `StaffRequestFinanceClearancePanel.tsx` — validate + disabled execute |
| **canValidate** | **true** |
| **canSetStudentAffairsAmount / canConfirmRevenueReceipt / canExecuteClearance** | **false** (`finance_clearance_runtime_unavailable`) |
| **Finance clearance scenarios** | **14/14 PASS** |
| **Parallel clearance scenarios** | **12/12 PASS** (unchanged matrix) |
| **New DB writes** | **None** |
| **Build** | **PASS** |

---

## 2. Operational Decision (Aligned Model)

| Actor | Action | Portal behavior |
|-------|--------|-----------------|
| **student_affairs_manager / student_affairs_specialist** | `set_student_affairs_amount` | Manually sets positive amount (YER display default) — no auto calculation |
| **Student** | View only | Sees «المبلغ المطلوب سداده» — pays **outside** portal, no upload |
| **revenue_finance_officer** | `confirm_revenue_received` | Confirms receipt only — **cannot** modify amount, no hafiza/proof |
| **Parallel clearance (file_withdrawal)** | Member confirm | Revenue confirms SA-set amount receipt; library/labs/activities parallel |

**Removed from active P12:** `submit_payment_proof`, `verify_payment`, `reject_payment_proof`, payment upload UI, mandatory hafiza, in-portal payment, auto fee calculation, accounting.

---

## 3. Files Created / Modified

| File | Change |
|------|--------|
| `src/lib/student-requests/request-finance-clearance-contract.ts` | **Created** — aligned finance clearance contract |
| `src/lib/student-requests/request-fee-payment-contract.ts` | **Removed** — superseded by aligned contract |
| `src/lib/student-requests/parallel-clearance-contract.ts` | **Modified** — finance member label, central_signatory rejection, dry-run msg |
| `src/lib/student-requests/staff-inbox.functions.ts` | **Modified** — `prepareStudentRequestFinanceClearanceAction` replaces fee payment fn |
| `src/components/student-requests/StaffRequestFinanceClearancePanel.tsx` | **Rewritten** — SA amount + revenue receipt UI |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | **Modified** — integrates panel (prior P12) |

**Not modified:** migrations, `StudentRequestsSection.tsx`, `src/routeTree.gen.ts` (manual), seed, publish.

---

## 4. Approved / Disapproved Actions

### Approved

- `set_student_affairs_amount`
- `confirm_revenue_received`
- `approve_clearance`
- `reject_clearance`
- `request_clearance_completion`
- `mark_parallel_member_complete`
- `evaluate_parallel_group_completion`

### NOT Approved (rejected at validation)

- `assess_fee`
- `confirm_fee_assessment`
- `mark_fee_not_required`
- `submit_payment_proof`
- `verify_payment`
- `reject_payment_proof`

---

## 5. Capability

```json
{
  "canValidate": true,
  "canSetStudentAffairsAmount": false,
  "canConfirmRevenueReceipt": false,
  "canExecuteClearance": false,
  "reason": "finance_clearance_runtime_unavailable",
  "messageAr": "تحديد المبلغ وتأكيد الاستلام يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً."
}
```

---

## 6. Finance Clearance Contract Types

| Type | Purpose |
|------|---------|
| `StudentAffairsAmountInput` | SA sets amount — no client studentId/actorUserId/actorRole |
| `StudentAffairsAmountResult` | Dry-run result with `amountYer` |
| `RevenueReceiptConfirmationInput` | Revenue confirms — no amount/hafiza/proof/File |
| `RevenueReceiptConfirmationResult` | Dry-run receipt confirmation |
| `FinanceClearanceCapability` | Validation-only capability |
| `FinanceClearanceValidationIssue` | error / warning / info |
| `ParallelClearanceGroup` | Re-export from parallel contract |
| `ParallelClearanceMember` | Re-export from parallel contract |

---

## 7. Server Dry-Run

| Function | Guards | Read-only SELECT |
|----------|--------|------------------|
| `prepareStudentRequestFinanceClearanceAction` | `requireSupabaseAuth`, `assertStaffInboxAccess`, `userRoles()` | `student_requests` (id, request_type) |
| `prepareStudentRequestParallelClearance` | Same | `student_requests` (id, request_type) |

**Finance actions:** `set_student_affairs_amount`, `confirm_revenue_received`

**Explicitly NOT called:** `act_on_student_request_step`, insert/update/upsert/delete, audit, notification.

---

## 8. UI Behavior

### Student Affairs
- Tab: «تحديد المبلغ المطلوب سداده»
- Input: positive amount (YER), optional note
- Validate (dry-run) + **disabled** «حفظ المبلغ»

### Revenue
- Tab: «تأكيد استلام المبلغ»
- Label: «المبلغ المطلوب استلامه»
- Optional note only — **disabled** «تأكيد استلام المبلغ»

### Messages
- «يتم تحديد المبلغ من شؤون الطلاب — الطالب يرى «المبلغ المطلوب سداده» فقط.»
- «المبلغ المطلوب سداده — يُسدَّد خارج البوابة. لا دفع ولا رفع إثبات داخل البوابة.»
- «تم التحقق فقط. لم يتم حفظ مبلغ أو تأكيد استلام أو إخلاء طرف في قاعدة البيانات.»

**NO:** payment upload, hafiza fields, proof verification toasts.

---

## 9. Parallel Clearance (file_withdrawal) — KEPT

| memberKey | roleKey | Responsibility |
|-----------|---------|----------------|
| finance | `revenue_finance_officer` | Confirm receipt of SA-set amount (does **not** set amount) |
| library | `library_officer` | Library clearance |
| labs | `labs_manager` / `lab_custodian` | Labs clearance |
| activities | `student_affairs` | Student activities (role gap) |

Rules: group incomplete until all confirm; no actual closure in P12.

---

## 10. Validation Matrix — `runFinanceClearanceScenarioMatrix()` (14 scenarios)

| # | Scenario | Expected | Actual | Pass |
|---|----------|----------|--------|------|
| 1 | set_student_affairs_amount — no amount | INVALID | INVALID | ✅ |
| 2 | positive amount | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 3 | negative amount | INVALID | INVALID | ✅ |
| 4 | non-SA role | UNAUTHORIZED | UNAUTHORIZED | ✅ |
| 5 | confirm_revenue from revenue_finance_officer | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 6 | confirm from non-revenue | UNAUTHORIZED | UNAUTHORIZED | ✅ |
| 7 | confirm with new amount | INVALID | INVALID | ✅ |
| 8 | submit_payment_proof | UNSUPPORTED_ACTION | UNSUPPORTED_ACTION | ✅ |
| 9 | File/base64 payload | UNSUPPORTED_ACTION | UNSUPPORTED_ACTION | ✅ |
| 10 | file_withdrawal all members | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |
| 11 | file_withdrawal student_activities role gap | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |
| 12 | complete group before members | INVALID | INVALID | ✅ |
| 13 | central_signatory as clearance member | INVALID | INVALID | ✅ |
| 14 | labs_manager/lab_custodian mapping | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |

**Matrix:** **14/14 PASS**

---

## 11. Role Gaps (Notes Only)

| Gap | Handling |
|-----|----------|
| Student activities clearance | `student_activities_role_gap` — uses `student_affairs`; no new app_role |
| `labs_manager` vs `lab_custodian` | Both accepted for labs member (`labs_role_alternatives` info) |
| DB tables not applied | `finance_clearance_runtime_unavailable` — capability unavailable |
| No in-portal payment | Student pays outside portal; revenue confirms offline receipt |

---

## 12. Cancelled Keywords Grep

```powershell
git grep -n "submit_payment_proof|verify_payment|reject_payment_proof|payment proof|hafizaNumber|base64|File" -- src/lib/student-requests src/components/student-requests
```

| Match | Context |
|-------|---------|
| `request-finance-clearance-contract.ts` | **Rejection rules only** — disapproved actions list, `hafiza_rejected`, `base64_rejected` |
| `DynamicStudentRequestForm.tsx` | Pre-existing general form File handling — **not P12 payment** |
| `request-form-registry.ts` | Pre-existing File strip for form_data — **not P12 payment** |
| `student-request-submit-contract.ts` | Pre-existing base64/File rejection for submit — **not P12 payment** |

**No active** `submit_payment_proof`, `verify_payment`, `reject_payment_proof`, payment proof UI, or hafiza input fields in P12 finance/clearance paths.

---

## 13. DB Write Audit

```powershell
git diff -U0 | Select-String -Pattern '^\+.*\b(insert|update|upsert|delete)\b|^\+.*act_on_student_request_step|^\+.*audit|^\+.*notification'
```

**Result:** **No matches**

---

## 14. Build and Git Checks

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0, ~113s) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Restored |
| `npx tsx -e runFinanceClearanceScenarioMatrix()` | **14/14 PASS** |

---

## 15. Confirmation — No Real Execution

- ✅ No insert / update / upsert / delete in new paths
- ✅ No `act_on_student_request_step`
- ✅ No actual amount save, receipt confirm, or clearance closure
- ✅ No file upload execution; no payment recording
- ✅ No audit/notification writes
- ✅ Execute buttons disabled; capability flags false
- ✅ NO commit, NO PR (per task constraints)

---

## 16. Decision: **PASS_WITH_NOTES**

Aligned P12 foundation reflects operational decision: SA sets amount manually, student sees amount only (off-portal payment), revenue confirms receipt without amount modification. Notes: schema not applied on shared prod, student activities role gap, scenarios 10/11 emit `VALID_WITH_WARNINGS` due to documented role-gap infos (expected).

---

*End of P12 Student Affairs Amount, Revenue Receipt Confirmation & Parallel Clearance Foundation Report*
