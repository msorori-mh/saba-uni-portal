# PORTAL-B1-NEGATIVE-RPC-MATRIX-FRESH-AUTHORITATIVE-BASELINE-CAPTURE-12

**MODE:** LOVABLE PRODUCTION READ-ONLY BASELINE CAPTURE ONLY
**PRODUCTION PROJECT:** wpmicqriltrowwonknox
**REPORT TIMESTAMP (UTC):** 2026-07-31T22:5x (see capture rows below)

## FINAL DECISION

**HOLD_B1_NEGATIVE_RPC_MATRIX_BASELINE_CAPTURE_CURRENT_SCOPE_INCOMPLETE**

A fresh authoritative baseline was **not** pinned. The blocker is G6: after the
Stage 3 forward-only cleanup, production no longer contains a complete, current,
**non-stale** request scope capable of supporting the five-service negative
authorization matrix, and fixture creation is forbidden by this mission.

The active baseline therefore remains untouched in its fail-closed `PENDING`
state. No source artifact was modified by this mission.

---

## G0 — SOURCE GATE — PASS (with known generated noise)

| Item | Value |
| --- | --- |
| Reviewed SHA | `b719801b898160c9fad9f4e5fcc99b39fb250238` (present in history) |
| Working head | `bc6d983eae14daa5a987f0c2c268a34fd8e69893` |
| `git diff b719801b..HEAD -- scripts/b1-rpc-principal-harness-01/` | EMPTY |
| `git diff b719801b..HEAD -- tests/b1-five-services-rpc-authorization-preflight-01/` | EMPTY |
| Whole-tree diff vs reviewed SHA | only `src/routeTree.gen.ts` (known generated TanStack footer noise, not committed by this mission) |

Active baseline (`scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json`):

- `status = PENDING`
- `fingerprint = null`
- `execution_authorized = false`
- `scope = []`
- `expected_migration_head = 20260731203030`

Archived stale baseline
(`baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json`) is
`status = STALE`, `selectable_by_launcher = false` — **not selected, not reused.**

## G1 — TRUSTED READ-ONLY CHANNEL — PASS

| Item | Verdict |
| --- | --- |
| Channel | Lovable Cloud production read-only SQL channel |
| project_ref | `wpmicqriltrowwonknox` |
| Database principal | `supabase_read_only_user` |
| `transaction_read_only` | `on` |
| DML / DDL issued | 0 / 0 |
| Workflow RPC calls | 0 |
| Role switching | none |
| Secrets recorded | none (no credentials, connection strings, tokens or dumps in this report) |

## G2 — SINGLE CONSISTENT TRANSACTION — NOT REACHED

The dual-fingerprint SERIALIZABLE READ ONLY capture was **not executed**,
because the G6 scope precondition failed before any fingerprint was pinned.
Executing a capture over an incomplete scope would have produced a baseline that
cannot bind the matrix. Counts for this mission:

- production transactions performed: read-only inspection statements only
- DML = 0, DDL = 0, RPC = 0, production writes = 0
- fingerprint pinned: **none** (active baseline fingerprint stays `null`)

## G3 — MIGRATION HISTORY — PASS

| Item | Value |
| --- | --- |
| Production migration head | `20260731203030` |
| Cleanup migration occurrences | 1 (exactly once) |
| Migrations later than head | 0 |
| Verdict | MATCH — no migration-history drift |

## G4 — PACKAGE BINDING — NOT PINNED

Binding values are unchanged and remain declared in the reviewed package, but
were **not** written into a baseline artifact because no baseline was pinned:

- `reviewed_package_sha = b719801b898160c9fad9f4e5fcc99b39fb250238`
- `matrix_sha256_lf = fd2621877d4db1df5927f0583d6de5a269c9e50b258578592c299f373459739d`
- negative_total = 267, executable = 245, blocked = 22
- function graph closure = 28
- canonical baseline artifact path =
  `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json`
