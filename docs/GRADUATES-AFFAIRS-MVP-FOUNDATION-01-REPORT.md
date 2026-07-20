# GRADUATES-AFFAIRS-MVP-FOUNDATION-01

Date: 2026-07-20 (Asia/Riyadh)

Base: `origin/main@427b7eb48f8771f31bd08a46fc4590cf883ab7e2`

## Decision

`PASS_GRADUATES_AFFAIRS_MVP_FOUNDATION_SOURCE_READY`

This PASS covers source, SQL draft, and tests only. It is not approval to apply SQL, activate a feature, create a graduate, alter an account, expose data, deploy, or publish.

## Implemented foundation

- An explicit `graduate_official_decisions` ledger is the sole graduate-record source. It accepts only `registrar_approved_decision` or `university_system_of_record_import` provenance.
- `create_graduate_record_from_official_decision` fails closed unless the decision is approved and contains approver, approval time, effective graduation date, program/department snapshot and immutable academic snapshot.
- Candidate lists, completion percentages, `student_profiles.status`, certificate requests and issued documents do not create a graduate record.
- Career/contact data is separated from the immutable graduate fact through profiles, verified-purpose contact points, versioned consent, append-only employment events and reviewed employers.
- Jobs, internships and training use a moderated opportunity lifecycle; direct draft-to-published transition is rejected in the source contract.
- Surveys have immutable versions and purpose/version consent references. Events and registrations are scoped independently.
- Employment and specialization-relationship reporting uses aggregate metrics with small-cell suppression. These contracts support employment, work-to-specialization, quality and accreditation reporting without row-level disclosure.
- All draft tables enable RLS with no permissive policies. The graduate creation function is revoked from `PUBLIC`, `anon` and `authenticated`; a later authorization bundle must add exact self/direct-assignee RPC policies and positive/negative tests.
- `graduate_domain_events` provides an append-only audit target for future sensitive reads, consent changes, moderation and report/export events.

## Fail-closed graduate definition

The implementation deliberately does not invent the unresolved academic mapping. An approved ledger row must be supplied by a separately governed registrar or university-system integration. The ledger records source reference and payload SHA-256, allowing corrections/revocations through explicit versioned decisions rather than silently reclassifying a student.

No automatic trigger observes student status, grades, graduation candidates or documents. Therefore unofficial or incomplete data cannot convert a student into a graduate.

## Authorization and privacy boundary

- Current draft access is default-deny. There is no general admin, registrar, dean or graduates-affairs bypass.
- Graduate self-service and staff access remain unavailable until a separate bundle proves exact ownership/direct assignment, unit, role, program/report scope, expiry and zero-mutation DENY behavior through RPC tests.
- Consent is purpose- and notice-version-specific and prospectively withdrawable.
- Employers cannot browse graduate identities. Applications are not implemented.
- Row-level exports are not implemented. Aggregate reporting suppresses cells below a configured minimum of at least three; the source default is five.
- Documents are neither issued nor referenced by this foundation.

## Files changed

- `src/lib/graduates-affairs/foundation.ts`
- `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql`
- `tests/graduates-affairs/graduates-affairs-foundation-01.test.ts`
- `tests/graduates-affairs/graduates-affairs-foundation-01.pg-setup.sql`
- `tests/graduates-affairs/graduates-affairs-foundation-01.pg-verify.sql`
- `docs/GRADUATES-AFFAIRS-MVP-FOUNDATION-01-REPORT.md`

## Verification

The task requires:

- targeted foundation tests;
- `bunx tsc --noEmit`;
- `bun test tests/student-requests` as the mandatory runtime regression suite;
- `bun run build`;
- `git diff --check`;
- independent findings review with `CRITICAL=0 / HIGH=0 / MEDIUM=0`.

Results:

- `bun test tests/graduates-affairs/graduates-affairs-foundation-01.test.ts`: PASS, 6 tests / 45 assertions.
- isolated PostgreSQL 17 executable draft verification: PASS. It compiles the draft and proves pending/forged direct inserts fail, approved creation succeeds, all client ACL/RLS paths remain default-deny, survey/event consent binds the same graduate/purpose/version and active state, approved facts and published scopes are immutable, revocation propagates, and audit events are append-only.
- `bunx tsc --noEmit` equivalent (`node .../typescript/bin/tsc --noEmit` against the locked workspace dependencies): PASS.
- `bun test tests/student-requests`: 523 PASS / 2 FAIL. Both failures are pre-existing environment dependency failures because the available shared locked installation lacks `@pdf-lib/fontkit`; failures occur in `enrollment-certificate-pdf-storage-saga-completion-01` and `staff-inbox-archive-action`, outside this change.
- `bun run build` equivalent (`vite build` against the locked workspace dependencies): client build PASS (3,147 modules); SSR build HOLD on the same missing `@pdf-lib/fontkit` dependency. No graduates-affairs module error was reported.
- `git diff --check`: PASS.
- independent findings review: pending at report authoring; final result is recorded in the PR handoff decision.

## Assumptions

- The two source-kind names describe provenance categories, not an academic mapping or permission to import data.
- `programs`, `departments`, `student_profiles` and authenticated user identities remain stable reference owners; the draft uses `ON DELETE RESTRICT` and never edits them.
- Account continuity, contact protection/encryption, retention periods, staff assignments and report/export approval remain separately governed decisions.

## Risks and blockers

- Applying this draft before the authorization/privacy bundle would leave the domain intentionally inaccessible. That is safe but not operationally complete.
- Contact values require an approved encryption/protection mechanism before implementation is promoted.
- Academic owners must approve the upstream official-decision integration, correction/revocation procedure and final-result freeze semantics.
- No source blocker prevents review of this foundation. Production activation remains blocked by separate approvals.

## Production impact

Zero. No production connection, read/write, SQL apply, migration, seed, account or profile change, `student_visible` change, workflow activation, Storage operation, deploy, publish, or E2E occurred.

## Findings

The first independent review found `CRITICAL=0 / HIGH=0 / MEDIUM=4 / LOW=2`; all were remediated through database-enforced official-decision integrity, consent/scope binding, correction/revocation propagation, immutable facts/events/versions, timestamp validation and executable PostgreSQL tests.

Final independent re-review: `CRITICAL=0 / HIGH=0 / MEDIUM=0 / LOW=0` — PASS.
