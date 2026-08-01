# PORTAL-B1-NEGATIVE-RPC-MATRIX-POST-FIXTURE-AUTHORITATIVE-BASELINE-CAPTURE-22 — Report

Mode: PRODUCTION READ-ONLY BASELINE CAPTURE ONLY
Production project: `wpmicqriltrowwonknox`
Production read-only capture timestamp (UTC): **2026-08-01T02:21:24Z**

## FINAL DECISION

```text
HOLD_B1_NEGATIVE_RPC_MATRIX_POST_FIXTURE_BASELINE_FUNCTION_GRAPH_DRIFT
```

G6 failed. The baseline was **NOT** pinned: the canonical
`AUTHORITATIVE-BASELINE.json` remains `PENDING` / `fingerprint = null` /
`execution_authorized = false`. Fail-closed, per G6
(`HOLD_B1_POST_FIXTURE_BASELINE_FUNCTION_GRAPH_DRIFT`).

## G0 — Source and state gate (PASS)

| Item | Value |
|---|---|
| Authoritative main SHA `f3d0b15e…` is ancestor of local HEAD | yes |
| Diff vs `f3d0b15e` for harness / matrix / fixture SQL | none |
| MATRIX totals | 267 defined / 267 executable / 0 blocked |
| Rebound cases | 22 (19 illegal-action + 3 transfer-scope) |
| MATRIX SHA-256 (LF) | `5c76faffd33ccd9ed57ffc7d5a93f3217feea48cf33170414a4f06b07c5c7e46` (equals manifest pin) |
| Fixture migration applied | exactly once (`20260801021541`) |
| Cleanup migration | NOT_APPLIED / not registered |
| Active baseline | `PENDING`, fingerprint null, `execution_authorized=false` |
| Operator preflight executed | false |
| Negative cases executed | 0 |

## G1/G2 — Trusted channel and single consistent capture (PASS)

One transaction: `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY; … COMMIT;`
`current_database = postgres`, `transaction_read_only = on`,
`transaction_isolation = serializable`. Zero DML, zero DDL, zero RPC calls,
no role escalation, no secrets recorded. No retry after any serialization
failure (none occurred).

| Fingerprint | Value |
|---|---|
| first | `b67ba689c697ca3c01e026bd70b2ae0408a68edf7af290c71d504a72b505fd46` |
| second | `b67ba689c697ca3c01e026bd70b2ae0408a68edf7af290c71d504a72b505fd46` |
| drift | NONE (identical, non-null) |

Fingerprint domain: migration head + migration count, all fixture requests,
all 104 fixture runtime steps (id/key/order/status/singular identity/
`direct_assignment_id`), all fixture transfer details, the six service
visibility rows, the protected enrollment-certificate triple, and the 28
function-graph entries (definition SHA-256, security, owner, `search_path`).

## G3 — Migration history (PASS)

| Item | Value |
|---|---|
| head | `20260801021541` |
| previous head | `20260731203030` |
| head occurrences | 1 |
| migrations later than head | 0 |
| last 6 | `20260801021541, 20260731203030, 20260730175527, 20260730000034, 20260729173359, 20260729014519` |
| cleanup registered | no |
| manual repair / drift | none observed |

## G4 — Fixture inventory (PASS)

| Metric | Observed | Expected |
|---|---:|---:|
| fixture requests | 19 | 19 |
| runtime steps | 104 | 104 |
| active steps | 19 | 19 |
| completed steps | 52 | — |
| pending steps | 33 | — |
| transfer details | 5 | 5 |
| request markers | 19 | 19 |
| step markers | 104 | 104 |
| requests not `in_review` | 0 | 0 |
| requests with ≠1 active step | 0 | 0 |
| singular-identity violations | 0 | 0 |
| assignment-provenance mismatches | 0 | 0 |
| fixture workflow events | 0 | 0 |
| fixture fee assessments / receipts | 0 / 0 | 0 / 0 |

Service distribution: department_transfer 5, enrollment_suspension 2,
excused_absence 2, file_withdrawal 6, final_chance 4.

### Pinned active steps (19)

