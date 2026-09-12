# Department Transfer 10A1 — Activation Runbook

This is a source-only review package. It contains no production command and
does not authorize migration apply, deploy, publish, E2E, or a visibility
change.

The following gates must pass in order:

1. Migration review PASS with one authoritative ordered chain and no duplicate
   migration.
2. Disposable PostgreSQL 17 executable harness PASS, including all positive
   and negative direct-RPC cases, concurrency/replay, ACL/RLS/catalog checks,
   audit append-only checks, and zero residue.
3. Production read-only preflight PASS using
   `PRODUCTION-READONLY-PREFLIGHT.sql`; no student PII may be exported.
4. A separately authorized production apply of one approved migration at a
   time, with no `student_visible` or activation change bundled in the apply.
5. Production post-verifier PASS using `POST-VERIFIER.sql`, plus migration
   history and zero-delta evidence.
6. Controlled synthetic `TEST_ONLY` E2E PASS using separately authorized test
   identities. No real student may be used.
7. A separate written authorization to change `student_visible` and the
   service activation gate. This package does not grant that authorization.

Until all gates pass, preserve:

```text
SCHEMA_PENDING=true
department_transfer.E2E=PENDING
student_visible=false
```

## Required evidence handoff

- source SHA and exact draft/migration blob hashes;
- preflight output and database identity;
- PG17 harness output with `FAIL_COUNT=0`;
- post-verifier output with no `HOLD` rows;
- production write counter equal to zero before and after preflight;
- explicit approval identifiers for apply, TEST_ONLY E2E, and visibility.

If any check is partial, stop with
`HOLD_PORTAL_DEPARTMENT_TRANSFER_SCHEMA_AND_RPC_READINESS_10A1_<EXACT_REASON>`.
