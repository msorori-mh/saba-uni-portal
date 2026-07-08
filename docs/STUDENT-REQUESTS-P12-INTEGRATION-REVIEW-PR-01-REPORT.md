# STUDENT-REQUESTS-P12 — Integration Review (PR-01)

**Task ID:** STUDENT-REQUESTS-P12-INTEGRATION-REVIEW-PR-01  
**Date:** 2026-07-08  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Base:** `main` (includes merged PR #105)  
**Decision:** **PASS_WITH_NOTES** (no blockers for draft PR)

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Integration decision** | **PASS_WITH_NOTES** |
| **Blockers** | None |
| **Finance contract** | `request-finance-clearance-contract.ts` (sole P12 finance source) |
| **Parallel clearance** | `parallel-clearance-contract.ts` (foundation; file_withdrawal) |
| **Server dry-run** | `prepareStudentRequestFinanceClearanceAction`, `prepareStudentRequestParallelClearance` |
| **Staff UI** | `StaffRequestFinanceClearancePanel` in `StaffRequestDetailPanel` |
| **Finance scenario matrix** | **14/14 PASS** |
| **Parallel scenario matrix** | **12/12 PASS** |
| **Build** | **PASS** |
| **New DB writes in diff** | **None** |
| **Draft PR** | Created on branch `codex/student-requests-p12-amount-revenue-clearance-contract` |

---

## 2. Preflight Verification

| Check | Result |
|-------|--------|
| Current branch | `main` |
| `origin/main` HEAD | Merge PR #105 (`81b4c3d`) — staff action contract foundation |
| Migrations modified | **No** |
| `request-fee-payment-contract.ts` | **Not present** on `main` or working tree (never tracked in this repo) |
| Sole P12 finance contract | `request-finance-clearance-contract.ts` |
| `git diff --check` | **PASS** (whitespace) |
| `routeTree.gen.ts` | Restored after build; **not staged** |

---

## 3. Approved Scope Alignment

| Requirement | Implementation |
|-------------|----------------|
| SA sets amount manually (`set_student_affairs_amount`) | Contract + staff dry-run + UI tab |
| Student sees required amount only; pay outside portal | `STUDENT_AMOUNT_DISPLAY_MSG`; no payment UI |
| Revenue confirms receipt (`confirm_revenue_received`); cannot modify amount | Typed `never` fields; validation rejects amount/hafiza/file/base64 |
| No in-portal payment, proof upload, auto fee calc, accounting | Disapproved actions list + `UNSUPPORTED_ACTION` |
| Parallel clearance for `file_withdrawal` (foundation) | 4 members; validate-only server fn + UI |

---

## 4. Files in Scope (Integration PR)

| File | Status |
|------|--------|
| `src/lib/student-requests/request-finance-clearance-contract.ts` | **Added** |
| `src/lib/student-requests/parallel-clearance-contract.ts` | **Added** |
| `src/lib/student-requests/staff-inbox.functions.ts` | **Modified** |
| `src/components/student-requests/StaffRequestFinanceClearancePanel.tsx` | **Added** |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | **Modified** (panel integration) |
| `docs/STUDENT-REQUESTS-P12-FEES-PAYMENT-PARALLEL-CLEARANCE-CONTRACT-FOUNDATION-01-REPORT.md` | **Added** |
| `docs/STUDENT-REQUESTS-P12-INTEGRATION-REVIEW-PR-01-REPORT.md` | **Added** (this report) |

**Explicitly excluded:** `src/routeTree.gen.ts`, migrations, `StudentRequestsSection.tsx`, unrelated phase docs.

---

## 5. Approved / Disapproved Actions

**Approved (7):** `set_student_affairs_amount`, `confirm_revenue_received`, `approve_clearance`, `reject_clearance`, `request_clearance_completion`, `mark_parallel_member_complete`, `evaluate_parallel_group_completion`.

**Disapproved (6) — validation rejects / unsupported:** `assess_fee`, `confirm_fee_assessment`, `mark_fee_not_required`, `submit_payment_proof`, `verify_payment`, `reject_payment_proof`.

---

## 6. Amount & Revenue Rules

- Amount must be **positive** finite number; missing/invalid → `INVALID`.
- **Student affairs** roles (`student_affairs_manager`, `student_affairs_specialist`; admin bypass) only for set amount.
- **Revenue** (`revenue_finance_officer`; admin bypass) only for confirm receipt.
- Revenue path rejects client-supplied **amount**, **hafizaNumber**, **paymentProofReference**, **file**, **fileBase64**.
- Display currency: **YER** label only (no FX/accounting).

---

## 7. Capability Flags

```json
{
  "canValidate": true,
  "canSetStudentAffairsAmount": false,
  "canConfirmRevenueReceipt": false,
  "canExecuteClearance": false,
  "reason": "finance_clearance_runtime_unavailable"
}
```

Parallel clearance capability: `canValidate: true`; `canClearMember` / `canCompleteGroup`: **false** (`clearance_schema_unavailable`).

---

## 8. Server Dry-Run Review

| Function | Auth | DB |
|----------|------|-----|
| `prepareStudentRequestFinanceClearanceAction` | `requireSupabaseAuth`, `assertStaffInboxAccess`, `userRoles()` | **SELECT** `student_requests` (id, request_type) only |
| `prepareStudentRequestParallelClearance` | Same | **SELECT** `student_requests` (id, request_type) only |

- Actions exposed: `set_student_affairs_amount`, `confirm_revenue_received` (finance); `validate_group` / `member_action` (parallel).
- **Not invoked:** `act_on_student_request_step`, audit, notification, insert/update/upsert/delete.

---

## 9. Staff UI Integration

- Panel mounted in `StaffRequestDetailPanel` above `StaffRequestActionPanel`.
- Finance: SA amount + revenue confirm tabs; **Validate** enabled; **Execute** buttons **disabled** with runtime-unavailable tooltip.
- Copy reflects off-portal payment and dry-run-only behavior; **no** proof upload controls or hafiza fields.
- Parallel: group/member dry-run; execute disabled; lists four `file_withdrawal` members.

---

## 10. Parallel Clearance (`file_withdrawal`)

| memberKey | roleKey | Note |
|-----------|---------|------|
| finance | `revenue_finance_officer` | Receipt confirm (not amount set) |
| library | `library_officer` | |
| labs | `labs_manager` (+ `lab_custodian` alt) | Info `labs_role_alternatives` |
| activities | `student_affairs` | Warning `student_activities_role_gap` |

Group cannot close from client (`closedByUserId` rejected); premature group `cleared` with pending members → `INVALID`.

---

## 11. Finance Validation Matrix (`runFinanceClearanceScenarioMatrix`)

**Result: 14/14 PASS** (`PASS true` via `npx tsx`).

Scenarios cover: missing/negative amount, role authorization, revenue confirm without amount override, unsupported payment proof/base64, parallel group warnings, role gap, invalid group completion, central_signatory rejection, labs mapping note.

---

## 12. Legacy Scope Grep & Old Contract

| Query | Result |
|-------|--------|
| `request-fee-payment-contract` in `src`/`docs` | **No matches** |
| Disapproved keywords in P12 paths | Only in `request-finance-clearance-contract.ts` as **rejection/disapproval** definitions and scenario tests |
| Pre-existing `base64` handling | `student-request-submit-contract.ts` (form submit sanitizer — not P12 payment) |

---

## 13. DB Write Audit

```powershell
git diff -U0 | Select-String -Pattern '^\+.*\b(insert|update|upsert|delete)\b|^\+.*act_on_student_request_step|^\+.*audit|^\+.*notification'
```

**Result:** **No matches** in staged/working diff for new P12 paths.

---

## 14. Build & Automated Checks

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (~109s) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Applied |
| `runFinanceClearanceScenarioMatrix()` | **14/14 PASS** |
| `runParallelClearanceScenarioMatrix()` | **12/12 PASS** |

---

## 15. Integration Decision, PR, Production Impact

**Decision:** **PASS_WITH_NOTES** — aligned contract integrated with staff inbox dry-run and UI; execution intentionally unavailable pending schema/runtime.

**Notes (non-blocking):**
- `student_activities_role_gap` — activities member uses `student_affairs` processing role; no dedicated app_role in P12.
- Scenarios 10/11 emit `VALID_WITH_WARNINGS` for documented role-gap/info codes (expected).
- Finance/clearance DB schema not applied; capability flags remain false.

**Production / DB impact:** **None** from this PR — read-only SELECT for request type lookup, validation-only responses, disabled execute, no migrations.

**PR:** Draft to `main`; **do not merge** until execution schema and staging sign-off.

---

*End of STUDENT-REQUESTS-P12-INTEGRATION-REVIEW-PR-01 report*
