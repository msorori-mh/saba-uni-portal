# PORTAL-PRODUCTION-CONTAINMENT-FORENSIC-RECOVERY-LONGRUN-16

**FINAL_DECISION:** `PASS_PORTAL_PRODUCTION_CONTAINMENT_FORENSIC_RECOVERY_C5_C7_AND_C8C9_READY`

MODE: PRODUCTION READ-ONLY FORENSIC RECONCILIATION + SOURCE REMEDIATION + NEXT-STEPS PREPARATION  
DATE: 2026-08-10  
REPOSITORY: `msorori-mh/saba-uni-portal`  
BRANCH: `ops/production-containment-forensic-recovery-16`  
PRODUCTION SUPABASE: `wpmicqriltrowwonknox`  
LOVABLE PROJECT: `90f4dcde-07fb-4441-b86a-6ad5510833b8`

---

## Mandatory summary

| Field | Value |
|---|---|
| CURRENT_MAIN_SHA | `fab94705443264ae5fe768c5091e25c7c729be1a` |
| ROOT_CAUSE_GOVERNANCE_FINDING | Operator packets authorized production writes via repo text (`Standing owner authorization` / `NO TOKEN PAUSE`) and lacked a single-writer mutex, enabling concurrent writers and non-governed sequencing. |
| C5_LEDGER | `version=20260810180000` / `name=councils_c5_minutes_lifecycle_02` / `statements=NULL` / statement_count=NULL |
| C5_SCHEMA | Complete V2 poststate: type, amendments table+RLS+policy, 3 SECDEF RPCs `search_path=public, pg_temp`, `extensions.digest` qualification on `approve_and_lock_council_minutes`, ACL deny INSERT/UPDATE/DELETE for authenticated, amendments rows=0 |
| C5_VERDICT | `C5_SCHEMA_EQUIVALENT_LEDGER_ANOMALY` |
| C5_BODY_WAS_ACTUALLY_EXECUTED | `YES` (V2-specific `extensions.digest` + complete catalog; NULL ledger statements are not body proof) |
| C6_MANAGED_VERSION | `20260810123158` |
| C6_MANAGED_NAME | `e4d9fe06-550d-43df-89cb-803fb49df1da` |
| C6_BODY_EQUIVALENT | `YES` (comment/blank/BEGIN-COMMIT strip SHA match) |
| C6_POSTSTATE | `PASS` (blocked enum, 6 decision columns, 3 indexes, RPCs+trigger, ACL inherited) |
| C6_VERDICT | `C6_LOVABLE_MANAGED_ALIAS_PROVEN` |
| C7_MANAGED_VERSION | `20260810123359` |
| C7_MANAGED_NAME | `8d8851ce-18d9-465b-b9a9-b34d62fc14fb` |
| C7_BODY_EQUIVALENT | `YES` |
| C7_POSTSTATE | `PASS` (audit table, indexes, RLS/policy, 11 funcs, 2 triggers, audit rows=0, authenticated SELECT-only) |
| C7_VERDICT | `C7_LOVABLE_MANAGED_ALIAS_PROVEN` |
| C8_STATE | `PRESENT` / managed `20260810123616` / `7aac7456-a80d-464d-84fc-bc9671ae2e4e` / body equivalent YES / archive guards 6/6 / `council_decision_transition_is_legal` present |
| C9_STATE | `PRESENT` / managed `20260810124128` / `8b20af1b-8607-42cd-94d8-f71793d9a687` / live prosrc 26/26 match after source fix / notifications table+RLS+policies |
| LOGICAL_LEDGER_PREFIX | `10` |
| SCHEMA_PREFIX | `10` |
| LAST_APPLIED_LOGICAL | `C9` |
| FIRST_UNAPPLIED_LOGICAL | `NONE_IN_C0_C9` (next go-live DB write candidate is `GA3`; GA1/GA2 managed aliases also present) |
| WRITE_LEASE_TESTS | PASS (acquire/release, two writers HOLD, stale never auto-deleted, wrong-owner release refused, read-only bypass, force-unlock forbidden) |
| C8_READY | `C8_READY_FOR_EXPLICIT_APPLY` (source/packet/lease/governance ready; production already has C8 — do not re-apply) |
| C9_READY | `C9_READY_FOR_EXPLICIT_APPLY` (source hash updated after overdue-notify fix; production already has C9 — do not re-apply) |
| B1_VISIBLE_COUNT | `5` |
| PRODUCTION_READS | `YES` |
| PRODUCTION_WRITES | `0` |
| BUSINESS_RPC_CALLS | `0` |

