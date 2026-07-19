# DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01

## Outcome

The source-only forward package is fail-closed, idempotent, and locally verified on PostgreSQL 17. It corrects only Osama's CS mapping, preserves the wrong IT assignment as inactive history, and never touches `position_assignments`. Khaled remains the sole IT chair; Ramzi and his IS assignment remain byte-for-byte unchanged.

## Exact approved identity anchors

The canonical faculty schema has `employee_number`, not `academic_number`. The approved administrative academic numbers are therefore asserted against `faculty_profiles.employee_number`: Osama `F2025006`, Khaled `F2025005`, and Ramzi `F2025004`. The SQL also asserts each exact stored Arabic name, user ID, faculty-profile ID, department ID, and assignment ID. No email is present in this report, the SQL, or its audit payload.

## Transaction and concurrency contract

- One transaction, transaction-local ticket and actor UUID preflight, advisory lock, and table locks.
- The future operator identity is deliberately parameterized because no production actor was approved. An arbitrary UUID is rejected: the actor must resolve through canonical `auth.users` plus `public.user_roles`, must not have a future `auth.users.banned_until`, and must hold the explicitly approved `system_admin` role. The package never invents or embeds a production operator ID.
- Exact 7-argument `public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)` existence check and fully typed call; no overload ambiguity and no `auth.uid()` reliance.
- Exact account/profile/assignment assertions before mutation.
- Reuses exactly one inactive matching Osama CS assignment; inserts only when zero; aborts when more than one.
- A second execution verifies the final state without another chair row. No DELETE, cleanup, backfill, or history loss.
- Any stale identity, duplicate inactive candidate, postcondition failure, or audit failure rolls back the entire transaction.

## PostgreSQL 17 verification

The isolated Docker harness compiles and executes the package on `postgres:17` and covers positive apply, inactive-row reuse, idempotent rerun, stale identity rejection, duplicate-candidate rejection, and forced-audit-failure rollback. It additionally proves nonexistent, banned/inactive, and wrong-role actors fail before mutation, produce no audit row, and leave the original department mapping intact. Result: PASS.

## Production effect and decision

No SQL, Supabase connection, production read/write, migration apply, deploy, or publish occurred. Production execution remains prohibited.

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 0
- Risk: an authorized operator must supply the exact transaction-local ticket and actor UUID; state drift aborts and requires new read-only evidence.
- Independent review: PASS on commit `d42fb5a` with all finding counts zero.
- Decision: `PASS_DEPARTMENT_CHAIRS_CONTROLLED_FIX_PACKAGE_READY_FOR_APPLY_APPROVAL`; apply remains `HOLD_REQUIRES_SEPARATE_EXPLICIT_AUTHORIZATION`.
