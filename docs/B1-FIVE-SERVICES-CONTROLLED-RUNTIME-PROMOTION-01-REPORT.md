# B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01 — Report

Updated: 2026-07-19 (Asia/Riyadh)
Repository: `msorori-mh/saba-uni-portal`
Branch: `codex/b1-five-services-controlled-runtime-promotion-01`
Base: `origin/main@ae959be8c0aa3c3a5797a936f6e62f1feaa29933`
Worktree: `C:\projects\saba-uni-portal-b1-five-services-promotion`

## Decision

```text
HOLD_B1_FIVE_SERVICES_RUNTIME_PROMOTION
SOURCE READY
PRODUCTION APPLY BLOCKED
```

Source contracts, inactive workflow drafts, dispatcher, attachments overlays,
authorization matrix source, free-workflow SHA pin, inventory/runbook
reconciliation, ACL-cutover five-boundary remediation, PL/pgSQL compile fixes,
and isolated PostgreSQL 17 compile evidence are complete for the five in-scope
services.

```text
SOURCE READY = candidate drafts compile locally; docs/tests pin final LF SHA-256;
               adapters remain runtimeAvailable:false; deferred six untouched.
PRODUCTION APPLY BLOCKED = no Supabase apply; no student_visible; no Deploy/Publish;
               B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL.
```

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

Queue task `REMAINING-STUDENT-REQUESTS-SOURCE-READINESS-01` remains
`DEFERRED_USER_LIFECYCLE_INPUT` (not deleted; not started).

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

1. Remediated `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql`.
2. Added `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` (placeholder
   locked; fails closed until a real 40-char deploy SHA is substituted).
3. Reconciled inventory + runbook to LF/git-blob SHA-256 values.
4. Fixed PL/pgSQL / catalog preflight defects discovered by local PG17 compile:
   - `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` — parenthesize `CASE ... END`
   - `REQUEST-B1-SERVICE-DETAILS-05A.sql` — parenthesize `CASE ... END`
   - `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` — raw `pg_get_constraintdef`
   - `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` — raw `pg_get_constraintdef`
   - `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` — raw/pretty constraint accept
   - `B1-FREE-SERVICE-WORKFLOWS-08.sql` — `record` loop vars for `jsonb_array_elements`
   - `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` — same `record` loop fix
5. Isolated Docker/PostgreSQL 17 compile harness under
   `scripts/b1-local-pg-compile/` (no production credentials).

## Final application order and SHA-256 (LF/git-blob)

Harness compile order applies the stamp after atomic SQL so `COMMENT ON FUNCTION`
survives `CREATE OR REPLACE`. Production order-1 still requires a real release
SHA in the stamp before any apply.

