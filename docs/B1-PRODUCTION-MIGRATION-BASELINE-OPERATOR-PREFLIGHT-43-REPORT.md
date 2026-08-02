# B1-PRODUCTION-MIGRATION-BASELINE-OPERATOR-PREFLIGHT-43

Date: 2026-08-02 (UTC)  
Mode: OWNER-APPROVED CONTROLLED PRODUCTION EXECUTION (attempted)  
Repository: `msorori-mh/saba-uni-portal`  
Review branch: `review/b1-production-migration-baseline-preflight-43`  
Production project (required): `wpmicqriltrowwonknox`

## Final decision

`HOLD_B1_PRODUCTION_MIGRATION_TRUSTED_CHANNEL_AND_INTERACTIVE_OPERATOR_UNAVAILABLE`

**No production SQL was executed.** No migration was applied. No baseline was
rewritten. No Operator Preflight was run. RPC executions = 0. Service activation
= 0. Deploy/Publish = 0. Execution authorization remains **NOT_GRANTED**.

G0 (source/worktree) **PASS**. The mission stopped at the G1 production-target
gate because this Cursor agent session has no usable trusted production write
or interactive operator channel that satisfies the mission’s credential rules.

---

## G0 — Source and worktree gate — PASS

| Check | Result |
|---|---|
| Working tree clean | **PASS** |
| `HEAD` | `6b8b632d06c5bdef0a6015721f45e1763cad05a9` |
| `origin/main` | `6b8b632d06c5bdef0a6015721f45e1763cad05a9` |
| HEAD = origin/main = required SHA | **PASS** |
| Approved migration exists on main | **PASS** |
| Working-tree file byte-identical to `origin/main` blob | **PASS** (`git hash-object` = `git rev-parse origin/main:…` = `03e20380bd31a3bf947e6e24224f28018aa64268`) |
| Later unapplied migrations after `20260802070000` on main tip | **None** (tip version prefix = `20260802070000`) |
| Forbidden bulk tools used (`db push` / reset / repair / squash) | **Not used** |

### Approved migration

| Field | Value |
|---|---|
| Path | `supabase/migrations/20260802070000_b1_34_five_services_terminal_visibility_false.sql` |
| Bytes | 3691 |
| SHA-256 (raw file bytes) | `19723c14e2051c55bc492eeb94aacafa7387e3f05607fbb16a49e46efa14c626` |
| SHA-256 (LF-normalized UTF-8) | `26be4545108987ed29282e4825b3df5909a8358735764861afd44599d2235969` |
| Git blob OID | `03e20380bd31a3bf947e6e24224f28018aa64268` |

Contract (source review only): single atomic `DO` block; updates exactly the five
B1 codes’ `student_visible=false` + `updated_at`; fail-closed on count/missing/
duplicate/post-check; does not touch `enrollment_certificate`, `is_active`,
workflows, Auth, or Storage.

---

## G1 — Production target gate — HOLD (not reached)

### Required target (from package)

| Field | Value |
|---|---|
| Project ref | `wpmicqriltrowwonknox` |
| Approved host | `aws-1-eu-north-1.pooler.supabase.com` |
| Approved port | `5432` (session mode; `6543` forbidden) |
| Database | `postgres` |
| Manifest user regex (migration/write class) | `^postgres\.wpmicqriltrowwonknox$` |
| Baseline capture principal (historical Capture-22/25) | `supabase_read_only_user` via Lovable read-only SQL channel |

### Channel availability in this agent session

| Channel / prerequisite | Available? |
|---|---|
| Lovable managed migration channel (`supabase--migration`) | **No** (no Lovable/Supabase MCP; MCP server catalog empty) |
| Supabase CLI login / access token | **No** (`SUPABASE_ACCESS_TOKEN` unset; no `~/.supabase/access-token`) |
| `DATABASE_URL` / `PGPASSWORD` / `PGPASSFILE` / `PGSERVICE` | **Unset** (correctly forbidden by mission) |
| Interactive `psql -W` password prompt usable by agent | **No** (non-interactive agent shell cannot complete a secret interactive prompt) |
| Local `psql` binary | Present: PostgreSQL **18.1** at `C:\Program Files\PostgreSQL\18\bin\psql.exe` |
| Bun | Present: **1.3.14** |

Therefore **no** of the following could be proven against live production:

* exact authenticated execution channel
* production migration head before apply
* absence/presence of version `20260802070000`
* five unique `request_types` rows
* pre-apply fingerprints (five services, certificate surfaces, migration history)

**HOLD reason (exact):** trusted production channel and interactive operator
credentials required by G1/G2/G5 are unavailable in this session without
violating the mission’s credential rules (no `DATABASE_URL` /
`PGPASSWORD` / non-interactive secret injection; password must remain
interactive and secret).

Historical production applies for this project used the **Lovable managed
migration channel**; baseline captures used the **Lovable read-only SQL
channel**. Neither channel is attached to this Cursor agent.

---