---

## Phase 0 — Containment / root-cause closure

Dangerous packet contract on current main included:

- `Standing owner authorization`
- `Execute automatically without owner-token pauses`
- `NO TOKEN PAUSE` / `STANDING OWNER AUTHORIZATION`

Remediation: all C5V2–C9 + GA1–GA3 + master sequential packets now require:

- `AUTHORIZATION=EXPLICIT_OWNER_RUNTIME_GRANT_REQUIRED`
- `REPO_TEXT_AUTHORIZATION=NEVER_SUFFICIENT`
- `HISTORICAL_GRANT_AUTHORIZATION=NEVER_SUFFICIENT`
- `STANDING_GRANT_MODE=FORBIDDEN`
- `OWNER_TOKEN_BYPASS_MODE=FORBIDDEN`
- `PRODUCTION_WRITE_LEASE=REQUIRED`
- explicit “cannot self-authorize” / historical-grant denial language

Fail-closed tests: `tests/academic-councils/production-write-governance-containment-16.test.ts`.

---

## Phase 1 — Single-writer mutex

Added `scripts/production-write-lease.ps1`:

- `Acquire-ProductionWriteLease` / `Release-ProductionWriteLease`
- Atomic directory create at `C:\projects\saba-production-write-lease` (overridable)
- Metadata: session, mission, logical_step, source_sha, started_at
- Stale lock never auto-deleted; force unlock forbidden; read-only bypass; release only by owning session after PASS|HOLD|ABORT|STOP

Every C5–C9 + GA production packet requires the lease before write.

---

## Phase 2 — Production ledger forensics (from C4 forward)

| order | version | name | statements | count | chars | notes |
|---|---|---|---|---|---|---|
| 1 | `20260810012715` | `72757e0e-…` | PRESENT | 1 | 25673 | known C4 |
| 2 | `20260810123158` | `e4d9fe06-…` | PRESENT | 1 | 9940 | C6 |
| 3 | `20260810123359` | `8d8851ce-…` | PRESENT | 1 | 21484 | C7 |
| 4 | `20260810123616` | `7aac7456-…` | PRESENT | 1 | 24608 | C8 |
| 5 | `20260810124128` | `8b20af1b-…` | PRESENT | 1 | 50963 | C9 |
| 6 | `20260810124407` | `2802e1fa-…` | PRESENT | 1 | 25866 | GA1 (body-equivalent) |
| 7 | `20260810124539` | `7c7f84cf-…` | PRESENT | 1 | 15250 | GA2 (body-equivalent) |
| 8 | `20260810180000` | `councils_c5_minutes_lifecycle_02` | NULL | NULL | NULL | C5 stub anomaly |

No additional rows after `20260810123359` were ignored: C8/C9/GA1/GA2 and the C5 stub were all captured. GA3 ledger row absent.

---

## Phase 3–6 — Forensic verdicts

### C5

- Ledger identity matches canonical V2 version+short name with **NULL statements**.
- Catalog proves V2: `extensions.digest` qualified in `approve_and_lock_council_minutes`; SECDEF + `search_path=public, pg_temp` on all three RPCs; amendments RLS/policy/ACL; 0 amendment rows.
- Verdict: `C5_SCHEMA_EQUIVALENT_LEDGER_ANOMALY` (never reapplied).

### C6 / C7 / C8

