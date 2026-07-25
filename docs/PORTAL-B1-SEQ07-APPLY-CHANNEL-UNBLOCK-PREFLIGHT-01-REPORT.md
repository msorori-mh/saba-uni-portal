# PORTAL-B1-SEQ07-APPLY-CHANNEL-UNBLOCK-PREFLIGHT-01

## Decision

| Gate | Decision |
|---|---|
| G0 Production drift (from last apply-exec RO) | **PASS** — no evidence of catalog movement |
| Option A — Lovable managed migration/insert tool | **REJECTED** |
| Option B — Supabase CLI linked single-migration push | **ACCEPTED** (revised apply package; operator credentials outside chat) |
| Option C — Storage tool + split SQL | **REJECTED_SEQ07_SPLIT_APPLY_BREAKS_ATOMICITY_OR_HISTORY** |
| Local channel simulation | **PASS_B1_SEQ07_CLI_CHANNEL_LOCAL** |

```
PASS_B1_SEQ07_APPLY_CHANNEL_UNBLOCK_PREFLIGHT
READY_FOR_REVISED_SEQ07_APPLY_APPROVAL
```

**This package is documentation only. SEQ07 was not applied to Production.**

---

## G0 — State pin (read-only)

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Production ref | `wpmicqriltrowwonknox` |
| `origin/main` | `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` |
| SEQ07 path | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` (recomputed ✅) |
| Pending B1 files on main after cutoff | **17** (`20260725110000` … `20260725160000`) |

Agent session has **no Production SQL credentials**. G0 accepts the last verified Lovable apply-exec post-state (`PORTAL-B1-SEQ07-PRODUCTION-APPLY-EXEC-01-RESULT` + independent verification):

| Check | State |
|---|---|
| `20260725110000` in history | absent |
| Partial SEQ07 objects / bucket | absent (0) |
| History tip | `20260725002136` (total 151) |
| Five services | hidden; requests = 0 |
| Protected digests | unchanged vs G4 |
| SEQ08–24 | not applied |
| Any Production write this prep | **none** |

If a fresh RO probe shows any delta → `HOLD_B1_SEQ07_UNBLOCK_PREFLIGHT_DRIFT_<EXACT_REASON>` (not observed).

---

## G1 — Lovable tool rejection analysis

| Item | Finding |
|---|---|
| Tool (operator evidence) | Lovable **migration / insert tools** (managed apply surface) |
| Rejection class | **Parser / static policy** — pre-execution; not a PostgreSQL runtime error |
| Quoted reject | *"This SQL writes to `storage.buckets`, which the migration and insert tools reject. Create buckets with the storage tool…"* |
| Scope | Tool refuses **writes to `storage.buckets`** in the migration/insert path (SEQ07 lines 10–13) |
| Transaction started? | **No** — pre-execution rejection |
| Partial apply? | **No** — history tip unchanged; SEQ07 objects remain absent |
| Alternate Lovable runner that auto-registers history + accepts `storage.buckets` | **Not available / not evidenced** in the apply-exec session (“only managed tool available”) |
| Can Lovable tool apply one migration + history when SQL is “allowed”? | Historically yes for non-storage migrations; **blocked for unmodified SEQ07** |

Conclusion: Lovable managed channel cannot execute the **byte-identical** SEQ07 file. Unblock requires a different runner, not an in-place edit of `20260725110000`.

---

## G2 — Channel evaluation

### Option A — Lovable migration runner (unmodified file)

| Criterion | Result |
|---|---|
| Executes original file unmodified | **FAIL** (static reject) |
| One migration only / BEGIN·COMMIT / auto history | N/A (never starts) |
| Verdict | **REJECTED** |

### Option B — Supabase CLI / official linked migration push

Project runbook pin: `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`  
(`supabase db push --linked` with dry-run proving **exactly one** migration; forbids `--include-all`, repair, raw `psql -f` as history substitute).

| Criterion | Result |
|---|---|
| Executes original SEQ07 bytes (incl. `storage.buckets` upsert) | **YES** — PostgreSQL accepts; proven locally |
| Single migration only | **YES if and only if** apply tree is isolated so dry-run pending count = **1** |
| Preserves BEGIN/COMMIT inside file | **YES** |
| Registers `20260725110000` via official runner | **YES** (`supabase_migrations.schema_migrations`) |
| Does not apply SEQ08+ | **YES** under isolation; **FAIL on full main tree** (17 pending) |
| Preflight / post-verifier runnable | **YES** (companion SQL, ROLLBACK) |
| No history repair | **YES** (required) |
| Credentials in this agent session | **ABSENT** — package for authorized operator only; **do not paste secrets in chat** |
| Local CLI availability | `npx supabase` → **2.109.1** (not linked to Production here) |

**Verdict: ACCEPTED** as the supported unblock channel, with mandatory isolation + dry-run=1 gate.

**Hard stop:** `supabase db push` against a full `main` checkout that still contains SEQ08–SEQ24 files would propose **17** pending migrations → **FORBIDDEN** (`max_migrations_per_apply_session=1`).

### Option C — Storage tool + SQL migration split

| Criterion | Result |
|---|---|
| Keep unmodified SEQ07 | **FAIL** — file still contains `INSERT INTO storage.buckets`; Lovable still rejects; or requires deleting the INSERT |
| Atomicity of original single transaction | **Broken** if bucket created outside then SQL applied separately without a new reviewed design |
| Correct history without repair / manual insert | Not achievable while keeping pinned SEQ07 bytes on Lovable path |
| Orphan bucket on SQL failure | Residual risk if sequenced across tools |

**Verdict: `REJECTED_SEQ07_SPLIT_APPLY_BREAKS_ATOMICITY_OR_HISTORY`**

### Non-option — Dashboard SQL paste / raw `psql -f` without history

Forbidden by G3 and runbook-07 (applies objects without official history registration unless using the migration runner). **REJECTED**.

---

## G3 — Forbidden (reaffirmed)

- Edit `20260725110000_…sql` or ship a same-version patched copy  
- Apply SQL without history registration  
- Manual `schema_migrations` INSERT / `migration repair`  
- Create Production bucket now / apply any SEQ07 object now  
- SEQ08→24 · Gate 25 · activation · `student_visible` · Deploy/Publish  

---

## G4 — Local alternate-runner simulation

Harness: `tests/b1-seq07-cli-channel/run-harness.ps1`  
Image: `postgres:17-alpine` → **17.10**  
Simulates: history tip surrogate → dry-run count=1 → apply unmodified SEQ07 → insert history version → post-verifier → second-apply refuse → failure rollback → SEQ08 absent.

| Check | Result |
|---|---|
| One migration only | PASS |
| History row `20260725110000` | PASS |
| Transaction rollback on forced failure | PASS |
| SEQ08 not applied | PASS |
| Post-verifier | PASS |
| Second apply refuse | PASS |
| Bucket `public=false` | PASS |
| anon EXECUTE denied on intent RPC | PASS |

`PASS_B1_SEQ07_CLI_CHANNEL_LOCAL`

---

## G5 — Revised SEQ07 apply package (**DO NOT EXECUTE HERE**)

```
ONE MIGRATION ONLY = SEQ07
CHANNEL = Supabase CLI linked db push (Option B)
FORBIDDEN: Lovable migration/insert tool for this file
FORBIDDEN: SEQ08→24 in the same session
```

### Identity

| Field | Value |
|---|---|
| File | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` |
| Project | `wpmicqriltrowwonknox` |
| Expected new history version | `20260725110000` |

