# PORTAL-FIRST-DELIVERY-FIVE-SERVICES-REAL-GO-LIVE-01

## Decision

**PASS_PR267_FULL_OPERATIONAL_CLOSURE_SOURCE_READY**

```
NO_PRODUCTION_WRITE
SOURCE_ONLY
NO_STUDENT_VISIBLE_MUTATION_IN_THIS_PR
NO_DEPLOY
FAIL_CLOSED_ATTACHMENTS_CAPABILITY
ARABIC_STUDENT_DETAIL_CLOSED
RPC_MATRIX_M03_PASS
```

## Scope

Complete the five-service B1 path from student card → draft/submit → staff `act_on` → real academic effect, by extending existing B1 surfaces only.

Services:

1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

Protected: `enrollment_certificate` — regression = NONE (no mutation in this track).

## Reused UI surfaces

| Surface | Role |
|---|---|
| `B1StudentRequestForm` | restore open draft/returned, autosave (~1s), STALE reload, submit → success |
| `B1SuccessState` | request number then route to B1 view |
| `B1StudentRequestDetail` | Arabic summary via form registry + options + attachments + messages + steps + resume |
| `B1AttachmentUploader` | progress / retry / 5MB contract |
| `B1EmployeeActionPanel` / `B1StaffWorkspace` | step-accurate Arabic labels; attachment download via existing adapter |
| `student.requests.index` / `student.requests.new` | B1 list/detail routes; legacy new-request redirect for five codes |

## K3 blockers closed

1. **Owned upload row normalizer** — `parseOwnedStudentRequestAttachmentUpload` / `prepareOwnedAttachmentStorageUpload` accept only a single object or array length 1; reject null/undefined/empty/multi/invalid before any storage mutation.
2. **Arabic student tracking summary** — `buildB1StudentFormSummaryItems` reuses request-form registry + `B1_KNOWN_VALUE_LABELS_AR` + form options (year/semester/dept/program/section). No snake_case keys; raw UUIDs without lookup → «قيمة محفوظة».

## Runtime activation (source)

- Attachments runtime: fail-closed capability probe (`create_intent` / `upload` / `complete` / `download`) — never hardcoded true for upload path.
- Cleared TS `activationBlockedReason` for `excused_absence`, `department_transfer`, `final_chance`
- Card visibility still gated by DB `studentVisible` (existing main migration out of scope; no new mutation here)

## Academic effects matrix

| Service | Terminal step | Marker | Effect |
|---|---|---|---|
| enrollment_suspension | registrar_apply / apply_decision | effect_applied_at | academic status suspended + period |
| excused_absence | record_apply / apply_decision | record_applied_at | excused ledger row |
| department_transfer | registrar_apply / apply_decision | effect_applied_at | dept/program swap + audit |
| final_chance | registrar_apply / apply_decision | chance_applied_at | student_extra_chances unique scope |
| file_withdrawal | registrar_apply after clearances | effect_applied_at | withdrawn + records_transferred_at |

Legacy `approved` triggers left untouched; B1 completes as `completed` and applies effects via SEQ27 `act_on` integration.

## Migrations (source-promoted, NOT applied to Production)

| Order | Draft | Migration | draft_sha_lf | migration_sha_lf |
|---|---|---|---|---|
| 25 | `B1-ACADEMIC-EFFECT-MARKERS-01.sql` | `20260727120000_b1_25_academic_effect_markers_01.sql` | `50db2dfec04e940d2e474f81e660167ea28453e0cca892228dfd8d6cfa629bdf` | `4d818e9df43b6eaa3a8cc13de00c23f470886e7bb18a96e0cfb0fed9d6153065` |
| 26 | `B1-ACADEMIC-EFFECT-FUNCTIONS-01.sql` | `20260727120100_b1_26_academic_effect_functions_01.sql` | `ad0a5de204a0bfdc7df21a0283c0761e5f4060a062a200352eb828c7cb33e795` | `7cafecd5e4fc1a49aac123616640163478eb8680df9aee00b297b48dcb4ac305` |
| 27 | `B1-ACT-ON-ACADEMIC-EFFECT-INTEGRATION-01.sql` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | `0b29034dd3d30d4e2e54516d09b53be87ec58a175a9b187db7203853f28b0937` | `7a8f46fdc9c1a12da3d5f864099ddff947b58fdcde1bbffae9637d6af45a598d` |

Companion preflight/post-verifiers under `docs/migration-drafts/b1-backend-verifiers/25-*` … `27-*`.
`PROMOTION-MAP.json` and `B1-SEQUENTIAL-APPLY-MANIFEST.json` updated through sequence 27.
Non-migration activation remains **gate 25** (after sequence 27 verifies green).

## Tests and harnesses (closure evidence)

| Check | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun test tests/student-requests` | PASS (856) |
| `bun test` (full) | PASS (1914) |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `tests/b1-academic-effects/run-harness.ps1` | PASS_B1_ACADEMIC_EFFECTS_AUTHZ_MATRIX (positive=5/5 deny=4/4 zero=4/4 idempotent=5/5 rollback=PASS EC=NONE) |
| `tests/b1-rpc-matrix/pg/run-harness.ps1` | PASS (RESULTS=65\|12\|0; M03 exact-assignee-apply-decision OK) |
| Browser CDP smoke `tests/student-requests/b1-real-app-browser-smoke/run.ts` | PASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE (360/768/1366 + Arabic detail no snake_case) |
| Arabic summary unit | `tests/student-requests/b1-form-summary-arabic-01.test.ts` PASS |
| Owned-row normalizer + zero storage mutation | `tests/student-requests/secure-attachments-capability-01.test.ts` PASS |
| Codex business effects | PASS_PR267_CODEX_BUSINESS_EFFECTS_REVIEW (on prior HEAD; SEQ25–27 compile + matrix) |

## Assumptions

- Production apply of SEQ25–27 is a separate human-approved gate.
- Local/TEST_ONLY harnesses may seed `student_visible` without shipping a new visibility mutation.
- Full Browser E2E through all staff steps / academic side-effects against disposable PG remains beyond source smoke; covered by PG authz matrix + real-app HTTP smoke.

## Risks

- Naming collision: non-migration **activation gate 25** vs migration **sequence_order 25** (academic markers). Documented in manifest `activation_gate`.
- Effect functions require `b1.atomic_action=1` and direct-assignee authorization; wrong-step / non-assignee must fail closed.
- Cloud attachment runtime still depends on deployed secure-attachment edge path; source capability is fail-closed until RPCs are present.

## Blockers

None remaining for source PR operational closure of the five services (Arabic detail + owned-row normalizer closed).

## Production impact

- **None written.** No Deploy/Publish, no Production catalog apply, no types regeneration from Production, no `student_visible` change in this PR.
- After approved apply of SEQ25–27, terminal `apply_decision` on the five services will write academic effects idempotently.

## Files modified (closure delta)

- `src/components/student-requests/b1/B1StudentRequestDetail.tsx` — Arabic summary + form options load
- `src/lib/student-requests/b1-ui/form-summary.ts` — registry-based student/staff summary helper
- `src/lib/student-requests/b1-ui/index.ts` / `adapter.mock.ts` / `b1-ui.functions.ts`
- `src/lib/student-requests/secure-attachments-capability.ts` — strict owned-row + pre-storage gate
- Tests: Arabic summary, owned-row zero-mutation, browser smoke Arabic assertion
- This report