## G2 / G3 — Apply + post-verify — NOT EXECUTED

| Counter | Value |
|---|---|
| Production migration writes | **0** |
| Migration occurrence count for `20260802070000` | **unknown** (not queried) |
| Pre migration head | **not observed** (source pin / prior baseline head: `20260801021541`) |
| Post migration head | **unchanged / not applied** |
| ALREADY_APPLIED_EXACT_MATCH | **not evaluated** |
| Partial apply | **none** (no write attempted) |

---

## G4 — Fresh authoritative baseline — NOT EXECUTED

Current **in-repo** baseline (unchanged by this mission; pre-existing at
`6b8b632d`):

| Field | Value |
|---|---|
| Path | `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` |
| Status | `PINNED` |
| Fingerprint | `4c95c6a344cee2f52ade4a5312bd8240` |
| Artifact SHA-256 (LF) | `758da22be7c6c46b45c5f2e5f613408b501db27bcbb84286ba909b894ad133a4` |
| Migration head | `20260801021541` |
| `execution_authorized` | `false` |
| `operator_preflight_executed` | `false` |
| `negative_cases_executed` | `0` |

No archive/invalidate/update of the baseline was performed. A post-`20260802070000`
baseline was **not** captured.

---

## G5 / G6 — Operator Preflight — NOT EXECUTED; STOP honored

`scripts/b1-rpc-principal-harness-01/00-preflight.sql` was **not** run.

Also not run (mission-forbidden / stop):

* `01-execution-gate.sql`
* `run-negative-matrix.ps1`
* positive Fixture RPC harness
* operational E2E
* cleanup
* `student_visible=true` / activation
* Deploy / Publish

| Counter | Value |
|---|---|
| Workflow RPC executions | **0** |
| Negative matrix cases | **0** |
| Positive Fixture RPC cases | **0** |
| Operator Preflight result | **NOT_RUN** |
| Execution authorization | **NOT_GRANTED** (artifact unchanged) |

Matrix contract in source (offline): **267 / 267 / 0**. Function-graph pin
(offline): closure **28**, entrypoint hash `07d793b4…`.

---

## Observed differences / assumptions

1. **Assumption:** Production still has migration head `20260801021541` until
   B1-34 is applied (matches current pinned baseline). Not re-attested live.
2. **Assumption:** Fixture package remains present in production as recorded by
   Capture-22/25 (19 TEST_ONLY requests). Not re-attested live.
3. **Source note:** `TARGET-MANIFEST.json` → `matrix.readiness.status` still reads
   `FIXTURE_PACKAGE_NOT_APPLIED` even while baseline is `PINNED` at fixture head
   `20260801021541`. Untouched by this mission; must be reconciled during a
   successful Capture after apply if the launcher readiness enum is still used.
4. Agent environment has `psql` 18.1 and Bun, but lacks the interactive secret
   channel required by the package launcher contract.

---

## What is required to unblock (human / owner)

Resume the **same** mission only when one of these approved paths is attached
without weakening credential rules:

1. **Apply (G2):** Lovable/Supabase managed migration channel applying **only**
   `20260802070000_b1_34_five_services_terminal_visibility_false.sql` atomically
   with ledger registration (no `db push` bulk, no other versions), **or** an
   owner-attended interactive session-mode `psql` on port **5432** that can run
   that single file under a migration-capable principal and register the version
   exactly once.
2. **Baseline (G4):** Lovable (or equivalent) **read-only** SERIALIZABLE capture
   using `fingerprint.sql`, pinning a new baseline with
   `migration_head=20260802070000`, `execution_authorized=false`, and archiving
   the prior `4c95c6a3…` baseline as stale.
3. **Preflight (G5):** Owner-attended interactive `psql -W` as a non-privileged
   operator (not `postgres` / `service_role` / `supabase_admin` / `sandbox_exec`,
   not SUPERUSER/BYPASSRLS), session mode 5432, running **only**
   `00-preflight.sql`, then **STOP**.

Until then, do **not** flip execution authorization and do **not** run the
negative matrix.

---

## Production operation counters (this session)

| Operation | Count |
|---|---|
| Production SQL statements executed | **0** |
| Migrations applied | **0** |
| Baseline artifacts rewritten | **0** |
| Operator Preflight runs | **0** |
| Workflow RPC executions | **0** |
| Service activation (`student_visible=true`) | **0** |
| Deploy / Publish | **0** |
| Execution authorization grants | **0** (remains NOT_GRANTED) |

---

## Risks

* Stale live head relative to source tip until B1-34 is applied.
* Any attempt to bypass interactive credentials with env-injected passwords
  would violate the mission and the harness contract — deliberately refused.
* Completing apply without an immediate baseline refresh would leave Preflight
  fail-closed on migration-head / fingerprint mismatch (correct fail-closed
  behavior).

---

## Final decision (token)

`HOLD_B1_PRODUCTION_MIGRATION_TRUSTED_CHANNEL_AND_INTERACTIVE_OPERATOR_UNAVAILABLE`
