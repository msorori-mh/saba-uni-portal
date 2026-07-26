# PORTAL-B1-SEQ07-B-ALTERNATE-APPLY-PACKAGE-PREFLIGHT-01

## Decision

**PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT**
**READY_FOR_SOURCE_MERGE_COORDINATOR_REVIEW**

| Gate | Result |
|---|---|
| G0 source / prior Production RO baseline | **PASS** (no new Production probe; no drift signal) |
| G1–G4 design + non-negotiables + atomicity | **PASS** |
| G5 local disposable equivalence harness | **PASS** — `PASS_B1_SEQ07B_LOCAL_EQUIVALENCE` |
| G6 dependency-chain source package | **PASS** (prepared; not Production-applied) |
| Source tests / tsc / eslint / build | **PASS** |
| Production write | **NONE** |

```
PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT
READY_FOR_SOURCE_MERGE_COORDINATOR_REVIEW
SEQ07_B_NOT_APPLIED
SEQ07_NOT_APPLIED
SEQ08_NOT_APPLIED
NO_BUCKET_CREATED_ON_PRODUCTION
NO_DEPLOY
NO_PUBLISH
NO_PRODUCTION_WRITE
```

**Not issued:** Production apply READY · Gate 25 · activation · `student_visible` · Deploy/Publish.

PR **#256** is **not** rewritten as apply authorization. Merge of this PR is **source review only**.

---

## Environment pins (this overnight exec)

| Field | Value |
|---|---|
| Docker Client | `29.6.1` (windows/amd64) |
| Docker Server | `29.6.1` (Docker Desktop 4.81.0 / linux/amd64) |
| Docker context | `desktop-linux` |
| PG harness image | `postgres:17-alpine` → server `17.10` |
| Worktree | `C:\projects\saba-uni-portal-b1-seq07b-preflight-01` |
| Branch | `preflight/b1-seq07b-alternate-apply-package-01` |
| `origin/main` (at G5/G-close) | `4d93d5a6fb33a01808d95f39a3c17e68968312f8` |
| PR #258 | https://github.com/msorori-mh/saba-uni-portal/pull/258 |

---

## G0 — Pins

| Field | Value |
|---|---|
| Original SEQ07 | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| Original LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` ✅ unchanged vs `origin/main` |
| SEQ07-B | `supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| SEQ07-B LF SHA-256 | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| Version reuse | **None** — `20260725110000` bytes unmodified; new version `20260725110050` only |
| History repair | **None** |
| Production baseline (prior Lovable RO / apply-exec) | tip `20260725002136`; SEQ07 absent; bucket absent; five services hidden; requests=0; digests stable |

Agent cannot re-list Production via CLI (`HOLD_SUPABASE_CLI_PRODUCTION_ACCESS_NOT_PROVISIONABLE`). G0 accepts last attested RO; any delta before future apply ⇒ `HOLD_B1_SEQ07_B_PREFLIGHT_DRIFT_*`.

---

## G1 — Precise SEQ07-B definition

