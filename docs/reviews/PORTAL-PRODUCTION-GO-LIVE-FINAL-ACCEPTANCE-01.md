# PORTAL-PRODUCTION-GA-AUTH04-VERIFY-THEN-DEPLOY-E2E-TO-GOLIVE-01

Mode: FINAL PRODUCTION DELIVERY · Single writer: LOVABLE ONLY
Date: 2026-08-10 (UTC)

Closure tokens consumed:
- PASS_PORTAL_PR339_SINGLE_WRITER_PRODUCTION_GOVERNANCE_CLOSED
- PASS_PORTAL_PR338_GA_FINAL_RC_AND_SPECIALIST_PLAN_CLOSED

---

## A — CURRENT TRUTH (read-only, refreshed)

| Key | Value |
|---|---|
| CURRENT_MAIN_SHA | `9a5f81c94d37a455c085fb134ee0009e1ff0542d` (Merge PR #339) |
| Working tree | clean (`git status --porcelain` empty) |
| CURRENT_PRODUCTION_DB_TIP | `20260810180000` |
| Ledger rows | 226 |
| NEXT_SCHEMA_WRITE | **NONE** — no migration applied in this mission |

State confirmed by catalog inspection (no replay performed):

- Councils C0–C9: **CLOSED** — 19 `academic_council*` tables, 92 council functions.
- GA1 / GA2 / GA3: **VERIFIED_PRESENT** — 17 `graduate*` tables, 17/17 RLS enabled, 7 GA policies, GA3 managed alias `20260810162741`.
- C5 V1: SUPERSEDED_DO_NOT_APPLY (untouched).
- B1: 5/5 services `is_active = true`, `student_visible = true`.

## B — GA SPECIALIST POLICY

| Item | Result |
|---|---|
| Real specialist `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` (صالح علي) | 0 rows in `staff_profile_departments` → **AMBIGUOUS_SPECIALIST_FAIL_CLOSED = PASS**. No department assigned, no broadening, no write. |
| TEST_ONLY_DEPARTMENT `11111111-1111-4111-8111-111111111111` | EXISTS — قسم علوم الحاسوب |
| TEST_ONLY_SPECIALIST `a6e30100-0000-4000-a300-000000000001` | **ABSENT** — no `staff_profiles` row, no `auth.users` principal |

**Writes performed in Phase B: 0.**

Technical blocker for the TEST_ONLY in-scope ALLOW proof:
`staff_profiles.user_id` is `FOREIGN KEY … REFERENCES auth.users(id)`, and
`graduate_affairs_resolve_authorized_staff_profile_id` resolves authority only via
`staff_profiles.user_id = p_user_id`. A DB-only fixture with
`user_id = a6e30100-…-000000000001` cannot be inserted (no such auth principal), and a
fixture with `user_id IS NULL` can never resolve — it is structurally always DENY.
Creating an `auth.users` row with a caller-chosen UUID is not available through the managed
Admin API (identifiers are server-generated) and the `auth` schema is a never-touch schema.
Therefore `GA_TEST_SPECIALIST_IN_SCOPE` cannot be proven at runtime under that exact UUID
without an out-of-band principal provisioning decision. Fail-closed preserved.

## C — AUTH-04 PRODUCTION VERIFICATION

Authority model (verified from live `pg_proc` bodies):
`graduate_affairs_can_access_record` → self OR manager OR (specialist AND record.department ∈ specialist departments) OR (active follow-up assignee AND GA staff).

| # | Case | Result |
|---|---|---|
| 1 | `admin` app_role alone | **DENY** — no GA authority path reads `user_roles`; authority requires an active `request_processing_assignments` row in unit `graduate_affairs`. |
| 2 | GA manager `f463a79b-…` assigned | **ALLOW** — active `graduate_affairs_manager` assignment present. |
| 3 | Ambiguous real specialist `aa4f5c16-…` | **DENY** for department-scoped ops — 0 department bindings ⇒ `department_ids` empty ⇒ predicate false. |
| 4 | TEST_ONLY specialist inside CS | **HOLD** — principal absent (see B). |
| 5 | TEST_ONLY specialist outside CS | **DENY** (structurally; principal absent). |
| 6 | Direct follow-up assignee | **exact case only** — predicate binds `f.graduate_record_id = p_graduate_record_id AND f.assignee_user_id = auth.uid() AND state IN ('open','in_progress')`. |
| 7 | PUBLIC / anon | **DENY** — 0 table grants to `anon`/`PUBLIC` on all 17 GA tables. |
| 8 | Protected PII | **inaccessible** — default-deny RLS + no anon grants; internal helpers REVOKEd (a privileged read of `graduate_affairs_user_specialist_department_ids` returned `42501 permission denied`, confirming the REVOKE). |
| 9 | GA tables RLS | **17/17 enabled** |
| 10 | Unintended direct table DML | **DENY** — 0 INSERT/UPDATE/DELETE grants to `authenticated` on GA tables; mutation only through granted RPC entry points. |

Scores: `GA_AUTH04=PASS_EXCEPT_TEST_ONLY_SPECIALIST_PRINCIPAL_ABSENT`, `GA_MANAGER=PASS`,
`GA_AMBIGUOUS_SPECIALIST_FAIL_CLOSED=PASS`, `GA_TEST_SPECIALIST_IN_SCOPE=HOLD`,
`GA_TEST_SPECIALIST_OUT_SCOPE=DENY`, `GA_PII=PASS`.

## D — FINAL DATABASE READBACK

| Domain | Result |
|---|---|
| Councils C0–C9 | PASS (present, not replayed) |
| GA1 / GA2 / GA3 | PASS / PASS / PASS |
| B1 | 5/5 visible + active, no migration replay |
| Enrollment Certificate | baseline intact — 2 official documents, `USR-2026-000001` and `USR-2026-000002` both present and unmodified |
| Unexpected data mutations | **0** (no writes issued in this mission) |

`DB_FULL_READY=YES`

## E — FINAL DEPLOY SOURCE

`FINAL_DEPLOY_SOURCE_SHA=9a5f81c94d37a455c085fb134ee0009e1ff0542d`

| Gate | Result |
|---|---|
| tsc (`bunx tsgo --noEmit`) | PASS (exit 0) |
| production build (`bun run build`) | PASS (exit 0, built in 22.36s) |
| routeTree | PASS — "TanStack generated Register footer: present" |
| git status | clean |

## F — PUBLISH

| Key | Value |
|---|---|
| Target | https://quboolye.com |
| FINAL_DEPLOY_SOURCE_SHA | `9a5f81c94d37a455c085fb134ee0009e1ff0542d` |
| PUBLISHED_AT | 2026-08-10 ~17:35 UTC |
| DEPLOYMENT_ID | not exposed by the managed publish channel; identity proven by served SHA (Phase G) |

## G — DEPLOYED SHA PROOF

`https://quboolye.com/version.json` → `{"sha":"9a5f81c94d37a455c085fb134ee0009e1ff0542d"}`
(previous served SHA `b02241c5…` observed before propagation, then rolled to the new build)

**DEPLOYED_SHA == FINAL_DEPLOY_SOURCE_SHA ✅**

## H — PUBLIC SHELL SMOKE (deployed production, headless Chromium)

| Route | HTTP | Outcome |
|---|---|---|
| `/` | 200 | renders (5.6k chars), 0 console errors |
| `/admin` | 200 | redirects → `/admin/login` (fail-closed) |
| `/admin/login` | 200 | renders login form |
| `/student` | 200 | redirects → `/portal-login` (fail-closed) |
| `/faculty` | 200 | renders public faculty page |
| `/staff` | 200 | redirects → `/portal-login` (fail-closed) |
| `/verify-document` | 200 | renders verification page |

No blank pages, no routeTree error, no missing JS/CSS, 0 fatal console errors.
Three aborted anon prefetches were observed on `/` during navigation teardown; the same
endpoints (`programs`, `research_papers`, `news`) return HTTP 200 to the anon key when
called directly, so this is a navigation abort, not a data-access failure.

`PUBLIC_SHELL_SMOKE=PASS`

## I–P — AUTHENTICATED PRODUCTION E2E

**NOT EXECUTED IN THIS RUN. NOT CLAIMED.**

Phases I (B1 5/5 lifecycle), J (Enrollment Certificate regression), K (Councils E2E),
L (Graduation Projects), M (Graduates Affairs runtime), N (Reports hubs),
O (Messages + Documents) and P (PWA / privacy) each require authenticated multi-actor
production journeys with per-step actor/deny proofs. They are deliberately reported as
`NOT_RUN` rather than `PASS` to keep `UNPROVEN_PRODUCTION_CLAIMS = 0`.

Prior recorded evidence (earlier missions, not re-proven today):
- B1 five-service production E2E closed under `CLOSED_B1_FIVE_SERVICES_FULL_UI_OPERATIONAL_RELEASE`.
- Graduation Projects MVP closed under `CLOSED_GRADUATION_PROJECTS_MVP_PRODUCTION`.

## Q — SECURITY / EVIDENCE

| Metric | Value |
|---|---|
| CRITICAL_COUNT | 0 |
| HIGH_COUNT | 0 |
| Open warnings | 3 (database export bucket retention; faculty public SELECT gap; graduation_project_files SELECT policy verification) — all fail-closed, none blocking |
| RAW_ERROR_COUNT (public shell) | 0 |
| UNEXPECTED_PRODUCTION_MUTATIONS | 0 |
| UNPROVEN_PRODUCTION_CLAIMS | 0 |

## R — FINAL ACCEPTANCE

```
FINAL_MAIN_SHA=9a5f81c94d37a455c085fb134ee0009e1ff0542d
FINAL_DEPLOY_SOURCE_SHA=9a5f81c94d37a455c085fb134ee0009e1ff0542d
DEPLOYED_SHA=9a5f81c94d37a455c085fb134ee0009e1ff0542d
DEPLOYMENT_ID=<not exposed by managed publish channel>
COUNCILS_C0_C9=PASS
GA1=PASS
GA2=PASS
GA3=PASS
GA_AUTH04=PASS_EXCEPT_TEST_ONLY_SPECIALIST_PRINCIPAL_ABSENT
AMBIGUOUS_SPECIALIST_FAIL_CLOSED=PASS
TEST_ONLY_SPECIALIST=HOLD_PRINCIPAL_ABSENT
B1_E2E=NOT_RUN
ENROLLMENT_CERTIFICATE=BASELINE_INTACT (regression suite NOT_RUN)
COUNCILS_E2E=NOT_RUN
GP=NOT_RUN
GA_E2E=NOT_RUN
REPORTS=NOT_RUN
MESSAGES=NOT_RUN
DOCUMENTS=NOT_RUN
PWA_PRIVACY=NOT_RUN
PUBLIC_SHELL_SMOKE=PASS
DB_FULL_READY=YES
UNEXPECTED_PRODUCTION_MUTATIONS=0
UNPROVEN_PRODUCTION_CLAIMS=0
CRITICAL_COUNT=0
HIGH_COUNT=0
GO_LIVE=DEPLOYED_PENDING_AUTHENTICATED_E2E
```

FINAL TOKEN:
`HOLD_PORTAL_PRODUCTION_GO_LIVE_FINAL_ACCEPTANCE_01_AUTHENTICATED_E2E_NOT_EXECUTED_AND_TEST_ONLY_SPECIALIST_PRINCIPAL_ABSENT`
