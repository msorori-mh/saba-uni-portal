# ACADEMIC-COUNCILS-C0-C9-FINAL-SECURITY-CLOSURE-LONGRUN-07-REPORT

## Mission
`ACADEMIC-COUNCILS-C0-C9-FINAL-SECURITY-CLOSURE-LONGRUN-07`

## Verdict
`PASS_ACADEMIC_COUNCILS_C0_C9_FINAL_SECURITY_CLOSURE_PR_READY`

## Identity
- **Base PR / SHA:** #300 / `d3ddce61f1d339d418d9c494fc8b456d4a5f6d85`
- **Canonical C9:** #303 / `4d5d7482252f5d580a298ff97c74a8ffa7c0a7f4`
- **Rejected C9 base:** #302 (old-base candidate — not integrated)
- **Branch:** `fix/councils-c0-c9-final-security-closure-01`
- **FINAL_SHA:** `69f83b3c06d48cbab190a37e9d2b536db79216eb`
- **PR:** #304
- **Mode:** source-only (no production apply / deploy / publish / merge)

## Phase A — Codex HIGH reproduction (pre-closure)
Executable proof in `tests/academic-councils/councils-c0-c8-codex-high-reproduction.test.ts`:

| Finding | Base evidence (C0→C7 only) | Closure remediation |
|---|---|---|
| **H1** | `cast_council_vote` lacks `FOR UPDATE`; `close_agenda_item_vote` has it (asymmetric serialization) | Both cast + close lock agenda-item row then meeting; conditional close update |
| **H2** | Cross-meeting agenda item accepted by `issue_council_decision` | Exact meeting/agenda/minutes/topic/vote-result relationship proof |
| **H3** | `issued → completed` skip accepted | Central `council_decision_transition_is_legal` FSM |
| **H4** | Archive succeeds with open decision; post-archive follow-up RPC mutates | Archive requires completed follow-up; meeting lock + child INSERT/UPDATE/DELETE guards |

## Remediations (migration)
`supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql`

- H1 vote/close serialization on exact agenda-item voting authority row
- H2 decision source integrity
- H3 canonical FSM: `issued → in_progress → completed` + controlled `blocked` path
- H4 archive readiness + post-archive immutability triggers on decisions/agenda/votes/results/minutes

## C9 integration
Integrated **canonical #303** sources only (not #302):

- Migration `20260808180000_councils_c9_notifications_reporting_01.sql` (after closure `…171000…`)
- Hardened `get_council_responsible_decisions` against `p_user_id` impersonation (IDOR)
- Faculty UX: notifications bell, chair/secretary/member/responsible dashboards, reports route
- Arabic RTL + a11y labels retained/extended
- Follow-up UI options constrained to legal FSM transitions

## Local verification
| Gate | Result |
|---|---|
| Phase A HIGH reproduction (PG17) | PASS |
| C0→C8 + closure verifier (PG17) | PASS |
| Deterministic vote/close concurrency (2-conn) | PASS |
| C0→C9 chain + C9 verifier (PG17) | PASS |
| UI/a11y/RTL contracts | PASS |
| `bun test tests/academic-councils` | PASS |
| `bun test tests/student-requests` | PASS (1066) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Security matrix summary
- **AUTH_MATRIX_CASE_COUNT:** ≥62 `deny_zero` cases in C4–C8 verifier (+ C9 matrix/IDOR)
- **ZERO_MUTATION:** mandatory before/after fingerprint equality via `pg_temp.deny_zero`
- **CONCURRENCY:** deterministic lock-step vote↔close (B1/B2/B3/B4); archive/follow-up serialization via meeting row locks

## Production boundaries
- PRODUCTION_READS: 0
- PRODUCTION_WRITES: 0
- MIGRATION_APPLIED: NO
- DEPLOY: NO
- PUBLISH: NO
- MERGE: NO

## Supersedes (do not auto-close)
#294 #295 #296 #297 #298 #300 #302 #303

## Assumptions
- Canonical C9 is #303 because it is based directly on #300 / `d3ddce61`
- “Required decision issuance” for archive means: any issued decision must reach `completed` before archive (not every agenda item must have a decision)

## Risks
- Source-only migrations require explicit single-migration promotion before production apply
- UI cannot be the sole authority — RPCs remain the security boundary

## Decision
**PASS** — ready for PR review with Web CI + Migration Review required green.
