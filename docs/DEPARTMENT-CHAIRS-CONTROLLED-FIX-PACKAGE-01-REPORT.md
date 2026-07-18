# DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01

## Outcome

Prepared a forward-only, never-applied controlled SQL draft from
`DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01`. The approved identities are
CS Dr Osama Abduljalil, IT Dr Khaled Albrahi, and IS Dr Ramzi Aljabri.

The package performs only the approved minimal correction when deliberately run
in a separately authorized environment: disable Osama's exact wrong IT
processing assignment without deletion, move his exact faculty profile from IT
to CS, and insert exactly one active CS `department_head` faculty assignment.
Khaled remains the sole IT chair. Ramzi and his IS assignment remain byte-for-byte
unchanged. No employee, account, position, or chair identity is created.

## Fail-closed preflight

- Requires a transaction-local controlled-fix ticket.
- Takes an advisory lock and table locks before resolving or writing.
- Anchors every known department, user, faculty profile, and existing assignment
  to IDs documented by the read-only report; no new identity ID is invented.
- Resolves exactly one active `department` unit and its exact active
  `department_head` role dynamically.
- Requires the exact pre-state: CS zero effective chairs, IT two (Khaled plus the
  wrong Osama row), and IS one (Ramzi). Zero/one/multiple drift aborts.
- Snapshots Khaled and Ramzi profiles and assignments before mutation.

## Post-verification

The transaction commits only when CS, IT, and IS each have exactly one effective
active chair with the approved direct faculty assignment; Osama belongs to CS;
his old IT row is inactive; Khaled is the sole IT chair; and Khaled/Ramzi
snapshots are unchanged. Every UPDATE requires row count one. No DELETE exists.

## Rollback by forward correction

There is no destructive rollback. A separately approved forward correction must
resolve the generated CS assignment from its exact tuple, require exactly one
match, disable it without deletion, restore only report-anchored values, and
rerun all invariants. The generated assignment ID is deliberately not guessed.

## Production effect and decision

This PR is source-only. No SQL, Supabase connection, production read/write,
employee modification, migration apply, deploy, or publish occurred.

- CRITICAL: 0
- HIGH: 0
- Focused package tests: PASS (5 tests, 45 assertions).
- TypeScript, focused ESLint/Prettier, and `git diff --check`: PASS.
- Assumption: the read-only report remains the sole identity evidence; any drift
  must produce a fresh read-only report rather than weakening predicates.
- Blockers: production execution remains prohibited and was not attempted.
- Residual operational risk: applying against state different from the report
  aborts and requires a fresh read-only resolution; it must never be bypassed.
- Decision: `PASS_SOURCE_PACKAGE_READY_FOR_INDEPENDENT_REVIEW`; production/apply
  remains `HOLD_REQUIRES_SEPARATE_EXPLICIT_AUTHORIZATION`.