| Order | Draft | SHA-256 | Local PG17 compile |
|---:|---|---|---|
| 1 | `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` | `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357` | PASS (real placeholder fail-closed proved) |
| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0` | PASS |
| 3 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` | `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf` | PASS |
| 4 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` | `a92505d71ba6e02d29b4993d10da8ff8e2f91e5fa62549a6a7efe74c1dc8b58a` | PASS |
| 5 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` | `41ab67a1208f926400799d2c6870dd44015e59fbbb9a7d6adaba4faf9d3b7f84` | PASS |
| 6 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `6034c0de0a7a347f576ef8839b730d5c1f1d281ebe74a7ac312266ac92ee2356` | PASS |
| 7 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` | PASS |
| 8 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205` | PASS |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `a94233525724f96959568672744b7466a88b22d338298eaf13a6b75319f97df4` | PASS |
| 10 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `febf7a9bedd9d62f6fefe1533784d7e1f8fa7d995ea90a5fc3b16812a392ca71` | PASS |
| 11 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284` | PASS |
| 12 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704` | PASS |
| 13 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `7c53e89a0cfa48545d115ee7aad1d08c3cbd8719620663e80d3df2217e2b06e0` | PASS |
| 14 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c` | PASS |
| 15 | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c` | PASS |
| 16 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250` | PASS |
| 17 | `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` | PASS |
| 18 | Per-service `student_visible` / activation | SEPARATE APPROVAL | NOT IN THIS PHASE |

Overall local harness verdict: `PASS_LOCAL_PG17_COMPILE` (see
`scripts/b1-local-pg-compile/RESULTS.md`).

## Idempotency / ACL / RLS / write checks (local)

| Draft | Idempotency | ACL/RLS | Positive/negative writes | Soft note |
|---|---|---|---|---|
| actor hardening | PASS | SKIP | SKIP | — |
| processing domains | PASS | SKIP | SKIP | — |
| atomic submit/action | PASS | SKIP | SKIP | — |
| release stamp | PASS | SKIP | SKIP | real placeholder raises `B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED` |
| payment confirmation | PASS | SKIP | SKIP | — |
| secure attachments | PASS | PASS | SKIP | bare `CREATE TABLE` re-apply → `already exists` (accepted soft) |
| trusted validators | PASS | SKIP | SKIP | — |
| absence vocabulary | PASS | SKIP | SKIP | second-pass catalog trigger inventory → `CANONICAL_ABSENCE_REASON_TRIGGER_MISMATCH` (accepted soft; first compile PASS) |
| absence detail | PASS | PASS | SKIP | — |
| file withdrawal details | PASS | PASS | SKIP | — |
| transfer attachment | PASS | SKIP | SKIP | — |
| final-chance write | PASS | PASS | PASS | — |
| RPC write boundaries | PASS | PASS | SKIP | — |
| service details dispatcher | PASS | PASS | SKIP | — |
| free workflows | PASS | SKIP | SKIP | — |
| paid workflows | PASS | SKIP | SKIP | — |
| ACL cutover | PASS | PASS | SKIP | — |

## Per-service readiness matrix

| Service | Contracts | Detail persistence | Workflow draft | Attachments | Auth matrix source | UI forms | Runtime available | Apply ready |
|---|---|---|---|---|---|---|---|---|
| enrollment_suspension | PASS | PASS (draft) | PASS inactive | n/a | PASS | PASS | NO | HOLD — sequence gates |
| excused_absence | PASS | PASS (draft) | PASS inactive | PASS draft (`excuse_documents`) | PASS | PASS | NO | HOLD — sequence gates |
| file_withdrawal | PASS | PASS (draft table) | PASS inactive 7-step | n/a | PASS | PASS | NO | HOLD — sequence gates |
| department_transfer | PASS | PASS (`transfer_request_details`) | PASS inactive + external payment | PASS draft (`secondary_certificate`) | PASS + dept isolation | PASS | NO | HOLD — sequence gates |
| final_chance | PASS | PASS (`extra_chance` alias; write=`final_chance`) | PASS inactive + external payment | n/a | PASS | PASS | NO | HOLD — sequence gates |

### Production blockers (require separate approval / production or safe-env access)

| Blocker | Blocks |
|---|---|
| Missing atomic-caller release evidence (order 1 real deploy SHA) | entire apply chain / ACL cutover |
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

Follow runbook sections in
`docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`.

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
Production credentials used in compile: NO
```

## Files changed in this phase

- `docs/migration-drafts/*.sql` (compile fixes + LF normalization for pinned drafts)
- `docs/B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md`
- `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`
- `docs/B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01-REPORT.md`
- `docs/autopilot/TASK-QUEUE.md`
- `docs/autopilot/ACTIVE-WORKERS.md`
- `docs/autopilot/BLOCKED-TASKS.md`
- `docs/autopilot/DEPENDENCY-GRAPH.md`
- `scripts/b1-local-pg-compile/**`
- `tests/student-requests/b1-detail-acl-cutover-06.test.ts`
- `tests/student-requests/b1-migration-runbook-07.test.ts`
- `tests/student-requests/b1-five-services-controlled-runtime-promotion-01.test.ts`

## Local validation

| Gate | Result |
|---|---|
| Isolated PostgreSQL 17 compile (Docker local) | PASS_LOCAL_PG17_COMPILE (17/17) |
| Focused promotion/ACL/runbook tests | PASS 14/14 |
| `bun test tests/student-requests` | PASS 530/530 |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Production SQL apply | NO |
| Independent review (post-compile) | CRITICAL=0 HIGH=0 MEDIUM=0 |

## Next authorized action

Merge source PR #162 after green Web CI on the HEAD that includes this
compile evidence. Do **not** apply migrations, change visibility, or publish
until a separate explicit production authorization names the exact migration
and SHA. Keep `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.
