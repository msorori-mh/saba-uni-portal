# STUDENT-REQUESTS-P9-SUBMIT-FLOW-CONSOLIDATION-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Decision:** **PASS — single canonical submit path**

---

## 1. Decision

| Item | Result |
|------|--------|
| **Architecture** | **Atomic create + submit** via one server function (`submitCanonicalStudentRequest`) |
| **Dual submit removed** | **Yes** — legacy `initializeSteps` + `workflow_schema` patching removed from submit path |
| **Draft on /new** | Removed from UI (single «إرسال الطلب» button). `createStudentServiceRequest` retained server-side for future draft-only use |
| **RPC unavailable** | Session RPC first; server-side admin fallback (never browser insert). Eligibility RPC failure → fail closed |

---

## 2. Previous paths (inventory)

| # | Path | Location | Behavior (before) |
|---|------|----------|-------------------|
| 1 | **Triple client submit** | `src/routes/student.requests.new.tsx` | `createStudentServiceRequest` → `saveStudentServiceRequestDraft` → `submitStudentServiceRequest` (3 round-trips) |
| 2 | **Create draft RPC** | `createStudentServiceRequest` in `student-affairs.functions.ts` | `rpc(create_student_request)` → draft row |
| 3 | **Save draft UPDATE** | `saveStudentServiceRequestDraft` | Session-scoped UPDATE on `student_requests` (draft/returned only) |
| 4 | **Submit + dual workflow** | `submitStudentServiceRequest` | `rpc(submit_student_request)` **then** `initializeSteps` + patch `current_step_index` / `current_role_key` (legacy JSON workflow) |
| 5 | **Resubmit from detail** | `src/routes/student.requests.$id.tsx` | Called `submitStudentServiceRequest` with no double-click guard |
| 6 | **RPC wrappers** | `src/lib/student-request-rpc.ts` | Thin `create_student_request` / `submit_student_request` |
| 7 | **Mobile list** | `src/routes/mobile.student.requests.tsx` | Links to `/student/requests/new` — no local submit |
| 8 | **Legacy portal (deprecated)** | `src/components/portal/StudentRequestsSection.tsx` | Direct browser `student_requests.insert` — **unchanged per scope** |

---

## 3. Canonical path

| Item | Value |
|------|-------|
| **Server entry** | `submitCanonicalStudentRequest` / `submitCanonicalStudentRequestCore` |
| **File** | `src/lib/student-affairs.functions.ts` |
| **Contract** | `src/lib/student-requests/student-request-submit-contract.ts` |
| **Client (new request)** | `src/routes/student.requests.new.tsx` → `submitCanonicalStudentRequest` only |
| **Client (resubmit)** | `src/routes/student.requests.$id.tsx` → `submitStudentServiceRequest` → delegates to core |

### Server flow

1. `requireSupabaseAuth` — session verified  
2. `currentStudentProfile(userId)` — student resolved server-side (never trust client `student_id`)  
3. `validateStudentRequestSubmitInput` — normalize type code, form_data, attachments  
4. `assertStudentEligibleForRequestType` — RPC eligibility; unavailable → «خدمة قيد التحديث»  
5. Create draft via `create_student_request` RPC **or** admin fallback  
6. Submit via `submit_student_request` RPC **or** admin fallback  
7. Audit + event log — **no** `initializeSteps`, **no** workflow runtime init  
8. Return `{ submitted: true, workflowInitialized: false }`

---

## 4. Create vs submit

**Chosen:** Atomic **create + submit** in one server call for new requests.

- Eliminates redundant `saveStudentServiceRequestDraft` between create and submit on `/new`
- `existingRequestId` supports resubmit (returned/draft) without a second architecture
- `createStudentServiceRequest` remains for explicit draft-only scenarios (not exposed on `/new` UI)

---

## 5. Dedup / double-click prevention

| Layer | Mechanism |
|-------|-----------|
| **UI** | `submitInFlightRef` + `submitting` state disables button and blocks re-entry |
| **Client hint** | `clientRequestId` (UUID) tracked in `completedClientIdsRef` — in-memory only, **not** DB idempotency |
| **Success** | No retry after success (navigation away) |
| **Resubmit** | `resubmitInFlightRef` + `resubmitting` on `$id` page |