| Request | Service | Step key | Ord | Configured action | Unit / role | Identity kind | Pred done | Succ pending | Dept scope |
|---|---|---|--:|---|---|---|--:|--:|---|
| SR-20260801-13000001 | department_transfer | source_department_head_approval | 2 | approve | department / department_head | position_assignment | 1/1 | 4/4 | IT→CS |
| SR-20260801-13000002 | department_transfer | target_department_head_approval | 3 | approve | department / department_head | position_assignment | 2/2 | 3/3 | IT→CS |
| SR-20260801-13000003 | department_transfer | dean_approval | 4 | approve | dean / dean | faculty_profile | 3/3 | 2/2 | IT→CS |
| SR-20260801-13000004 | department_transfer | payment_confirmation | 5 | confirm_payment | finance / revenue_finance_officer | staff_profile | 4/4 | 1/1 | IT→CS |
| SR-20260801-13000005 | department_transfer | registrar_apply | 6 | apply_decision | registrar / registrar_general | staff_profile | 5/5 | 0/0 | IT→CS |
| SR-20260801-13000006 | enrollment_suspension | manager_approval | 2 | approve | student_affairs / student_affairs_manager | staff_profile | 1/1 | 1/1 | — |
| SR-20260801-13000007 | enrollment_suspension | registrar_apply | 3 | apply_decision | registrar / registrar_general | staff_profile | 2/2 | 0/0 | — |
| SR-20260801-13000008 | excused_absence | manager_review | 2 | approve | student_affairs / student_affairs_manager | staff_profile | 1/1 | 1/1 | — |
| SR-20260801-13000009 | excused_absence | record_apply | 3 | apply_decision | student_affairs / student_affairs_specialist | staff_profile | 2/2 | 0/0 | — |
| SR-20260801-13000010 | file_withdrawal | library_clearance | 2 | clear | library / library_officer | staff_profile | 1/1 | 5/5 | — |
| SR-20260801-13000011 | file_withdrawal | labs_clearance | 3 | clear | labs / labs_manager | staff_profile | 2/2 | 4/4 | — |
| SR-20260801-13000012 | file_withdrawal | activities_clearance | 4 | clear | student_affairs / student_affairs_manager | staff_profile | 3/3 | 3/3 | — |
| SR-20260801-13000013 | file_withdrawal | finance_clearance | 5 | clear | finance / revenue_finance_officer | staff_profile | 4/4 | 2/2 | — |
| SR-20260801-13000014 | file_withdrawal | registrar_apply | 6 | apply_decision | registrar / registrar_general | staff_profile | 5/5 | 1/1 | — |
| SR-20260801-13000015 | file_withdrawal | archive | 7 | archive | archive / archive_officer | staff_profile | 6/6 | 0/0 | — |
| SR-20260801-13000016 | final_chance | manager_review | 2 | approve | student_affairs / student_affairs_manager | staff_profile | 1/1 | 3/3 | — |
| SR-20260801-13000017 | final_chance | dean_decision | 3 | approve | dean / dean | faculty_profile | 2/2 | 2/2 | — |
| SR-20260801-13000018 | final_chance | payment_confirmation | 4 | confirm_payment | finance / revenue_finance_officer | staff_profile | 3/3 | 1/1 | — |
| SR-20260801-13000019 | final_chance | registrar_apply | 5 | apply_decision | registrar / registrar_general | staff_profile | 4/4 | 0/0 | — |

Every active step id is deterministic (`f1300001-0000-4000-8000-<ord><order>`),
carries exactly one identity column, and pins `direct_assignment_id`.

## G5 — Matrix binding for cases 0242–0267 (PASS)

| Check | Result |
|---|---|
| rebound cases | 22 |
| missing requests | 0 |
| missing runtime steps | 0 |
| inactive target steps | 0 |
| actor mismatch | 0 |
| action mismatch (literal configured action) | 0 |
| unit/role mismatch | 0 |
| department-scope mismatch | 0 (source IT, target CS, unrelated CIS never stored) |
| payment cases keyed by runtime step UUID | yes |
| totals | 267 total / 267 executable / 0 blocked |
| cases executed | 0 |

## G6 — Function graph (FAIL — HOLD CAUSE)

Closure size 28, all 28 resolved in production, 0 null hashes, owners all
`postgres`, `prosecdef` and `search_path` exactly as pinned for all 28,
trigger-aware closure intact, no new reachable function, no prohibited
external effect.

**One definition SHA-256 mismatch (mismatched = 1, required 0):**

