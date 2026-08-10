# GA Specialist Department-Scope — Owner Decision Package

**Mission:** `PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02`  
**Mode:** production READ-ONLY inspection. Zero writes.  
**Captured:** 2026-08-10 (Asia/Riyadh) via Lovable `query_database` on project `90f4dcde-07fb-4441-b86a-6ad5510833b8`.

---

## Exact specialist identity

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
Other columns/tables are evidence sources for owner decision, never substitutes.

| Binding source | Result for specialist `aa4f5c16-…` |
|---|---|
| `staff_profile_departments` | **0 rows** |
| `staff_profiles.department_id` | **NULL** |
| `staff_profiles.department_scope` | text `all` (not a department UUID; **not** AUTH-04 scope) |
| `graduation_project_department_coordinators` by `user_id` / profile | **0 rows** |
| Active GA unit assignment | present (1 specialist) |

No second active `graduate_affairs_specialist` assignment was observed.

---

## Verdict

```text
OWNER_DECISION_REQUIRED
REASON=AMBIGUOUS_NO_SINGLE_AUTHORITATIVE_DEPARTMENT
```

Exactly one authoritative department **cannot** be proven. No department is invented.

---

## Exact active department candidates

| `department_id` | `name_ar` | `name_en` | `sort_order` | `is_active` |
|---|---|---|---|---|
| `ce485c67-5f7c-498d-b120-4b1130a86ae8` | قسم تكنولوجيا المعلومات | Information Technology Department | 1 | true |
| `11111111-1111-4111-8111-111111111111` | قسم علوم الحاسوب | Department of Computer Science | 2 | true |
| `22222222-2222-4222-8222-222222222222` | قسم نظم المعلومات الحاسوبية | Department of Computer Information Systems | 3 | true |

Owner must pick **one or more** of the above UUIDs (or revoke the specialist assignment).

---

## Owner options (no agent write)

### Option A — Forward-only exact SPD assignment (after owner pick)

For each chosen `department_id` from the candidate table:

```sql
-- OWNER-GATED WRITE ONLY. Do not run without explicit approval.
BEGIN;
INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
VALUES (
  'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f'::uuid,
  '<OWNER_CHOSEN_DEPARTMENT_UUID>'::uuid
)
ON CONFLICT DO NOTHING;
COMMIT;
```

Then re-run diagnosis in
`docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql`
and expect `department_scope_count >= 1`.

### Option B — Revoke specialist assignment until scope decided

Deactivate assignment `276cf8d1-4bce-4fea-9e96-b1f8dc1bdf0e` (or equivalent governed revoke path) so foundation preflight no longer sees an active specialist with empty SPD.

### Option C — Hold

Leave production unchanged. GA production apply-one sequence remains gated by
`HOLD_SPECIALIST_MISSING_DEPARTMENT_SCOPE` (in addition to lineage/C9 gates).

---

## Related artifacts

- Dry-run diagnosis SQL: `docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql`
- SELECT preflight: `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql`
- AUTH-04 source: `supabase/migrations/20260808210200_ga_authorization_04.sql` (`graduate_affairs_specialist_department_ids`)

**Production writes this package:** `0`
