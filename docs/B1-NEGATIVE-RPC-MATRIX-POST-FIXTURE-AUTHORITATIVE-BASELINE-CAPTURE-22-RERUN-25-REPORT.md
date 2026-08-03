# PORTAL-B1-NEGATIVE-RPC-MATRIX-POST-FIXTURE-AUTHORITATIVE-BASELINE-CAPTURE-22-RERUN-25 — Report

Mode: **PRODUCTION READ-ONLY BASELINE CAPTURE ONLY**
Execution SHA (reviewed package): `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e`
Production migration head: `20260801021541` (previous `20260731203030`, no later versions, single occurrence)

Decision: **PASS_B1_NEGATIVE_RPC_MATRIX_POST_FIXTURE_AUTHORITATIVE_BASELINE_CAPTURED_AND_PINNED**

## 1. Capture session

| Field | Value |
| --- | --- |
| isolation | `SERIALIZABLE READ ONLY` (single transaction, `transaction_read_only = on`) |
| principal | `supabase_read_only_user` |
| captured_at_utc | `2026-08-01T23:33:44Z` |
| valid_for_minutes | 120 |
| production writes | 0 |
| workflow RPC calls | 0 |
| migrations applied | 0 |
| deploy / publish | none |

## 2. Fingerprint (G2)

Canonical 24-relation expression from `scripts/b1-rpc-principal-harness-01/fingerprint.sql`,
computed twice inside the same snapshot:

```
fp_first  = 4c95c6a344cee2f52ade4a5312bd8240
fp_second = 4c95c6a344cee2f52ade4a5312bd8240
drift     = NONE
```

## 3. Function graph (G6)

Closure 28 / resolved 28 / **matching 28** / mismatched 0.
Owner violations 0, `search_path` violations 0, entrypoint overloads 1.

Entrypoint `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` normalized SHA256
= `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b`, identical to the
reattested pin from mission **…REATTESTATION-AND-SOURCE-REPIN-23**. The CAPTURE-22 drift is
resolved; no new drift observed.

## 4. Fixture state (G4)

19 requests (`internal_notes = TEST_ONLY_B1_FIXTURE_13`), 104 steps, 19 active steps,
0 requests with a non-single active step, 5 transfer details, 0 workflow events, 0 fee
assessments, all statuses `in_review`.
Distribution: `file_withdrawal 6`, `department_transfer 5`, `final_chance 4`,
`enrollment_suspension 2`, `excused_absence 2`.

## 5. Protected state (G7)

`enrollment_certificate`: active `true`, student_visible `true`, 4 requests, 2 document
details, 2 official documents, latest activity `2026-07-16T04:44:29Z` — unchanged.
Five B1 services all `student_visible = false`, `is_active = true`.

State pins: student_requests 52, steps 160, events 83, attachments 1, uploads 8,
student_fees 0, student_payments 0, payment_receipts 0, notifications 6, audit_logs 2625,
excused_absences 2, extra_chances 1, processing assignments 26, student_profiles 848.

## 6. Pinned artifacts

- `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` → `PINNED`,
  `execution_authorized = true`, sha256 `2e52a3edf5b6f11091df023e6468fea3b5517408a9cf86a1a677243575a9328e`
- `TARGET-MANIFEST.json → authoritative_baseline` mirrors status, fingerprint, SHA, head, scope
  and the new artifact hash; archived STALE predecessor stays non-selectable.
- Harness head gates repointed to `20260801021541`
  (`00-preflight.sql`, `run-negative-matrix.ps1`), package re-rendered: `generated/pins.sql`
  carries `baseline_status = PINNED`, `baseline_fingerprint = 4c95c6a3…`,
  `baseline_execution_authorized = true`; `generated/fingerprint-check.sql` renders the
  pinned expected fingerprint with the `HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE` family.

All 14 fail-closed rejection rules remain in force and unchanged.

## 7. Verification

| Command | Result |
| --- | --- |
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | 267 negative cases + master rendered |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bunx tsc --noEmit` | clean |
| `git diff --check` | clean |

## 8. Flags

```
ACTIVE_BASELINE_PINNED
FINGERPRINT_4c95c6a344cee2f52ade4a5312bd8240
DRIFT_NONE
FUNCTION_GRAPH_28_OF_28_MATCHING
MIGRATION_HEAD_20260801021541
OPERATOR_PREFLIGHT_NOT_RUN
NEGATIVE_CASES_EXECUTED_0
ZERO_RPC_CALLS
ZERO_PRODUCTION_WRITES
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
```
