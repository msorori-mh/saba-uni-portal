# B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01 — Report

Updated: 2026-07-18 (Asia/Riyadh)
Repository: `msorori-mh/saba-uni-portal`
Branch: `codex/b1-five-services-controlled-runtime-promotion-01`
Base: `origin/main@ae959be8c0aa3c3a5797a936f6e62f1feaa29933`
Worktree: `C:\projects\saba-uni-portal-b1-five-services-promotion`

## Decision

```text
HOLD_B1_FIVE_SERVICES_RUNTIME_PROMOTION
```

Source contracts, inactive workflow drafts, dispatcher, attachments overlays,
authorization matrix source, free-workflow SHA pin, inventory/runbook
reconciliation, and ACL-cutover five-boundary remediation are complete for the
five in-scope services. The production apply gate remains closed because order-1
release evidence, processing-domain identity verification, private bucket/policy
approval, safe-environment RPC matrix execution, and explicit per-migration
approval are still unresolved.

After those gates receive separate explicit approval, the sequential apply plan
in `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md` is the only
authorized path.

## Scope

### In scope (five services only)

| Service | Fee policy | Workflow draft | Steps |
|---|---|---|---|
| `enrollment_suspension` | `FREE_NO_PAYMENT` | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | 3 |
| `excused_absence` | `FREE_NO_PAYMENT` | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | 3 |
| `file_withdrawal` | `FREE_NO_PAYMENT` | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | 7 |
| `department_transfer` | `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | paid + isolation |
| `final_chance` | `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | final-exam chance only |

### Deferred to PHASE 2 (no Workflow/SQL/UI designed or created)

- `grade_statement_non_graduate`
- `october_exam_entry_form`
- `replacement_student_card`
- `academic_record`
- `grade_statement`
- `graduation_certificate`

Queue task `REMAINING-STUDENT-REQUESTS-SOURCE-READINESS-01` is recorded as
`DEFERRED_USER_LIFECYCLE_INPUT` (not deleted).

## Phase A — Actual state

- Merged source for the five services includes PRs #139–#147 (matrix, paid
  workflows, final-chance write, atomic boundaries, 05A suite, runbook, free
  workflows) plus later queue/docs merges through `#161`.
- All executable SQL remains under `docs/migration-drafts/` — none promoted to
  `supabase/migrations/` and none applied.
- `runtimeAvailable: false` for all five adapters; `student_visible` untouched.
- `enrollment_certificate` was not modified in this phase.
- No dependency on the six deferred services was introduced.

## Phase B–F — Source closure performed here

1. Remediated `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql`:
   - requires non-bypassable release-evidence comment on the atomic caller
   - proves `absence_excuse_details` and `file_withdrawal_details` RPC-write
     boundaries before cutover
   - post-verifies all five detail tables
2. Added `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` (placeholder
   locked; fails closed until a real 40-char deploy SHA is substituted).
3. Reconciled inventory + runbook to LF/git-blob SHA-256 values and pinned
   `B1-FREE-SERVICE-WORKFLOWS-08.sql`.
4. Documented per-service readiness, authorization matrix summary, and
   sequential apply plan (no production execution).

## Candidate migrations (ordered) and SHA-256 (LF/git-blob)

| Order | Draft | SHA-256 |
|---:|---|---|
| 1 | Release stamp `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` | `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357` |
| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0` |
| 3 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` | `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf` |
| 4 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` | `769e8af5c3a34bc81c793fb4a36bcebf80a3a522c15ca6868f66b48d65d9e277` |
| 5 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` | `da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b` |
| 6 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `8487c5ae0ac8b85965de9dd08dafb934550a16e1450b0bedf4f847c5ef17849c` |
| 7 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` |
| 8 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `c73b359baf55f1d9ac28aa588d4c2c1d13c63c2a6036184203e8ba4a1847fb27` |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe` |
| 10 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `e75dd442ac226529a88f8aaee72ecd55971886b841583cf5b7d35af38326089a` |
| 11 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `ba163a3f2bc5115a22373e324d199817d58796284bb3ca0d095abc6bf12783a8` |
| 12 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704` |
| 13 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495` |
| 14 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `82bab7a52b44dde51c71c12acbdfd3445d08d2d4c24176c66a0b0cc39f99118c` |
| 15 | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | `6ae62b5346a21d10a43c88738477f1ecffe57826948d85c9854689debdc4f6f6` |
| 16 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | `f63ff4f526a5dea6b8896586375eaf01ec07433001c857f270f0f1ce155aa444` |
| 17 | `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` |
| 18 | Per-service `student_visible` / activation | SEPARATE APPROVAL |

