# PORTAL-PR221-PR238-FINAL-MERGE-SIMULATION-AND-CONFLICT-PREFLIGHT-01

## Decision

**PASS_PR221_PR238_FINAL_MERGE_SIMULATION_PREFLIGHT**

This is a **local merge simulation / conflict preflight only**. It is **not** authorization to merge PR #238 into PR #221, and **not** a substitute for the parallel Codex review of PR #238.

No Production/Staging, migration apply, Deploy/Publish, activation, or `student_visible` change.

## Live HEADs (verified before and after suite)

| PR | Branch | HEAD | State |
|---|---|---|---|
| **#221** | `feat/b1-five-services-ui-kimi-01` | `8c6e092c591be3d10bdfa159e86f61bc30ad0d05` | OPEN / MERGEABLE / BLOCKED (checks) |
| **#238** | `integration/b1-final-backend-ui-contracts-01` | `945da82ec0be44c98649e1bc152bad4249354f77` | OPEN / MERGEABLE / CLEAN |

Re-fetch after tests: **PR #238 HEAD unchanged** (`945da82…`). Simulation tip still contains that commit as ancestor. No Codex tip drift required a re-merge in this cycle.

## Simulation branch

| Field | Value |
|---|---|
| Branch | `preflight/pr221-pr238-final-merge-simulation-01` |
| Base | `origin/feat/b1-five-services-ui-kimi-01` @ `8c6e092…` |
| Merged | `origin/integration/b1-final-backend-ui-contracts-01` @ `945da82…` |
| Merge commit | `66082694bbd498e987d048b7f035e8b42282bfab` |
| Strategy | `git merge --no-ff` (ort) |
| Result | **CLEAN — zero conflicts** |

Real #221 / #238 branches were **not** modified.

## Conflicts discovered

**None.** No conflict markers. Merge completed automatically.

Semantic overlap areas reviewed (adapter, secure-read/draft, attachments, capability, tests, manifest/PROMOTION-MAP, reports, route tree): all resolved by take-from-#238 additive integration on top of #221 UI tip, with only intentional small component edits from #238 (below).

## Intentional post-#221 UI deltas retained from #238

| File | Change |
|---|---|
| `B1StudentRequestForm.tsx` | Pass `draft.updatedAt` as required `expectedUpdatedAt` on save/submit chain |
| `B1StaffWorkspace.tsx` | Null-safe `allowedAction` UI message when staff has no action |

All other Kimi UI components / RTL / a11y surfaces from #221 remain present (`dir="rtl"` on service list/form/staff; form/staff retain aria/role usage).

## Preservation checklist

| Asset | Status |
|---|---|
| Kimi RTL + Accessibility | **Kept** |
| Content / journey regression docs + tests | **Kept** |
| Secure attachment download boundary | **Kept** (`downloadB1RequestAttachment`; no optimistic timestamps) |
| Authoritative mutation acknowledgments | **Kept** |
| `expectedUpdatedAt` chaining | **Kept** (types + live + form) |
| Secure read/draft contracts + wrappers | **Kept** (byte-identical to #238) |
| Migrations seq 21–24 + gate 25 policy | **Kept** (manifest + PROMOTION-MAP) |
| Integrated runtime 5/5 evidence (harness + reports) | **Present** (SQL byte-identical → PG17 not re-run this cycle) |
| `enrollment_certificate` regression suite | **Kept** (`60-enrollment-certificate-regression.sql`) |
| Five services hidden | **Kept** (fail-closed availability; no activation) |
| `src/routeTree.gen.ts` | **Unchanged** vs #221 |

## Files affected (merge vs #221 tip)

78 paths / +11842 / −318 roughly:

| Area | Count (approx) |
|---|---:|
| `tests/` | 37 |
| `docs/` | 23 |
| `src/` (secure-read/draft + adapter + 2 components) | 14 |
| `supabase/migrations/` (seq 21–24) | 4 |

SQL/runtime blobs verified **byte-identical** to PR #238 for migrations 21–24 and key adapter/contract files → full PostgreSQL re-run deferred until Codex closes and final #238 HEAD is pinned (per brief).

## Tests (simulation tip)

| Check | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/student-requests/b1-ui` | **159 pass** |
| `bun test tests/student-requests` | **821 pass** |
| `bun test tests/b1-rpc-matrix` | **22 pass** |
| `bun test tests/b1-manifest` | **20 pass** |
| `bun test tests` (first full pass) | 1757 pass / **1 fail** (timeout flake on hash-object sequence pin test @ 30s) |
| Re-run `b1-integrated-runtime-independent-review-01.test.ts` | **5 pass** (same test green in 4.6s) |
| `bunx tsc --noEmit` | PASS |
| ESLint on affected files | PASS after LF normalize; committed blobs are LF (Windows `core.autocrlf` working-tree noise discarded) |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| PostgreSQL 17 full harnesses | **NOT RE-RUN** (SQL/backend byte-identical to #238; prior evidence 25/25, 35/35, RPC 0 FAIL, 5/5 still applies) |

## Residual risks

1. **Codex may still change PR #238** — simulation must be re-merged if `headRefOid` moves.
2. **Full-suite timeout flake** on sequential pin hashing under load — re-run that file; consider raising timeout only if it reproduces after Codex pin.
3. **#221 is BLOCKED** on GitHub checks — unrelated to this simulation merge cleanliness.
4. This preflight does **not** replace independent Backend/UI Codex review of #238, nor a final merge authorization.

## Repeat steps after Codex finishes on #238

1. `git fetch origin --prune`
2. Confirm new #238 `headRefOid`; if changed, reset simulation branch from #221 tip and re-merge #238 (or merge the new tip into this preflight branch).
3. Re-run bun suites + tsc + eslint + build + `git diff --check`.
4. If SQL/runtime blobs changed vs prior pin, re-run Secure Read / Secure Draft / RPC matrix / Integrated Runtime PG17.
5. Update this report with final HEADs and issue a **new** decision token for the final merge cycle (this document remains a preflight only).

## Explicit non-approvals

- Not a merge of #238 into #221.
- Not a merge to `main`.
- Not Production/Staging apply, Deploy, activation, or visibility change.
- Not a final PASS for shipping the five services.

## Decision token

`PASS_PR221_PR238_FINAL_MERGE_SIMULATION_PREFLIGHT`