| Question | Answer |
|---|---|
| Forward-only new migration? | **Yes** — `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| Storage tool then SQL? | **Yes** — **B0** Lovable Storage tool creates private bucket; **B1** SQL creates table/trigger/RPCs/policy/grants |
| Replace original file? | **No** — original bytes stay; marked `SUPERSEDED_NOT_FOR_LOVABLE_CLOUD_APPLY` |
| Keep `20260725110000` unapplied? | **Yes** |
| New version | **`20260725110050`** |
| History | Official runner registers **only** `20260725110050` when B1 SQL succeeds |
| Relation to SEQ08 | SEQ08 predecessor is **object proof** (uploads table + private bucket), satisfied by original SEQ07 **or** SEQ07-B |

---

## G2 — Non-negotiables checklist

| # | Requirement | Package stance |
|---:|---|---|
| 1 | No edit of historical SEQ07 file | **PASS** — file untouched |
| 2 | No manual `schema_migrations` insert | **PASS** — forbidden |
| 3 | No migration repair | **PASS** — forbidden |
| 4 | No false APPLIED for SEQ07 | **PASS** — history uses `20260725110050` only |
| 5 | No SEQ08 in package apply | **PASS** — harness proves SEQ08 objects absent |
| 6–7 | Private bucket / no public URLs | **PASS** — B0 contract + B1 assert |
| 8–11 | anon / RLS / RPCs / no broad bypass | **PASS** — behavioral matrix |
| 12 | No protected-record mutation | **PASS** — DDL/RPC install only |
| 13 | Restart-safe stages | **PASS** — see G3 / harness |
| 14 | Stop conditions vs ambiguity | **PASS** |
| 15 | Decisive history proof | **PASS** |

---

## G3 — Atomicity / failure-injection matrix

| Stage | Failure mode | Residual | Restart | Cleanup required? | Harness |
|---|---|---|---|---|---|
| B1 SQL without B0 bucket | fail-closed `B1_SEQ07B_BUCKET_PREREQUISITE_MISSING` | no table/RPCs | create B0 then B1 | **No** | **PASS** |
| B0 Storage create | tool fails | no/incomplete bucket | re-run B0 via Storage tool | **No** SQL DELETE | design PASS |
| B0 OK, B1 preflight fails | SQL not started | private bucket may exist alone | fix contract; re-run B1 | **No** | design PASS |
| B1 SQL mid-transaction | runner aborts | no table/RPCs (txn rollback); bucket remains | re-run B1 | **No** | design PASS |
| B1 OK, post-verifier fails | objects + history likely present | STOP; classify; forward remediation only | do not re-apply B1 blindly | **No** delete/repair | design PASS |
| Second B1 apply | refused (objects exist) | no ambiguous partial | leave as-is | **No** | **PASS** |
| Success then accidental original SEQ07 apply | CREATE TABLE conflict | STOP | never apply `20260725110000` on Lovable | N/A | operational ban |

**Restart-safe behavior:** B0→B1 is stop-safe and forward-restartable without history repair or destructive cleanup. Residual private bucket-without-SQL is explicit **B0-complete / B1-pending**, not an ambiguous partial SQL apply. Harness cleans only the disposable Docker container named for this run.

---

## G4 — Preferred design (adopted in source package)

1. **B0** — Lovable Storage: `student-request-secure-attachments`, `public=false`, 5 MiB, pdf/jpeg/png; no broad policies.
2. **B1** — migration `20260725110050_…` asserts bucket contract then installs SEQ07-equivalent SQL (no `INSERT INTO storage.buckets`).
3. PROMOTION-MAP order **7** annotated superseded; order **7.5 / 7B** added.
4. Manifest addendum: `docs/b1/B1-SEQ07-B-SEQUENTIAL-MANIFEST-ADDENDUM-01.json`.
5. SEQ08 preflight updated for object-level predecessor.

---

## G5 — Local harness (executed)

Command (once):

```
powershell -ExecutionPolicy Bypass -File tests/b1-seq07b-alternate/run-harness.ps1
```

Result: **`PASS_B1_SEQ07B_LOCAL_EQUIVALENCE`**

| Proof area | Result |
|---|---|
| Baseline before SEQ07 (foundation applied; SEQ07 objects absent) | PASS |
| Fail-closed without bucket (injection after foundations, before B0) | PASS |
| B0 private bucket simulation (exact contract) | PASS |
| B1 alternate migration apply | PASS |
| Full equivalence vs original SEQ07 post-verifier | PASS |
| Table / columns / constraints / indexes (via post-verifiers + behavioral) | PASS |
| RLS | PASS |
| Trigger (ownership spoof denied) | PASS |
| RPC signatures | PASS |
| Owners / search_path / grants/revokes | PASS (matrix) |
| Storage policy | PASS |
| `public=false` | PASS |
| MIME types + size limit | PASS (B0 contract) |
| anon denied | PASS |
| ownership spoof denied | PASS |
| failure injection after B0 / during B1 path | PASS (no-bucket + second-apply refuse) |
| restart-safe / no partial ambiguous state | PASS |
| SEQ08 not applied | PASS |
| second-run behavior | PASS (`SECOND_B1_REFUSED=PASS`) |
| Docker resource cleanup (package container only) | PASS (`docker stop` in `finally`) |

Behavioral matrix (`SEQ07_BEHAVIORAL_PASS`): 8/8 — anon deny, intent coords, other-student deny, owner intent allow, ownership spoof deny, private bucket, RLS grants fail-closed, unassigned staff download deny.

### Equivalence matrix (SEQ07-B final state ≡ original SEQ07 objects)

| Surface | Equivalent? |
|---|---|
| Private bucket `student-request-secure-attachments` | Yes |
| `public.student_request_attachment_uploads` | Yes |
| Intent RPC | Yes |
| Authorize download RPC | Yes |
| RLS enabled + deny-by-default grants | Yes |
| Identity trigger | Yes |
| Storage INSERT policy | Yes |
| anon EXECUTE denied | Yes |
| authenticated direct SELECT denied | Yes |
| Bucket upsert via SQL | **N/A by design** — B0 Storage tool replaces SEQ07 `storage.buckets` DML |

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
| Behavioral fixture | `tests/b1-seq07-attachments/pg/20-behavioral.sql` |
| Harness | `tests/b1-seq07b-alternate/run-harness.ps1` |

### Exact Lovable execution package (**NOT AUTHORIZED TO RUN HERE**)

```
ONE SQL MIGRATION ONLY = 20260725110050 (SEQ07-B)
B0 = Storage tool bucket create (separate stage; not SQL migration)
FORBIDDEN: apply 20260725110000 · SEQ08+ · Gate 25 · activation · student_visible · Deploy
```

---

## Source test results (Phase D)

| Command | Result |
|---|---|
| `bun test tests/student-requests` | **823 pass / 0 fail** |
| `bun test tests` | **1760 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bunx eslint` (modified TS) | **PASS** (LF normalized) |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |

Contract freeze companion count updated to **18** (orders 7–19 + 7B + 21–24). Absorbed `origin/main` generated-types remediation from PR **#257**.

---

## G7 — PR policy

- Independent PR #258 from this branch to `main` for **source review only**.
- Do **not** treat merge as Production apply approval.
- Do **not** alter PR #256 to imply SEQ07/SEQ07-B apply is live-authorized.

---

## Assumptions / risks / obstacles

| Item | Note |
|---|---|
| Assumption | Lovable migration runner accepts B1 SQL because it contains no `storage.buckets` DML |
| Risk | Accidental later apply of `20260725110000` after 7B → conflict; operational ban required |
| Obstacle | Prior session Docker HOLD cleared this overnight exec |

## Production impact

**Zero.** No Production write, no Staging write, no cloud migration apply, no bucket create on Production, no Deploy/Publish.

## Final codes

```
PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT
READY_FOR_SOURCE_MERGE_COORDINATOR_REVIEW
```
