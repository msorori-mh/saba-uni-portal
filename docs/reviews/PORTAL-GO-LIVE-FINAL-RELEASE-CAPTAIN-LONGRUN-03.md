# PORTAL-GO-LIVE-FINAL-RELEASE-CAPTAIN-AUTONOMOUS-LONGRUN-03

MISSION=`PORTAL-GO-LIVE-FINAL-RELEASE-CAPTAIN-AUTONOMOUS-LONGRUN-03`  
MODE=`AUTONOMOUS OVERNIGHT FINAL RELEASE CLOSURE / SOURCE-ONLY`  
DATE=`2026-08-10`

## Status (living document — freeze section finalizes only when all gates PASS)

```text
C8_CONTRACT_FIXED=YES
PR329_INTEGRATED=YES
PR327_INTEGRATED=YES
PR330_INTEGRATED=YES
B1_CLOSURE_INTEGRATED=YES
PG17_CHAIN_PASS=YES
VISUAL_R2_PASS=PENDING
INDEPENDENT_R2_PASS=PENDING (prior HOLD on stale SHA; CRITICAL sensor + HIGH reports remediated — re-review required)
REPORTS_DEPARTMENT_CONTAINMENT_HIGH_FIXED=YES
B1_TOKEN=PASS_PORTAL_B1_GO_LIVE_MIGRATION_DRIFT_TESTONLY_D02_FINAL_CLOSURE_LONGRUN_01
CURRENT_TIP=pending-push
MAIN_MERGED=NO
```

## Phase 0 — Current truth (mission start)

| Ref | SHA |
|-----|-----|
| CURRENT_MAIN (start) | `a98b76feefa1fd67ed868c6eefe8650dd8c66f45` |
| CURRENT_PR328_HEAD (remote start) | `8c3a468c3e1fe64c73699d558bf620ee9b7f9c86` |
| CURRENT_PR329_HEAD | `0375436b267fc03ddc282466c79142d4b71abd03` |
| CURRENT_PR327_HEAD | `ebac711fa08389ec0ce6f811b08675940f1e3ad3` |
| CURRENT_PR330_HEAD | `77b5c84db548ee568ad669e8d9ca53f36456326a` |
| CURRENT_PR326_HEAD | `62c6bb374b15503dfa93c5d8066e4b61837169aa` |

PR328 (`integration/go-live-final-source-closure-01`) remains the only final source RC.

## Phase 1 — C8 decision contract

Fixed frontend/server wrapper without weakening C8 SQL:

- `issueCouncilDecisionFn`: `agenda_item_id` required; Arabic validation `اختر بند جدول الأعمال المرتبط بالقرار.`; no `?? null` fallback
- Issue CTA only when `meetingStatus === "minutes_locked"`
- Agenda remains loadable at `minutes_locked`; dialog lists only `session_status === "resolved"` items
- Closure SQL markers unchanged (`COUNCIL_AGENDA_ITEM_ID_REQUIRED`, minutes locked, resolved, meeting match)

Tests: `tests/academic-councils/councils-c8-decision-ui-backend-contract.test.ts` → 6 pass / 0 fail

```text
C8_UI_AGENDA_ITEM_REQUIRED=PASS
C8_UI_UNRESOLVED_ITEM_DENIED=PASS
C8_UI_PRE_LOCK_ISSUANCE=DENY
C8_UI_LOCKED_RESOLVED_ITEM=ALLOW
C8_BACKEND_SECURITY_UNCHANGED=YES
```

Commit: `b40b35ed55f7f5d62000e1f80205dc0928e3801d`

## Phase 2 — Release deltas

Integrated into PR328 (docs/tests preferred for 327/330; app source from 329 preserved):

- PR329 acceptance delta (Reports/Security/Documents/Messages/DynamicStudentRequestForm + demo script/report)
- PR327 deploy/E2E operator packets + tests
- PR330 C5V2–GA3 Lovable operator pack

```text
ACCEPTANCE_DELTA_INTEGRATED=YES
DEPLOY_E2E_PACK_INTEGRATED=YES
DB_OPERATOR_PACK_INTEGRATED=YES
```

## Phase 3 — B1 D02

Parallel worktree `fix/b1-go-live-final-drift-d02-closure-01` shows in-progress source remediation (test-only archive moves, exclusion manifest, chair-sensor tests). No open PR / final PASS token observed yet at last poll.

```text
B1_STATUS=WAITING
```

## Phase 4 — Codex PG17 full chain

Evidence archived:

- `docs/reviews/PORTAL-GO-LIVE-C5V2-THROUGH-GA3-FULL-CHAIN-PG17-REHEARSAL-LONGRUN-01.md`
- PR328 comment attestation by `tarasana-mufadhala`

```text
C5V2=PASS
C6=PASS
C7=PASS
C8=PASS
C9=PASS
GA1=PASS
GA2=PASS
GA3=PASS
RUN1=PASS
RUN2=PASS
CRITICAL=0
HIGH=0
PASS_PORTAL_GO_LIVE_C5V2_THROUGH_GA3_FULL_CHAIN_PG17_REHEARSAL_LONGRUN_01
```

## Phase 5 / 6 — Visual R2 + Independent R2

`RC2_CANDIDATE_READY` comments published for successive tips. Awaiting:

- `PASS_PORTAL_GO_LIVE_FINAL_VISUAL_BROWSER_ACCEPTANCE_R2`
- `PASS_PORTAL_GO_LIVE_FINAL_INDEPENDENT_REVIEW_R2`

on the exact current head.

## Phase 7 — Local qualification matrix (captain branch)

| Suite | Result |
|-------|--------|
| tests/admin | 244 pass / 0 fail |
| tests/academic-councils | 103 pass / 0 fail |
| tests/graduation-projects | 119 pass / 0 fail |
| tests/graduates-affairs + reports-beneficiaries (combined run) | 509 pass / 0 fail |
| tests/student-requests | 1066 pass / 0 fail |
| tests/pwa + tests/mobile | 53 pass / 0 fail |
| tests/faculty-portal | 79 pass / 0 fail |
| tests/student-portal | 96 pass / 0 fail |
| tests/docs | 45 pass / 0 fail |
| tests/runbook | 21 pass / 0 fail |
| bunx tsc --noEmit | PASS |
| bun run build | PASS |
| git diff --check | PASS |

Copy scan notes:

- No English toast literals under `src/routes` / `src/components`
- Mobile account tab intentionally shows Arabic `قريباً` (not English phase copy)
- Worker fallback `src/lib/error-page.ts` remains English infrastructure shell (pre-existing; not treated as product toast regression)

```text
RAW_ERROR_COUNT=0
STALE_PHASE_COPY_COUNT=0
ROLE_MISMATCH_COUNT=0
SCOPE_MISMATCH_COUNT=0
```

## Freeze / merge

Deferred until B1 + Visual R2 + Independent R2 + CI on exact tip are all PASS.

## Decision

`HOLD_PENDING_PARALLEL_GATES` until B1/Visual/Independent close; then publish freeze JSON, mark PR ready, and merge under standing owner authorization.
