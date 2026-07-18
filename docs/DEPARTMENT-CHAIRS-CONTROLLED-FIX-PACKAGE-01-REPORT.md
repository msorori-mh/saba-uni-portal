# DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01

## Outcome

The source-only forward package is fail-closed, idempotent, and locally verified on PostgreSQL 17. It corrects only Osama's CS mapping, preserves the wrong IT assignment as inactive history, and never touches `position_assignments`. Khaled remains the sole IT chair; Ramzi and his IS assignment remain byte-for-byte unchanged.

## Exact approved identity anchors

The canonical faculty schema has `employee_number`, not `academic_number`. The approved administrative academic numbers are therefore asserted against `faculty_profiles.employee_number`: Osama `F2025006`, Khaled `F2025005`, and Ramzi `F2025004`. The SQL also asserts each exact stored Arabic name, user ID, faculty-profile ID, department ID, and assignment ID. No email is present in this report, the SQL, or its audit payload.

## Transaction and concurrency contract

- One transaction, transaction-local ticket and actor UUID preflight, advisory lock, and table locks.
- Exact 7-argument `public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)` existence check and fully typed call; no overload ambiguity and no `auth.uid()` reliance.
- Exact account/profile/assignment assertions before mutation.
- Reuses exactly one inactive matching Osama CS assignment; inserts only when zero; aborts when more than one.
- A second execution verifies the final state without another chair row. No DELETE, cleanup, backfill, or history loss.
- Any stale identity, duplicate inactive candidate, postcondition failure, or audit failure rolls back the entire transaction.

## PostgreSQL 17 verification

The isolated Docker harness compiles and executes the package on `postgres:17` and covers positive apply, inactive-row reuse, idempotent rerun, stale identity rejection, duplicate-candidate rejection, and forced-audit-failure rollback. Result: PASS.

## Production effect and decision

No SQL, Supabase connection, production read/write, migration apply, deploy, or publish occurred. Production execution remains prohibited.

- CRITICAL: 0
- HIGH: 0
- Risk: an authorized operator must supply the exact transaction-local ticket and actor UUID; state drift aborts and requires new read-only evidence.
- Decision: `PASS_SOURCE_PACKAGE_READY_FOR_INDEPENDENT_REVIEW`; apply remains `HOLD_REQUIRES_SEPARATE_EXPLICIT_AUTHORIZATION`.
