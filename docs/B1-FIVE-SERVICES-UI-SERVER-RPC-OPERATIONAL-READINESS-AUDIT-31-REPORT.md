# PORTAL-B1-FIVE-SERVICES-UI-SERVER-RPC-OPERATIONAL-READINESS-AUDIT-31 — REPORT

**MODE:** LONG INDEPENDENT SOURCE REVIEW AND LOCAL UI TESTING  
**REPOSITORY:** `msorori-mh/saba-uni-portal`  
**WORKTREE:** `C:\projects\saba-uni-portal-b1-ui-rpc-audit-31`  
**BRANCH:** `review/b1-five-services-ui-server-rpc-31`  
**AUTHORITATIVE MAIN:** `3b743d7237b40219ae3d172581afc7faa0ab2b48`  
**REVIEW HEAD (at audit start):** `3b743d7237b40219ae3d172581afc7faa0ab2b48`  
**SCOPE:** Source-only UI → server → RPC operational readiness for the five B1 services. No production access. No merge. Runtime source unmodified (review-first).

---

## FINAL DECISION

```
HOLD_B1_FIVE_SERVICES_UI_SERVER_RPC_SOURCE_MIGRATION_TERMINAL_STUDENT_VISIBLE_TRUE
```

**Rationale:** Every required UI/server/RPC authorization, routing, double-submit, stale-step, error-redaction, RTL/mobile, and `enrollment_certificate` isolation proof **passes** in source. The single required proof that fails is launch-hiding at the **migration-chain terminal state**: ordered `supabase/migrations` that `SET student_visible` for the five B1 codes end at `true` (`20260727114619`, then `20260727115111`), with no later migration restoring `false`. Per AGENTS.md this audit must not mutate `request_types.student_visible`; the finding is documented and gated by pack-31 tests.

UI availability still fail-closes when the backend omits the services (`mapBackendRowsToB1Availability([])` → all `studentVisible=false`). Production read-only attestations elsewhere report the five remain hidden — this HOLD is about **source-chain terminal consistency**, not a UI bypass.

---

## 1. Five services

| Canonical code | Legacy aliases | Fee policy |
|---|---|---|
| `enrollment_suspension` | — | `FREE_NO_PAYMENT` |
| `excused_absence` | `absence_excuse` | `FREE_NO_PAYMENT` |
| `department_transfer` | `transfer` | `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` |
| `final_chance` | `extra_chance` | `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` |
| `file_withdrawal` | — | `FREE_NO_PAYMENT` |

Authority: `src/lib/student-requests/request-service-adapter.ts` (`B1_CANONICAL_CODES`, `B1_WORKFLOWS`, `B1_FEE_POLICIES`).

---

## 2. Required proofs (matrix)

| # | Required proof | Result | Evidence |
|---|---|---|---|
| 1 | B1 requests always mount the B1-specific panel | **PASS** | `StaffRequestDetailPanel` → `isB1StaffRoutedRequestType` → `B1StaffStepActionSection` |
| 2 | Generic executor cannot bypass B1 routing | **PASS** | Client guard + Zod `superRefine` + authoritative DB re-read before `act_on_student_request_step` |
| 3 | Missing `requestTypeCode` fails closed | **PASS** | `z.string().trim().min(1)` + authoritative `GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR` |
| 4 | Buttons derive from server capability / configured action | **PASS** | `resolveB1StaffActionContract` + single `allowedAction` button; no `getAllowedActionsForStepContext` |
| 5 | No alternative action button | **PASS** | One `<button>` in employee panel; `confirm_payment` on revenue card only |
| 6 | Direct assignee enforced server-side | **PASS** | `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`; payment `EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED` |
| 7 | No admin/registrar/dean general bypass | **PASS** | Act-on uses `can_current_user_act_on_step` only; payment comment forbids role-pool/admin/registrar/dean bypass |
| 8 | Loading/error/retry cannot double-submit | **PASS** | `inFlightRef` in section + panel; concurrent handler tests |
| 9 | Stale views cannot act on transitioned steps | **PASS** | Active-step check; predecessor incomplete; `STALE_VERSION` Arabic reload message |
| 10 | PII/backend errors not rendered | **PASS** | `b1AdapterErrorMessageAr` + `sanitizeStaffErrorMessage` |
| 11 | Mobile 360px / Arabic RTL — no hidden/overlapping actions | **PASS** | `dir="rtl"`, `min-h-11`, `min-w-0`, no absolute/fixed overlays in B1 action surfaces; prior visual QA PASS |
| 12 | Services hidden until launch approval | **HOLD** | UI fail-closed **PASS**; migration terminal `student_visible=true` **FAIL** |
| 13 | `enrollment_certificate` unaffected | **PASS** | Outside `B1_CANONICAL_CODES`; generic path + issue-document button retained |

