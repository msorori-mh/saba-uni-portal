# PORTAL-FINAL-RELEASE-CANDIDATE-V3-MAIN-RECONCILIATION-LONGRUN-03

**Decision:** `PASS_PORTAL_FINAL_RELEASE_CANDIDATE_V3_MAIN_RECONCILED`

**FINAL_SHA:** `55afee941e51cf29aa68102ca2240d6d0883bb55`  
**DRAFT_PR:** [#309](https://github.com/msorori-mh/saba-uni-portal/pull/309)  
**Branch:** `integration/portal-final-release-candidate-v3-01`  
**Mission date:** 2026-08-09  

## Pins

| Role | Value |
|---|---|
| CURRENT_MAIN | `855a4f17de42361b92bc9e0d96ebfa36aff06ff1` |
| OLD_BASELINE | `e71d9aa8cfc0f5ddefef08c16bb361413eb97496` |
| GP_HEAD (#293) | `61952df385eea12f57720ea33b2d10b5b6621247` |
| GA_SOURCE_HEAD (#291) | `f799608a5d5fb167d66e5615d3f7b50692295f30` |
| GA_PROMOTION_HEAD (#299) | `19b412e655079697ea03e016f311151f74673480` |
| COUNCILS_HEAD (#306) | `1f50e7dcc8042cf15780c7817ecefa579c49f431` |
| B1_HEAD (#307) | `3617a8a1eac69528b1dfacc988fc6d4cfbe9dec6` |
| ORCHESTRATOR (#301) | `47c03c4ef2d21025fa173fa6bb9004e3162d5159` |
| OLD_RC_V2 (#308) | `891eb44319116adb5fe44f0ffcee81c3b1816678` (superseded, not merged) |

## Phase A — Lovable main drift

Independent proof (`e71d9aa8..855a4f17`):

- Commits: `a24faba3` → `855a4f17`
- Files changed: **only** `package.json`, `bun.lock`
- Change: `@lovable.dev/vite-tanstack-config` `2.8.5` → `2.9.1`
- Lock transitive: `@lovable.dev/vite-plugin-hmr-gate` `1.3.4` → `1.5.0`

**Verdict:** tooling/dev-server HMR bridge upgrade only. No application source drift on main.  
RC V3 reconciles onto current main **without** downgrading packages.

After `bun run build` on 2.9.1:

- Route semantic SHA256 remained `0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef`
- No semantic route hash churn from the Lovable bump

## Phase B–E — Semantic merge order

Merged onto `855a4f17` (no file-copy, no #308 merge):

1. GP #293
2. GA #291 source
3. GA #299 promotion/hash contract
4. Councils #306 final (`1f50e7dc`) — resolved one conflict in `tanstack-register-stable-augmentation-01.test.ts` to integrated GA+Councils hash
5. B1 #307
6. Release orchestrator #301, then V3 pin finalization commit

Superseded councils #294–#305 were **not** merged independently; only final #306.

## Phase C — GA hash contract (verified)

| Migration | FULL | BODY |
|---|---|---|
| Foundation `20260808210000` | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| Completion `20260808210100` | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| AUTH04 `20260808210200` | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` |

No stale hash exception. Contract closed via LONGRUN-15 (#299 tip).

## Phase D — Councils final

Integrated only `1f50e7dc` (#306). Preserves C9 internal RPC hardening, TEST_ONLY execute, positive E2E, negative matrix, zero residue / false-pass proofs, sentinels, strict preflight, drift tests, PostgREST v12 HTTP matrix, DML/RPC denial matrices, zero mutation, two-connection concurrency (covered by councils test suite).

## Phase E — B1 final

Integrated #307. Preserves 267 fresh render, payment `v_step`, exact `42501` contracts, verify-full, override bans, SELECT-only operator, no `FOR SHARE`, state pinning, function graph, side-effect scanner, fingerprint.  
`AUTHORITATIVE_BASELINE` remains production-derived gate (PENDING / not invented locally). No 267 production execution.

## Phase F — Global migration graph

Post-main order present, no collisions, chronological OK:

```
20260808010000  GP L4
20260808120000  Councils C0
20260808121000  Councils C1
20260808122000  Councils C2
20260808130000  Councils C3
20260808140000  Councils C4
20260808150000  Councils C5
20260808160000  Councils C6
20260808170000  Councils C7
20260808171000  Councils C0-C8 closure
20260808180000  Councils C9
20260808210000  GA foundation
20260808210100  GA completion
20260808210200  GA AUTH04
```

## Phase G — Orchestrator finalization

Updated `src/release/release-manifest.json` + `COUNCILS_300_INTEGRATED_PIN`:

- `current_main` = `855a4f17...`
- GP / GA / Councils / B1 pins as above
- Source review gates: `source_ready=PASS` for integrated packages
- Production gates remain HOLD / OWNER_APPROVAL_REQUIRED
- Explicit separation: `SOURCE_READY` / `PRODUCTION_READONLY_READY` / `OWNER_APPROVAL_REQUIRED`
- Live-production gates **not** marked PASS

## Phase H — Route / build

- `bun run build` PASS on Lovable `2.9.1`
- GP / GA / Councils / admin / student / faculty routes present
- Semantic hash stable; no package downgrade

## Phase I — Database collision audit

Scanned CREATE function/table/type/view/policy objects across `20260808*` domain migrations:

- Objects scanned: 224
- Cross-domain collisions: **0**

## Phase J — Regression

| Suite | Result |
|---|---|
| `bun test tests/graduation-projects` | 119 pass / 0 fail |
| `bun test tests/graduates-affairs` | 167 pass / 0 fail |
| `bun test tests/academic-councils` | 50 pass / 0 fail |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | 202 pass / 0 fail |
| `bun test tests/student-requests` | 1066 pass / 0 fail |
| `bun test tests/release` | 18 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| PG17 disposable chains | exercised via GP/GA/Councils suites |
| PostgREST v12 HTTP matrix | PASS (councils suite) |
| B1 local operator simulation | executed locally (Docker PG17) |

## Phase K — Why #308 is superseded

PR #308 (`891eb443`) is **not** closed automatically, but is superseded because:

1. **Old main baseline:** pinned/reconciled on `e71d9aa8`, missing Lovable main drift `a24faba3`/`855a4f17`
2. **Old GA #299 SHA:** used `5b03a6e3` (LONGRUN-14 tip), not canonical LONGRUN-15 `19b412e6`
3. **Old Councils #306 SHA:** used `e76ace8b`, not final HIGH-findings closure `1f50e7dc`

V3 replays the same domain sources onto **current main** with the final candidate tips.

## Phase L — Draft PR

- Branch pushed: `integration/portal-final-release-candidate-v3-01`
- Draft PR: [#309](https://github.com/msorori-mh/saba-uni-portal/pull/309) (not ready, not merged)
- Web CI: **PASS** (all jobs green, run `31280575025`)
- Migration Review: **PASS** (run `31280575033`)

## Hard boundaries honored

- PRODUCTION_READS: 0
- PRODUCTION_WRITES: 0
- MIGRATION_APPLIED: NO
- MERGE_TO_MAIN: NO
- DEPLOY: NO
- FLAGS: NO

## Agent report

### Files modified (mission tip commits beyond merges)

- `src/release/release-manifest.json`
- `src/release/orchestrator.ts`
- `tests/release/portal-release-orchestrator.test.ts`
- `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` (conflict resolution during #306 merge)
- `docs/release/PORTAL-FINAL-RELEASE-CANDIDATE-V3-MAIN-RECONCILIATION-LONGRUN-03.md`

### Assumptions

- Candidate SHAs listed in the mission brief are authoritative.
- Production security/owner gates remain HOLD until owner evidence, even when source packages are integrated.

### Risks

- Draft PR CI may still require Migration Review attention on stacked migration volume.
- #308 remains open until human disposition.

### Production impact

- Source-only RC. Zero production mutation/apply/deploy from this mission.

### Decision

**PASS**
