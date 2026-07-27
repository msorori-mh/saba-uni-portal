# PORTAL-FIRST-DELIVERY-FIVE-SERVICES-LOCAL-OPERATIONAL-E2E-01

## Decision

**PASS_FIRST_DELIVERY_FIVE_SERVICES_LOCAL_OPERATIONAL_E2E**

```
NO_PRODUCTION_WRITE
TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E
SYNTHETIC_DATA_ONLY
LOCAL_DISPOSABLE_PG17
NO_STUDENT_VISIBLE_CLOUD_MUTATION
```

## Baseline

| Item | Value |
|---|---|
| Worktree | `C:\projects\saba-uni-portal-b1-five-services-local-e2e-01` |
| Branch | `test/b1-five-services-local-operational-e2e-01` |
| PR #261 candidate HEAD | `319d551d68196ad645a1b9013d4c7d4b69337001` |
| Namespace marker | `TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E` |
| PostgreSQL | 17.10 (`postgres:17-alpine`, disposable) |

## Environment proof (A)

| Step | Result |
|---|---|
| SEQ07-B apply + second-apply refuse | PASS (`a49d615b…`) |
| SEQ08→19,21→24 sequential preflight/apply/post | PASS |
| F1/F2 actor-action hardening (local, post-24) | PASS |
| Gate25 local activation (non-migration) | PASS |
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

- Direct RPC negative samples in lifecycle + authz suite: PASS (admin/dean/registrar unassigned denied; wrong dept denied; predecessor/replay denied).
- Full Auth Matrix: **24 / 528 / 528 / 0** (`positive_cells=24`, `negative_cells=528`, `zero_mutation_assertions=528`, `failures=0`).
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
| page errors | 0 |
| console errors | 0 |
| failed asset requests | 0 |
| Decision | `PASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE` |

## Final verifiers (F)

| Verifier | Result |
|---|---|
| Operational E2E harness | `PASS_B1_LOCAL_OPERATIONAL_E2E_5_OF_5` |
| Auth Matrix | 24/528/528/0 |
| Secure Read | 25/25 `B1_SECURE_READ_PG17_PASS` |
| Secure Draft | 35/35 + concurrency `B1_SECURE_DRAFT_PG17_PASS` |
| `bun test tests/student-requests` (+ operational source) | 831 pass / 0 fail |
| `bun test tests` | 1889 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| Real-app HTTP browser smoke | PASS |
| `git diff --check` | PASS (after harness commit content) |

## Git / scope

- PR #261 branch not modified / not force-pushed.
- This track adds local operational harness + report only.
- No cloud migration, Deploy, Publish, or Production write.

## Assumptions

- Local Gate25 activates the five workflows inside disposable PostgreSQL only.
- Local harness may stub `request_types.student_visible` inside the disposable DB for draft create gating (never against Production).
- F1/F2 actor-action hardening draft is applied locally after SEQ24 (not Gate25; required for assignment guards), matching integrated runtime apply-order seq90.

## Risks

- Auth matrix harness still bootstraps via original SEQ07 file path for its own fixture (separate disposable container); operational E2E uses SEQ07-B as required.
- Real-app smoke mocks Supabase auth/profiles over HTTP; RPC lifecycle proof is the disposable PG harness, not the browser mock.

## Blockers

None.

## Production impact

**NONE** — disposable local only; no Production records, documents, or visibility changes.

## Final verdict

```
PASS_FIRST_DELIVERY_FIVE_SERVICES_LOCAL_OPERATIONAL_E2E
5/5 services PASS
all lifecycle steps completed
direct RPC negative matrix PASS (24/528/528/0)
zero mutation PASS
no admin/registrar/dean bypass
real-app UI PASS
enrollment_certificate regression NONE
no Production write
```
