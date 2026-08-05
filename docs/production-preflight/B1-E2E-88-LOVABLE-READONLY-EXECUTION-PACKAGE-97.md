# B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97

| field | value |
|---|---|
| package | `PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97` |
| mode | **READ-ONLY preflight execution package only** |
| Lovable project id | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| production Supabase project ref | `wpmicqriltrowwonknox` |
| repository | `msorori-mh/saba-uni-portal` |
| branch | `fix/b1-e2e-88-preflight-ledger-permission-108` |
| source merge commit | `e0cf9d48acb562109aaf310dbd5e534b900c6d90` |
| PR #281 source HEAD | `630bb9d1eac55b97e0723381d8d859a463dfaacc` |
| ledger-permission remediation | `PORTAL_B1_E2E_88_PREFLIGHT_LEDGER_PERMISSION_FIX_108` |
| channel | Lovable-managed **production database** (read / query channel) |
| execution status | **NOT EXECUTED by this source package** |

## Migration 88 identity (pinned; do not rewrite)

| field | value |
|---|---|
| filename | `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql` |
| expected version | `20260804120000` |
| expected managed alias token | `b1_88_request_scoped_e2e_support` |
| raw SHA-256 | `b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c` |
| LF SHA-256 | `fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a` |
| raw bytes | `58236` |
| LF bytes | `56666` |
| LF lines | `1571` |

## Read-only preflight SQL (execute exactly once)

| field | value |
|---|---|
| path | `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` |
| raw SHA-256 | `e65dc4ae5f36a692e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68` |
| LF SHA-256 | `e65dc4ae5f36a692e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68` |
| raw bytes | `57376` |
| LF bytes | `57376` |
| LF lines | `1262` |

## Explicit non-authorization

**Executing this package does NOT authorize Migration 88 apply.**  
It does NOT authorize Deploy, Publish, Auth writes, password changes, visibility changes, assignment changes, fixture mutations, or any write SQL.

## Operator steps (exactly once)

1. Confirm Lovable project `4b291119-790f-4484-9285-c2b774e1ba6f` is bound to production Supabase ref **`wpmicqriltrowwonknox`** via the trusted Lovable channel. If unproven → **STOP** (`HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN`).
2. Open the Lovable-managed production database query channel.
3. Do **not** use `set_config` or any user-supplied GUC to force G01 or G02 PASS. SQL G01 remains **UNPROVEN** by design; SQL G02 ledger readability remains **UNPROVEN** by design when the managed ledger cannot be read independently.
4. Paste and execute **the entire** file  
   `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql`  
   exactly once, unmodified.
5. Archive the full result set (14 gate rows G01–G14).
6. Collect **trusted Lovable-managed migration-history metadata** outside SQL (see G02 final classification below). User prompt text, operator GUCs, and `set_config` do **not** count.
7. Classify PASS/HOLD using the rules below.
8. Do **not** apply Migration 88 from this package.

## Required result schema

Exactly one deterministic result set with **one row per gate** (14 rows), columns:

| column | type |
|---|---|
| `gate` | text (`G01` … `G14`) |
| `check_name` | text |
| `status` | text (`PASS`, `HOLD`, or `UNPROVEN` for G01/G02 SQL ledger identity) |
| `detail` | text |
| `evidence` | jsonb |

## Gate summary

| gate | purpose |
|---|---|
| G01 | Project identity — SQL always **UNPROVEN**; trusted Lovable channel attests `wpmicqriltrowwonknox` |
| G02 | Migration ledger — SQL never queries the managed ledger; returns **UNPROVEN** / `HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE` when ledger unreadable; separately reports pg_catalog object-state + source/alias identity; final class combines trusted Lovable migration-history metadata |
| G03 | Full Migration-88 object inventory (3 tables + 18 M88-only functions + 2 triggers + RLS/ACL) — any non-zero subset → `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| G04 | Four replaced-function base preimage fingerprints (deterministic ACL / null markers) |
| G05 | Five services `is_active=true` and `student_visible=false` |
| G06 | `enrollment_certificate` protected + protected request/document identities |
| G07 | Full 19-Fixture matrix pins (id/number/type/status/step/unit/role/action/assignee/dept) |
| G08 | Five-service RPA fingerprint (includes `position_assignment_id`; empty → HOLD) |
| G09 | Protected-surface fingerprints (empty/missing → HOLD) |
| G10 | TEST_ONLY identity inventory (password usability **UNKNOWN**) |
| G11 | Production E2E prerequisites classification (READY / NOT_READY / AMBIGUOUS / UNPROVEN) |
| G12 | Apply feasibility record (does **not** authorize apply; does not require ledger SELECT success) |
| G13 | Decommission draft pin + base restore fingerprints |
| G14 | Stop conditions / final HOLD detail |

## G02 final classification (SQL + trusted Lovable ledger attestation)

SQL alone **cannot** independently prove managed migration-ledger state. The preflight SQL deliberately does **not** reference the managed ledger relation (the Lovable read-only role may lack schema USAGE and would otherwise abort with `permission denied for schema …`).

### 1) SQL result (always archived)

From gate G02 evidence / detail:

| SQL field | meaning |
|---|---|
| `ledger_readability` | always `UNREADABLE` from this SQL package |
| `status` / `detail` when ledger unreadable and objects not partial | `UNPROVEN` / `HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE` |
| `object_state_code` | pg_catalog-only inference |
| `source_version_identity` | pinned `20260804120000` |
| `expected_managed_alias_identity` | pinned `b1_88_request_scoped_e2e_support` |

Object-state inference rules (pg_catalog only):

| condition | `object_state_code` |
|---|---|
| zero Migration-88 objects | `OBJECT_STATE_NOT_APPLIED` |
| non-zero incomplete subset | `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| complete expected object set | `OBJECT_STATE_APPLIED_OR_EQUIVALENT` |
| ambiguity | `HOLD` |