## Per-service readiness matrix

| Service | Contracts | Detail persistence | Workflow draft | Attachments | Auth matrix source | UI forms | Runtime available | Apply ready |
|---|---|---|---|---|---|---|---|---|
| enrollment_suspension | PASS | PASS (draft) | PASS inactive | n/a | PASS | PASS | NO | HOLD — sequence gates |
| excused_absence | PASS | PASS (draft) | PASS inactive | PASS draft (`excuse_documents`) | PASS | PASS | NO | HOLD — sequence gates |
| file_withdrawal | PASS | PASS (draft table) | PASS inactive 7-step | n/a | PASS | PASS | NO | HOLD — sequence gates |
| department_transfer | PASS | PASS (`transfer_request_details`) | PASS inactive + external payment | PASS draft (`secondary_certificate`) | PASS + dept isolation | PASS | NO | HOLD — sequence gates |
| final_chance | PASS | PASS (`extra_chance` alias; write=`final_chance`) | PASS inactive + external payment | n/a | PASS | PASS | NO | HOLD — sequence gates |

### Independent blockers (shared)

| Blocker | Blocks |
|---|---|
| Missing atomic-caller release evidence (order 1) | entire apply chain / ACL cutover |
| Processing-domain identity verification | domains expansion migration |
| Private bucket/policy approval | secure attachments + absence/transfer |
| Safe non-prod RPC matrix execution | runtime authorization proof |
| Explicit per-migration approval | every production apply |
| Separate `student_visible` approval | student exposure |
| Separate Deploy/Publish approval | production UI/runtime |

## Authorization matrix (source-complete; runtime pending apply)

Source matrix from PR #139 covers every configured B1 staff step:

| Case | Expected |
|---|---|
| exact assigned actor | ALLOW |
| same-role unassigned | DENY |
| wrong unit | DENY |
| wrong role | DENY |
| wrong action | DENY |
| admin bypass | DENY |
| registrar bypass | DENY unless exact assignee on registrar step |
| dean bypass | DENY unless exact assignee on dean step (if any) |
| anonymous | DENY |
| pending/inactive/completed step | DENY |
| another request | DENY |
| incomplete predecessor | DENY |
| replay/stale | DENY |
| source dept head on target step / reverse | DENY |
| failed auth mutations / workflow advance | zero |

Runtime RPC execution of this matrix remains gated on a safe isolated environment
after migrations are separately approved and applied.

## Preflight / post-verification / E2E plan

Follow runbook sections:

1. preflight (history, SHA, identities, assignees, protected IDs)
2. pin SHA (LF/git-blob)
3. apply one migration only
4. post-verification (schema/ACL/RLS)
5. RPC authorization matrix
6. service-specific E2E
7. workflow activation for that service only
8. `student_visible` for that service only (separate approval)
9. Deploy/Publish (separate approval)
10. smoke
11. next service only after PASS

Service promotion order: suspension → absence → withdrawal → transfer → final_chance.

## Non-execution confirmation

```text
G3/B1 production SQL apply: NO
student_visible change: NO
Deploy/Publish: NO
Staff/account/assignment creation: NO
reset/cleanup/delete/truncate/backfill: NO
Protected requests/documents touched: NO
Six deferred services implemented: NO
Supabase production writes: NO
```

## Files changed in this phase

- `docs/migration-drafts/REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql`
- `docs/migration-drafts/REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`
- `docs/B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md`
- `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`
- `docs/B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01-REPORT.md`
- `docs/autopilot/TASK-QUEUE.md`
- `docs/autopilot/ACTIVE-WORKERS.md`
- `docs/autopilot/BLOCKED-TASKS.md`
- `docs/autopilot/DEPENDENCY-GRAPH.md`
- `tests/student-requests/b1-detail-acl-cutover-06.test.ts`
- `tests/student-requests/b1-migration-runbook-07.test.ts`
- `tests/student-requests/b1-five-services-controlled-runtime-promotion-01.test.ts`

## Local validation

| Gate | Result |
|---|---|
| Focused promotion/ACL/runbook tests | PASS 14/14 |
| `bun test tests/student-requests` | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Isolated PostgreSQL compile of candidate migrations | NOT EXECUTED (no local isolated DB in this cycle) |
| Production SQL apply | NO |
| Independent review | pending on PR #162 |

## Next authorized action

Independent review of the ACL cutover + checksum reconciliation PR.
Do **not** apply migrations, change visibility, or publish until a separate
explicit production authorization names the exact migration and SHA.
