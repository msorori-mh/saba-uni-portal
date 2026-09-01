# PORTAL-FIRST-DELIVERY-FIVE-SERVICES-LOCAL-OPERATIONAL-E2E-01

## Decision

**PASS_FIRST_DELIVERY_FIVE_SERVICES_LOCAL_OPERATIONAL_E2E**

Track addendum: **PORTAL-FIRST-DELIVERY-FIVE-SERVICES-OPERATIONAL-E2E-PR-PREP-02**

```
NO_PRODUCTION_WRITE
TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E
SYNTHETIC_DATA_ONLY
LOCAL_DISPOSABLE_PG17
NO_STUDENT_VISIBLE_CLOUD_MUTATION
CANONICAL_BOOTSTRAP=SEQ07B_THEN_SEQ08_TO_24
ORIGINAL_SEQ07_ABSENT=PASS
NO_SILENT_FALLBACK_TO_ORIGINAL_SEQ07=PASS
```

## Baseline

| Item | Value |
|---|---|
| Worktree | `C:\projects\saba-uni-portal-b1-five-services-local-e2e-01` |
| Branch | `test/b1-five-services-local-operational-e2e-01` |
| PR #261 candidate HEAD | `319d551d68196ad645a1b9013d4c7d4b69337001` |
| Namespace marker | `TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E` |
| PostgreSQL | 17.10 (`postgres:17-alpine`, disposable) |
| Shared bootstrap | `tests/b1-delivery-chain/local-seq07b-through-24.ps1` |

## Canonical bootstrap proof (closed risk)

Operational E2E **and** Auth Matrix now share one legal apply path:

1. B0 private bucket simulation
2. **SEQ07-B** (`20260725110050…`) exactly once + second-apply refused
3. **SEQ08→19,21→24** (skip superseded original SEQ07 + duplicate order 20)
4. **F1/F2** local actor-action hardening (**after SEQ24**, **not Gate25**, **not Production**)
5. Gate25 only inside operational E2E (Auth Matrix skips activation)

| Proof | Operational | Auth Matrix |
|---|---|---|
| Original SEQ07 absent from apply log | PASS | PASS |
| SEQ07-B applied exactly once | PASS | PASS |
| SEQ07-B second apply refused | PASS | PASS |
| No silent fallback to original SEQ07 | PASS | PASS |
| Same delivery chain | PASS | PASS (`AUTH_MATRIX_SAME_DELIVERY_CHAIN`) |
| Hard ban `FORBIDDEN_ORIGINAL_SEQ07_APPLY_PATH` | PASS | PASS |

Ledger/proof SQL: `tests/b1-delivery-chain/pg/40-seq07b-canonical-proof.sql`

Auth matrix department_head positives use SEQ23 `position_assignment` scope (faculty path no longer authorized after SEQ23).

## F1/F2 order (explicit)

| Fact | Value |
|---|---|
| When | After SEQ24 |
| Where | Local operational E2E / Auth Matrix harness only |
| Gate25? | **No** (`GATE25_IS_NOT_F1F2=PASS`) |
| Production apply? | **Forbidden** (`F1F2_PRODUCTION_APPLY=FORBIDDEN`) |
| Purpose | Assignment/actor-action guards for local RPC proof |

## Environment proof (A)

| Step | Result |
|---|---|
| SEQ07-B apply + second-apply refuse | PASS (`a49d615b…`) |
| SEQ08→19,21→24 sequential preflight/apply/post | PASS |
| F1/F2 actor-action hardening (local, post-24) | PASS |
| Gate25 local activation (non-migration; ops only) | PASS |
| Synthetic data only | PASS |
| Production/Staging write | NONE |

Harness: `tests/b1-operational-e2e/run-harness.ps1`

## Per-service operational matrix (B–D)

Integrated lifecycle counters (disposable):

`services_completed=5 action_allows=24 action_denials=9 attachment_assertions=4 concurrency=1 draft_creates=5 draft_saves=6 idempotency=3 read_allows=18 read_denials=4 zero_mutation=18 fail_rows=0`

