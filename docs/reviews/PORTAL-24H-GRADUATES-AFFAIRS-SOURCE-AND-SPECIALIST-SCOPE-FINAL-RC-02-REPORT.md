# PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02

**Date:** 2026-08-10 (Asia/Riyadh)
**Branch:** `ops/24h-graduates-source-final-rc-02`
**Mission base (reconcile anchor):** `fab94705443264ae5fe768c5091e25c7c729be1a`
**Current main tip at RC cut (superseded):** `8c944b57534dda435afc7b600f590e85567e5103`
**Reconciled main tip (PR338):** `845f3501c8ccdec7d411811c565e62a8bb93ba25` (GA3 managed apply on main)
**Production project:** `wpmicqriltrowwonknox` (Lovable `90f4dcde-07fb-4441-b86a-6ad5510833b8`)
**Mode:** SOURCE RC + production READ-ONLY. Zero production writes.

---

## Decision

```text
PASS_GA_SOURCE_FINAL_RC_READY_FOR_PRODUCTION_SEQUENCE
```

Merged-source GA package is ready; GA1/GA2/GA3 schema objects are
`VERIFIED_PRESENT` on production via managed aliases. Remaining governed ops are
ledger mapping + optional TEST_ONLY specialist fixture under runtime grant/lease
(`NEXT_WRITE=NONE_SCHEMA`). This token does **not** mean feature flags are ON.

**Supersession (PR338 deterministic specialist resolution):** human department-pick
for `aa4f5c16-…` is closed as `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE`. GA1/GA2/GA3 are
`VERIFIED_PRESENT`; `NEXT_WRITE=NONE_SCHEMA`; optional
`SPECIALIST_TESTONLY_FIXTURE_OWNER_GATED`. See
`docs/reviews/PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01.md`
and `docs/go-live/operator-packets/GA-PRODUCTION-STATUS.txt`.

Prior closure hold token (historical RC-02 wording; specialist limb superseded):
`HOLD_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED_PENDING_C9_AND_SPECIALIST_SCOPE`

---

## Preservation checks

