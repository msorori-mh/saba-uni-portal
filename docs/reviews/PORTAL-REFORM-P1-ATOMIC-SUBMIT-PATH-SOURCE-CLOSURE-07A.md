# PORTAL_REFORM_P1_ATOMIC_SUBMIT_PATH_SOURCE_CLOSURE_07A

MODE: SOURCE_ONLY + ISOLATED_REHEARSAL — PRODUCTION_WRITES=0, MIGRATION_APPLY=0.

## Deliverables

| Artifact | Purpose |
| --- | --- |
| `docs/migration-drafts/p1/P1-06-ATOMIC-SUBMIT-PATH.sql` | Forward-only draft: canonical `submit_student_request_with_details`, P1 TEST_ONLY registry, fail-closed guards |
| `scripts/p1-atomic-submit-07a-pg17/00-harness-ext.sql` | Production preimages (create/submit/workflow init, legacy bypass policies) |
| `scripts/p1-atomic-submit-07a-pg17/01-cases.sql` | Full positive/negative matrix incl. rollback delta proofs |
| `scripts/p1-atomic-submit-07a-pg17/run.sh` | Isolated PG17 cluster: P1-01..05 → P1-06 (applied twice) → matrix |
| `src/lib/student-request-rpc.ts` | Typed client wrapper `rpcSubmitStudentRequestWithDetails`, capability still `available: false` |

## Contract

One RPC serves both paths. Actor identity comes only from `auth.uid()` →
`p1_active_student_profile`; the client never supplies a student id.

- **Normal path** — allowed only when `request_types.student_visible = true`.
- **TEST_ONLY hidden path** — requires all of: hidden type, actor email matching
  the approved `test-only.` institutional convention, a registry row in
  `p1_e2e_07_executions` bound to that exact user + service, still active, not
  yet claimed. The B1-88 five-service allowlist is untouched and unusable for P1.

Eligibility, form validation and server recomputation all run **before** the
first insert, so duplicate-open checks cannot observe the row being created and
every rejection leaves zero residue. Detail rows are written by the same
transaction; `submit_student_request` and a BEFORE INSERT/UPDATE trigger both
reject any P1 request reaching a non-draft status without its canonical detail.
Generic `create_student_request` fails closed with `P1_ATOMIC_SUBMIT_REQUIRED`
for the three P1 types. Legacy student-write policies on `grade_appeal_details`
are removed.

## Rehearsal result

`bash scripts/p1-atomic-submit-07a-pg17/run.sh` → **153 PASS / 0 FAIL**,
`P1_06_ATOMIC_SUBMIT_PG17_REHEARSAL_PASS`, P1-06 applied twice (idempotent).

Covered: hidden-path denials (non-test actor, no marker, ghost marker, copied
marker, claimed replay), anonymous denial, October level/count/tamper rules,
replacement duplicate + declaration rules, appeal ownership / 7-day boundary /
duplicate / reason, 48% boundary (47.99 failed vs 48.00 passed), generic-create
bypass, detail-less submit via RPC / direct UPDATE / direct INSERT, grants
(anon and service_role denied EXECUTE, no client table grants, registry
unreadable), non-P1 service regression, and zero-delta rollback proofs on every
failure case.

## Verification

`bunx tsgo --noEmit` clean · `bun test tests/student-requests` 1093 pass / 0 fail.

FINAL: **PASS_PORTAL_REFORM_P1_ATOMIC_SUBMIT_PATH_SOURCE_CLOSURE_07A_READY_FOR_CONTROLLED_APPLY**
