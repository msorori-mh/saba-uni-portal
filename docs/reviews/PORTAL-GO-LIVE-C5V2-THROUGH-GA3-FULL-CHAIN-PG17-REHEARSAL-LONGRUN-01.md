# PORTAL-GO-LIVE-C5V2-THROUGH-GA3-FULL-CHAIN-PG17-REHEARSAL-LONGRUN-01

MISSION=`PORTAL-GO-LIVE-C5V2-THROUGH-GA3-FULL-CHAIN-PG17-REHEARSAL-LONGRUN-01`
MODE=`DISPOSABLE POSTGRESQL 17 ONLY / SOURCE-ONLY / NO PRODUCTION ACCESS`
DATE=`2026-08-10`

## Decision

```text
C5V1_SUPERSEDED=YES
C5V2=PASS
C6=PASS
C7=PASS
C8=PASS
C9=PASS
GA1=PASS
GA2=PASS
GA3=PASS
RUN_1=PASS
RUN_2=PASS
ZERO_RESIDUE_AFTER_RESET=PASS
AUTHORIZATION=PASS
ACL_RLS=PASS
FUNCTION_RESOLUTION=PASS
CONCURRENCY=PASS
B1_REGRESSION=PASS
GP_REGRESSION=PASS
DOCUMENTS_REGRESSION=PASS
CRITICAL_COUNT=0
HIGH_COUNT=0
FINAL_DECISION=PASS
```

`PASS_PORTAL_GO_LIVE_C5V2_THROUGH_GA3_FULL_CHAIN_PG17_REHEARSAL_LONGRUN_01`

## Canonical source and sequence

Canonical C5 V2 was read from PR326 merge source `e55629ae` / PR326 head `62c6bb374b15503dfa93c5d8066e4b61837169aa`:

| Logical step | Source | SHA256 LF-normalized |
|---|---|---|
| C5V2 | `20260810180000_councils_c5_minutes_lifecycle_02.sql` | `0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8` |
| C6 | `20260808160000_councils_c6_decisions_followup_01.sql` | `1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43` |
| C7 | `20260808170000_councils_c7_audit_archive_01.sql` | `3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a` |
| C8 | `20260808171000_councils_c0_c8_final_security_closure_01.sql` | `6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3` |
| C9 | `20260808180000_councils_c9_notifications_reporting_01.sql` | `c15f3378d12de10a0ef04d93ce033adca06f70fd7d9d53b764a21e828c329d4e` |
| GA1 | `20260808210000_ga_mvp_foundation_01.sql` | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` |
| GA2 | `20260808210100_ga_mvp_completion_01.sql` | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` |
| GA3 | `20260808210200_ga_authorization_04.sql` | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` |

V1 `20260808150000_councils_c5_minutes_lifecycle_01.sql` was never applied. The focused PR326 test proved the V1 freeze and permitted V2-only semantic delta. C5V2 uses schema-qualified `extensions.digest`; it does not create the extension or widen SECURITY DEFINER search paths.

## Final release addendum

The exact source set was cross-checked against PR330 operator-pack branch `review/go-live-db-operator-pack-night-01` at head `77b5c84db548ee568ad669e8d9ca53f36456326a`. All eight tested SHA256-LF values in the table above match the operator pack. The machine-readable attestation is [`docs/go-live/C5V2-GA3-FULL-CHAIN-ATTESTATION.json`](../go-live/C5V2-GA3-FULL-CHAIN-ATTESTATION.json).

Backend contract truth for C8: `public.issue_council_decision(uuid, uuid, text, text, uuid, text, date)` requires a non-null `agenda_item_id`, locks and checks the referenced agenda item is `resolved`, locks and checks meeting minutes are present and `is_locked = true` with status `minutes_locked`, and persists both source relationships. No UI was edited.

C6 explicitly executed `ALTER TYPE public.academic_council_decision_status ADD VALUE IF NOT EXISTS 'blocked'` in both clean PG17 cycles. Both completed without PostgreSQL SQLSTATE `55P04`; the blocked transition verifier also passed.

## Execution evidence

Two independent disposable `postgres:17` containers were built from a combined synthetic council/GA fixture, advanced to logical C4, and then executed as one sequential campaign:

`C5V2 → POSTVERIFY → C6 → POSTVERIFY → C7 → POSTVERIFY → C8 → POSTVERIFY → C9 → POSTVERIFY → GA1 → POSTVERIFY → GA2 → POSTVERIFY → GA3 → POSTVERIFY`

Each release step performed a read-only post-verifier plus custom checks for catalog objects, ACL/RLS, SECURITY DEFINER, exact `search_path`, function resolution, pre-existing business-data fingerprint, and prior-step invariants. No logical step was repaired or re-applied manually. The C6 transaction completed without `55P04`; the C7 audit/archive, C8 blocked-state/security closure, C9 notification/reporting, and GA1/GA2/GA3 surfaces all passed in both cycles.

The harness also ran GA authorization, remediation concurrency, and follow-up authority-loss verifiers in each cycle. Every owned container was removed and confirmed absent before the next clean reset: `ZERO_RESIDUE_AFTER_RESET=PASS`.

## Cross-system regression and concurrency

| Area | Result |
|---|---|
| C5V2 focused PG17 verifier | 2 pass / 0 fail / 25 assertions |
| Council C0–C9 production readiness package | 8 pass / 0 fail / 177 assertions |
| Full-chain two-cycle harness | 1 pass / 0 fail / 18 assertions; RUN_1 and RUN_2 PASS |
| GA promoted migration matrix | 7 pass / 0 fail / 34 assertions |
| Council C0–C8 concurrency | 1 pass / 0 fail; vote/close and archive/follow-up races |
| Council C9 concurrency | 1 pass / 0 fail; notification/archive/vote/minutes races |
| B1 student-request suite | 1066 pass / 0 fail / 8085 assertions |
| B1 academic-effects PG17 matrix | PASS; positive=5, deny=4, idempotent=5, rollback=PASS, `EC_REGRESSION=NONE` |
| Graduation Projects suite | 119 pass / 0 fail / 1455 assertions |
| Official-document contracts | 89 pass / 0 fail across issuance/archive/download, worker-safe PDF/storage, and Arabic PDF spike tests |

The isolated Wrangler Worker runtime test timed out at its fixed 60-second Windows harness limit and killed one dangling process. The Arabic PDF spike and all official-document contract/storage/download tests passed; this is recorded as an environment-only limitation, not a database or product regression.

## Agent report

`FILES_MODIFIED=` this review report plus the machine-readable attestation in the current worktree. The temporary full-chain test harness file was removed and its Git worktree metadata was pruned after execution; the separate Wrangler runtime cleanup directory is outside the repository and is not part of the evidence branch.
`TESTS=` disposable PG17 C5V2/C0–C9/GA1–GA3 harnesses; council and GA concurrency harnesses; B1; GP; official-document contracts.
`ASSUMPTIONS=` the GA authorization setup is synthetic fixture data; pgcrypto was normalized to the local Supabase-compatible `extensions` schema in fixture setup before C4. No migration source was changed.
`RISKS=` Windows Wrangler runtime timeout remains an environment-specific verification limitation; managed production ledger aliases were not accessed or invented in this local rehearsal.
`BLOCKERS=` none for the requested disposable PostgreSQL campaign.
`PRODUCTION_IMPACT=` NONE — no production endpoint, credential, write, migration apply, deploy, publish, merge, or production/test data mutation.
`DECISION=` PASS`

`git diff --check` was run after writing this report and the current worktree remains source-only aside from this documentation artifact.