### Operator prerequisites (outside this agent)

1. Official Supabase access for project `wpmicqriltrowwonknox` (service role / CLI link credentials — never paste into chat).  
2. CLI version recorded in evidence (example local: `2.109.1` via `npx supabase`).  
3. Fresh read-only pre-check: tip still `20260725002136`; SEQ07 objects/bucket still absent; five services hidden; protected digests stable.  
4. Official preflight SQL (ROLLBACK): `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql`.

### Apply-tree isolation (mandatory)

Prepare an **apply-only worktree/checkout** whose `supabase/migrations` contains:

- all migrations already present on Production history, **and**
- **exactly one** not-yet-applied local file: `20260725110000_b1_07_secure_attachments_source_01.sql`

Do **not** include `20260725110100`…`20260725160000` in that apply tree for this session.  
Do **not** delete those files from `main` permanently — isolation is session-scoped.

### Exact command envelope (documentation only)

```powershell
# DOCUMENTATION ONLY — requires REVISED separate human approval for Option B
# Target: wpmicqriltrowwonknox AFTER approval. NOT authorized by this prep.

$migrationPath = 'supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql'
$expectedSha  = '66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8'

# 1) LF SHA-256 gate on $migrationPath == $expectedSha
# 2) supabase link --project-ref wpmicqriltrowwonknox   # credentials via operator secret store
# 3) supabase migration list --linked
# 4) supabase db push --linked --dry-run
#      FAIL CLOSED unless pending list is EXACTLY:
#      20260725110000_b1_07_secure_attachments_source_01.sql
# 5) Re-check SHA
# 6) supabase db push --linked          # ONE migration only
# 7) supabase migration list --linked   # tip must include 20260725110000
# NEVER: --include-all | migration repair | db reset | batch SEQ08+
```

### Post-apply

1. `07-…-POST-VERIFIER.sql` (ROLLBACK)  
2. Object proof: private bucket + uploads table + RPCs; no anon grants  
3. Protected-record digest recheck  
4. Confirm SEQ08+ versions absent  
5. Stop on any ERROR / PARTIAL / dry-run≠1 / digest drift  

### Stop conditions

- Dry-run pending ≠ 1  
- SHA mismatch  
- Lovable tool re-selected for this file  
- Any SEQ08+ apply  
- History repair / manual history insert  
- Partial objects without history row (or history without objects)

### Forward-only remediation

New reviewed migration only. No down migration. No mass-delete of attachment objects.

---

## Assumptions / risks / obstacles

| Item | Note |
|---|---|
| Assumption | Last Lovable apply-exec RO remains valid until operator re-probes immediately before push |
| Risk | Full-tree `db push` from `main` would apply 17 migrations — isolation is mandatory |
| Risk | Operator credential mishandling — use secret store / CI OIDC; never chat |
| Obstacle | Lovable managed tool remains unusable for unmodified SEQ07 |

## Production impact

**Zero** from this preparation track.

## Files

| Path | Role |
|---|---|
| `docs/PORTAL-B1-SEQ07-APPLY-CHANNEL-UNBLOCK-PREFLIGHT-01-REPORT.md` | This report |
| `tests/b1-seq07-cli-channel/run-harness.ps1` | Local Option B simulation |

## Final codes

```
PASS_B1_SEQ07_APPLY_CHANNEL_UNBLOCK_PREFLIGHT
READY_FOR_REVISED_SEQ07_APPLY_APPROVAL
REJECTED_SEQ07_SPLIT_APPLY_BREAKS_ATOMICITY_OR_HISTORY   # Option C
# SEQ07 NOT APPLIED
```
