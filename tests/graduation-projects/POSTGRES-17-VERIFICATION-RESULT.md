# PostgreSQL 17 disposable verification result

Date: 2026-07-20 (Asia/Riyadh)

Environment: local Docker `postgres:17`, isolated database
`gp_verify_final_3`. No remote or production connection was used. Fixture UUIDs
are deterministic synthetic values from `postgres-minimal-schema.sql`; no secret
or real identity is recorded here.

Executed in order with `ON_ERROR_STOP`:

1. `tests/graduation-projects/postgres-minimal-schema.sql` — PASS.
2. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` — PASS;
   transaction reached `COMMIT` with all tables, composite constraints, RLS,
   triggers, reporting/readiness sources and six RPC functions created.
3. `tests/graduation-projects/postgres-foundation-verifier.sql` — PASS; final
   statement was `ROLLBACK`.

Verified executable outcomes:

- exact fixture identity and processing department;
- anonymous execute denial and active direct-assignment enforcement;
- wrong role/subject and wrong profile owner rejection;
- cross-project FK rejection across all 11 sensitive child surfaces;
- proposal/team/milestone/discussion/evaluation positive RPC paths;
- wrong-role and state/precondition negative paths;
- same-correlation idempotent result and exactly-one audit event for all five
  lifecycle RPCs and archive;
- evaluation requires discussion `held` and project `evaluating`;
- archive requires completed state, clean accepted final evidence and accepted
  corrections, with denial zero-side-effects;
- append-only event UPDATE and DELETE rejection.

Verifier exit code: `0`. Synthetic verifier mutations: rolled back.
