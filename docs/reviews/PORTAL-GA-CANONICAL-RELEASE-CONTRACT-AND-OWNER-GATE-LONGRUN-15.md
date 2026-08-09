# PORTAL-GA-CANONICAL-RELEASE-CONTRACT-AND-OWNER-GATE-LONGRUN-15

## Mission Report — Canonical Release Contract Freeze + Owner-Gate Qualification

**Repository:** `msorori-mh/saba-uni-portal`
**Canonical Source PR:** `#291` — `f799608a5d5fb167d66e5615d3f7b50692295f30`
**Promotion Package PR:** `#299`
**Base (this mission):** `5b03a6e32b0cdb027759cf9e7599bd6863409cce`
**Branch:** `prep/ga-production-promotion-longrun-01` (updated via same PR #299)
**Status:** `PASS_PORTAL_GA_CANONICAL_RELEASE_CONTRACT_QUALIFIED`
**HASH_EXCEPTION_STATUS:** `CLOSED`
**Read-Only Preflight:** `LIVE_READONLY_BLOCKED_CREDENTIALS`

---

## A — Hash Terminology Resolved

Canonical algorithm: `SHA256_LF_NORMALIZED_V1` via `scripts/sha256_lf_normalized_v1.py`

| Term | Definition |
|---|---|
| `FULL_FILE_SHA256_LF` | SHA256 of entire LF-normalized file |
| `BODY_SHA256_LF` / `PROMOTED_MIGRATION_BODY_SHA256_LF` | SHA256 from first `begin;` through EOF |
| `SOURCE_DRAFT_BODY_SHA256_LF` | For GA drafts without `begin;`: SHA256 from first `CREATE` through EOF |
| Semantic equivalence | Source draft body == promoted semantic core (CREATE→EOF, `commit;` stripped) |

**Never compare FULL to BODY.**

Prior apparent conflict:

| Reported value | Actual dimension |
|---|---|
| `3a85f54d…` | AUTH04 **BODY** (correct) |
| `212865fb…` | AUTH04 **FULL** (correct) |

No SQL remediation required.

Frozen manifest: `docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt`

---

## B — Semantic Equivalence (#291 ↔ #299)

| Migration | Source draft (#291 tip) | Promoted (#299) | Follow-up authority locks | Status |
|---|---|---|---|---|
| Foundation | byte-identical core | byte-identical core | n/a | `EQUIVALENT` |
| Completion | byte-identical core | byte-identical core | n/a | `EQUIVALENT` |
| AUTH04 | byte-identical core | byte-identical core | present in both (`FOR SHARE` lock helpers) | `EQUIVALENT` |

`AUTH04_SOURCE_EQUIVALENCE=EQUIVALENT` — no promoted SQL semantic edit.

---

## C — Frozen Hash Pins

| Stage | FULL_FILE_SHA256_LF | BODY_SHA256_LF |
|---|---|---|
| Foundation | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| Completion | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| AUTH04 | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` |

Stale mislabels purged from LONGRUN-09 / LONGRUN-14; hash contract test pins the manifest.

---

## D — Foundation / Completion Drift Check

No accidental semantic drift. Drafts at `#291` tip match current drafts; semantic cores match promoted migrations.

---

## E — Fresh PG17 Chain

Exact promoted files (disposable postgres:17):

```
setup → Foundation → verifier → Completion → verifier → AUTH04 → verifier
→ authority race matrix → full GA E2E (bun test tests/graduates-affairs)
```

**Result:** `PG17_CHAIN_PASS`

Verifier tokens observed: `FOUNDATION_POST_VERIFIER_PASS`, `COMPLETION_POST_VERIFIER_PASS`, `AUTH04_POST_VERIFIER_PASS`, follow-up authority-race `PASS`.

GA suite including E2E matrix / hash contract: **167 pass / 0 fail**.

---

## F — Live Production Readonly Preflight

No authenticated safe production channel in this worktree (no `.env` / production DB URL).

**Result:** `LIVE_READONLY_BLOCKED_CREDENTIALS`

Preflight SQL remains: `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql` (read-only).

---

## G — Merge Topology Simulation (no merge)

```
main → merge #291 → retarget/rebase #299 onto resulting main
```

Owner-approved runbook (commands only; **do not execute without owner approval**):

```bash
# 1) Merge #291 into main (owner-approved)
gh pr merge 291 --merge

# 2) Update local main
git fetch origin main
git checkout main
git pull --ff-only origin main

# 3) Retarget #299 onto main
gh pr edit 299 --base main

# 4) Rebase promotion branch onto main (on a clean worktree)
git fetch origin prep/ga-production-promotion-longrun-01
git checkout prep/ga-production-promotion-longrun-01
git rebase origin/main
# resolve conflicts if any (simulation expected: none)
git push --force-with-lease origin prep/ga-production-promotion-longrun-01

# 5) Merge #299 only after CI green + owner approval
gh pr merge 299 --merge
```

Simulation result: `MERGE_SIMULATION_PASS` (main←#291 merge clean; #299 rebase onto resulting main clean, 9 commits).

---

## H — Apply-One Qualification

See `docs/migration-drafts/GA-PRODUCTION-APPLY-ONE-QUALIFICATION-01.md`.

Order: Foundation STOP → Completion STOP → AUTH04 STOP → config STOP → flags separately.
Each step: readonly preflight → owner approval → apply one → post-verifier.

---

## I — Safety Attestations

| Item | Value |
|---|---|
| `PRODUCTION_WRITES` | 0 |
| `MIGRATION_APPLIED` | NO |
| `FLAGS_ENABLED` | NO |
| `MERGE` | NO |

---

## Files Changed by This Mission

```
docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt
docs/migration-drafts/GA-PRODUCTION-APPLY-ONE-QUALIFICATION-01.md
docs/reviews/PORTAL-GA-CANONICAL-RELEASE-CONTRACT-AND-OWNER-GATE-LONGRUN-15.md
docs/reviews/PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14.md
docs/reviews/PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09.md
scripts/ga-local-exact-rehearsal.sh
tests/graduates-affairs/ga-release-hash-contract.test.ts
```

## Decision

`PASS_PORTAL_GA_CANONICAL_RELEASE_CONTRACT_QUALIFIED`