---

## 3. End-to-end chains

### 3.1 Student create / submit

```
B1StudentServiceList / student.requests.b1.$service
→ B1StudentRequestForm (requires studentVisible && runtimeAvailable)
→ getB1UiAdapter().submitB1Request
→ submitB1UiRequestFn
   schema: { requestId:uuid, expectedUpdatedAt:string }.strict()
   guards: owned profile, draft|returned*, canonical B1 code
→ rpcSubmitB1StudentRequestAtomic
→ submit_b1_student_request_atomic(
     p_request_id, p_canonical_code, p_form_data,
     p_expected_updated_at, p_attachment_ids)
→ response: { requestId, requestNumber, submittedAt, updatedAt }
→ UI success / confirmation (no staff-inbox invalidation on this path)
```

### 3.2 Staff queue / detail

```
staff.b1-requests / StaffInboxShell
→ fetchStaffInbox / fetchStaffRequestDetail (staff-inbox.functions.ts)
→ StaffRequestDetailPanel
   requestTypeCode from actor-detail RPC mapping
→ isB1StaffRoutedRequestType(detail.requestTypeCode)
   → B1: B1StaffStepActionSection
   → non-B1: StaffRequestActionPanel (generic review executor)
```

### 3.3 B1 configured staff action (non-payment)

```
B1StaffStepActionSection
→ resolveB1StaffActionContract({
     requestTypeCode, stepId, configuredActionType=active.actionType,
     allowedAction, isActionable })
→ B1EmployeeActionPanel (exactly one button = configured action)
→ createB1StaffActHandler (inFlightRef)
→ adapter.actOnB1RequestStep(stepId, action, comment?)
→ actOnB1UiRequestStepFn
   schema: { stepId:uuid, action:enum, comment? }.strict()
   resolveB1ActOnRpcAction(stepId, action)  // literal equality vs DB action_type
→ rpcActOnB1StudentRequestStepAtomic
→ act_on_b1_student_request_step_atomic(
     p_step_id, p_action, p_comment, p_payload={})
→ expected RPC: { success, step_id, action_result, next_step_id, transition_applied }
→ server narrows: { accepted:true, stepId, action }
→ invalidate ["staff-inbox-detail", id], ["staff-inbox"], ["notifications"], fee-context
```

### 3.4 Specialized payment (`department_transfer` / `final_chance` only)

```
B1StaffStepActionSection (configuredActionType === "confirm_payment")
→ B1RevenueReceiptCard
→ createB1ConfirmPaymentHandler (never actOnB1RequestStep)
→ adapter.confirmB1RevenueReceipt(stepId, note?)
→ confirmB1UiRevenueReceiptFn
   schema: { stepId:uuid, note? }.strict()
→ rpcRecordExternalUniversityPaymentConfirmation
→ record_external_university_payment_confirmation(p_step_id, p_note)
   forbidden client keys: amount/currency/invoice/status/…
→ expected RPC: { success, status:"payment_confirmed", request_id, step_id, next_step_id, transition_applied }
→ server: { accepted:true, stepId, requestId?, action:"confirm_payment" }
→ same staff-inbox invalidation keys
```

