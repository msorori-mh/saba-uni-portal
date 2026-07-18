# MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01

## Remediated source-only outcome

This PR contains only a forward SQL draft and contract tests. It deliberately
does not wire runtime code to an unapplied RPC. Deployment order is migration
first, verification second, then a separate caller release whose initiating UI
must generate and retain one stable `mutationId` across lost-response retries.

The draft authorizes and mutates metadata in one transaction with no admin or
service-role bypass. It uses deterministic faculty, canonical-term table,
section, offering, then material locks. Canonical-term table SHARE locks prevent
term changes during authorization and write. Exact owner/section/target bindings
are revalidated under locks; current active term is required where relevant.

Idempotency stores a SHA-256 fingerprint of action, immutable target, expected
version, and canonical JSON payload. A stable-key retry with identical input
returns without a second write; changed action, target, version, or payload is
rejected.

Direct DML cutover is fail-closed: unexpected policy inventory aborts, and the
draft refuses to revoke direct grants until upload reservation/finalization and
checked download-audit RPCs exist. Upload is not claimed atomic by this PR.
The definition migration only creates the separately gated cutover procedure;
it never calls it. Required rollout is: define/verify metadata RPC, release its
stable-key caller, define/verify and release upload/download RPC callers, then
invoke the cutover procedure in a separately approved migration stage.

No SQL was applied. No runtime, production, storage, `student_visible`, deploy,
or publish change occurred. Decision: `PASS_SOURCE_DRAFT_READY_FOR_RE_REVIEW`.

Verification: focused tests PASS (5 tests, 33 assertions), TypeScript PASS,
Prettier/ESLint PASS, and `git diff --check` PASS. Clean-runner CI remains the
authoritative build gate because the local Bun extraction omits the declared
`lucide-react` ESM/CJS entries without any lockfile change.
