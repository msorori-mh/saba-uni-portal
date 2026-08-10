# PORTAL-GO-LIVE-FINAL-SOURCE-INTEGRATION-LONGRUN-01

## Decision

**PASS**

TOKEN: `PASS_PORTAL_GO_LIVE_FINAL_SOURCE_INTEGRATION_LONGRUN_01`

## A - Current truth (post addendum refresh)

| Stream | SHA | Disposition |
|--------|-----|-------------|
| `origin/main` | `38578b6533f20407c02ed775b5af18d11fcb85eb` | BASE - includes PR #323 + PR #321 |
| PR #326 C5 Rev02 | `62c6bb374b15503dfa93c5d8066e4b61837169aa` | INTEGRATED |
| PR #324 latest | `9aa6cf66902230bbe72952bbbf82ce40bf72af74` | INTEGRATED |
| PR #325 | `2eccfe4ed965651462279d525eb7d2bc57baacfa` | INTEGRATED |
| PR #322 | - | **NOT integrated** (superseded by PR #326) |
| PR #323 | already on main | **NOT re-integrated** |
| PR #321 | already on main | **NOT re-integrated** |

## B - Integration order executed

1. Reset `integration/go-live-final-source-closure-01` to `origin/main`
2. Merge PR #326 (`fix/councils-c5-digest-source-revision-13`)
3. Merge PR #324 latest (`fix/go-live-ui-gaps-01` @ `9aa6cf66`)
4. Merge PR #325 (`feat/graduates-affairs-admin-integration-01`)

No file overlaps between PR326 x PR324 x PR325. Clean merges.

## C - Dean report scope

PR324 latest preserves fail-closed dean department selection:

- `DEAN_OUTSIDE_BOUND_COLLEGE=DENY`
- `DEPARTMENT_HEAD_OTHER_DEPARTMENT=DENY`
- `ADMIN_EXPLICIT_DEPARTMENT_SCOPE=PRESERVE_EXISTING_CONTRACT`
- `NO_SILENT_UNIVERSITY_SCOPE=YES`
- `AUTHORIZATION_BROADENED=NO`

`DEAN_SCOPE=PASS`

## D - Multi-council contract

- future `active_to` = current; expired = previous; inactive = excluded
- Department chair + College member concurrent memberships
- deterministic meeting roles; C9 fail-soft

`MULTI_COUNCIL=PASS`

## E - Admin councils (from main / PR #323)

- `GLOBAL_KPIS_ONLY_GLOBAL_CONTEXT=YES`
- `SELECTED_COUNCIL_GLOBAL_DECISION_MISATTRIBUTION=0`
- `SELECTED_COUNCIL_GLOBAL_AGENDA_MISATTRIBUTION=0`
- `ADMIN_UNIVERSAL_ACADEMIC_BYPASS=0`

`ADMIN_COUNCILS=PASS`

## F - Graduation Projects admin

Arabic fail-closed capability mapping; read-only oversight + KPIs/filters; no admin bypass.

`GP_ADMIN=PASS`

## G - Graduates Affairs

Workspace behind `staffGraduatesAffairs=false`. Assignment AUTH-04; admin `app_role` alone grants nothing.

`GA_UI=PASS`

## H - Nav / Messages / Reports

- `adminFinance=false` => group label `الوثائق الرسمية`, finance link absent
- Messages back + `/admin` fallback
- Department reports containment-safe

`NAV=PASS` / `MESSAGES=PASS` / `REPORTS=PASS`

## I - User-facing quality sweep

`USER_VISIBLE_ERROR_SWEEP=PASS` for integrated streams (no new stale phase copy; GP/C9 Arabic fail-closed retained).

## J - Qualification results

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

## K - Release hygiene

- Migrations vs main: **only** `20260810180000_councils_c5_minutes_lifecycle_02.sql`
- C5 V1 remains frozen `SUPERSEDED_DO_NOT_APPLY`
- Feature flags all OFF (`staffGraduatesAffairs`, `adminFinance`, ...)
- No secrets; no conflict markers; no routeTree accidental drift
- No production apply / deploy / publish / main merge

## L - C5 canonical hashes

| Artifact | Status | SHA256_LF |
|----------|--------|-----------|
| C5 V1 `20260808150000_councils_c5_minutes_lifecycle_01.sql` | `SUPERSEDED_DO_NOT_APPLY` | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| C5 V2 `20260810180000_councils_c5_minutes_lifecycle_02.sql` | `CANONICAL_APPLY_CANDIDATE` | `0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8` |

V2: `extensions.digest` qualified; `search_path = public, pg_temp`; fail-closed prerequisite; production C5 remains NOT APPLIED.

`C5V1_SUPERSEDED_PRESERVED=YES` / `PR326_C5V2_INTEGRATED=YES`

## University Council Acceptance delta

PR #329 head `0375436b` cherry-picked onto this branch.

`ACCEPTANCE_DELTA_PENDING_PROMOTION=NO` / `ACCEPTANCE_DELTA_INTEGRATED=YES`

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