### 3.5 Generic review panel (must never execute B1)

```
StaffRequestActionPanel
→ assertGenericStaffExecutorAllowed(requestTypeCode)   // client
→ executeStudentRequestStaffAction
   Zod min(1) requestTypeCode + superRefine B1 reject
→ assertGenericExecutorAuthoritativeRequestType(lookup DB type)
→ act_on_student_request_step(...)   // only if non-B1
```

---

## 4. Per-service step inventory

### enrollment_suspension

| step_key | unit / role | action | UI | Server fn | RPC |
|---|---|---|---|---|---|
| initial_review | student_affairs / student_affairs_specialist | review | B1EmployeeActionPanel | actOnB1UiRequestStepFn | act_on_b1_student_request_step_atomic |
| manager_approval | student_affairs / student_affairs_manager | approve | same | same | same |
| registrar_apply | registrar / registrar_general | apply_decision | same | same | same |

### excused_absence

| step_key | unit / role | action | UI | Server fn | RPC |
|---|---|---|---|---|---|
| student_affairs_intake | student_affairs / student_affairs_specialist | review | B1 panel | actOnB1UiRequestStepFn | atomic act-on |
| manager_review | student_affairs / student_affairs_manager | approve | same | same | same |
| record_apply | student_affairs / student_affairs_specialist | apply_decision | same | same | same |

### department_transfer

| step_key | unit / role | action | UI | Server fn | RPC |
|---|---|---|---|---|---|
| student_affairs_intake | student_affairs / student_affairs_specialist | review | B1 panel | actOnB1UiRequestStepFn | atomic act-on |
| source_department_head_approval | department / department_head | approve | same | same | same |
| target_department_head_approval | department / department_head | approve | same | same | same |
| dean_approval | dean / dean | approve | same | same | same |
| payment_confirmation | finance / revenue_finance_officer | confirm_payment | B1RevenueReceiptCard | confirmB1UiRevenueReceiptFn | record_external_university_payment_confirmation |
| registrar_apply | registrar / registrar_general | apply_decision | B1 panel | actOnB1UiRequestStepFn | atomic act-on |

### final_chance

| step_key | unit / role | action | UI | Server fn | RPC |
|---|---|---|---|---|---|
| student_affairs_intake | student_affairs / student_affairs_specialist | review | B1 panel | actOnB1UiRequestStepFn | atomic act-on |
| manager_review | student_affairs / student_affairs_manager | approve | same | same | same |
| dean_decision | dean / dean | approve | same | same | same |
| payment_confirmation | finance / revenue_finance_officer | confirm_payment | B1RevenueReceiptCard | confirmB1UiRevenueReceiptFn | payment RPC |
| registrar_apply | registrar / registrar_general | apply_decision | B1 panel | actOnB1UiRequestStepFn | atomic act-on |

### file_withdrawal

| step_key | unit / role | action | UI | Server fn | RPC |
|---|---|---|---|---|---|
| student_affairs_intake | student_affairs / student_affairs_specialist | review | B1 panel | actOnB1UiRequestStepFn | atomic act-on |
| library_clearance | library / library_officer | clear | same | same | same |
| labs_clearance | labs / labs_manager | clear | same | same | same |
| activities_clearance | student_affairs / student_affairs_manager | clear | same | same | same |
| finance_clearance | finance / revenue_finance_officer | clear | same | same | same |
| registrar_apply | registrar / registrar_general | apply_decision | same | same | same |
| archive | archive / archive_officer | archive | same | same | same |

Workflow authority: `B1_WORKFLOWS` + migrations `20260725110900_b1_16_free_service_workflows_08.sql`, `20260725111000_b1_17_external_university_payment_workflows_02.sql`.

---

## 5. HOLD finding detail — migration terminal visibility

Ordered `SET student_visible` mutations for the five codes in `supabase/migrations`:

| Migration | Value |
|---|---|
| `20260727071910_08128c70-…` | `true` |
| `20260727081838_7b86bc78-…` | `false` |
| `20260727114316_f533371f-…` | `false` |
| `20260727114619_87548ebe-…` | `true` |
| `20260727115111_8609ac67-…` | `true` |

**Terminal source-chain value: `true` for all five.**  
Later fixture `20260801021541_…` *preconditions* `student_visible=false` but does not restore it — so a linear apply of the visibility-true migrations is incompatible with that fixture precondition and contradicts the launch-hide invariant.

**Not remediated in this pack** (AGENTS forbids changing `request_types.student_visible`). Remediation requires a separately authorized migration/ops action outside this audit.

Note: `docs/PORTAL-FIRST-DELIVERY-SOURCE-RC-01-REPORT.md` §10 incorrectly claimed no migration sets the five to `student_visible=true`. That claim is **false** against current main.

---

## 6. Files touched (this pack)

| Path | Change |
|---|---|
| `tests/b1-five-services-ui-server-rpc-operational-readiness-31/ui-server-rpc-chain.test.ts` | **new** — operational readiness proofs + HOLD gate |
| `docs/B1-FIVE-SERVICES-UI-SERVER-RPC-OPERATIONAL-READINESS-AUDIT-31-REPORT.md` | **new** — this report |

No runtime (`src/**`) changes. No migrations. No visibility DML. No production access.

---

## 7. Tests and verification

| Command | Result |
|---|---|
| `bun test tests/b1-five-services-ui-server-rpc-operational-readiness-31` | **72 pass / 1 fail** — G14 HOLD gate (`terminal student_visible === true`) |
| `bun test tests/b1-configured-action-panel-routing-42` | **82 pass / 0 fail** |
| `bun test tests/student-requests` | **1060 pass / 0 fail** (97 files) |
| `bunx tsc --noEmit` | **exit 0** |
| `bun run build` | **exit 0** (client + SSR + route-tree register footer present) |
| `git diff --check` | **exit 0** (pack files only; `src/routeTree.gen.ts` build drift restored) |

Browser smoke: exercised via existing static/source contracts (`dir="rtl"`, `min-h-11`, `min-w-0`, no fixed overlays) and prior PASS of `PORTAL-B1-FIVE-SERVICES-UI-VISUAL-UX-QA-01`. No production browser session.

---

## 8. Assumptions

1. Authoritative workflow step matrices in `B1_WORKFLOWS` match promoted workflow migrations for the five services.
2. Production remains outside this audit; production-hidden attestations are cited only as residual context, not as a substitute for source-chain terminal proof.
3. Antigravity PR #274 remediation is out of scope for this worktree.

---

## 9. Risks

| Risk | Severity | Notes |
|---|---|---|
| Source migration chain ends with five B1 `student_visible=true` | **High** | Blocks PASS of launch-hide proof; separate authorization required to restore `false` or to deliberately launch |
| Fresh environments applying all migrations may expose services before launch gates | **High** | Fixture package preconditions assume hidden |
| Prior RC report claim (“no visibility=true migration”) is inaccurate | Medium | Documentation drift |

---

## 10. Obstacles

- Cannot remediate `student_visible` in this mission (AGENTS + review-first).
- No production connection permitted; live visibility not re-queried here.

---

## 11. Production impact

**None.** Source-only tests + report. No deploy, publish, migration apply, or data mutation.

---

## 12. What must happen before PASS

1. Separately authorized remediation that makes the **ordered migration terminal** (or an explicit post-chain assert) keep the five B1 services at `student_visible=false` until launch approval — **or** an explicit launch authorization that accepts `true` for named services only.
2. Re-run pack-31 G14 gate to green.
3. Keep all other pack-31 proofs green.

Until then the final token remains:

```
HOLD_B1_FIVE_SERVICES_UI_SERVER_RPC_SOURCE_MIGRATION_TERMINAL_STUDENT_VISIBLE_TRUE
```
