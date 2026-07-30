# GRADUATION-PROJECTS E2E — TEST_ONLY DATASET & CLEANUP MANIFEST

- Environment: disposable PostgreSQL 17 container only (created and destroyed by
  `tests/graduation-projects/run-pg17-migration-package.sh`). No production, no
  staging, no shared database, no real user data, no real secrets.
- Execution mode: every journey runs inside a single transaction that ends in
  `rollback;` — **nothing persists**, so cleanup is a no-op by construction.

## Dataset (100% synthetic)

All E2E fixture ids carry the `7e570000-` prefix and all titles carry the
`TEST_ONLY —` marker:

- Departments: `7e570000-0000-4000-8000-0000000000d1` / `...0d2`
- Users: `7e570000-0000-4000-8000-0000000000a1..c3` (students, solo student,
  supervisor, co-supervisor, department head, coordinator, committee chair,
  second committee member, other-department admin)
- Profiles: `7e570000-0000-4000-8000-0000000000e1..f7`
- Projects: `TEST_ONLY — bootstrap`, `TEST_ONLY — J1 team project`,
  `TEST_ONLY — J2 individual`, `TEST_ONLY — J4 withdrawal`
- Correlation ids: `51111111-…` (E2E journeys), `41111111-…` (matrix),
  `31111111-…` (admin), `21111111-…` (files), `11111111-…` (hardening)

## Cleanup procedure (if the fixture is ever replayed on a persistent local DB)

1. Confirm the database is local and contains no real data.
2. Delete in FK-safe order, scoped by the TEST_ONLY markers:

```sql
delete from public.graduation_project_events where project_id in
  (select id from public.graduation_projects where proposal_title like 'TEST\_ONLY — %');
-- repeat for every graduation_project_* child table, then:
delete from public.graduation_projects where proposal_title like 'TEST\_ONLY — %';
delete from public.student_profiles where id like '7e570000-%';
delete from public.faculty_profiles where id like '7e570000-%';
delete from public.departments where id like '7e570000-%';
delete from auth.users where id like '7e570000-%';
```

3. Verify: `select count(*) from public.graduation_projects where proposal_title like 'TEST\_ONLY — %';` → 0.

## What must NEVER be cleaned by this manifest

Portal reference data (departments, programs, academic years), any real user,
any B1/five-services object. This manifest covers GP E2E fixtures only.
