# STUDENT-REQUESTS-P9-INTEGRATION-REVIEW-PR-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Base:** `main` @ `960c8ee`  
**Decision:** **PASS_WITH_NOTES** (no blockers — Draft PR approved)

---

## 1. Decision

| Item | Result |
|------|--------|
| **Integration review** | **PASS_WITH_NOTES** |
| **Blockers** | **None** |
| **Draft PR** | **Created** — branch `codex/student-requests-p9-submit-consolidation` |
| **Environment** | No migrations, seed, DB writes, or production publish |

---

## 2. Git pre-review state

| Check | Result |
|-------|--------|
| Branch | `main` |
| HEAD | `960c8ee` Merge PR #102 |
| Modified (P9) | 5 source files + 1 new contract |
| Untracked excluded | P8/P8-adjacent docs not in PR |
| `git diff --check` | **PASS** (no conflict markers / whitespace errors) |

---

## 3. Integration checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `submitCanonicalStudentRequest` is sole active new-request entry | **PASS** | `student.requests.new.tsx` calls only `submitCanonicalStudentRequest` |
| No separate create → submit in student new UI | **PASS** | Triple path removed; single «إرسال الطلب» button |
| No direct browser insert on active routes | **PASS** | Grep: inserts only in deprecated `StudentRequestsSection.tsx` (not imported) |
| `student_id` not trusted from client | **PASS** | `currentStudentProfile(context.userId)` in server handlers |
| Request type code normalized | **PASS** | `normalizeStudentRequestTypeCode()` in contract + server |
| `form_data` sanitized (no File/base64/undefined) | **PASS** | `sanitizeFormDataForSubmit()` in contract; used client + server |
| No fake attachment claims | **PASS** | Rejects placeholders; blocks types with `requires_attachment` |
| Submit button disabled during execution | **PASS** | `submitInFlightRef` + `submitting` / `resubmitInFlightRef` |
| No success toast before await completes | **PASS** | Toast after `submitFn` resolves |
| No workflow init / `act_on_student_request_step` | **PASS** | `initializeSteps` not called; `workflowInitialized: false` always |
| `StudentRequestsSection.tsx` unchanged | **PASS** | Not in diff |

---

## 4. Notes (non-blocking)

1. **Resubmit wrapper:** `student.requests.$id.tsx` calls `submitStudentServiceRequest`, which delegates to `submitCanonicalStudentRequestCore` — acceptable thin wrapper for returned requests.
2. **Dead code:** `initializeSteps()` remains defined in `student-affairs.functions.ts` but is **not invoked** — safe to remove in a future cleanup PR.
3. **Legacy server fns:** `createStudentServiceRequest` / `saveStudentServiceRequestDraft` retained for explicit draft scenarios; not exposed on `/student/requests/new`.
4. **Eligibility RPC unavailable:** Server fails closed with «خدمة قيد التحديت» — not full P1 eligibility, consistent with P8/P9 scope.
5. **Admin fallback inserts:** Server-side `supabaseAdmin` fallback when RPCs missing — never browser; required for pre-migration compatibility.

---

## 5. Direct insert audit

```text
git grep "\.from(['\"]student_requests['\"]).*insert" -- src
```

| Location | Count | Status |
|----------|-------|--------|
| `src/components/portal/StudentRequestsSection.tsx` | 8 | Deprecated — **not imported** anywhere in `src` |
| Active routes / server canonical path | 0 browser | Server fallback only via `supabaseAdmin` when RPC unavailable |

```text
git grep "create_student_request|submit_student_request|submitCanonicalStudentRequest" -- src
```

| Symbol | Usage |
|--------|-------|
| `submitCanonicalStudentRequest` | `student.requests.new.tsx` (new), `student-affairs.functions.ts` (definition + core) |
| `submitStudentServiceRequest` | `student.requests.$id.tsx` (resubmit → delegates to core) |
| `create_student_request` / `submit_student_request` | `student-request-rpc.ts` wrappers only (server-side RPC layer) |

---

## 6. Build and post-build checks

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0, ~67s) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Executed — no manual routeTree changes committed |

---

## 7. PR scope — files included

1. `src/lib/student-requests/student-request-submit-contract.ts` *(new)*
2. `src/lib/student-affairs.functions.ts`
3. `src/lib/student-request-rpc.ts`
4. `src/routes/student.requests.new.tsx`
5. `src/routes/student.requests.$id.tsx`
6. `src/routes/mobile.student.requests.tsx`
7. `docs/STUDENT-REQUESTS-P9-SUBMIT-FLOW-CONSOLIDATION-01-REPORT.md`
8. `docs/STUDENT-REQUESTS-P9-INTEGRATION-REVIEW-PR-01-REPORT.md`

**Excluded:** P8 reports, enrollment suspension design doc, post-merge routetree audit, `StudentRequestsSection.tsx`, migrations, `routeTree.gen.ts`.

---

## 8. No-write / no-production assurance

- No migrations applied  
- No Supabase apply  
- No seed  
- No test request creation  
- No workflow runtime activation  
- No production publish  
- Draft PR only — **not merged**
