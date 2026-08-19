# USR Organization Registry — Verification Gate 02

Status: HOLD until every mandatory check passes.  
Scope: isolated development database only.  
Production execution: prohibited.

## A. Baseline invariants

- [ ] `main` still points to the protected ITCS baseline or approved successors only.
- [ ] `quboolye.com` and the production Supabase project receive no university-expansion variables.
- [ ] Android package remains `ye.edu.usr.fitcs.portal`.
- [ ] Existing ITCS login, home, notifications, requests, documents, schedule, and account switching pass regression tests.
- [ ] No existing department row is updated by the registry foundation.

## B. PostgreSQL compile

Run only in a disposable database:

```sql
set usr.allow_draft_migration = 'TEST_ONLY';
\i USR-ORG-REGISTRY-FOUNDATION-02.draft.sql
```

Expected:

- all statements compile;
- transaction ends with `ROLLBACK`;
- no new table/type remains after execution;
- without the setting, execution fails with `DRAFT_GUARD`.

## C. Structural tests

- [ ] Duplicate institution code is rejected.
- [ ] Duplicate unit code within an institution is rejected.
- [ ] A campus from institution A cannot be assigned to a unit in institution B.
- [ ] A parent unit from institution A cannot parent a unit in institution B.
- [ ] A unit cannot parent itself.
- [ ] One legacy department cannot map to multiple organization units.
- [ ] One organization unit cannot map to multiple legacy departments.
- [ ] A verified legacy link requires verifier and timestamp.
- [ ] Deleting referenced organizational records is restricted.

## D. RLS negative tests

As `anon`:

- [ ] cannot read any registry table;
- [ ] cannot insert, update, or delete any registry row.

As an authenticated user without membership:

- [ ] cannot read institutions, campuses, units, memberships, or links;
- [ ] cannot insert, update, or delete.

As a member of unit A:

- [ ] can read own active membership;
- [ ] can read unit A and its institution;
- [ ] cannot read unit B;
- [ ] cannot read another user's membership;
- [ ] cannot read an unverified legacy link;
- [ ] does not automatically inherit parent/child access.

As an expired/inactive member:

- [ ] receives no scoped registry data.

## E. Compatibility tests

- [ ] Existing reports still fail closed when `collegeId` is absent.
- [ ] A verified legacy link resolves a department to exactly one college path.
- [ ] Dean identity alone never grants access to another college.
- [ ] Existing department-head council reconciliation is not invoked for new colleges in this stage.
- [ ] Future council refactor test proves two active college councils can coexist without ambiguity.

## F. Seed evidence

For every seeded row:

- [ ] Arabic name matches an official university page.
- [ ] Unit type is supported by the page.
- [ ] Source URL is stored.
- [ ] Unpublished departments are not invented.
- [ ] Conflicting official counts are recorded as evidence notes.
- [ ] All demo metadata is marked `TEST_ONLY`.

## G. Promotion decision

Promotion from `.draft.sql` to `supabase/migrations` requires:

1. separate private repository;
2. separate Supabase development project;
3. PostgreSQL compile PASS;
4. RLS negative-test PASS;
5. existing ITCS regression PASS;
6. explicit user approval for the isolated migration.

Until then: **HOLD**.
