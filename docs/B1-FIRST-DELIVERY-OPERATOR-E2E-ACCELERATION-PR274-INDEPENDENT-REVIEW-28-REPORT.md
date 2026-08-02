# B1 First Delivery Operator E2E Acceleration — PR #274 Independent Review 28

> **Mission**: PORTAL-B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-PR274-INDEPENDENT-REVIEW-28  
> **Repository**: `msorori-mh/saba-uni-portal`  
> **PR**: [#274](https://github.com/msorori-mh/saba-uni-portal/pull/274)  
> **Exact reviewed SHA**: `f8d7c9a0d22f1a4e240d5d2e41c70d937b4776d2`  
> **Base main**: `87449f85b95d927436e7607ae3c2b6a73245eb0d`  
> **Review branch**: `review/b1-pr274-independent-review-28`  
> **Mode**: INDEPENDENT LOCAL-ONLY SECURITY AND OPERATIONAL PACKAGE REVIEW  
> **Final decision**: `HOLD_B1_FIRST_DELIVERY_OPERATOR_E2E_ACCELERATION_PR274_PACKAGE_CONTRACT_DRIFT_VS_HARNESS`

---

## 1. Executive verdict

PR #274 is a **preparation package** (9 docs + 1 local unit-test file). It adds no runtime, migration, deploy, or visibility mutation code, and this review performed **no** production connection, Operator Preflight, RPC matrix, cleanup apply, deploy, or merge.

It **cannot** receive `PASS_..._PRELIMINARY_REVIEW_READY_FOR_BASELINE_FIX_DELTA` because Pack 27’s written execution contracts **drift from the authoritative harness on main/base**: three-gate authorization mechanism, negative-matrix decomposition, preflight `execution_authorized` polarity, migration-head pin, positive-step binding identity, and cleanup inventory vs the referenced Stage-3 SQL.

Known base condition (`execution_authorized = true` while PINNED) remains an independent execution blocker. A separate Kimi mission is correcting that on another branch. Even after that fix, Pack 27 docs must be reconciled and a delta review must pass before any operator execution or merge authorization.

**This review does not authorize Operator Preflight, RPC execution, cleanup, launch, or merge of PR #274.**

---

## 2. Inventory — all 10 changed files

Diff `87449f85…f8d7c9a0` = **10 files / +981 / −0**. No other paths.

| # | Path | Kind |
|---|---|---|
| 1 | `docs/B1-FIRST-DELIVERY-OPERATOR-PREFLIGHT-PACK-27.md` | documentation |
| 2 | `docs/B1-FIRST-DELIVERY-NEGATIVE-MATRIX-EXECUTION-PLAN-27.md` | documentation |
| 3 | `docs/B1-FIRST-DELIVERY-POSITIVE-AUTHORIZATION-MATRIX-27.md` | documentation |
| 4 | `docs/B1-FIRST-DELIVERY-FIVE-SERVICES-E2E-PLAN-27.md` | documentation |
| 5 | `docs/B1-FIRST-DELIVERY-POST-EXECUTION-VERIFIER-27.md` | documentation |
| 6 | `docs/B1-FIRST-DELIVERY-ENROLLMENT-CERTIFICATE-REGRESSION-27.md` | documentation |
| 7 | `docs/B1-FIRST-DELIVERY-CLEANUP-VERIFICATION-27.md` | documentation |
| 8 | `docs/B1-FIRST-DELIVERY-LAUNCH-READINESS-27.md` | documentation |
| 9 | `docs/B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-27-REPORT.md` | documentation |
| 10 | `tests/student-requests/b1-first-delivery-operator-e2e-acceleration-27.test.ts` | local unit tests (string/presence asserts only) |

**Package composition check**: documentation + local tests only. **PASS** for surface inventory.

---

## 3. Checklist results

### 3.1 Documentation and local tests only

**PASS.** No `src/`, no `supabase/migrations/`, no new operator scripts, no visibility SQL apply package in the PR delta.

### 3.2 No PR script performs production access or RPC execution

**PASS for PR delta.** The new test only reads local markdown via `fs`. Referenced harness paths (`scripts/b1-rpc-principal-harness-01/*`) are pre-existing and were **not executed** by this review.

### 3.3 Operator Preflight is read-only

**PASS for referenced harness behavior; FAIL for Pack wording consistency.**

- `scripts/b1-rpc-principal-harness-01/00-preflight.sql` ends in `ROLLBACK` and is structured as a fail-closed observer.
- Pack 27 correctly requires read-only / zero execution RPCs during preflight.
- Pack 27 **incorrectly** states Gate 3 as `execution_authorized = false` and that preflight verifies false. The live preflight pin gate requires `baseline_execution_authorized = true` (`00-preflight.sql` §6). That polarity mismatch is material.

### 3.4 Three independent gates

Required model:

1. fresh PINNED baseline  
2. successful Operator Preflight  
3. separate explicit execution authorization  

**Conceptual intent in Pack 27: partial PASS. Implementation accuracy: FAIL.**

Evidence:

| Gate | Pack 27 claim | Authoritative harness |
|---|---|---|
| PINNED baseline | required | `run-negative-matrix.ps1` denies unless status is `PINNED` |
| Operator Preflight | required before matrix | Preflight is `\ir`’d inside the master SQL; launcher also refuses if `operator_preflight_executed` is already true on the baseline artifact |
| Separate execution authorization | Explicit CLI `--authorize-execution` | **No such flag.** Launcher is `param()` with zero parameters. Separate auth is the baseline/manifest field `execution_authorized` |

Inventing a CLI authorization switch that does not exist means the proposed operator model is not executable as written.

### 3.5 PINNED must not auto-authorize execution

**FLAGGED (known + package conflict).**

- Pack prose correctly tries to separate PINNED from authorization.
- Base artifacts currently have `status=PINNED` **and** `execution_authorized=true` in both `AUTHORITATIVE-BASELINE.json` and `TARGET-MANIFEST.json` (premature authorization — known Kimi remediation track).
- Pack Preflight Pack claiming “verify `execution_authorized = false`” while the harness requires `true` would, if followed literally, produce contradictory operator instructions.

**PINNED must never be treated as execution approval.** Current base state violates that safety property until the baseline-authorization fix lands.

### 3.6 Coverage of all 267 negative cases

**Source matrix: PASS. Pack plan text: FAIL.**

- `MATRIX.json` / `TARGET-MANIFEST.json`: `negative_total = 267`, decomposition `240 + 24 + 3`, `executable_negative_total = 267`, `blocked = 0` (RECONCILIATION-17).
- Pack Negative Plan header and Master Report still say **`247 executable / 20 rebound-blocked`**.
- That stale decomposition is false against the current executable contract and misleads operators about rebound/blocked handling.

### 3.7 Coverage of all 19 positive active steps

**Count: PASS. Binding fidelity: FAIL.**

- Baseline fixture_state: `requests=19`, `steps=104`, `active_steps=19` (distribution 6/5/4/2/2).
- Pack positive tables list 19 step rows (same totals).
- Identifiers/roles are **synthetic** (`SR-20260716-TRANSFER-01`, `head_dept_src`, …) and do **not** match `MATRIX.json` positive fixtures (e.g. `SR-20260727-88D885F0`, `student_affairs_specialist`, 43 positive_cases catalog).
- Section headers also miscount fixture requests vs listed steps (e.g. suspension “3 fixture requests” with 2 rows).

### 3.8 Complete E2E plans for five services

**PASS as planning coverage.**

`docs/B1-FIRST-DELIVERY-FIVE-SERVICES-E2E-PLAN-27.md` contains journey specs for:

1. `enrollment_suspension`  
2. `excused_absence`  
3. `department_transfer`  
4. `final_chance`  
5. `file_withdrawal`  

Including student submit → staff steps → atomic RPC → audit/notification → fee/academic effects → completion → idempotency. Not executed in this review.

### 3.9 enrollment_certificate regression coverage

**PASS as package presence.**

Regression doc pins protected records (`SR-20260716-26BAD4C8`, `SR-20260715-FEDCB3E1`, `SR-20260713-2DE64041`, `USR-2026-000001`, `USR-2026-000002`), visibility, issuance/archive contracts, and zero B1 touch. Minor internal inconsistency: Standard #2 also names `SR-20260710-1A2B3C4D` while the digest inventory lists three SR ids.

### 3.10 Post-execution drift detection

**PASS as package presence.**

Post-execution verifier defines 12 read-only inspection domains and immediate `HOLD_POST_EXECUTION_*` halt rules. Not executed.

### 3.11 Cleanup protects non-fixture records

**Intent: PASS. Inventory accuracy vs referenced SQL: FAIL.**

Cleanup verification correctly requires fixture-only deletes, protected enrollment_certificate exclusions, and pre/post stop tokens.

But it claims the referenced `docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql` deletes **exactly 19 requests / 104 steps**. That SQL’s own prechecks/deletes target a **different Stage-3 inventory** (e.g. 37 candidate requests, different step/event counts) while protecting hold/production numbers. Pack 27’s cleanup inventory statement is therefore not faithful to the cited artifact.

### 3.12 Launch-readiness does not enable `student_visible` automatically

**PASS.**

Launch readiness is SOURCE-ONLY checklist; activation is Gate 25 / controlled toggle; track forbids changing `student_visible`. No PR file mutates visibility.

### 3.13 Stop conditions after mismatch

**PASS as documentation.**

Immediate stops are specified for preflight gate failure, negative-case success/mutation/unexpected SQLSTATE, post-execution anomaly, and cleanup pre/post verifier failure.

### 3.14 No broad admin / registrar / dean bypass assumed

**PASS.**

Negative plan includes admin-bypass denial class; positive plan requires exact actor + exact action; E2E/launch docs require direct assignment and atomic RPC (no client bypass). Aligns with AGENTS.md and existing principal matrix tests (`admin` / `registrar` / `dean` covered in preflight-01 suite).

---

## 4. Blocking findings (HOLD drivers)

1. **Three-gate misspecification** — Pack invents `--authorize-execution`; launcher has no CLI auth gate.  
2. **Preflight authorization polarity drift** — Pack requires `execution_authorized=false`; `00-preflight.sql` requires `true`.  
3. **Negative matrix decomposition stale** — Pack still publishes 247/20 rebound-blocked vs authoritative 267/0 executable.  
4. **Migration-head pin stale** — Pack Preflight lists `20260725110050`; harness/baseline require `20260801021541`.  
5. **Positive matrix not fixture-bound** — synthetic request/step/role identities diverge from `MATRIX.json` / fixture package.  
6. **Cleanup inventory mismatch** — Pack’s 19/104 claim does not match cited Stage-3 dry-run SQL.  
7. **Known base premature authorization** — `execution_authorized=true` on PINNED baseline blocks any production-adjacent execution approval until fixed + delta-reviewed.  
8. **`git diff --check` fails** on trailing whitespace in multiple Pack 27 docs (local hygiene defect on the reviewed SHA).

Non-blocking notes:

- Pack-27 unit tests are shallow presence checks; they cannot detect the contract drift above.  
- Full `bun test` had 1 unrelated timeout (`template workbook structure (HIGH-3)`); not introduced by PR #274. CI Web CI on the exact SHA is green.

---

## 5. Local verification (this review)

| Command | Result |
|---|---|
| `bun test tests/student-requests/b1-first-delivery-operator-e2e-acceleration-27.test.ts` | **10 pass / 0 fail** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bun test tests/student-requests` | **1070 pass / 0 fail** |
| `bun test` | **2393 pass / 1 fail** (unrelated template workbook timeout >5s) |
| `bunx tsc --noEmit` | **exit 0** |
| `bun run build` | **exit 0** (pre-existing duplicate-key esbuild warnings in `secure-attachments-capability.ts`) |
| `git diff --check 87449f85…f8d7c9a0` | **FAIL** — trailing whitespace in Pack 27 docs |

No production SQL, no Operator Preflight run, no negative/positive matrix RPC execution, no cleanup apply, no deploy/publish, no `student_visible` change, no modification of PR #274 source, no merge.

---

## 6. GitHub CI for exact reviewed SHA

- Commit: `f8d7c9a0d22f1a4e240d5d2e41c70d937b4776d2`  
- Run: https://github.com/msorori-mh/saba-uni-portal/actions/runs/30726030122  
- Workflow: **Web CI** — **success**  
- Jobs observed SUCCESS for exact `head_sha` above: Install·Lint·Typecheck·Build; Bun tests; all listed PG 17 verifiers.

---

## 7. Assumptions

- Review is source/package review only; live DB state was not re-attested.  
- Authoritative negative/positive contracts are `MATRIX.json` + `TARGET-MANIFEST.json` + `scripts/b1-rpc-principal-harness-01/*` as present at the reviewed SHA/base.  
- Known premature `execution_authorized=true` is being corrected on `fix/b1-baseline-execution-authorization-fail-closed-26` (or successor); this review does not validate that fix.  
- Preliminary PASS was intentionally withheld because package/harness contract drift is independent of the baseline-auth fix.

---

## 8. Risks

- An operator following Pack 27 literally could believe a nonexistent CLI flag authorizes execution, or that preflight must see `execution_authorized=false` while the launcher/preflight SQL require `true`.  
- Stale 247/20 wording could resurrect abolished blocked-case handling.  
- Synthetic positive IDs could drive the wrong fixture bindings.  
- Cleanup guidance tied to the wrong row inventory could endanger non-fixture data if ever applied without re-audit.  
- Premature `execution_authorized=true` on the PINNED baseline remains an execution-safety defect on base until the separate fix merges.

---

## 9. Production impact of this review

**Zero.** Review report only. No production access. No RPC. No migration/cleanup apply. No deploy. No visibility change. PR #274 not modified and not merged.

---

## 10. Required remediation before any PASS / execution / merge

1. Integrate the baseline authorization fail-closed fix (`execution_authorized` must not be prematurely true).  
2. Rewrite Pack 27 three-gate language to match the real gates (PINNED + Operator Preflight + separate `execution_authorized` grant / approved readiness path — **not** `--authorize-execution`).  
3. Align negative plan/master report to **267 executable / 0 blocked** (RECONCILIATION-17).  
4. Align preflight migration-head and `execution_authorized` polarity with `00-preflight.sql` / launcher.  
5. Rebind positive matrix rows to real fixture request/step/role identities from the fixture package / `MATRIX.json`.  
6. Reconcile cleanup inventory with the actual cleanup SQL intended for the 19/104 fixture set (or stop citing Stage-3 SQL 125 if it is a different package).  
7. Clear `git diff --check` whitespace defects.  
8. Re-run independent **delta** review after the above; only then consider preliminary/final readiness language.

---

## 11. Agent report fields

- **Files modified by this review**: `docs/B1-FIRST-DELIVERY-OPERATOR-E2E-ACCELERATION-PR274-INDEPENDENT-REVIEW-28-REPORT.md` only  
- **Tests and results**: see §5  
- **Assumptions**: see §7  
- **Risks**: see §8  
- **Blockers**: package/harness contract drift (§4); known premature baseline authorization  
- **Production impact**: none  
- **Decision**: **HOLD**

---

## 12. Final authoritative decision

```
HOLD_B1_FIRST_DELIVERY_OPERATOR_E2E_ACCELERATION_PR274_PACKAGE_CONTRACT_DRIFT_VS_HARNESS
```

Not approved for production execution.  
Not approved for Operator Preflight or RPC matrix launch.  
Not approved for merge until baseline-authorization fix + Pack 27 contract reconciliation + delta review PASS.