- fingerprint expression: **unmodified** (`scripts/b1-rpc-principal-harness-01/fingerprint.sql`,
  delimiters `BEGIN_FINGERPRINT_EXPR` / `END_FINGERPRINT_EXPR`)

## G5 — FUNCTION GRAPH — NOT EXECUTED

Not performed: the mission's function-graph attestation exists to bind a pinned
baseline. With G6 failed, no baseline can be pinned, so the 28-function catalog
attestation was deliberately not run. No claim of `28/28` is made by this
mission.

## G6 — CURRENT SAFE REQUEST SCOPE — **FAIL (BLOCKER)**

Current production inventory for the five B1 services (live read):

| request_number | service | status | steps | active steps | chain |
| --- | --- | --- | --- | --- | --- |
| SR-20260727-3E20EA8D | department_transfer | draft | 0 | 0 | — |
| SR-20260727-88D885F0 | department_transfer | completed | 6 | 0 | all completed |
| SR-20260727-2A69DE8D | enrollment_suspension | draft | 0 | 0 | — |
| SR-20260727-50BEDCE2 | enrollment_suspension | completed | 3 | 0 | all completed |
| SR-20260727-F67CF366 | enrollment_suspension | submitted | 3 | 1 | initial_review/active → manager_approval/pending → registrar_apply/pending |
| SR-20260727-695EC35B | excused_absence | completed | 3 | 0 | all completed |
| SR-20260727-78427CC5 | excused_absence | completed | 3 | 0 | all completed |
| SR-20260727-9952DED4 | excused_absence | draft | 0 | 0 | — |
| SR-20260727-254B6B52 | file_withdrawal | draft | 0 | 0 | — |
| SR-20260727-702A54ED | file_withdrawal | draft | 0 | 0 | — |
| SR-20260727-42393846 | file_withdrawal | completed | 7 | 0 | all completed |
| SR-20260727-3C550070 | final_chance | in_review | 5 | 1 | registrar_apply/active |
| SR-20260727-40E3E66B | final_chance | completed | 5 | 0 | all completed |
| SR-20260727-E0E2DC46 | final_chance | draft | 0 | 0 | — |

Exclusion rules applied per mission:

- stale scope entries (present verbatim in the archived stale baseline) are **not reusable**:
  `SR-20260727-42393846`, `SR-20260727-50BEDCE2`, `SR-20260727-3C550070`,
  `SR-20260727-88D885F0`, `SR-20260727-695EC35B`,
  `SR-20260713-2DE64041`, `SR-20260715-FEDCB3E1`, `SR-20260716-26BAD4C8`
- deleted TEST_ONLY requests (Stage 3 cleanup, 37 requests) — absent, not reusable
- draft requests carry **0 workflow steps** and therefore expose no authorization
  gate the negative matrix can target

Result after exclusions — non-stale requests carrying an active workflow step:

| service | usable non-stale request with an active step |
| --- | --- |
| enrollment_suspension | `SR-20260727-F67CF366` (initial_review/active) — 1 |
| excused_absence | **none** |
| department_transfer | **none** |
| final_chance | **none** (only stale `SR-20260727-3C550070`) |
| file_withdrawal | **none** |

Coverage = **1 of 5 services**. A complete current safe scope does not exist,
and fixture creation is explicitly forbidden by this mission
→ `HOLD_B1_BASELINE_CAPTURE_CURRENT_SCOPE_INCOMPLETE`.

## G7 — PROTECTED STATE — PASS (verified read-only, not pinned)

enrollment_certificate baseline:

| Item | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| is_active | true | true | MATCH |
| student_visible | true | true | MATCH |
| requests | 4 | 4 | MATCH |
| document_details | 2 | 2 | MATCH |
| official_documents | 2 | 2 | MATCH |
| latest relevant timestamp | 2026-07-16 04:44:29.338193+00 | 2026-07-16 04:44:29.338193+00 | MATCH |

