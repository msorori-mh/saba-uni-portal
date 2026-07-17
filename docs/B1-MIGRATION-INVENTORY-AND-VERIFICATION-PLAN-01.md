# B1 Migration Inventory and Verification Plan 01

## Inventory and dependency order

1. `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql`
   - Current SHA-256: `c039db2ed5b4e79348bcd5898f8a634cfaaec967eab501027b37810806209967`.
   - Adds the strict actor helpers and closed B1 step tuple contract.
2. `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql`
   - Current SHA-256: `bcc34dd68aa2683c8d7df35d12042bbd195545374d96e56a0dc293481fe5fc32`.
   - Blocked for apply: embedded staff/faculty IDs require fresh read-only identity and department verification; no mapping may be inferred.
3. `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`
   - Current SHA-256: `dd93cb52a640a09faf7a906d75b818017621373671c1c0927981b9dee9f69152`.
   - Depends on actor hardening, workflow tables, `log_audit`, submission boundary, storage schema, and separately approved bucket/policy creation.
4. Shared atomic submit/action vocabulary executable migration.
   - Missing: `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql` is documentary only.
5. `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql`.
   - Current SHA-256: `2ce6500f55edcc2ebd858bd5bfae35b5bd7dd5ba6032a7405dc76aebbdb670d3`.
   - Vocabulary and specialized finance RPC only; no financial ledger fields.
6. Executable workflow/validator migrations for suspension, absence, withdrawal, department transfer, and final chance.
   - Missing/incomplete: current suspension/absence and shared files are documentary; withdrawal contains only a partial executable detail table.
7. External-payment workflow migration 2/3 for `department_transfer` and `final_chance`.
   - Draft complete: `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql`.
   - Current SHA-256: `f63ff4f526a5dea6b8896586375eaf01ec07433001c857f270f0f1ce155aa444`.
   - Creates inactive, versioned drafts only; application remains gated. It fails closed on ambiguous stored aliases or processing bindings, configures exactly one `payment_confirmed` transition per payment step, and validates any reused draft structurally.
8. Final-chance canonical-write migration 3/3.
   - Missing; new writes only `final_chance`, historical aliases read-only, and no backfill.

No exact production apply command is approved while items 4, 6, and 8 are missing or item 2 identity mappings remain unverified.

## Preflight for each single migration

- Pin main commit, migration bytes, SHA-256, independent review PASS, and zero HIGH/CRITICAL findings.
- Verify migration history absence, target schema signatures, owners, ACLs, constraints, and dependencies.
- Snapshot `student_visible`, workflow versions, active request counts, storage objects/policies, and audit/event counts.
- Verify each referenced staff/faculty identity is active, user-linked, and correctly department-scoped without modifying it.
- Verify exactly one direct assignee for every B1 runtime step and separate source/target department heads.
- Prove the protected request IDs and preserved request/user are outside every mutation set; forbid historical notification backfill.
- Reject any fee type, amount, currency, invoice, gateway, balance, DROP, DELETE, TRUNCATE, reset, or cleanup operation.

## Sequential application protocol

For one migration only: preflight → exact apply → schema verification → authorization matrix → invariants → evidence capture. Do not start the next migration until every check passes. On failure or partial apply, stop only the migration chain, retain logs and database evidence, and do not reset or clean up.

## Post-verification

- Recheck objects, function definitions, `SECURITY DEFINER` search paths, grants/revokes, constraints, and migration history.
- Run every B1 step ALLOW/DENY case directly through RPC with approved synthetic users only.
- Prove failed authorization creates no workflow, transition, event, detail, attachment access, or payment confirmation mutation.
- Verify department isolation, attachment direct-assignee-only download, payment negative no-advance, and payment positive exactly-one transition/audit.
- Verify free services bypass payment entirely and paid services store no financial ledger data.
- Verify `final_chance` new writes only, historical read compatibility, no backfill, and unchanged protected entities.
- Verify `student_visible` remains unchanged until its separate per-service activation gate is approved.
