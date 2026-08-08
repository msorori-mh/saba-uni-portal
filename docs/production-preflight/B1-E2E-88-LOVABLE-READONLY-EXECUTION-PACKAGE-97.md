# B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97

| field | value |
|---|---|
| package | `PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97` |
| mode | **READ-ONLY preflight execution package only** |
| Lovable project id (active) | `90f4dcde-07fb-4441-b86a-6ad5510833b8` |
| Lovable project id (historical/stale; do not use) | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| production Supabase project ref | `wpmicqriltrowwonknox` |
| repository | `msorori-mh/saba-uni-portal` |
| branch | `fix/b1-e2e-88-preflight-g04-g07-repin-128` |
| source merge commit | `e00fbe611b888b1589a03a3b8716fb167fec09da` |
| G04/G07 source repin | `PORTAL_B1_E2E_88_G04_G07_SOURCE_REPIN_128` |
| evidence capture | `PORTAL_B1_E2E_88_PRODUCTION_REPIN_EVIDENCE_CAPTURE_125` |
| G04 analysis | `PORTAL_B1_E2E_88_G04_FUNCTION_REPIN_SOURCE_ANALYSIS_126` |
| G07 analysis | `PORTAL_B1_E2E_88_G07_FIXTURE_REPIN_SOURCE_ANALYSIS_127` |
| uuid/text remediation | `PORTAL_B1_E2E_88_PREFLIGHT_UUID_TEXT_FIX_116` |
| privileged-schema remediation | `PORTAL_B1_E2E_88_PREFLIGHT_PRIVILEGED_SCHEMAS_FIX_112` |
| prior ledger-permission remediation | `PORTAL_B1_E2E_88_PREFLIGHT_LEDGER_PERMISSION_FIX_108` |
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
| raw SHA-256 | `01d5d27dd7a22d1fbfe4f7694900a6fc7a3ba2db9775ba60217db20732e0e348` |
| LF SHA-256 | `01d5d27dd7a22d1fbfe4f7694900a6fc7a3ba2db9775ba60217db20732e0e348` |
| raw bytes | `75453` |
| LF bytes | `75453` |
| LF lines | `1608` |

> Identity values above are filled by the focused G04/G07 source-repin commit after SHA recalculation. Do **not** reuse consumed identities `f58d5446…`, `e65dc4ae…`, `e1c1e8a0…`, or `ad3ce4f4…`. Execute only after merge and dual review.

## Explicit non-authorization

**Executing this package does NOT authorize Migration 88 apply.**  
It does NOT authorize Deploy, Publish, Auth writes, password changes, visibility changes, assignment changes, fixture mutations, or any write SQL.

## Operator steps (exactly once)

1. Confirm Lovable project `90f4dcde-07fb-4441-b86a-6ad5510833b8` is bound to production Supabase ref **`wpmicqriltrowwonknox`** via the trusted Lovable channel. If unproven → **STOP** (`HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN`). Do **not** use stale id `4b291119-790f-4484-9285-c2b774e1ba6f`.
2. Open the Lovable-managed production database query channel.
3. Do **not** use `set_config` or any user-supplied GUC to force G01, G02, G10, or G11 PASS. SQL G01 remains **UNPROVEN** by design; SQL G02 ledger readability remains **UNPROVEN** by design; SQL G10 Auth existence remains **UNPROVEN** by design.
4. Paste and execute **the entire** file  
   `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql`  
   exactly once, unmodified, **after** merge + dual review of the new SQL identity.
5. Archive the full result set (14 gate rows G01–G14).
6. Collect **trusted Lovable-managed external attestations** outside SQL (see below). User prompt text, operator GUCs, SQL literals, comments, and `set_config` do **not** count.
7. Classify PASS/HOLD by combining SQL gates with those attestations.
8. Do **not** apply Migration 88 from this package.

## Required result schema

Exactly one deterministic result set with **one row per gate** (14 rows), columns:

| column | type |
|---|---|
| `gate` | text (`G01` … `G14`) |
| `check_name` | text |
| `status` | text (`PASS`, `HOLD`, or `UNPROVEN`) |
| `detail` | text |
| `evidence` | jsonb |

## Gate summary