Five B1 services — active and hidden:

| service | is_active | student_visible |
| --- | --- | --- |
| enrollment_suspension | true | false |
| excused_absence | true | false |
| department_transfer | true | false |
| final_chance | true | false |
| file_withdrawal | true | false |

Supporting read: `request_processing_assignments` = 26 rows.
No protected-state drift observed. Nothing was pinned into an artifact.

## G8 — BASELINE VALIDITY — NOT APPLICABLE

No baseline was captured, so no `captured_at_utc` / `expires_at_utc` /
`valid_for_minutes = 120` window exists. The active baseline remains:

- `status = PENDING`
- `fingerprint = null`
- `execution_authorized = false`
- `operator_preflight_executed = false`
- `negative_cases_executed = 0`

## G9 — SOURCE OUTPUT

Changed files (this mission):

- `docs/B1-NEGATIVE-RPC-MATRIX-FRESH-AUTHORITATIVE-BASELINE-CAPTURE-12-REPORT.md` (new, this report)

Explicitly **not** modified: active baseline JSON, `TARGET-MANIFEST.json`,
generated pins, archived stale baseline, application runtime source, migrations,
RLS/grants, enrollment_certificate implementation, service visibility.

## G10 — OFFLINE VALIDATION — DEFERRED

Offline re-render and the full test sweep validate a *captured* baseline. With
the capture held at G6 and **zero** source artifacts changed, there is nothing
new to validate; the reviewed package at `b719801b…` was already validated at
`267 / 245 / 22 / 28` by the preceding independent reviews (Cursor = PASS,
Codex = PASS). Operator Preflight remains unexecuted.

## G11 — PRODUCTION OPERATION COUNTS

| Counter | Value |
| --- | --- |
| Production writes | 0 |
| DML statements | 0 |
| DDL statements | 0 |
| Workflow RPC calls | 0 |
| Negative cases executed | 0 |
| Operator Preflight runs | 0 |
| Migrations applied | 0 |
| Deploys / Publishes | 0 |
| Role / GRANT / REVOKE / RLS changes | 0 |
| Fixtures created | 0 |
| Auth / Storage modifications | 0 |
| `student_visible` changes | 0 |

## REQUIRED FLAGS

```
REVIEWED_SHA_B719801B898160C9FAD9F4E5FCC99B39FB250238
LOVABLE_PRODUCTION_READ_ONLY_CAPTURE
MIGRATION_HEAD_20260731203030
FINGERPRINT_NON_NULL              -> NOT MET (capture held at G6; fingerprint remains null)
FINGERPRINT_DRIFT_NONE            -> N/A (no fingerprint computed)
FUNCTION_GRAPH_28_OF_28           -> NOT EXECUTED
STALE_SCOPE_NOT_REUSED
ENROLLMENT_CERTIFICATE_UNCHANGED
FIVE_B1_SERVICES_REMAIN_HIDDEN
BASELINE_PINNED_FOR_REVIEW        -> NOT MET (baseline remains PENDING)
EXECUTION_AUTHORIZED_FALSE
OPERATOR_PREFLIGHT_NOT_RUN
NEGATIVE_CASES_EXECUTED_0
ZERO_RPC_CALLS
ZERO_PRODUCTION_WRITES
NO_ROLE_CHANGE
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
```

## WHAT UNBLOCKS THIS

A future, separately authorized mission must decide **one** of:

1. Authorize creation of fresh `TEST_ONLY` fixtures (one non-terminal request per
   service, each parked at its first authorization gate) — currently forbidden; or
2. Re-scope the negative matrix contract so it may bind terminal/`completed`
   requests and the surviving evidence records, which requires amending the
   fingerprint scope and the reviewed package (new review cycle); or
3. Explicitly re-authorize reuse of the surviving evidence request numbers as a
   fresh scope, acknowledging they overlap the archived stale baseline's scope
   list.

No further action was taken. Stopping before Operator Preflight, as instructed.
