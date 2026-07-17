# Final Chance Canonical Write 03

## Result

PASS — source-only migration draft 3/3 is complete.

The draft preserves `extra_chance` as the currently proven stored request-type code while enforcing `chance_type='final_chance'` for every new or changed academic chance value. Historical noncanonical rows are retained without scan, rewrite, validation, or backfill and become read-only.

## Enforcement

- Fails closed unless exactly one stored `extra_chance` request type exists and no unproven canonical request-type row exists.
- Applies exact normal/origin, row-level, before-insert/update triggers to both chance-detail and academic-chance tables.
- Adds `NOT VALID` final-chance constraints so existing historical rows remain untouched while future writes are constrained.
- Fully validates existing trigger and constraint catalog definitions before idempotent reuse.
- Removes direct authenticated DML on chance details while retaining authenticated SELECT; future writes wait for the reviewed atomic server submit boundary.
- Wraps all statements in one explicit transaction.

## Verification

- Focused source-contract tests: 6 PASS.
- Student-request suite: 429 PASS.
- TypeScript: PASS.
- Production build: PASS.
- `git diff --check`: PASS.
- Independent review: PASS; CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0 after closing two HIGH and one MEDIUM findings across review rounds.
- Isolated PostgreSQL 17 compile: PASS.
- Isolated idempotent second application: PASS.
- Negative legacy-value inserts rejected; positive `final_chance` inserts allowed; historical row counts and authenticated ACL invariants preserved.

## Production impact

None. Verification used a temporary local Docker PostgreSQL instance which was stopped and removed afterward. No production connection, SQL application, request mutation, visibility change, deploy, publish, or historical notification backfill occurred.

## Remaining gates

The shared atomic submit/action executable migration, complete executable service migrations, verified processing identities, exact per-migration apply commands, and production preflight/post-verification evidence remain incomplete. This draft does not authorize application.
