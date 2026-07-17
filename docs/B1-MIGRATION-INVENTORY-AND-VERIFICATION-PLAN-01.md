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
   - Draft complete: `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql`.
   - Current SHA-256: `769e8af5c3a34bc81c793fb4a36bcebf80a3a522c15ca6868f66b48d65d9e277`.
   - Installs fail-closed service persistence, exact direct-assignment workflow initialization, atomic submit/action boundaries, legacy B1 mutation guards, strict resubmit coverage, and closed action outcomes. Service persistence remains deliberately unavailable until item 6 replaces its dispatcher.
5. `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql`.
   - Current SHA-256: `32cd7bde1ef73a32e23643035d27764ed27dd8e9dd4948ee295f5b6763dfa461`.
   - Vocabulary and specialized finance RPC only; no financial ledger fields.
6. Executable workflow/validator migrations for suspension, absence, withdrawal, department transfer, and final chance.
   - 05A absence vocabulary draft complete: `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql`, SHA-256 `c73b359baf55f1d9ac28aa588d4c2c1d13c63c2a6036184203e8ba4a1847fb27`, independent review PASS.
   - 05A withdrawal detail boundary draft complete: `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql`, SHA-256 `e75dd442ac226529a88f8aaee72ecd55971886b841583cf5b7d35af38326089a`, independent review PASS.
   - 05A trusted-reference validators complete: `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql`, SHA-256 `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c`, independent review PASS.
   - 05A excused-absence detail/RPC-write boundary complete: `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql`, SHA-256 `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe`, independent review PASS.
   - 05A transfer secure-attachment overlay complete: `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql`, SHA-256 `ba163a3f2bc5115a22373e324d199817d58796284bb3ca0d095abc6bf12783a8`, independent review PASS.
   - 05A detail RPC-write cutover primitive complete: `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql`, SHA-256 `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495`, independent review PASS. Installation alone does not invoke the primitive; invocation belongs inside the future reviewed atomic dispatcher/caller cutover migration.
   - Remaining: atomic five-service persistence dispatcher and inactive workflow drafts for the three free services. These remain fail-closed and no item-6 application is approved.
7. External-payment workflow migration 2/3 for `department_transfer` and `final_chance`.
   - Draft complete: `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql`.
   - Current SHA-256: `f63ff4f526a5dea6b8896586375eaf01ec07433001c857f270f0f1ce155aa444`.
   - Creates inactive, versioned drafts only; application remains gated. It fails closed on ambiguous stored aliases or processing bindings, configures exactly one `payment_confirmed` transition per payment step, and validates any reused draft structurally.
8. Final-chance canonical-write migration 3/3.
   - Draft complete: `FINAL-CHANCE-CANONICAL-WRITE-03.sql`.
   - Current SHA-256: `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704`.
   - Keeps `extra_chance` as the proven stored request-type alias, permits only `chance_type='final_chance'` for new academic writes, makes historical noncanonical rows read-only, and performs no validation scan, rewrite, or backfill.

No exact production apply command is approved while item 6 is missing or item 2 identity mappings remain unverified.

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