```
CURRENT_MAIN_SHA=a98b76feefa1fd67ed868c6eefe8650dd8c66f45
MAIN_BASE_SHA=38578b6533f20407c02ed775b5af18d11fcb85eb
FINAL_SOURCE_SHA=b912cbb36a34b81a34c905a9a5cd93d7ee85af04
PR326_C5V2_INTEGRATED=YES
C5V1_SUPERSEDED_PRESERVED=YES
PR324_LATEST_INTEGRATED=YES
PR325_INTEGRATED=YES
ACCEPTANCE_DELTA_INTEGRATED=YES
ACCEPTANCE_DELTA_PENDING_PROMOTION=NO
C5_NEW_SHA256_LF=0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8
```

## Draft PR

https://github.com/msorori-mh/saba-uni-portal/pull/328

---

## RC2 — Blocker closure and integration (LONGRUN-01 / RC2)

**TOKEN:** `PASS_PORTAL_GO_LIVE_FINAL_RC2_BLOCKER_CLOSURE_AND_INTEGRATION_LONGRUN_01`

### Integration matrix (RC2)

| Stream | Head | Disposition |
|--------|------|-------------|
| PRE_RC2 tip | `8c3a468c3e1fe64c73699d558bf620ee9b7f9c86` | baseline before RC2 |
| PR #329 acceptance delta | `0375436b267fc03ddc282466c79142d4b71abd03` | **INTEGRATED** (product UX cleanup) |
| PR #330 DB operator pack | `77b5c84db548ee568ad669e8d9ca53f36456326a` | **INTEGRATED** (docs/operator packets only) |
| PR #327 deploy/E2E pack | `ebac711fa08389ec0ce6f811b08675940f1e3ad3` | **INTEGRATED** (docs/tests; demo script resolved to 9-station deploy pack) |
| C8 decision UI contract fix | `b40b35ed` | **FIXED** (source + focused regression) |
| PR #321 / #323 | already on main | **NOT re-integrated** |

### C8 decision contract (blocker closed)

Backend `issue_council_decision` unchanged. UI/server-fn aligned:

| Gate | Result |
|------|--------|
| `C8_UI_AGENDA_ITEM_REQUIRED` | **PASS** |
| `C8_UI_UNRESOLVED_ITEM_NOT_ELIGIBLE` | **PASS** |
| `C8_UI_ISSUE_BEFORE_MINUTES_LOCKED` | **DENY** |
| `C8_UI_MINUTES_LOCKED_RESOLVED_ITEM` | **ALLOW** |
| `C8_BACKEND_CONTRACT_UNCHANGED` | **YES** |

- Issue CTA only when `meetingStatus === "minutes_locked"`
- Agenda query remains enabled at `minutes_locked`
- Dialog requires a **resolved** agenda item; Arabic validation: `اختر بند جدول الأعمال المرتبط بالقرار.`
- `issueCouncilDecisionFn` requires `agenda_item_id` and never sends null

Also repaired PR329 `documents.lazy.tsx` finance filter (`ALL_TYPES` → `Object.keys(TYPE_LABEL)`).

### Release packs

```
DB_OPERATOR_PACK_INTEGRATED=YES
DEPLOY_E2E_PACK_INTEGRATED=YES
```

### Preservation

```
C5V2_PRESERVED=YES
C5_V2_SHA256_LF=0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8
C5_V1_STATUS=SUPERSEDED_DO_NOT_APPLY
GA_UI_PRESERVED=YES
MULTI_COUNCIL_PRESERVED=YES
DEAN_FAIL_CLOSED_PRESERVED=YES
PR323_COUNCIL_SCOPE_TRUTH_PRESERVED=YES
```

### User-facing sweep (post PR329)

```
raw_English_backend_errors=0
stale_phase_copy=0
dead_critical_CTA=0
role_mismatch=0
scope_mismatch=0
```

### RC2 qualification

| Suite | Result |
|-------|--------|
| `bun test tests/admin/` | **244 pass / 0 fail** |
| `bun test tests/academic-councils/` | **103 pass / 0 fail** (includes C8 UI contract) |
| `bun test tests/graduation-projects/` | **119 pass / 0 fail** |
| `bun test tests/graduates-affairs/` | **180 pass / 0 fail** |
| `bun test tests/reports-beneficiaries/` | **210 pass / 0 fail** |
| `bun test tests/student-requests` | **1066 pass / 0 fail** |
| `bun test tests/pwa tests/mobile` | **53 pass / 0 fail** |
| `bun test tests/docs/go-live-operator-packets.test.ts` | **11 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |

### Findings / production posture

```
CRITICAL_COUNT=0
HIGH_COUNT=0
PRODUCTION_WRITES=0
DEPLOY=NO
PUBLISH=NO
MAIN_MERGE=NO
```

### Final RC2 tokens

```
PRE_RC2_SHA=8c3a468c3e1fe64c73699d558bf620ee9b7f9c86
FINAL_RC2_SHA=eefadf8c3c2cd6eb42da5faa4716d485c1db537e
PR329_INTEGRATED=YES
PR330_INTEGRATED=YES
PR327_INTEGRATED=YES
C8_DECISION_CONTRACT_FIXED=YES
C8_AGENDA_ITEM_REQUIRED=YES
C8_MINUTES_LOCK_GATE=YES
C8_RESOLVED_ITEM_GATE=YES
ACCEPTANCE_DELTA_INTEGRATED=YES
```
