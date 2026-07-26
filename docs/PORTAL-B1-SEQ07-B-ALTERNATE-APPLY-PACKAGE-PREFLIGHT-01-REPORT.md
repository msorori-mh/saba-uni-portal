# PORTAL-B1-SEQ07-B-ALTERNATE-APPLY-PACKAGE-PREFLIGHT-01

## Decision

**HOLD_B1_SEQ07_B_LOCAL_HARNESS_DOCKER_UNAVAILABLE**

| Gate | Result |
|---|---|
| G0 source / prior Production RO baseline | **PASS** (no new Production probe; no drift signal) |
| G1–G4 design + non-negotiables + atomicity | **PASS** (documented; package shaped) |
| G5 local disposable equivalence harness | **HOLD** — Docker engine unreachable this session |
| G6 dependency-chain source package | **PREPARED** (not Production-applied) |
| Production write | **NONE** |

```
PASS design gates are not sufficient for READY_FOR_SEPARATE_SEQ07_B_SOURCE_MERGE_APPROVAL
until G5 harness prints PASS_B1_SEQ07B_LOCAL_EQUIVALENCE.
SEQ07_B_NOT_APPLIED
SEQ07_NOT_APPLIED
SEQ08_NOT_APPLIED
NO_BUCKET_CREATED_ON_PRODUCTION
NO_DEPLOY
NO_PUBLISH
```

**Not issued:** `PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT` · `READY_FOR_SEPARATE_SEQ07_B_SOURCE_MERGE_APPROVAL` · any Production apply readiness.

PR **#256** is **not** rewritten as apply authorization.

---

## G0 — Pins

| Field | Value |
|---|---|
| `origin/main` | `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` |
| Worktree | `C:\projects\saba-uni-portal-b1-seq07b-preflight-01` |
| Branch | `preflight/b1-seq07b-alternate-apply-package-01` |
| Original SEQ07 | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| Original LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` ✅ unchanged |
| Production baseline (prior Lovable RO / apply-exec) | tip `20260725002136`; SEQ07 absent; bucket absent; five services hidden; requests=0; digests stable |

Agent cannot re-list Production via CLI (`HOLD_SUPABASE_CLI_PRODUCTION_ACCESS_NOT_PROVISIONABLE`). G0 accepts last attested RO; any delta before future apply ⇒ `HOLD_B1_SEQ07_B_PREFLIGHT_DRIFT_*`.

---

## G1 — Precise SEQ07-B definition

| Question | Answer |
|---|---|
| Forward-only new migration? | **Yes** — `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| Storage tool then SQL? | **Yes** — **B0** Lovable Storage tool creates private bucket; **B1** SQL creates table/trigger/RPCs/policy/grants |
| Replace original file? | **No** — original bytes stay; marked `SUPERSEDED_NOT_FOR_LOVABLE_CLOUD_APPLY` |
| Keep `20260725110000` unapplied? | **Yes** — must remain absent from history unless that exact file is someday executed (not the Lovable path) |
| New version | **`20260725110050`** |
| History | Official runner registers **only** `20260725110050` when B1 SQL succeeds; never manual insert; never claim `20260725110000` applied for 7B |
| Relation to SEQ08 | SEQ08 predecessor becomes **object proof** (uploads table + private bucket), satisfied by original SEQ07 **or** SEQ07-B — see updated `08-…-PREFLIGHT.sql` |

LF SHA-256 of B1 migration (this package):  
`a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec`

---

## G2 — Non-negotiables checklist

| # | Requirement | Package stance |
|---:|---|---|
| 1 | No edit of historical SEQ07 file | **PASS** — file untouched |
| 2 | No manual `schema_migrations` insert | **PASS** — forbidden |
| 3 | No migration repair | **PASS** — forbidden |
| 4 | No false APPLIED for SEQ07 | **PASS** — history uses `20260725110050` only |
| 5 | No SEQ08 in package | **PASS** |
| 6–7 | Private bucket / no public URLs | **PASS** — B0 contract + B1 assert |
| 8–11 | anon / RLS / RPCs / no broad bypass | **PASS** — same SQL body as SEQ07 after bucket block |
| 12 | No protected-record mutation | **PASS** — DDL/RPC install only |
| 13 | Restart-safe stages | **PASS** — see G3 |
| 14 | Stop conditions vs ambiguity | **PASS** — matrix below |
| 15 | Decisive history proof | **PASS** — `20260725110050` present XOR not; `20260725110000` remains absent |

---

## G3 — Atomicity / failure matrix