| gate | purpose |
|---|---|
| G01 | Project identity — SQL always **UNPROVEN**; trusted Lovable channel attests `wpmicqriltrowwonknox` |
| G02 | Migration ledger — SQL never queries the managed ledger; **UNPROVEN** / `HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE` + pg_catalog object-state; final class needs Lovable migration-history metadata |
| G03 | Full Migration-88 object inventory — any non-zero subset → `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| G04 | Four replaced-function **current-production** base preimage fingerprints (`8d0ca5f5…` / `8a8fb290…` / `4ae614f3…` / `4d564dd7…`) |
| G05 | Five services `is_active=true` and `student_visible=false` |
| G06 | `enrollment_certificate` protected + protected request/document identities |
| G07 | Full 19-Fixture matrix pins including `direct_assignee_principal_kind` + id + row/matrix fingerprints |
| G08 | Five-service RPA fingerprint (empty → HOLD) |
| G09 | Protected-surface fingerprints (empty/missing → HOLD) |
| G10 | Public-side TEST_ONLY identity inventory; Auth-user existence **UNPROVEN**; password/session **UNKNOWN**; SQL status **UNPROVEN** / `HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE` |
| G11 | Production E2E prerequisites — fail-closed while Auth/password/session unresolved |
| G12 | Apply feasibility record (does **not** authorize apply) |
| G13 | Decommission draft pin + cleanup restore fingerprints (unchanged companion pins) |
| G14 | Stop conditions / final HOLD detail |

## G04 current-production base fingerprints

| function | expected base fp | forbidden Migration-88 fp |
|---|---|---|
| `public.create_student_request(text, text, jsonb, text)` | `8d0ca5f5dfed004fb105ce0e5904e9ce` | `ed11125e55df36b154c432c7e28d7285` |
| `public.user_matches_workflow_runtime_step(uuid)` | `8a8fb2907a080a1fa782332d49086394` | `2fba2db758a2edd42b1c440a36a4aa47` |
| `public.current_user_matches_transfer_department_scope(uuid, text)` | `4ae614f3f203fdccb68a90ed38d60a91` | `396eb3a5f12fb7d46018823930d87851` |
| `public.can_current_user_act_on_step(uuid, text)` | `4d564dd7ee03dbbefaff1c607f6537b6` | `586893beacb33c10a1483b38e8d090fd` |

Canonicalization remains: `md5(regexp_replace(pg_get_functiondef) || owner || prosecdef || provolatile || proisstrict || proparallel || proconfig || ACL(order) || identity_args)`. Unique catalog match required. Body must not contain `b1_e2e_88`. Equality with a forbidden Migration-88 fingerprint forces HOLD.

## G07 assignee + matrix pins

- Fixture count / active row count expected: **19**
- Routing drift / missing / duplicates / unexpected expected: **0**
- Sole prior drift dimension: direct-assignee identity (kind + id)
- Expected full-matrix fingerprint: `ebc412c0ad1d3be9742fddd5219216a7` (`md5(string_agg(expected_row_fp, '|' ORDER BY expected_row_fp))`)
- Live kind derivation: `assigned_user_id` → `user`; else `assigned_staff_profile_id` → `staff_profile`; else `assigned_faculty_profile_id` → `faculty_profile`; else `assigned_position_assignment_id` → `position_assignment`; else NULL
- Exactly one direct-assignee column must be populated per authoritative fixture
- Fixture-15 remains `in_review` with archive active and six completed predecessors
- `enrollment_certificate` protection unchanged

## Privileged-schema contract (SQL)

Executable SQL may read only:

- `public`
- `pg_catalog`
- `information_schema`

SQL must **never** SELECT/JOIN/call/EXECUTE against:

- `auth`, `storage`, `vault`, `realtime`, `supabase_functions`, `supabase_migrations`, `net`, `cron`, `pgmq`
- any other non-whitelisted schema

Restricted schema names may appear only in comments, evidence labels, expected object-name strings, and `pg_catalog` metadata predicates. No `GRANT`/`REVOKE`, no `set_config`, no `search_path` mutation, no dynamic `EXECUTE`/`CALL`.

Gate continuity: G01–G14 must always return even when auth/storage/sibling schemas are absent, USAGE-denied, or unreadable.

## Required external attestations (outside SQL)

Final operational classification = SQL G01–G14 **plus** trusted Lovable-managed metadata. Prompt text, comments, SQL literals, user input, GUCs, and `set_config` are **not** trusted evidence.

### 1) Connected project identity

| attestation | required value |
|---|---|
| Lovable project ID | `90f4dcde-07fb-4441-b86a-6ad5510833b8` |
| Supabase ref | `wpmicqriltrowwonknox` |

### 2) Migration history

| attestation field | required |
|---|---|
| source migration version | yes (`20260804120000` or proven equivalent) |
| known managed alias | yes (token / rewritten filename identity) |
| whether Migration 88 is already applied | yes |
| whether an equivalent migration exists | yes |

### 3) Auth readiness

| attestation field | required |
|---|---|
| exact Auth user IDs for required TEST_ONLY actors | yes |
| whether each required TEST_ONLY Auth user exists | yes |
| password usability where the managed channel can prove it | yes (never print password values/secrets) |
| session usability where the managed channel can prove it | yes (never print session secrets) |

SQL alone leaves Auth existence **UNPROVEN** and password/session **UNKNOWN**.

### 4) Storage / protected-schema evidence

Any required storage or other protected-schema evidence that SQL cannot read must be attested via the trusted Lovable channel outside SQL.

## G02 final classification (SQL + trusted Lovable ledger attestation)

SQL alone **cannot** independently prove managed migration-ledger state. The preflight SQL deliberately does **not** reference the managed ledger relation.

### 1) SQL result (always archived)

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

### 2) Trusted Lovable-managed migration metadata (outside SQL)

Operator must obtain from the trusted Lovable channel (not user prompt / GUC / `set_config`):

| attestation field | required |
|---|---|
| source migration version | yes (`20260804120000` or proven equivalent) |
| known managed alias | yes |
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

## G10 / G11 Auth final classification (SQL + trusted Lovable Auth attestation)

### SQL result

| field | SQL value |
|---|---|
| G10 status / detail | `UNPROVEN` / `HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE` |
| public identity inventory | student/staff/faculty/role/assignment candidates from `public` only |
| Auth-user existence | `UNPROVEN` |
| password usability | `UNKNOWN` |
| session usability | `UNKNOWN` |
| G11 | always fail-closed `HOLD` while Auth/password/session unresolved |

### Combined final Auth readiness

| SQL Auth | Trusted Lovable Auth attestation | Final |
|---|---|---|
| UNPROVEN | unavailable / untrusted | **HOLD** |
| UNPROVEN | proves required Auth users + password/session readiness without printing secrets | may lift Auth hold only if all other gates allow |
| UNPROVEN | proves missing required Auth users | **HOLD** |

Do **not** fabricate password or session usability from public profile rows.

## PASS / HOLD classification rules

- Final operational classification requires **trusted Lovable channel identity** (`90f4dcde-07fb-4441-b86a-6ad5510833b8` ↔ `wpmicqriltrowwonknox`) **and** SQL G02–G14 **and** trusted Lovable migration-history attestation **and** trusted Lovable Auth attestation for Auth readiness.
- G01 from SQL is **UNPROVEN** and never PASS from user-supplied values.
- G02 SQL ledger readability is **UNPROVEN** when the managed ledger cannot be read independently.
- G10 SQL Auth existence is **UNPROVEN**; G11 cannot PASS while Auth/password/session unresolved.
- Any gate `status = HOLD` among G02–G14 (or unresolved G01/G10 channel attestation, or missing Lovable ledger/Auth attestation) ⇒ overall production preflight **HOLD**.
- Partial Migration-88 objects ⇒ `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED`.
- Function fingerprint ≠ base or body contains `b1_e2e_88` ⇒ `HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT`.
- Wrong Fixture service/step routing ⇒ HOLD.
- Assignee kind/id drift or multi-populated assignee columns ⇒ HOLD.
- Any query error or unexpected result count ⇒ **HOLD**.
- Source-package readiness is separate from a live production PASS.

## Prohibitions

- No Migration 88 apply
- No Deploy / Publish
- No Auth user create/update/delete
- No password or session material changes
- No visibility / workflow / assignment / fixture / request writes
- No secrets or connection strings in this package
- No operator `set_config` identity, ledger, or Auth proof
- No GRANT / schema changes requested from this package
- No static or dynamic SQL against privileged schemas (`auth`, `storage`, `vault`, `realtime`, `supabase_functions`, `supabase_migrations`, `net`, `cron`, `pgmq`, …)
- No static or dynamic SQL against the managed migration ledger relation
- No printing of password values or session secrets

## Decommission companion (pin only; do not apply)

| field | value |
|---|---|
| path | `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` |
| raw SHA-256 | `61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d` |
| LF SHA-256 | `e77ea69b3c7914408af06c4c2b9ea50ce9fbd217d380507c94b0a2766107bce8` |
| raw bytes | `29733` |

Cleanup restore fingerprints remain the companion pins (`9c9090f2…` / `e25e7e4f…` / `4a3c50af…` / `f0bf4089…`) and are **not** rewritten by this G04 production-base repin.

## Final recommendation after successful source review

`READY_FOR_FAST_DUAL_REVIEW_AND_NEW_PREFLIGHT_EXECUTION`