- Comment/blank/BEGIN-COMMIT normalized statement SHA matches canonical source.
- Poststate conjunctions PASS.
- Registered exact managed aliases (no wildcards / version-only / order inference).

### C9

- Production live `prosrc` matched 25/26 vs prior source; mismatch was `tg_ac_decision_notify` incorrectly emitting `decision_overdue` on `status=completed`.
- Source remediated to match production (deadline-driven overdue; not on completed).
- Recomputed `SHA256_LF=7c18cab2ed35264155af241a7810d0d387ceec0b09a0c32216a10d59bc002a30`.
- After fix: live prosrc 26/26 match. Ledger blob retains Lovable transport formatting variance; catalog proof is authoritative.
- Alias registered: `20260810124128` / `8b20af1b-8607-42cd-94d8-f71793d9a687`.

---

## Phase 7 — Classifier reconciliation

Updated `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`:

- C5: `CANONICAL` vs `CANONICAL_NULL_STATEMENTS_ANOMALY` (explicit NULL-statements handling; schema similarity alone is never ledger body proof)
- C6–C9: exact pinned LOVABLE_MANAGED_ALIAS identities
- Anti-false-pass matrix extended

True prefixes after proofs: LOGICAL=10, SCHEMA=10, LAST=`C9`, FIRST_UNAPPLIED in C0–C9=`NONE`.

---

## Phase 8–9 — C8/C9 ready + governance tests

- C8/C9 apply-one packets: explicit runtime grant + lease + fail-closed language
- C9 source defect fixed; hashes/manifest/tests/packets updated
- Concurrency guard = production-write lease integration
- Governance tests prove standing-owner repo text and historical tokens do not authorize future writes; packets cannot self-authorize

**Do not apply C8/C9/GA in this mission.** Production already contains C5–C9 (+GA1/GA2). Next explicit write candidate is GA3 only, under fresh runtime grant + lease.

---

## Phase 10 — Validation

| Gate | Result |
|---|---|
| `bun test tests/academic-councils` | PASS (121) |
| `bun test tests/student-requests` | PASS (1066) |
| `bun test tests/reports-beneficiaries` | PASS (213) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS (LF/CRLF warnings only on packets) |
| PG17 classifier matrix (anti-false-pass incl. C5–C9 aliases) | PASS |

---

## Source changes (this mission)

- `scripts/production-write-lease.ps1`
- `docs/go-live/operator-packets/*` (C5V2–C9, GA1–GA3, master, post-GA3 hash pin)
- `supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql` (overdue-notify correctness)
- `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`
- `docs/migration-evidence/academic-councils/{HASHES.txt,MIGRATION_MANIFEST.json}`
- `docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json`
- `tests/academic-councils/production-write-governance-containment-16.test.ts`
- `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts`
- `tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts`
- this report

---

## Assumptions / risks / blockers

- Assumptions: Lovable Cloud DB for `90f4dcde-…` remains the production DB for `wpmicqriltrowwonknox`.
- Risk: C5 NULL-statements anomaly means ledger body cannot be re-hashed; rely on catalog + V2 digest proof. Do not “repair” the ledger.
- Risk: Concurrent historical writers left GA1/GA2 applied before GA3; next write must still be single-step with explicit grant + lease.
- Blocker: none for this source/forensic mission. Production mutation remains unauthorized until an operator issues a fresh `EXPLICIT_OWNER_RUNTIME_GRANT` for a single logical step.

## Production impact

None from this mission: source-only + read-only attestation. No migration apply, deploy, publish, B1 change, or DDL/DML.

---

## FINAL_DECISION

`PASS_PORTAL_PRODUCTION_CONTAINMENT_FORENSIC_RECOVERY_C5_C7_AND_C8C9_READY`

Containment closed in source. C5–C7 forensically classified. C8/C9 present and reconciled. Prefixes match at 10. C8/C9 source packages ready for explicit apply governance. Writes=0. Business RPC calls=0.
