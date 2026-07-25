# PORTAL-B1-FINAL-UNIFIED-SOURCE-RC-01

## Decision

**PASS_PR221_FINAL_UNIFIED_SOURCE_RC**  
**HOLD_PR221_MAIN_MERGE_GITHUB_ACTIONS_BILLING_NO_JOB_STEPS** *(expected unless remote CI actually starts)*

PR #238 was merge-committed into PR #221. Source + local PG17 verification on the unified tip are green. Five services remain hidden. No Production/Staging apply, Deploy/Publish, migration apply, activation, or `student_visible` change. **PR #221 was not merged to main.**

## Provenance

| Ref | SHA / value |
|---|---|
| `main` base | `92d51faa9bcdc9fd99e89579f6a498b463264246` (unchanged) |
| PR #221 HEAD before merge | `8c6e092c591be3d10bdfa159e86f61bc30ad0d05` |
| PR #238 final HEAD | `6f015bf005d7b0dd729d4960fe6218908bab4746` |
| PR #238 → #221 merge commit | `314b8684a637efaa7b8917ff649830898e946633` |
| PR #221 merge tip | `314b8684a637efaa7b8917ff649830898e946633` |
| PR #221 final tip (docs RC report) | `ed6898d0371fbabc95f26ecbcef25f5749001803` (docs-only after merge) |
| PR #242 (Codex HIGH fixes) | MERGED into #238 @ `6f015bf…` |
| PR #241 (backend Codex guards) | in ancestry via #227 tip `1c085a9…` |
| PR #239 (apply package seq 21–25) | in ancestry (`e656b825…`) |
| Codex on #238 | `PASS_PR238_FINAL_BACKEND_UI_RC_INDEPENDENT_REVIEW` |
| Preflight sim #244 | `PASS_PR221_PR238_FINAL_UNIFIED_RC_PREFLIGHT` (superseded; not merged) |

## Merge

- Method: `gh pr merge 238 --merge --match-head-commit 6f015bf…`
- Result: PR #238 **MERGED**; PR #221 **OPEN**; `main` unchanged.

## Surfaces present on unified tip

Secure Read / Secure Draft contracts · transfer department `position_assignment` scope · withdrawal NULL guard · activation gate **25** (local/non-migration) · student/staff UI · secure attachment boundary · final `adapter.live` · Codex reviews · production sequential apply package (READ-ONLY).

Absent by design: service activation, five-service `student_visible=true`, broad bypass, public storage URLs, optimistic mutations, local submit timestamps, browser storage coordinates, payment gateway/invoice/balance UI.

## PostgreSQL 17 (unified tip `314b868…`)

| Harness | Result |
|---|---|
| Secure Read | **25/25 PASS** |
| Secure Draft | **35/35 PASS** + concurrency PASS |
| RPC matrix | **65\|12\|0** (0 FAIL) |
| Integrated Runtime | **5/5**, `fail_rows=0`, zero-mutation PASS |
| Authorization matrix (`run-full-matrix.ps1`) | positive **24**, negative **528**, zero-mutation **528**, failures **0**, specialized failures **0** |
| `enrollment_certificate` regression | **PASS** |

## Source verification

| Check | Result |
|---|---|
| `bun test tests/b1-manifest` | 20 pass |
| `bun test tests/student-requests/b1-ui` | **161 pass** |
| `bun test tests/student-requests` | **823 pass** |
| `bun test tests/b1-rpc-matrix` | 22 pass |
| `bun test tests` | **1760 pass** / 0 fail |
| `bunx tsc --noEmit` | PASS |
| ESLint (affected B1 files) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Security / functional guards (confirmed)

- Visibility requires backend inclusion **and** `create_draft` readiness (fail-closed).
- Services remain hidden without activation.
- `expectedUpdatedAt` required; stale denied; concurrent open-draft guard proven.
- Submit uses authoritative DB reread (`B1_SUBMIT_AUTHORITATIVE_REFRESH_REQUIRED` if missing); no local timestamp.
- No optimistic status/current-step after mutations.
- Exact role/assignment/department; no admin/dean/registrar bypass.
- `confirm_payment`: `stepId` + optional note only.
- Attachments: `attachmentId` only from browser; authorize before signed URL; no bucket/path/object_key in DTOs.
- Five services lifecycle **5/5** in integrated harness.

## Protected IDs (untouched)

`SR-20260716-26BAD4C8`, `SR-20260715-FEDCB3E1`, `SR-20260713-2DE64041`, `USR-2026-000001`, `USR-2026-000002`.

## GitHub Actions

Inspected **once** via `gh pr checks 221` after the docs tip push:

| Observation | Evidence |
|---|---|
| `Review SQL migrations (read-only)` | `fail` in ~2s; job `steps: []`; `gh run view --log-failed` → `log not found` |
| Broader CI suite | `status: queued` / checks still `pending` (0 duration) |

This matches the account billing / spending-limit pattern (job concluded without executable steps), **not** a proven source regression.

Recorded:

`HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS`

That is **not** a local source failure and must **not** trigger merge to `main`. No further CI re-runs were attempted in this cycle.

## Next exact step

1. Clear GitHub Actions billing / spending limit (human/account action).
2. Confirm remote CI green on PR #221 unified tip (including any docs tip after this report).
3. Only then seek **separate human approval** to merge PR #221 → `main`.
4. Production sequential apply remains a later, separately authorized track (seq 21–25 package is PREPARATION-ONLY).

## Explicit non-approvals

- No merge of #221 to `main` in this cycle.
- No Production/Staging migration apply, Deploy/Publish, activation, or `student_visible`.
- PR #244 is simulation evidence only (close as superseded; do not merge).
