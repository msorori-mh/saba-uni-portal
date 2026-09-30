# Test-account role workflows — source repair review

Baseline: `874d86f4b4fdf44f125239c03afc6ac5cb94a07e`.
Branch: `fix/test-account-role-workflows`.
Decision: **HOLD for deployment and operational account completion**.

## Findings and changes

- Council membership reads and academic search joined `faculty(email)` with the authenticated client even though migration `20260715054903_3f6f3725-de3e-4478-a9e9-497c8b70ce9c.sql` revokes direct authenticated SELECT on `faculty`. Keep the existing manager gate and caller RLS for profiles/memberships; fetch only the necessary private email columns server-side. Email-search hits still require visible, active, linked faculty profiles before being returned. Membership mutations retain the caller's RLS/RPC path.
- Assignment candidates were keyed only by auth user ID, although one auth identity may have distinct staff/faculty profiles. Creation selected faculty first and ignored profile lookup errors. Select an explicit profile kind/ID, recheck its active status and current linked user before insertion, reject lookup failures, and show the selected identity for confirmation. Profile-backed assignments also resolve their names from the referenced profile rather than an optional assignment user ID. These are confirmed code defects; they do not establish the precise cause of the earlier UI selection incident.
- Library/lab roles can use the existing staff-profile ownership login contract without receiving an unrelated legacy role. Remove the default registrar grant from account creation/restoration and skip legacy/catalog grants for profile-only roles. Processing authorization still requires explicit assignments; no RLS, RPC authorization or role enum changes are included. Existing staff service fixtures already use profile-only staff identities.
- Persist the supplied staff contact email. Phone persistence is not included: the current staff profile schema has no phone column, so full contact-data completion remains unverified.
- Correct the compatibility role module's pre-existing duplicate/self-referencing export while touching role support.

## Validation

| Check | Result |
| --- | --- |
| `node --test tests/admin/test-account-role-workflows.test.ts` | PASS: 12 tests |
| TypeScript 5.8.3 transpilation of all 10 changed TS/TSX files | PASS: no syntax/transpilation errors; not semantic typechecking |
| `git diff --check` | PASS |
| Frozen Bun dependency install | BLOCKED: Bun reports `StackOverflow: failed to load bunfig`; repository config and supply-chain guard remain unchanged |
| `bunx tsc --noEmit` (via `bun x`) | BLOCKED: local Bun ENOENT; dependencies unavailable |
| `bun test tests/student-requests` | BLOCKED: same local Bun/config failure |
| `bun run build` | BLOCKED: local Bun reports script not found despite the tracked build script |
| `bun run security:test` | NOT RUN: no authorized isolated security-test credentials/environment supplied |
| Direct RPC allow/deny matrix / E2E | NOT RUN; E2E must follow the RPC matrix |

The new tests cover stale/mismatched/inactive profile rejection, private email lookup bounds/failure handling, manager/RLS wiring, and profile-only role mapping. They do not substitute for the full RPC authorization matrix or deployed UI verification. The repository's existing PR CI should run before any merge/release decision. Its TypeScript configuration currently has `noCheck: true`; a passing default typecheck alone is not semantic proof.

## Remaining gates and limits

1. Pass the required build/regression checks and direct RPC positive/negative matrix in an isolated environment. Verify UI selection and returned account identity there.
2. Review linked-account role transitions and all existing operational assignments before any test-role activation. This patch is not an atomic database provisioning transaction and does not solve concurrent assignment races.
3. Obtain the required release authorization after the candidate is reviewable; `AGENTS.md` defaults this work to source-only and prohibits deployment/migrations without explicit authorization.
4. After authorized deployment, finish the outstanding test accounts, council/department links, requested password setup and per-role operational data. Do not replace incumbent managerial assignments to make room for test accounts.

Production impact of this source repair: **none**. No deployment, migration, account/password change, membership write, operational assignment, email or notification was performed during this repair. No account credentials are committed. Earlier test-account setup is separate and remains incomplete; a source patch is not evidence that those accounts now work.
