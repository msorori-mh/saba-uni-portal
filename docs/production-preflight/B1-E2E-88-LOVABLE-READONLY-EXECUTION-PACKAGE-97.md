# B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97

| field | value |
|---|---|
| package | `PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97` |
| mode | **READ-ONLY preflight execution package only** |
| Lovable project id | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| production Supabase project ref | `wpmicqriltrowwonknox` |
| repository | `msorori-mh/saba-uni-portal` |
| branch | `ops/b1-e2e-88-production-readonly-preflight-97` |
| source merge commit | `e0cf9d48acb562109aaf310dbd5e534b900c6d90` |
| PR #281 source HEAD | `630bb9d1eac55b97e0723381d8d859a463dfaacc` |
| channel | Lovable-managed **production database** (read / query channel) |
| execution status | **NOT EXECUTED by this source package** |

## Migration 88 identity (pinned; do not rewrite)

| field | value |
|---|---|
| filename | `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql` |
| expected version | `20260804120000` |
| raw SHA-256 | `b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c` |
| LF SHA-256 | `fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a` |
| raw bytes | `58236` |
| LF bytes | `56666` |
| LF lines | `1571` |

## Read-only preflight SQL (execute exactly once)

| field | value |
|---|---|
| path | `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` |
| raw SHA-256 | `42d7b23ce9c62f4d864f00423d017b9dbecda29f6462585b6adc4d3d554df6ac` |
| LF SHA-256 | `e8a03afdee01d8776ab8e292f26817addb05a0ed7609a45a9bcb65d49e302e05` |
| raw bytes | `42186` |
| LF bytes | `41256` |
| LF lines | `931` |

## Explicit non-authorization

**Executing this package does NOT authorize Migration 88 apply.**  
It does NOT authorize Deploy, Publish, Auth writes, password changes, visibility changes, assignment changes, fixture mutations, or any write SQL.

## Operator steps (exactly once)

1. Confirm Lovable project `4b291119-790f-4484-9285-c2b774e1ba6f` is bound to production Supabase ref `wpmicqriltrowwonknox`. If unproven → **STOP** (`HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN`).
2. Open the Lovable-managed production database query channel.
3. In the same session, attest the project ref (required for G01 PASS):

```sql
SELECT set_config('app.b1_e2e_88_preflight_project_ref', 'wpmicqriltrowwonknox', true);
```

4. Paste and execute **the entire** file  
   `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql`  
   exactly once, unmodified.
5. Archive the full result set (14 gate rows G01–G14).
6. Classify PASS/HOLD using the rules below.
7. Do **not** apply Migration 88 from this package.

## Required result schema

Exactly one deterministic result set with **one row per gate** (14 rows), columns:

| column | type |
|---|---|
| `gate` | text (`G01` … `G14`) |
| `check_name` | text |
| `status` | text (`PASS` or `HOLD`) |
| `detail` | text |
| `evidence` | jsonb |

## Gate summary

| gate | purpose |
|---|---|
| G01 | Exact project/ref attestation (`wpmicqriltrowwonknox`) |
| G02 | Migration ledger — Migration 88 not applied; alias search by version/token + object identity |
| G03 | Object pre-state — Migration-88-only tables/RPCs/triggers absent; partial → `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| G04 | Four replaced-function base preimage fingerprints |
| G05 | Five services `is_active=true` and `student_visible=false` |
| G06 | `enrollment_certificate` protected + protected request/document identities |
| G07 | Exactly 19 Fixtures; one active step each; Fixture 15 restored approved state |
| G08 | Five-service RPA fingerprint; no duplicate active ambiguity |
| G09 | Protected-surface fingerprints capture |
| G10 | TEST_ONLY identity inventory (password usability **UNKNOWN**) |
| G11 | Production E2E prerequisites classification (READY / NOT_READY / AMBIGUOUS / UNPROVEN) |
| G12 | Apply feasibility record (does **not** authorize apply) |
| G13 | Decommission draft pin + base restore fingerprints |
| G14 | Stop conditions / final HOLD detail |

## PASS / HOLD classification rules

- Any gate `status = HOLD` ⇒ overall production preflight **HOLD**.
- G01 unset/mismatch ⇒ `HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN`.
- Partial Migration-88 objects ⇒ `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED`.
- Function fingerprint ≠ base or body contains `b1_e2e_88` ⇒ `HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT`.
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

## Decommission companion (pin only; do not apply)

| field | value |
|---|---|
| path | `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` |
| raw SHA-256 | `61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d` |
| LF SHA-256 | `e77ea69b3c7914408af06c4c2b9ea50ce9fbd217d380507c94b0a2766107bce8` |
| raw bytes | `29733` |

## Final recommendation after successful source review

`READY_FOR_INDEPENDENT_REVIEW_AND_LOVABLE_READONLY_EXECUTION`
