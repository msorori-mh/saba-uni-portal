# GA Specialist Department-Scope — Deterministic Resolution Plan

**Mission:** `PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01`
**Mode:** production READ-ONLY inspection + SOURCE remediation plan. Zero writes.
**Captured:** 2026-08-10 (Asia/Riyadh) via Lovable `query_database` on project `90f4dcde-07fb-4441-b86a-6ad5510833b8`.
**GA schema at capture:** GA1/GA2/GA3 = `VERIFIED_PRESENT` (managed aliases including `20260810162735`).
**Supersedes prior owner-pick gate for specialist `aa4f5c16-…`.**

---

## Exact current specialist identity (DO NOT SCOPE)

| Field | Value |
|---|---|
| Role | `graduate_affairs_specialist` (active) |
| Assignment id | `276cf8d1-4bce-4fea-9e96-b1f8dc1bdf0e` |
| Assignment type | `staff_profile` |
| `staff_profile_id` | `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` |
| `user_id` | `c870a7ee-d328-410d-b9e8-408c2fb033d5` |
| Name (AR) | صالح علي |
| Email | `saleh@usr.edu.ye` |
| Employee number | `S2026008` |
| Profile status | `active` |
| Job title | مختص شؤون الخريجين |
| Profile `role_type` | `graduate_affairs_specialist` |

Companion manager (context only; managers are not department-scoped by AUTH-04):

| Field | Value |
|---|---|
| Role | `graduate_affairs_manager` |
| `staff_profile_id` | `f463a79b-65be-4a94-8003-1c9a2727b88f` |
| Name (AR) | محمد شوقي |
| Email | `shuki@usr.edu.ye` |
| Profile `department_scope` | `all` |

---

## Authoritative bindings inspected (READ-ONLY)

AUTH-04 binds specialist record access **only** via
`public.staff_profile_departments` of the authorizing `staff_profile`.
Other columns/tables are evidence for deterministic resolution, never substitutes.

| Binding source | Result for specialist `aa4f5c16-…` |
|---|---|
| `staff_profile_departments` | **0 rows** |
| `staff_profiles.department_id` | **NULL** |
| `staff_profiles.department_scope` | text `all` (not a department UUID; **not** AUTH-04 scope) |
| `faculty_profiles` link by `user_id` | **none** |
| Active org `position_assignments` → department | **none** (`organizational_positions` has no `department_id`) |
| Active GA unit assignment | present (1 specialist) |

### College-wide staff scan (eligible GA specialist pool)

| Probe | Result |
|---|---|
| Active `staff_profiles` | 9 |
| With non-NULL `department_id` | **0** |
| With `department_scope='all'` | **9 / 9** |
| Rows in `staff_profile_departments` (entire table) | **0** |
| Staff with exactly ONE SPD binding | **0** |
| Staff user linked to faculty with department | **0** |

No existing staff profile has exactly one authoritative department binding.

---

## Verdict

```text
AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE
SPECIALIST=aa4f5c16-c993-4af6-a6d4-59d9542c1a7f
REASON=NO_UNIQUE_AUTHORITATIVE_DEPARTMENT_BINDING
SAFE_REAL_STAFF_CANDIDATE=NONE
```

Do **not**:
- invent a department for `aa4f5c16-…`
- assign all departments / treat `department_scope='all'` as AUTH-04 scope
- broaden GA authorization

Human department-pick for `aa4f5c16-…` is **closed** as a GA gate.
Operational specialist capacity moves to the TEST_ONLY single-department fixture below.

---

## SAFE_SPECIALIST_CANDIDATE (TEST_ONLY — plan only, no write)

Because no suitable real staff actor exists, prepare a tightly-scoped
**TEST_ONLY** GA specialist fixture for production E2E only.

| Field | Value |
|---|---|
| Marker | `TEST_ONLY_GA_SPECIALIST_E2E_01` |
| Package | `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql` |
| `SAFE_SPECIALIST_CANDIDATE` (planned staff_profile_id) | `a6e30100-0000-4000-a300-000000000001` |
| Planned auth user_id | `a6e30100-0000-4000-a100-000000000001` |
| `SAFE_SPECIALIST_DEPARTMENT` | `11111111-1111-4111-8111-111111111111` |
| Department name | قسم علوم الحاسوب / Department of Computer Science |
| SPD rows planned | **exactly 1** (never all departments) |
| High-privilege assignments | none (specialist role only) |
| Touch current specialist `aa4f5c16-…` | **forbidden** |

Department UUID is an existing active production department (sort_order=2),
already used by other TEST_ONLY GP fixtures — not invented.

Default package mode is DRY RUN (abort). Execute mode requires explicit GUC
and owner runtime grant; this mission performs **zero** production writes.

---

## Exact active department reference (context only)

| `department_id` | `name_ar` | `name_en` | `sort_order` | `is_active` |
|---|---|---|---|---|
| `ce485c67-5f7c-498d-b120-4b1130a86ae8` | قسم تكنولوجيا المعلومات | Information Technology Department | 1 | true |
| `11111111-1111-4111-8111-111111111111` | قسم علوم الحاسوب | Department of Computer Science | 2 | true |
| `22222222-2222-4222-8222-222222222222` | قسم نظم المعلومات الحاسوبية | Department of Computer Information Systems | 3 | true |

Fixture binds **only** the Computer Science UUID above.

---

## Related artifacts

- TEST_ONLY fixture (dry-run default): `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql`
- Dry-run diagnosis SQL: `docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql`
- SELECT preflight: `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql`
- Operator status: `docs/go-live/operator-packets/GA-PRODUCTION-STATUS.txt`
- AUTH-04 source: `supabase/migrations/20260808210200_ga_authorization_04.sql`

**Production writes this package:** `0`
