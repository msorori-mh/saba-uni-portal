# PostgreSQL 17 Lifecycle Verification Result — GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01

- **Date (UTC):** 2026-07-21
- **Engine:** PostgreSQL **17.10** (embedded-postgres linux-x64 binaries, disposable cluster, socket-only, no network listener)
- **Status:** **PASS** — full chain executed end-to-end with `ON_ERROR_STOP` semantics and exited 0.

## Executed chain (in order)

1. `tests/graduation-projects/postgres-minimal-schema.sql` — synthetic fixtures (one department, one student, one faculty user).
2. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` — merged foundation (DRAFT ONLY, applied to the disposable cluster only).
3. `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` — this lifecycle completion draft (DRAFT ONLY).
4. `tests/graduation-projects/postgres-foundation-verifier.sql` — **OK** (foundation remains green on top of the new draft).
5. `tests/graduation-projects/postgres-lifecycle-verifier.sql` — **OK**.

## What the lifecycle verifier proves (executed, not asserted-in-comments)

- **Full happy path on p1 via RPCs only:** delegated create (creator role propagated) → team add → submit proposal → start_review → approve → milestone → activate → supervisor/panel assignment → deliverable → accept (progress recompute) → file metadata registration → external scan flip → discussion request → schedule → panel attach → outcome held → evaluation submit → finalize → conclude corrections_required → complete correction → accept correction (project returns to evaluating) → conclude completed → **archive** (foundation RPC).
- **Revision loop on p2:** require_revision (reason enforced) → `resubmit_graduation_project_proposal` → reject.
- **Discussion reject/postpone on p3:** request rejected → re-request → scheduled → postponed → held.
- **Exact denial matrix (19 messages):** project creation assignment required, proposal review precondition failed, review reason required, project activation precondition failed, faculty assignment role denied, cannot end own assignment, deliverable submission state denied, revision note required, file object key outside project scope, file metadata invalid, panel assignment precondition failed, discussion outcome precondition failed, evaluation scores invalid, evaluation already submitted, evaluations not finalized, corrections payload invalid, correction acceptance precondition failed, department report assignment required, exact direct processing assignment required.
- **Idempotency:** 23 `_retry` pairs — every retry returned the same id and emitted **exactly one** event per correlation id (append-only events unique index exercised).
- **Visibility gates:** student saw no non-finalized evaluation; pending-scan file key never leaked; clean file key visible to the team; `anon` role holds no EXECUTE on new RPCs.
- All transactions end with `rollback;` — no residue on any clone.

## Notes

- The execution harness pipes each file through a simple-protocol multi-statement runner (psql meta-commands stripped, `:'var'` placeholders substituted with the synthetic fixture ids) because the embedded distribution ships `postgres/initdb/pg_ctl` without `psql`; statement semantics are identical (single transaction, stop-on-first-error). The files remain plain `psql -f` scripts for CI.
- Double-application of the lifecycle draft is refused by design (`graduation projects lifecycle completion already exists; refuse ambiguous retry`), validated separately.
- Nothing in this run authorizes applying any draft to a shared or production environment; both drafts remain **DRAFT ONLY — DO NOT APPLY** pending the review/privileged gates.