---

## 6. form_data

Handled in `student-request-submit-contract.ts`:

- `sanitizeFormDataForSubmit()` strips `File`/`Blob`, base64 data URLs, `_filePlaceholder` objects, `undefined`, non-serializable values
- HTML tags stripped from string fields
- `_formCode` / `_formVersion` added when form registry definition exists
- `buildStudentRequestSubmitPayload()` preserves `description` and `student_notes` (human summary via `buildFormValuesSummary`)

---

## 7. Attachments

- **No new upload system** built
- Server rejects types with `requiresAttachment` when no real attachment metadata provided
- UI blocks submit for `requires_attachment` types with clear Arabic notice
- Mobile hides «تقديم» link for attachment-required types
- File fields in dynamic form remain display-only placeholders (no fake uploaded files in `form_data`)

---

## 8. Eligibility

| Layer | Behavior |
|-------|----------|
| **UI** | Existing P5 guards (`canSubmitStudentRequestFromUi`, `StudentRequestEligibilityNotice`) |
| **Server** | `assertStudentEligibleForRequestType` via `get_available_request_types_for_current_student` |
| **RPC unavailable** | Fail closed — «خدمة الطلبات قيد التحديث» (needs_verification **not** treated as eligible) |
| **Form** | Server re-validates via `validateStudentRequestSubmitInput` + registry |

---

## 9. Security

| Control | Status |
|---------|--------|
| No browser `student_requests` insert from active routes | ✅ |
| No client `student_id` trust | ✅ — profile from `auth.uid()` |
| RPC auth via session client | ✅ |
| Admin fallback only on server (`supabaseAdmin`) | ✅ |
| No raw SQL errors to UI | ✅ — mapped messages |
| No sensitive payload logging | ✅ |
| No workflow/actor init on submit | ✅ — dual path removed |
| Legacy codes normalized before persist | ✅ — `normalizeStudentRequestTypeCode` |

---

## 10. Modified files

| File | Action |
|------|--------|
| `src/lib/student-requests/student-request-submit-contract.ts` | **New** — contract types + normalize/validate/payload |
| `src/lib/student-affairs.functions.ts` | **Modified** — `submitCanonicalStudentRequest`, eligibility assert, RPC/fallback helpers; submit path deduped |
| `src/lib/student-request-rpc.ts` | **Modified** — RPC unavailable detection; create/submit return union |
| `src/routes/student.requests.new.tsx` | **Modified** — single submit button → canonical path |
| `src/routes/student.requests.$id.tsx` | **Modified** — resubmit double-click guard |
| `src/routes/mobile.student.requests.tsx` | **Modified** — attachment UX + unified path note |
| `docs/STUDENT-REQUESTS-P9-SUBMIT-FLOW-CONSOLIDATION-01-REPORT.md` | **New** |

**Not modified (per scope):** `StudentRequestsSection.tsx`, `src/routeTree.gen.ts`, migrations

---

## 11. Build result

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | **Done** |

### Remaining direct browser inserts (excluding `StudentRequestsSection.tsx`)

**None** in active student routes. Grep shows inserts only in deprecated `StudentRequestsSection.tsx`.

Server-side admin fallback insert exists in `student-affairs.functions.ts` (`fallbackCreateStudentRequestDraft`) — used only when RPC functions are missing, never from browser.

---

## 12. Confirmations

| Item | Status |
|------|--------|
| Migrations applied | ❌ **No** |
| Seed / test DB writes | ❌ **No** |
| Workflow runtime init | ❌ **No** — removed from submit |
| Git commit / push / PR | ❌ **No** |

---

## 13. Return summary (parent agent)

- **Decision:** Atomic create+submit via `submitCanonicalStudentRequest`  
- **Canonical path:** `submitCanonicalStudentRequest` in `src/lib/student-affairs.functions.ts`  
- **Dual submit removed:** Yes (`initializeSteps` + legacy step patch removed)  
- **Double-click prevention:** `submitInFlightRef` + disabled button + `clientRequestId` hint  
- **Remaining browser inserts:** Only deprecated `StudentRequestsSection.tsx`  
- **Build:** PASS  
- **Modified files:** 6 source files + this report
