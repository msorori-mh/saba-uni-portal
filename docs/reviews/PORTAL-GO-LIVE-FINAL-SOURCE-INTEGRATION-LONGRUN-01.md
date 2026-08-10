# PORTAL-GO-LIVE-FINAL-SOURCE-INTEGRATION-LONGRUN-01

## Decision

**PASS**

TOKEN: `PASS_PORTAL_GO_LIVE_FINAL_SOURCE_INTEGRATION_LONGRUN_01`

## A — Current truth (post addendum refresh)

| Stream | SHA | Disposition |
|--------|-----|-------------|
| `origin/main` | `38578b6533f20407c02ed775b5af18d11fcb85eb` | BASE — includes PR #323 + PR #321 |
| PR #326 C5 Rev02 | `62c6bb374b15503dfa93c5d8066e4b61837169aa` | INTEGRATED |
| PR #324 latest | `9aa6cf66902230bbe72952bbbf82ce40bf72af74` | INTEGRATED |
| PR #325 | `2eccfe4ed965651462279d525eb7d2bc57baacfa` | INTEGRATED |
| PR #322 | — | **NOT integrated** (superseded by PR #326) |
| PR #323 | already on main | **NOT re-integrated** |
| PR #321 | already on main | **NOT re-integrated** |

## B — Integration order executed

1. Reset `integration/go-live-final-source-closure-01` → `origin/main`
2. Merge PR #326 (`fix/councils-c5-digest-source-revision-13`)
3. Merge PR #324 latest (`fix/go-live-ui-gaps-01` @ `9aa6cf66`)
4. Merge PR #325 (`feat/graduates-affairs-admin-integration-01`)

No file overlaps between PR326 × PR324 × PR325. Clean merges.

## C — Dean report scope

PR324 latest preserves fail-closed dean department selection:

- `DEAN_OUTSIDE_BOUND_COLLEGE=DENY`
- `DEPARTMENT_HEAD_OTHER_DEPARTMENT=DENY`
- `ADMIN_EXPLICIT_DEPARTMENT_SCOPE=PRESERVE_EXISTING_CONTRACT`
- `NO_SILENT_UNIVERSITY_SCOPE=YES`
- `AUTHORIZATION_BROADENED=NO`

## D — Multi-council contract

- future `active_to` = current; expired = previous; inactive = excluded
- Department chair + College member concurrent memberships
- deterministic meeting roles; C9 fail-soft

`MULTI_COUNCIL=PASS`

## E — Admin councils (from main / PR #323)

- `GLOBAL_KPIS_ONLY_GLOBAL_CONTEXT=YES`
- `SELECTED_COUNCIL_GLOBAL_DECISION_MISATTRIBUTION=0`
- `SELECTED_COUNCIL_GLOBAL_AGENDA_MISATTRIBUTION=0`
- `ADMIN_UNIVERSAL_ACADEMIC_BYPASS=0`

`ADMIN_COUNCILS=PASS`

## F — Graduation Projects admin

Arabic fail-closed capability mapping; read-only oversight + KPIs/filters; no admin bypass.

`GP_ADMIN=PASS`

## G — Graduates Affairs

Workspace behind `staffGraduatesAffairs=false`. Assignment AUTH-04; admin `app_role` alone grants nothing.

`GA_UI=PASS`

## H — Nav / Messages / Reports

- `adminFinance=false` → `الوثائق الرسمية`, finance link absent
- Messages back + `/admin` fallback
- Department reports containment-safe

`NAV=PASS` · `MESSAGES=PASS` · `REPORTS=PASS`

## I — User-facing quality sweep

`USER_VISIBLE_ERROR_SWEEP=PASS` for integrated streams (no new stale phase copy; GP/C9 Arabic fail-closed retained).

## J — Qualification results

| Suite | Result |
|-------|--------|
| `bun test tests/admin/` | **244 pass / 0 fail** |
| `bun test tests/academic-councils/` | **97 pass / 0 fail** (PG17 available) |
| `bun test tests/graduation-projects/` | **119 pass / 0 fail** |
| `bun test tests/graduates-affairs/` | **180 pass / 0 fail** |
| `bun test tests/reports-beneficiaries/` | **210 pass / 0 fail** |
| `bun test tests/student-requests` | **1066 pass / 0 fail** |
| `bun test tests/pwa tests/mobile` | **53 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |

## K — Release hygiene

- Migrations vs main: **only** `20260810180000_councils_c5_minutes_lifecycle_02.sql`
- C5 V1 remains frozen `SUPERSEDED_DO_NOT_APPLY`
- Feature flags all OFF (`staffGraduatesAffairs`, `adminFinance`, …)
- No secrets; no conflict markers; no routeTree accidental drift
- No production apply / deploy / publish / main merge

## L — C5 canonical hashes

| Artifact | Status | SHA256_LF |
|----------|--------|-----------|
| C5 V1 `20260808150000_councils_c5_minutes_lifecycle_01.sql` | `SUPERSEDED_DO_NOT_APPLY` | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| C5 V2 `20260810180000_councils_c5_minutes_lifecycle_02.sql` | `CANONICAL_APPLY_CANDIDATE` | `0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8` |

V2: `extensions.digest` qualified; `search_path = public, pg_temp`; fail-closed prerequisite; production C5 remains NOT APPLIED.

`C5V1_SUPERSEDED_PRESERVED=YES` · `PR326_C5V2_INTEGRATED=YES`

## University Council Acceptance delta

Local worktree `review/go-live-university-council-acceptance-01` exists at stale tip `b02241c5` and is **not pushed** to origin.

`ACCEPTANCE_DELTA_PENDING_PROMOTION=YES` · `ACCEPTANCE_DELTA_INTEGRATED=NO`

## Findings counts

```
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
```

## Production posture

```
PRODUCTION_WRITES=0
DEPLOY=NO
PUBLISH=NO
MAIN_MERGE=NO
```

## Final SHAs (integration tip)

Recorded by tip commit after this report lands:

```
CURRENT_MAIN_SHA=38578b6533f20407c02ed775b5af18d11fcb85eb
PR326_C5V2_INTEGRATED=YES
C5V1_SUPERSEDED_PRESERVED=YES
PR324_LATEST_INTEGRATED=YES
PR325_INTEGRATED=YES
ACCEPTANCE_DELTA_INTEGRATED=NO
```