**Do not** classify Migration 88 definitively `NOT_APPLIED` solely because the ledger is unreadable.

Partial object state forces SQL G02 `status = HOLD` with `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED`. G03–G14 continue regardless.

### 2) Trusted Lovable-managed migration metadata (outside SQL)

Operator must obtain from the trusted Lovable channel (not user prompt / GUC / `set_config`):

| attestation field | required |
|---|---|
| source migration version | yes (`20260804120000` or proven equivalent) |
| known managed alias | yes (token / rewritten filename identity) |
| whether Migration 88 is already applied | yes |
| whether an equivalent migration exists | yes |

### 3) Combined final G02

| SQL ledger | SQL object-state | Trusted Lovable attestation | Final G02 |
|---|---|---|---|
| UNREADABLE | partial / ambiguous HOLD | any | **HOLD** |
| UNREADABLE | absent or complete (inference only) | unavailable / untrusted | **HOLD** (remain fail-closed) |
| UNREADABLE | `OBJECT_STATE_NOT_APPLIED` | proves not applied + no equivalent | operational **PASS** only if G03–G14 also allow |
| UNREADABLE | `OBJECT_STATE_APPLIED_OR_EQUIVALENT` | proves applied or equivalent | **HOLD** (`MIGRATION_88_ALREADY_APPLIED` / equivalent) |
| UNREADABLE | any | conflicts with object-state | **HOLD** |

If Lovable cannot provide trusted migration-history metadata → **Final G02 remains HOLD**.

## PASS / HOLD classification rules

- Final operational classification requires **trusted Lovable channel identity** (`wpmicqriltrowwonknox`) **and** SQL G02–G14 results **and** trusted Lovable migration-history attestation for final G02.
- G01 from SQL is **UNPROVEN** and never PASS from user-supplied values.
- G02 SQL ledger readability is **UNPROVEN** when the managed ledger cannot be read independently; final G02 requires trusted Lovable migration-history metadata.
- Any gate `status = HOLD` among G02–G14 (or unresolved G01 channel attestation, or missing Lovable ledger attestation) ⇒ overall production preflight **HOLD**.
- Partial Migration-88 objects ⇒ `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED`.
- Function fingerprint ≠ base or body contains `b1_e2e_88` ⇒ `HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT`.
- Wrong Fixture service/step routing ⇒ HOLD.
- G11 cannot become production-ready PASS while `password_usability = UNKNOWN`.
- Any query error or unexpected result count ⇒ **HOLD**.
- Source-package readiness (`PASS_B1_E2E_88_READONLY_PREFLIGHT_PACKAGE_SOURCE_READY`) is separate from a live production PASS.

## Prohibitions

- No Migration 88 apply
- No Deploy / Publish
- No Auth user create/update/delete
- No password or session material changes
- No visibility / workflow / assignment / fixture / request writes
- No secrets or connection strings in this package
- No operator `set_config` identity or ledger proof
- No GRANT / schema changes requested from this package
- No static or dynamic SQL against the managed migration ledger relation

## Decommission companion (pin only; do not apply)

| field | value |
|---|---|
| path | `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` |
| raw SHA-256 | `61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d` |
| LF SHA-256 | `e77ea69b3c7914408af06c4c2b9ea50ce9fbd217d380507c94b0a2766107bce8` |
| raw bytes | `29733` |

## Final recommendation after successful source review

`READY_FOR_FAST_DELTA_REVIEW_AND_REEXECUTION`
