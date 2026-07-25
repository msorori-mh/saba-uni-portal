# PORTAL-PR221-PR238-FINAL-MERGE-SIMULATION-AND-RC-PREFLIGHT-02

## Decision

**PASS_PR221_PR238_FINAL_UNIFIED_RC_PREFLIGHT**

Independent local merge simulation of the **live** PR #238 tip (after PR #242 Codex fixes) into PR #221 tip. This is **not** a production merge approval, Deploy authorization, migration apply, activation, or `student_visible` change.

## Live HEADs

| PR | Branch | HEAD | Notes |
|---|---|---|---|
| **#221** | `feat/b1-five-services-ui-kimi-01` | `8c6e092c591be3d10bdfa159e86f61bc30ad0d05` | UI stack base; OPEN / MERGEABLE / BLOCKED |
| **#238** | `integration/b1-final-backend-ui-contracts-01` | `6f015bf005d7b0dd729d4960fe6218908bab4746` | Live tip after #242; OPEN / MERGEABLE / CLEAN |
| **#242** | merged into #238 | merge commit `6f015bf005d7b0dd729d4960fe6218908bab4746` | Closed fail-open readiness + local submit timestamp |

Re-fetch after verification: #238 `headRefOid` still `6f015bf…`.

## Simulation

| Field | Value |
|---|---|
| Branch | `preflight/pr221-pr238-final-merge-simulation-02` |
| Base | `origin/feat/b1-five-services-ui-kimi-01` @ `8c6e092…` |
| Merged | `origin/integration/b1-final-backend-ui-contracts-01` @ `6f015bf…` |
| Simulation merge commit | `73dc25ce5c05820a19855a169d7219bae325b739` |
| Result | **CLEAN — zero conflicts** |
| Real #221 / #238 | **not modified** |

## Conflicts

**None.** No conflict markers. Ort auto-merge succeeded.

## PR #242 fixes present on unified tip

| Finding | Fix evidence |
|---|---|
| Fail-open when `create_draft` readiness absent | `resolveB1RuntimeAvailable` requires `writesAvailable.includes("create_draft")` and denies `writesFailClosed` containing `create_draft` (empty `writesAvailable` now fail-closed) |
| Local timestamp / missing authoritative reread after submit | `submitB1UiRequestFn` requires DB reread of `request_number` / `submitted_at` / `updated_at` or throws `B1_SUBMIT_AUTHORITATIVE_REFRESH_REQUIRED`; no `new Date().toISOString()` fallback |

Integration tests assert both behaviors in `adapter-live-integration.test.ts`.

## Functional / security checklist (source + PG17)

| Check | Result |
|---|---|
| Service visible only with backend visibility + `create_draft` readiness | PASS |
| Runtime readiness fail-closed | PASS |
| Submit → authoritative reread | PASS |
| No local submit timestamp | PASS |
| `expectedUpdatedAt` chaining | PASS |
| Draft create/read/save | PASS (PG17 + UI) |
| Student list/details | PASS |
| Staff inbox/details/actions | PASS |
| Secure attachment authorize-before-sign | PASS |
| No bucket/path/object_key in DTOs | PASS |
| `confirm_payment` = stepId + optional note | PASS |
| No optimistic status / current-step | PASS |
| Exact role/department authorization | PASS (PG17 matrices) |
| Transfer `position_assignment` scope | PASS |
| Withdrawal NULL guard | PASS |
| Zero mutation on denials | PASS |
| Five services remain hidden | PASS (fail-closed without activation) |
| `enrollment_certificate` regression | PASS (integrated harness) |

## PostgreSQL 17

| Harness | Result |
|---|---|
| Secure Read | **PASS** 25/25 (`B1_SECURE_READ_PG17_PASS`) |
| Secure Draft | **PASS** 35/35 + concurrency (`B1_SECURE_DRAFT_PG17_PASS`, `B1_CONCURRENT_CREATE_ONE_DRAFT_PASS`) |
| RPC matrix | **PASS** `RESULTS=65\|12\|0` (0 FAIL) |
| Integrated Runtime | **PASS** 5/5, `fail_rows=0` (`B1_INTEGRATED_RUNTIME_E2E_PASS`) |

Containers disposable (`--rm`).

## Source verification

| Check | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/b1-manifest` | 20 pass |
| `bun test tests/student-requests/b1-ui` | **161 pass** |
| `bun test tests/student-requests` | **823 pass** |
| `bun test tests/b1-rpc-matrix` | 22 pass |
| `bun test tests` | **1760 pass** / 0 fail |
| `bunx tsc --noEmit` | PASS |
| ESLint (affected files) | PASS (LF normalize on working tree; committed blobs unchanged) |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Remaining risks / non-approvals

- This preflight does **not** authorize merging #238 into #221 or merging to `main`.
- Does **not** authorize Production/Staging apply, Deploy/Publish, activation, or `student_visible`.
- #221 remains GitHub-check BLOCKED independently of this simulation.
- If #238 tip moves again, re-run simulation-02 style preflight before any real merge.

## Decision token

`PASS_PR221_PR238_FINAL_UNIFIED_RC_PREFLIGHT`