| service | request lifecycle | roles/assignments | positive RPC actions | negative RPC actions | zero mutation | final state | UI smoke | enrollment_certificate regression | result |
|---|---|---|---|---|---|---|---|---|---|
| enrollment_suspension | draft→save→submit→staff walk→terminal | sa_specialist→sa_manager→registrar (direct assignment only) | 24 (shared walk total) | 9 action + 4 read denials (shared) | 18 (shared) | completed, active=0 | PASS (real-app HTTP) | NONE | **PASS** |
| excused_absence | draft→save→attachment→submit→staff walk→terminal | sa_specialist→sa_manager→sa_specialist apply | same suite | same suite | same suite | completed | PASS | NONE | **PASS** |
| department_transfer | draft→save→attachment→submit→scoped chairs→payment→dean→registrar | sa→source_chair→target_chair→finance→dean→registrar | same suite | dept isolation denials included | same suite | completed | PASS | NONE | **PASS** |
| final_chance | draft→save→submit→payment→staff walk→terminal | sa→manager→finance→dean→registrar | same suite | no money fields deny | same suite | completed | PASS | NONE | **PASS** |
| file_withdrawal | draft→save→ack guards→submit→clearances→archive | sa→library→labs→activities→finance→registrar→archive | same suite | null/false/missing ack zero-mutation | same suite | completed | PASS | NONE | **PASS** |

### Authorization / bypass

- Direct RPC negative samples in lifecycle + authz suite: PASS.
- Full Auth Matrix on **SEQ07-B→24** chain: **24 / 528 / 528 / 0**.
- No admin / registrar / dean global bypass observed.

### enrollment_certificate protection

After each service (`ec_after/<service>/*`) and final EC suite:

- No EC workflow activation in local Gate25 set
- Draft RPCs do not write `student_visible`
- No anon EXECUTE on enrollment_certificate routines
- Protected live request numbers absent from disposable DB
- Historical EC cases PASS (`60-enrollment-certificate-regression.sql`)
- Regression: **NONE**

## Real-app UI smoke (C)

`bun tests/student-requests/b1-real-app-browser-smoke/run.ts`

| Check | Result |
|---|---|
| Protocol | HTTP `127.0.0.1` (Vite/Nitro build; not `file://`) |
| Student list/form for 5 services | PASS |
| Draft edit + validation + submit + detail (`file_withdrawal`) | PASS |
| Staff assigned queue + actions | PASS |
| Unassigned staff: no action panel | PASS |
| Viewports 360 / 768 / 1366 + RTL + no overflow | PASS |
| page errors / console errors / failed assets | 0 / 0 / 0 |
| Decision | `PASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE` |

## Final verifiers (F) — PREP-02 re-run

| Verifier | Result |
|---|---|
| Operational E2E harness | `PASS_B1_LOCAL_OPERATIONAL_E2E_5_OF_5` |
| Auth Matrix (SEQ07-B chain) | **24/528/528/0** `PASS_B1_AUTH_MATRIX_24_528_528_0` |
| Secure Read | 25/25 `B1_SECURE_READ_PG17_PASS` |
| Secure Draft | 35/35 + concurrency `B1_SECURE_DRAFT_PG17_PASS` |
| `bun test` student-requests + ops + delivery-chain | 835 pass / 0 fail |
| `bun test tests` | 1893 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| Real-app HTTP browser smoke | PASS |
| `git diff --check` | PASS |

## Git / scope

- PR #261 merged: `72813caca57ea1fccddf2d6497cb7c72198265ec` (not force-pushed; branch untouched by this track).
- `origin/main` merged into `test/b1-five-services-local-operational-e2e-01` without force-push.
- This track: shared SEQ07-B bootstrap + auth matrix alignment + report + independent Draft PR to `main`.
- Draft PR: https://github.com/msorori-mh/saba-uni-portal/pull/263 — do **not** mark Ready / do **not** merge (K3/Codex review).
- No cloud migration, Deploy, Publish, or Production write.

## Assumptions

- Local Gate25 activates the five workflows inside disposable PostgreSQL only (ops harness).
- Local harness may stub `request_types.student_visible` inside the disposable DB for draft create gating (never against Production).
- Original SEQ07 remains pin-only in PROMOTION-MAP for SHA drift detection; never applied.

## Risks

- Real-app smoke mocks Supabase auth/profiles over HTTP; RPC lifecycle + auth matrix proof is disposable PG.
- ~~Auth matrix original SEQ07 bootstrap~~ → **CLOSED** (SEQ07-B canonical shared chain).

## Blockers

None for local PASS. Draft PR blocked only on PR #261 merge.

## Production impact

**NONE** — disposable local only; no Production records, documents, or visibility changes.

## Final verdict

```
PASS_FIRST_DELIVERY_FIVE_SERVICES_LOCAL_OPERATIONAL_E2E
5/5 services PASS
direct RPC negative matrix PASS (24/528/528/0) on SEQ07-B→24
zero mutation PASS
SEQ07-B canonical bootstrap PASS
no admin/registrar/dean bypass
real-app UI PASS
enrollment_certificate regression NONE
no Production write
PASS_B1_OPERATIONAL_E2E_DRAFT_PR_OPEN
Draft PR: https://github.com/msorori-mh/saba-uni-portal/pull/263
```

