# Security/mobile closure — source only

Baseline: `main` at `bbd113f49bde1d57f6f8112e2b9416d72e033e97` (includes #479 and #480).

## Scope and superseded changes

- #415/#417: effective RPC grants, authenticated reauthentication throttling, IP-scoped pre-auth throttling, and test-fixture write guards. Fixtures require explicit authorization plus localhost or an exact `TEST_ONLY_PROJECT_REF`; known production projects are always rejected. They never reset existing account passwords.
- #418: generic submission rolls back when workflow initialization fails; returned requests may reuse existing runtime steps.
- #419: legacy ad-hoc issuance/status approval is blocked; grades use the caller's JWT and scoped database authorization. The existing actor implementation remains responsible for exact active step/role/unit/assignment authorization. This package does not introduce an administrative bypass.
- #416: current-password verification uses #479's same-account Auth helper on all password screens; mandatory first-login state is carried through the mobile/offline identity; opaque document verification only; term labels, Latin-number dates, document codes and back navigation are retained.
- Existing main implementations are preserved for canonical current-term selection, parallel reads, offline query caches, QR auto-verification, native document actions, server headers and Android transport security. The older #416 tests are replaced rather than copied over #479. #420 is an obsolete integration branch and must not be merged on top of this package.

## First-login/offline behavior

Only an explicitly false `must_change_password` permits leaving settings. True and legacy snapshots with no flag go to settings, without signing out or erasing saved academic screens. Existing confirmed-false offline snapshots remain usable. After Auth verification and successful `complete_student_password_change`, the opted-in persisted identity is updated, the in-memory identity is invalidated and the router reloads its guard. The cached flag is a UX gate, not a substitute for database authorization or Auth enforcement.

## Database release gate — HOLD

No SQL was applied to an external database. The seven new `20261011*` files are forward-only and ordered after current main migrations. Applied historical migration files are untouched. Merging source does not demonstrate live database protection.

Before any separately authorized database release:

1. Run the tracked read-only preflights, inventory exact RPC signatures/ACLs, and confirm the current actor RPC and document/grade workflow contract against the target schema.
2. Apply and verify the package on a disposable staging database first, including real end-to-end owner/student, assigned actor, foreign department, issued-document download and mobile first-login journeys.
3. Record effective grants, new-function defaults, receipt cross-student rejection and generic-submission rollback. Database fixtures stub the workflow initializer and retained actor implementation; they prove the new boundaries but cannot prove every existing workflow implementation.
4. Schedule the production SQL and application rollout together only after explicit release approval. Application code now calls `approve_submitted_section_grades`; deploying it before the matching SQL will fail closed. Do not restore broad grants as a shortcut.

## Validation

- Local project TypeScript command and `git diff --check` passed. The repository sets `noCheck: true`; this is not a strict semantic typecheck.
- Vite client/server build passed locally with existing dependency/deprecation warnings.
- All thirteen SQL fixture/migration/matrix stages passed in isolated PGlite. The tracked test also requires real `postgres:17` through Docker in CI; PGlite does not replace that gate.
- Local Bun fails before test discovery with `StackOverflow: failed to load bunfig`, including an explicit empty-config attempt. No local Bun suite is claimed as passed. CI results on the final head determine the merge gate.
- The staging security harness is not run against production or without explicit disposable target credentials.