| Stage | Failure mode | Residual | Restart | Cleanup required? |
|---|---|---|---|---|
| B0 Storage create | tool fails | no/incomplete bucket | re-run B0 via Storage tool | **No** SQL DELETE |
| B0 OK, B1 preflight fails | SQL not started | private bucket may exist alone | fix contract; re-run B1 | **No** (orphan private bucket allowed; not ambiguous for SQL objects) |
| B1 SQL mid-transaction | runner aborts | no table/RPCs (txn rollback); bucket remains | re-run B1 | **No** |
| B1 OK, post-verifier fails | objects present + history likely present | STOP; classify; forward remediation only | do not re-apply B1 blindly | **No** delete/repair |
| Success then accidental original SEQ07 apply | CREATE TABLE conflict | STOP | never apply `20260725110000` on Lovable | N/A |

**Not rejected** as `REJECTED_B1_SEQ07_B_NON_ATOMIC_OR_REQUIRES_MANUAL_REPAIR`: cross-tool B0→B1 is stop-safe and forward-restartable without history repair or destructive cleanup. Residual private bucket-without-SQL is an explicit **B0-complete / B1-pending** state, not an ambiguous partial SQL apply.

---

## G4 — Preferred design (adopted in source package)

1. **B0** — Lovable Storage: `student-request-secure-attachments`, `public=false`, 5 MiB, pdf/jpeg/png; no broad policies.  
2. **B1** — migration `20260725110050_…` asserts bucket contract then installs SEQ07-equivalent SQL (no `INSERT INTO storage.buckets`).  
3. PROMOTION-MAP order **7** annotated superseded; order **7.5 / 7B** added.  
4. Manifest addendum: `docs/b1/B1-SEQ07-B-SEQUENTIAL-MANIFEST-ADDENDUM-01.json`.  
5. SEQ08 preflight updated for object-level predecessor.

---

## G5 — Local harness (blocked)

Harness: `tests/b1-seq07b-alternate/run-harness.ps1`  
Intended proofs: fail-closed without bucket → B0 sim → B1 apply → 07B + original 07 post-verifiers → behavioral matrix → second-apply refuse → SEQ08 absent.

**This session:** Docker Desktop engine did not become reachable (`dockerDesktopLinuxEngine` pipe missing / hung). Harness **not executed**.

Required before upgrading decision to PASS / source-merge READY:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tests/b1-seq07b-alternate/run-harness.ps1
# expect: PASS_B1_SEQ07B_LOCAL_EQUIVALENCE
```

---

## G6 — Prepared artifacts (no Production apply)

| Artifact | Path / value |
|---|---|
| B1 migration | `supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| LF SHA-256 | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| Preflight / post | `docs/migration-drafts/b1-backend-verifiers/07B-…` |
| PROMOTION-MAP | order 7 note + order 7.5 entry |
| Manifest addendum | `docs/b1/B1-SEQ07-B-SEQUENTIAL-MANIFEST-ADDENDUM-01.json` |
| SEQ08 preflight | CHECK_05 predecessor objects |
| Behavioral fixture copy | `tests/b1-seq07-attachments/pg/20-behavioral.sql` |

### Exact Lovable execution package (**NOT AUTHORIZED TO RUN HERE**)

```
ONE SQL MIGRATION ONLY = 20260725110050 (SEQ07-B)
B0 = Storage tool bucket create (separate stage; not SQL migration)
FORBIDDEN: apply 20260725110000 · SEQ08+ · Gate 25 · activation · student_visible · Deploy
```

1. Fresh Production RO (bucket absent or exact; uploads absent; tip; digests).  
2. B0: create private bucket to exact contract.  
3. Run `07B-…-PREFLIGHT.sql` (ROLLBACK).  
4. Apply **only** `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` via managed runner.  
5. Confirm history: `20260725110050` once; `20260725110000` still absent.  
6. `07B-…-POST-VERIFIER.sql` (+ optional original `07-…-POST-VERIFIER.sql`).  
7. Protected-record + hidden-services recheck.  
8. **STOP** — no SEQ08.

### Stop conditions

- B1 without exact private bucket  
- Managed runner still rejects SQL (unexpected)  
- History shows `20260725110000` without that file’s execution  
- Partial SQL objects without `20260725110050`  
- Any SEQ08+ in session  

---

## G7 — PR policy

- Independent Draft PR from this branch to `main` for **source review only**.  
- Do **not** treat merge as Production apply approval.  
- Do **not** alter PR #256 to imply SEQ07/SEQ07-B apply is live-authorized.

---

## Assumptions / risks / obstacles

| Item | Note |
|---|---|
| Assumption | Lovable migration runner accepts B1 SQL because it contains no `storage.buckets` DML |
| Risk | Accidental later apply of `20260725110000` after 7B → conflict; operational ban required |
| Obstacle | Docker unavailable blocked G5 equivalence proof this session |

## Production impact

**Zero.**

## Final code

```
HOLD_B1_SEQ07_B_LOCAL_HARNESS_DOCKER_UNAVAILABLE
```

Re-run G5 when Docker is available; if harness green and unchanged SHAs, decision may upgrade to  
`PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT` +  
`READY_FOR_SEPARATE_SEQ07_B_SOURCE_MERGE_APPROVAL`  
(still **not** Production apply READY).
