# PORTAL-GA-CROSS-PLATFORM-FAILURE-RECOVERY-AND-OPERATOR-REHEARSAL-LONGRUN-16

## Mission Report

**PR:** [#299](https://github.com/msorori-mh/saba-uni-portal/pull/299)
**Branch tip base (START SHA):** `661ee22b518726d8ab8c9baa84360d865149e368`
**Canonical runner:** `scripts/ga-failure-matrix-rehearsal.ps1`
**Companion (Linux/CI only):** `scripts/ga-failure-matrix-rehearsal.sh`

---

## A — Portability root cause(s)

Exact Windows/CRLF failure mechanism in the prior Bash-only harness:

1. **CRLF working-tree checkout (`core.autocrlf=true`)**
   - Index stored LF (`i/lf`) but working tree materialised CRLF (`w/crlf`).
   - WSL/`bash -n` failed with:
     `syntax error near unexpected token $'{\r'` on `start_container() {`.
   - This alone made the script non-executable evidence on Windows.

2. **Windows path vs WSL filesystem**
   - `C:\projects\...` is not a valid path inside WSL without `/mnt/c/...` conversion.
   - Even a LF-normalised script could not be invoked via a raw Windows path from WSL bash.

3. **Heredoc attached to `true` (logic bug)**
   - `docker exec ... || true <<EOF` fed the heredoc to `true`, not to `psql`.
   - Scenarios 8–10 SQL seeds were silently no-ops.

4. **Exit-code swallowing via `|| true` + bare `ERROR` markers**
   - Helpers always returned success to the shell.
   - Scenarios 4–5 accepted any `ERROR` string, so unexpected failures could count as PASS.

5. **No PowerShell canonical operator path**
   - Operator evidence required Bash/WSL/Git-Bash; not acceptable for the GA Windows gate.

---

## B — Canonical cross-platform runner

| Role | Path |
|---|---|
| **CANONICAL** | `scripts/ga-failure-matrix-rehearsal.ps1` |
| Companion | `scripts/ga-failure-matrix-rehearsal.sh` |
| Exact-apply chain | `scripts/ga-local-exact-rehearsal.ps1` |

Contract:

- PowerShell 7+ on Windows
- Docker + disposable `postgres:17` directly
- No WSL requirement
- No Git-Bash-only requirement
- LF-normalise every SQL input before `docker exec -i … psql`
- Classify **SUCCESS / EXPECTED_FAILURE / UNEXPECTED_FAILURE** by exit code **and** precise marker

---

## C — EOL contract

Root `.gitattributes` now pins LF for:

- `scripts/ga-failure-matrix-rehearsal.{ps1,sh}`
- `scripts/ga-local-exact-rehearsal.{ps1,sh}`
- GA promoted migrations `20260808210000` / `10100` / `10200`
- `docs/migration-drafts/GA-*.sql` and `GRADUATES-AFFAIRS-*.sql`
- `tests/graduates-affairs/**`

Runtime normalisation in the PS1 proves LF and CRLF checkouts execute identically.

---

## D — Failure classification

| Class | Rule |
|---|---|
| SUCCESS | exit 0 (setup/apply steps only) |
| EXPECTED_FAILURE | exit ≠ 0 **and** precise marker match |
| UNEXPECTED_FAILURE | exit 0 when failure required, wrong marker, or mutation drift |

Precise markers (not bare `ERROR`):

1. `GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED`
2. `GA_COMPLETION_PREFLIGHT_MISSING`
3. `GA_AUTH04_PREFLIGHT_MISSING`
4. `GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED`
5. `GA_AUTH04_PREFLIGHT_MISSING`
6. `CONFIG HOLD: manager_staff_profile_id is required`
7. `GA_FOUNDATION_PREFLIGHT_MISSING_UNIT`
8. `CONFIG HOLD: a current graduate_account_continuity_policies row already exists`
9. `owns more than one active staff_profile`
10. `is not scoped to department`

---

## E–G — Matrix / fingerprints / recovery

See execution section in the final mission output. Recovery drills use
`docs/migration-drafts/GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql`
(forward-only; no DROP-all production strategy).

---

## H — Frozen hashes (unchanged)

| Migration | FULL | BODY |
|---|---|---|
| Foundation | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| Completion | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| AUTH04 | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` |

No semantic SQL edits.

---

## J — Automated contract tests

`tests/graduates-affairs/ga-failure-matrix-cross-platform.test.ts`

---

## Safety

- PRODUCTION_WRITES: 0
- MIGRATION_APPLIED (production): NO
- CONFIG_EXECUTED_PRODUCTION: NO
- FLAGS_ENABLED: NO
- MERGE: NO