| Signature | Manifest pin | Production (2026-08-01) |
|---|---|---|
| `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` | `109033a026b765266eb33ae5bd993118c9c6a69a3250520304b0c6ab9fedf791` | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |

Hash method reproduced exactly as the preflight defines it
(`sha256(btrim(regexp_replace(pg_get_functiondef(oid),'\s+',' ','g')))`); the
other 27 pins match byte-for-byte, which validates the method.

Provenance: the entry-point RPC was last redefined by applied migration
`20260730175527` (literal configured-action remediation), i.e. **after** the
manifest attestation dated `2026-07-29T06:20:00Z`. This drift is
pre-existing and unrelated to the fixture migration `20260801021541`, which
created data rows only and defined no function.

Remediation required before a baseline can be pinned: a separate read-only
attestation mission that re-pins the entry-point definition SHA in
`TARGET-MANIFEST.json` against the reviewed source of `20260730175527`.
No such change was made in this mission.

## G7 — Protected state (PASS)

| Item | Observed | Required |
|---|---|---|
| `enrollment_certificate` is_active / student_visible | true / true | true / true |
| enrollment_certificate requests | 4 | 4 |
| `enrollment_certificate_document_details` | 2 | 2 |
| `official_documents` | 2 | 2 |
| latest official-document timestamp | `2026-07-16 04:44:29.338193+00` | identical |
| five B1 services active + hidden | 5 | 5 |
| non-fixture requests | 33 | pinned |
| fixture workflow events | 0 | 0 |
| attachments | 1 | pinned |
| storage objects | 29 | pinned |
| auth users | 911 | pinned |
| audit logs | 2625 | pinned |
| academic-effect rows created by this mission | 0 | 0 |

## G8 — Baseline artifact (NOT PINNED)

Because G6 failed, no baseline artifact was written. Values that *would*
have been pinned are recorded here for the follow-up mission only:

```json
{
  "status": "PENDING (capture withheld — FUNCTION_GRAPH_DRIFT)",
  "execution_authorized": false,
  "operator_preflight_executed": false,
  "negative_cases_executed": 0,
  "reviewed_package_sha": "f3d0b15eb1cf0506454fdae91d17354972242cf6",
  "migration_head": "20260801021541",
  "matrix_sha256_lf": "5c76faffd33ccd9ed57ffc7d5a93f3217feea48cf33170414a4f06b07c5c7e46",
  "fingerprint_observed": "b67ba689c697ca3c01e026bd70b2ae0408a68edf7af290c71d504a72b505fd46",
  "captured_at_utc": "2026-08-01T02:21:24Z",
  "valid_for_minutes": null
}
```

## G9 — Local source output

Changed files: **this report only.** Baseline JSON, TARGET-MANIFEST, fixture
and cleanup SQL, migrations, runtime application source, role/RLS
definitions, service visibility and archived baselines were all left
untouched. No credentials, dumps or sensitive output stored.

## G10 — Offline validation

| Gate | Result |
|---|---|
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | 267 negative cases + master rendered |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | 183 pass / 0 fail |
| Operator preflight | NOT RUN |
| Production RPC calls | 0 |
| Production writes | 0 |

## Flags

```text
MIGRATION_HEAD_20260801021541
FIXTURE_REQUESTS_19
WORKFLOW_STEPS_104
ACTIVE_STEPS_19
TRANSFER_DETAILS_5
REBOUND_CASES_22_VALID
NEGATIVE_TOTAL_267
EXECUTABLE_267
BLOCKED_0
FINGERPRINT_NON_NULL
FINGERPRINT_DRIFT_NONE
FUNCTION_GRAPH_27_OF_28   <-- required 28_OF_28, NOT MET
ENROLLMENT_CERTIFICATE_UNCHANGED
FIVE_B1_SERVICES_REMAIN_HIDDEN
BASELINE_NOT_PINNED       <-- fail-closed, required BASELINE_PINNED_FOR_REVIEW NOT MET
EXECUTION_AUTHORIZED_FALSE
OPERATOR_PREFLIGHT_NOT_RUN
NEGATIVE_CASES_EXECUTED_0
ZERO_RPC_CALLS
ZERO_PRODUCTION_WRITES
CLEANUP_NOT_APPLIED
NO_ROLE_CHANGE
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
```

Stopped after this report. Operator Preflight was not started and remains
unauthorized.
