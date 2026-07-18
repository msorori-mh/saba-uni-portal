# MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01

## Outcome

The create, update, publish, and archive metadata mutations now call one
authenticated forward RPC contract. The draft RPC resolves `auth.uid()`, locks
the active faculty profile and exact target, rechecks section and material
ownership, performs the mutation, and records its event in one transaction.
It has no admin, registrar, dean, or service-role bypass.

Create, update, and publish require an unambiguous canonical current term plus
an active offering and section. Archive remains possible for the exact owner on
a historical section. Update/publish/archive compare `updated_at` under the row
lock. All actions require an idempotency UUID; repeated keys return the original
target without another write. The section and material target parameters cannot
be combined or changed.

## Boundaries

- The SQL is a forward draft under `docs/migration-drafts`; it was not applied.
- Runtime activation must sequence the base materials design migration before
  this RPC and deploy the caller only after RPC verification.
- File upload crosses database and object storage and is intentionally not
  represented as transactionally atomic here. Its current compensating cleanup
  remains unchanged and requires a separate reservation/finalization design.
- First-publish notifications are inserted in the same transaction and only for
  exact `enrolled` members of the immutable section. No program/level/SAS or
  sibling-section fallback is used. Repeated publication attempts do not write
  another event or notification.
- No production, storage policy, bucket, generated types, feature visibility,
  deploy, or publish operation was changed.

## Verification target

Focused tests cover RPC argument preservation, fail-closed errors, exact
faculty/section/material bindings, row locks, canonical active-term gates,
immutable targets, optimistic guards, idempotency, grants, and absence of a
generic bypass.

- Focused tests: PASS (9 tests, 36 assertions).
- TypeScript: PASS.
- Focused ESLint and Prettier: PASS.
- `git diff --check`: PASS.
- Local build: environment HOLD because the frozen Bun install omitted the
  package-declared `lucide-react` ESM/CJS entries. This is the same workstation
  dependency extraction issue previously disproved by clean-runner CI; no
  dependency or lockfile changed. Clean CI build remains the merge gate.

Decision: `PASS_SOURCE_DRAFT_READY_FOR_INDEPENDENT_REVIEW`.
