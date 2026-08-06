# PostgreSQL 17 disposable verification result — Package A

Date: 2026-08-06

Environment: local Docker `postgres:17`, isolated database `gp_pkg_a`.
No remote or production connection was used. Fixture UUIDs are synthetic
values from `postgres-minimal-schema.sql`.

Executed in order with `ON_ERROR_STOP=1`:

1. `tests/graduation-projects/postgres-minimal-schema.sql` — PASS
2. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql` — PASS
3. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql` — PASS
4. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql` — PASS
5. `tests/graduation-projects/postgres-foundation-verifier.sql` — PASS (`PACKAGE_A_FOUNDATION_VERIFIER_PASS`, `ROLLBACK`)
6. `tests/graduation-projects/postgres-lifecycle-verifier.sql` — PASS (`PACKAGE_A_VERIFIER_PASS`, `ROLLBACK`)

Verified outcomes:

- department coordinator capability bootstrap (not title bypass)
- create team + identical-correlation idempotent replay
- changed-payload replay denial
- leader membership + exactly one leader + one-active-team enforcement path
- proposal upsert/submit/return/resubmit/accept with mandatory clean proposal PDF
- post-accept membership lock (leader denied)
- supervisor pending → accept → `active`; pending supervisor cannot review
- progress return → correct → approve
- final upload/finalize (sha256 required)/scan/submit/ready
- defense schedule + ≥2 committee + held → evaluating
- immutable evaluations; no peer note leakage in detail RPC
- average of submitted scores; coordinator records `passed` (no pass threshold)
- coordinator archive snapshot completeness; post-archive mutation denied
- append-only events; anon execute denial; private `graduation-projects` bucket contract
- foundation structural checks: enums, indexes, RLS, helper grants, bucket MIME

Production impact: **none**. No apply, deploy, publish, or production bucket creation.