| Invariant | Evidence | Verdict |
|---|---|---|
| GA1 FULL hash | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | PRESERVED |
| GA1 BODY hash | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` | PRESERVED |
| GA2 FULL hash | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | PRESERVED |
| GA2 BODY hash | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` | PRESERVED |
| GA3 FULL hash | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | PRESERVED |
| GA3 BODY hash | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` | PRESERVED |
| Staff workspace | `GraduatesAffairsStaffWorkspace` on main via PR #325; flags gate route | PRESERVED |
| Feature flags | `staffGraduatesAffairs:false` `studentGraduatesAffairs:false` | PRESERVED OFF |

Manifest:
`docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt`

Canonical ordered migrations:

1. `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql`
2. `supabase/migrations/20260808210100_ga_mvp_completion_01.sql`
3. `supabase/migrations/20260808210200_ga_authorization_04.sql`

---

## Reconcile vs current main

- Rebased onto `origin/main` tip `845f3501` (includes Lovable managed GA3 apply
  `20260810162735` / `d239a40c-…`; ancestor includes mission base `fab94705`).
- Staff workspace + GA1–GA3 apply-one packets already on main; RC-02/PR338 adds the
  specialist-scope deterministic plan + operator status refresh.
- No GA migration SQL rewritten. Do not re-apply GA1/GA2/GA3.

---

## Specialist department-scope package

Exact specialist identified:

- `staff_profile_id=aa4f5c16-c993-4af6-a6d4-59d9542c1a7f`
- صالح علي / `saleh@usr.edu.ye` / `S2026008`
- active `graduate_affairs_specialist` assignment `276cf8d1-4bce-4fea-9e96-b1f8dc1bdf0e`

Authoritative bindings (READ-ONLY):

| Source | Result |
|---|---|
| `staff_profile_departments` | 0 |
| `staff_profiles.department_id` | NULL |
| `staff_profiles.department_scope` | `all` (non-authoritative for AUTH-04) |
| GP department coordinators | 0 |
| College-wide unique SPD staff | 0 |

**Verdict:** `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE`

Deterministic plan (no invented department; no all-dept grant):

- Do not scope `aa4f5c16-…`
- `SAFE_SPECIALIST_CANDIDATE=a6e30100-0000-4000-a300-000000000001` (`TEST_ONLY_GA_SPECIALIST_E2E_01`)
- `SAFE_SPECIALIST_DEPARTMENT=11111111-1111-4111-8111-111111111111`
- Package: `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql` (dry-run default)
- Decision doc: `docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md`
- Operator status: `NEXT_WRITE=NONE_SCHEMA` / `GA3_CURRENT=VERIFIED_PRESENT`

No department invented. No production INSERT.

---

## Production READ-ONLY snapshot (PR338 refresh)

```text
MAIN_TIP=845f3501 (Applied GA3 AUTH-04 policy)
GA_MANAGED_ALIASES=20260810124407 (GA1), 20260810124539 (GA2), 20260810162735 (GA3)
GA_LOGICAL_LEDGER_ROWS_2026080821*=0
GA1_CURRENT=VERIFIED_PRESENT
GA2_CURRENT=VERIFIED_PRESENT
GA3_CURRENT=VERIFIED_PRESENT
AUTH04_SPECIALIST_SCOPE_FN=PRESENT
graduate_affairs_search_records=PRESENT
auth04_select_policies=7/7
graduate_records_rls=ON policies=0 (default-deny)
UNIT_OK=YES (graduate_affairs)
ROLES_OK=YES (manager + specialist)
ACTIVE_MANAGERS=1
ACTIVE_SPECIALISTS=1
SPECIALISTS_WITHOUT_DEPARTMENT_SCOPE=1
COLLEGE_SPD_ROWS=0
SAFE_REAL_STAFF_CANDIDATE=NONE
FLAGS_SOURCE=staffGraduatesAffairs:false studentGraduatesAffairs:false
PRODUCTION_WRITES=0 (this agent)
```

Warroom lineage: managed UUID migrations do **not** match canonical LF hashes.
PR338 reconcile: GA1/GA2/GA3 object+policy sets are `VERIFIED_PRESENT` via
managed aliases; `NEXT_WRITE=NONE_SCHEMA`; do not re-apply. Map logical
`20260808210000`/`201`/`202` in ledger reconciliation packet.

Specialist limb closed deterministically:
`AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE` + TEST_ONLY single-dept fixture plan
(see `GA-PRODUCTION-STATUS.txt`).

---

## PG17 / authorization / workspace verification

| Check | Result |
|---|---|
| Hash pins FULL/BODY vs files | match manifest |
| Local GA1→GA2→GA3 exact rehearsal | `LOCAL_EXACT_APPLY_REHEARSAL_PASS` |
| Failure matrix 10/10 | `LOCAL_FAILURE_MATRIX_REHEARSAL_PASS` (10/10) |
| `bun test tests/graduates-affairs` | **188 pass / 0 fail** |
| Staff workspace structural tests | admin-surface integration PASS (5/5) |
| Live browser workspace E2E | BLOCKED (flags OFF + AUTH04 absent in prod + lineage HOLD) |
| `bunx tsc --noEmit` | clean |
| `bun run build` | PASS |
| `git diff --check` | clean |

Authorization matrix coverage retained in source package (manager, specialist,
graduate self, wrong dept, admin, registrar, dean, anonymous, correction/
revocation, privacy, reports) via AUTH-04 TS + PG verifiers already on main.
Disposable PG promotion E2E matrix (auth / concurrency / follow-up race /
high-profile binding / context RPC) PASS inside `bun test tests/graduates-affairs`.

---

## Write gate — NOT OPEN

Do **not** apply or re-apply GA1/GA2/GA3 until all of:

1. Lovable managed↔canonical lineage reconciled (or divergent objects governed).
2. Councils C9 verified where release policy requires it.
3. Owner specialist department decision executed (Option A or B).
4. SELECT preflight returns `READY_FOR_APPLY_FOUNDATION` (or governed re-apply path).
5. Explicit owner production authorization for apply-one sequence.
6. Per-migration: hash pin → apply one → matching post-verifier PASS → STOP.

Apply-one packets (hashes preserved):

- `docs/go-live/operator-packets/GA1-LOVABLE-APPLY-ONE.txt`
- `docs/go-live/operator-packets/GA2-LOVABLE-APPLY-ONE.txt`
- `docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt`

---

## Files in this RC

```text
docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02-REPORT.md
docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01-REPORT.md
docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql
docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql
docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md
tests/graduates-affairs/ga-production-full-closure-readiness-01.test.ts
tests/graduates-affairs/ga-source-final-rc-02.test.ts
```

Staff workspace files are already on `origin/main` (PR #325); not re-landed here.

---

## Assumptions

- Lovable project `90f4dcde-…` remains the production DB for `wpmicqriltrowwonknox`.
- `department_scope='all'` on staff_profiles is informational only and never
  substitutes for `staff_profile_departments` under AUTH-04.
- Source RC readiness is independent of flipping feature flags (remain OFF).

## Risks

- Production already has partial graduate_* relations without AUTH-04 RPCs and
  without logical GA ledger versions → any naive re-apply risks collision.
- Specialist remains provisioned but fail-closed until owner picks department(s)
  or revokes the assignment.

## Production impact

Zero from this agent. No migrations applied. No flags flipped. No deploy.
No staff/department mutation.

## Resume → production closed

1. Lineage HOLD cleared.
2. Specialist owner decision A or B executed.
3. C9 / owner auth per release policy.
4. Preflight `READY_FOR_APPLY_FOUNDATION` (or governed remediation path).
5. Apply GA1 → verifier → STOP → GA2 → STOP → GA3 → STOP.
6. Keep flags OFF until separate enablement.
7. Then emit `PASS_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED`.
