# PORTAL-GP-GA-CURRENT-MAIN-MERGE-AND-PRODUCTION-CUTOVER-READINESS-LONGRUN-01

**Decision:** `PASS_PORTAL_GP_GA_CURRENT_MAIN_MERGE_AND_CUTOVER_READY`

**Repository:** `msorori-mh/saba-uni-portal`  
**Mode:** SOURCE-ONLY main reconciliation + merge qualification + cutover books  
**Integration worktree:** `integration/gp-ga-current-main-cutover-longrun-01`  
**NO merge to main · NO migration apply · NO production writes · NO flags · NO deploy**

---

## Final return block

| Key | Value |
|---|---|
| CURRENT_MAIN | `1b14201e5939cdbf17e7b5e5d79be7ad5b6b2149` |
| GP_OLD_SHA | `61952df385eea12f57720ea33b2d10b5b6621247` |
| GP_NEW_SHA | `301f71c1c09e52c4098712d5d2a1299344a28bb8` |
| GP_PR_MERGEABLE | YES (`CLEAN` vs current main) — [#293](https://github.com/msorori-mh/saba-uni-portal/pull/293) |
| GP_TESTS | PASS — fixture+L4 11/11; full GP suite 115/115 |
| GP_PG17 | PASS — disposable postgres:17 two-cycle + L4 U1–U4→L4 chain |
| GP_PRODUCTION_GATE | `GP_OWNER_APPLY_GATE=OPEN` (live-readonly P1-U compatible; **NO APPLY**) |
| GA291_OLD_SHA | `f799608a5d5fb167d66e5615d3f7b50692295f30` |
| GA291_NEW_SHA | `b97ec3100c830c7e82a0bf75a11318b73ae44d8d` |
| GA291_PR_MERGEABLE | YES (`CLEAN` vs current main) — [#291](https://github.com/msorori-mh/saba-uni-portal/pull/291) |
| GA299_OLD_SHA | `19b412e655079697ea03e016f311151f74673480` |
| GA299_NEW_SHA | `661ee22b518726d8ab8c9baa84360d865149e368` |
| GA299_STACK_STATUS | Restacked on reconciled #291; `MERGEABLE`/`CLEAN` — [#299](https://github.com/msorori-mh/saba-uni-portal/pull/299) |
| GA_HASHES | ALL MATCH frozen FULL/BODY pins (see §E) |
| GA_TESTS | PASS — 167/167 graduates-affairs |
| GA_PG17 | PASS — CI authority-race + Foundation/Completion/AUTH04 legs on #291; local PG17 via suite |
| GA_PRODUCTION_GATE | `GA_READY_FOR_OWNER_FOUNDATION_APPLY` after source merge sequence (**NO APPLY**) |
| MERGE_ORDER | Recommended: `#293 → #291 → retarget/restack #299 → #299` (source trees order-independent for GP↔GA291) |
| GLOBAL_MIGRATION_ORDER | `20260808010000` (GP L4) → `20260808210000` → `20260808210100` → `20260808210200` |
| TSC | PASS |
| BUILD | PASS |
| CI | #293 green; #291 green; #299 dispatched on `661ee22b` |
| PRODUCTION_READS | 0 |
| PRODUCTION_WRITES | 0 |
| MIGRATION_APPLIED | NO |
| FIXTURE_EXECUTION | NO |
| FLAGS_CHANGED | NO |
| MERGE_TO_MAIN | NO |

---

## Phase A — Current main drift

Audited `e71d9aa8` → `1b14201e`:

| Commit | Class | Runtime/schema? |
|---|---|---|
| `a24faba3` / merge `855a4f17` | Lovable tooling: `@lovable.dev/vite-tanstack-config` `2.8.5` → `2.9.1` (+ lock) | NO |
| `588b0972` / merge `1b14201e` | Production evidence doc `docs/PORTAL-PRODUCTION-COUNCILS-B1-RECONCILIATION-EVIDENCE-LONGRUN-03.md` | NO |

**Verdict:** No hidden runtime or schema drift. Current main left intact (no revert).

---

## Phase B — GP #293 main reconciliation

- Branch: `test/gp-level4-production-fixture-package-01`
- Action: `merge(origin/main)` — clean ort merge
- Preserved delta (exactly 6 files): fixtures / cleanup / fingerprint / runbook / test / verifier
- Did **not** duplicate L4 migration already on main
- Kept current-main tooling `2.9.1`
- Pushed same PR branch → head `301f71c1`

---

## Phase C — GP final regression

| Check | Result |
|---|---|
| Fixture package + L4 eligibility | 11 pass (PG17 replay, ≥12 negatives contract, zero residue) |
| Full `tests/graduation-projects` (on stacked tip) | 115 pass |
| L4 hash portability (`SHA256_LF_NORMALIZED_V1`) | Documented BODY pin `9e0422f8…086c3` unchanged on main |
| TSC / build / diff-check | PASS |
| CI on #293 | All jobs SUCCESS |

Production-attested fact retained: **`GP_OWNER_APPLY_GATE = OPEN`** (P1-U: SET U present, L4 absent). **No apply.**

---

## Phase D — GA #291 main reconciliation

- Branch: `fix/graduates-affairs-multimodel-remediation-01`
- Action: `merge(origin/main)` — clean ort merge
- Preserved: authorization, FOR SHARE authority locking, concurrency remediation, UI/runtime, hash-relevant drafts
- Kept current-main tooling `2.9.1`
- Pushed same PR branch → head `b97ec310`

---

## Phase E — GA #299 restack

- Stacked branch: `prep/ga-production-promotion-longrun-01`
- Action: merge reconciled #291 → then pin manifest `CANONICAL_SOURCE_SHA` to `b97ec310`
- **No semantic SQL drift.** Promoted migration bytes unchanged.

### Frozen hashes (recomputed; all MATCH)

| Stage | FULL_FILE_SHA256_LF | BODY_SHA256_LF |
|---|---|---|
| Foundation | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| Completion | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| AUTH04 | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` |

**Hash reconciliation note:** Only manifest metadata `CANONICAL_SOURCE_SHA` advanced (`f799608a` → `b97ec310`) to reflect the main-reconcile merge tip. Frozen FULL/BODY contracts were **not** altered. Prior tip recorded as `CANONICAL_SOURCE_SHA_PRE_MAIN_RECONCILE`.

---

## Phase F — GA final regression

| Check | Result |
|---|---|
| `bun test tests/graduates-affairs` | **167 pass / 0 fail** |
| Authority race / concurrency | CI SUCCESS on #291 (`graduates-affairs-followup-authority-race`, remediation-concurrency) |
| GP regression | **115 pass** |
| Student-request regression | **1066 pass** |
| TSC / build / diff-check | PASS |

Production gate retained: **`GA_READY_FOR_OWNER_FOUNDATION_APPLY`** after source merge sequence. **No apply.**

---

## Phase G — Merge sequence proof (local only; no main merge)

Local real merges proved:

```
CURRENT MAIN
→ merge GP #293     (clean)
→ merge GA #291     (clean)
→ merge GA #299     (clean)
```

Reverse order `main → #291 → #293` produced **identical trees** (`SOURCE_MERGE_ORDER_INDEPENDENT=YES`).  
**File overlap GP↔GA291:** none (disjoint deltas).

### Recommended source merge order

1. **Merge #293** (GP operator package) — optional relative to #291 for git topology, recommended first so L4 operator package is on main before any L4 apply window.
2. **Merge #291** (GA source remediation).
3. **Retarget/restack #299** onto resulting main (already restacked onto reconciled #291 today).
4. **Merge #299** (GA promotion migrations + operator pack).

Independence: GP fixture package and GA #291 **can** merge in either order without conflicts. Prefer `#293` first for release-window clarity.

---

## Phase H — Global migration order (GP + GA)

Frozen production ledger order for the same release window:

1. **GP L4** `20260808010000_gp_student_level4_only_eligibility_guard_01.sql` *(already on main; not applied)*
2. **GA Foundation** `20260808210000`
3. **GA Completion** `20260808210100`
4. **GA AUTH04** `20260808210200`

**Rule:** Never propose applying GA before GP L4 if both are intended for the same production release window. No backward ledger execution.

Note: GP #293 itself adds **no** migration; it is TEST_ONLY post-apply tooling that assumes L4 already applied.

---

## Phase I — GP production cutover book (DO NOT EXECUTE)

Authoritative precondition: GP live-readonly compatible under **P1-U** (`GP_OWNER_APPLY_GATE=OPEN`).

| Step | Action | STOP if |
|---|---|---|
| 1 | **READONLY RECHECK** — run L4 preflight SQL | any `GP_L4_PREFLIGHT_*` |
| 2 | **OWNER L4 APPLY APPROVAL** — single-migration only | approval missing |
| 3 | **APPLY L4 ONLY** — `20260808010000_…sql` | apply error / partial |
| 4 | **L4 POST VERIFIER** — post-verifier SQL | missing `GP_L4_PRODUCTION_POST_VERIFIER_PASS` |
| 5 | **STOP** | — record evidence; do not auto-continue |
| 6 | **OWNER GP TEST_ONLY APPROVAL** | approval missing |
| 7 | Fixture execute (`gp.l4_fixture.execute=true`) | collision / dry-run failure |
| 8 | Positive/negative E2E (incl. ≥12 negatives) | any mutation on deny / wrong allow |
| 9 | Observability pack GP-001…GP-012 | any FAIL |
| 10 | Cleanup execute (separate gated session) | allowlist drift |
| 11 | Zero residue + ordinary fingerprint | any TEST_ONLY residue / sentinel drift |

Artifacts: `docs/production-preflight/GP-STUDENT-LEVEL4-*`, `docs/production-test-fixtures/GP-LEVEL4-*`.

---

## Phase J — GA production cutover book (DO NOT EXECUTE)

| Gate | Action |
|---|---|
| 1 | **READONLY RECHECK** — `GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql` |
| 2 | Owner Foundation approval → apply `20260808210000` → foundation post-verifier → **STOP** |
| 3 | Owner Completion approval → apply `20260808210100` → completion post-verifier → **STOP** |
| 4 | Owner AUTH04 approval → apply `20260808210200` → AUTH04 post-verifier → **STOP** |
| 5 | Owner **CONFIG** approval → controlled config script (DRY RUN default) → **STOP** |
| 6 | Owner **staff flag** approval → enable `staffGraduatesAffairs` only → staff smoke → **STOP** |
| 7 | Owner **student flag** approval → enable `studentGraduatesAffairs` → graduate smoke |

Never batch Foundation→Completion→AUTH04. Flags stay OFF until after AUTH04 + config.

---

## Phase K — Failure / recovery (rollback-by-forward only)

### GP

| Failure | Response |
|---|---|
| L4 apply failure | **STOP**. Do not retry blindly. Capture ledger/error. If partial objects present, HOLD for owner; use rollback-by-forward companion only under separate recovery approval. No destructive reset. |
| L4 verifier failure | **STOP**. Treat as failed promotion. Do not start TEST_ONLY fixtures. Investigate predicate/ACL/bucket/policy. Forward-only fix migration if needed. |
| Fixture residue | **STOP** E2E. Run gated cleanup; re-run zero-residue fingerprint. If residue outside allowlist, HOLD — do not broaden deletes. |

### GA

| Failure | Response |
|---|---|
| Foundation failure | **STOP**. Do not apply Completion. Use `GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql` decision support. HOLD until Foundation objects/ledger consistent. |
| Completion failure | **STOP**. Do not apply AUTH04. Scenario A in rollback-by-forward: Foundation may remain; Completion incomplete is HOLD. |
| AUTH04 failure | **STOP**. Scenario B: Completion applied without AUTH04 surface is controlled HOLD; do not enable flags. |
| Config failure | **STOP**. Keep flags OFF. AUTH04 may remain; config is separately governed. |
| Flag smoke failure | Revert flags to OFF via source redeploy (UI-only). Backend RPCs/RLS stay; no destructive schema reset. |

**Forbidden:** destructive reset, DELETE of production data, ledger rewinds, batch re-apply.

---

## Phase L — PR updates

| PR | Branch | New head | Mergeable | CI |
|---|---|---|---|---|
| #293 | `test/gp-level4-production-fixture-package-01` | `301f71c1` | YES | SUCCESS |
| #291 | `fix/graduates-affairs-multimodel-remediation-01` | `b97ec310` | YES | SUCCESS |
| #299 | `prep/ga-production-promotion-longrun-01` | `661ee22b` | YES | workflow_dispatch on exact head |

PR descriptions updated with `CURRENT_MAIN_BASE`, new heads, tests, production-readonly status, **NO APPLY**.

---

## Phase M — Integration evidence

Local proof only (no extra integration PR):

- Forward merge tree after `#293+#291+#299` verified clean.
- Reverse `#291+#293` tree equality proven.
- Report retained on `integration/gp-ga-current-main-cutover-longrun-01`.

---

## Assumptions

- Lovable/production P1-U attestation for GP L4 (SET U present, L4 absent) from prior readonly evidence remains authoritative; this mission performed **0** production reads.
- `@lovable.dev/vite-tanstack-config@2.9.1` on current main is the correct tooling pin.
- GA feature flags remain OFF until explicit later owner gates.

## Risks

- #299 remains stacked on #291 until #291 merges; after #291 merges, retarget #299 to `main` before merging.
- Same release window must not apply GA timestamps before GP L4.
- Operator role for OPC-compliant production attestation is still separately blocked (Councils/B1 evidence doc); does not block these source merges.

## Blockers

- None for source merge readiness.
- Production apply still requires explicit owner gates (documented; not executed).

## Production impact

**None.** No writes, no applies, no flags, no deploy, no merge to main.

## Files touched by this mission

| Area | Change |
|---|---|
| GP #293 branch | merge current main |
| GA #291 branch | merge current main |
| GA #299 branch | restack on new #291 + manifest source-SHA metadata |
| This report | `docs/release/PORTAL-GP-GA-CURRENT-MAIN-MERGE-AND-PRODUCTION-CUTOVER-READINESS-LONGRUN-01.md` |

---

## Decision

`PASS_PORTAL_GP_GA_CURRENT_MAIN_MERGE_AND_CUTOVER_READY`
