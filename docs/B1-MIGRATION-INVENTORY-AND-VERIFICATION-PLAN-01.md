# B1 Migration Inventory and Verification Plan 01

Pinned source tip for this inventory refresh: `origin/main` at the promotion
branch base plus the controlled-promotion drafts below.

Canonical SHA-256 values are computed over **git-blob / LF-normalized** bytes.
Do not hash a Windows CRLF working-tree checkout with `Get-FileHash` unless the
file is first normalized to LF. Preferred check:

```powershell
git cat-file blob <rev>:docs/migration-drafts/<file.sql> | python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())"
```

## Inventory and dependency order

1. Runtime release containing the reviewed atomic caller (web/server artifact).
   - Evidence: deploy SHA recorded by `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`.
   - Current SHA-256 (stamp draft, placeholder locked): `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357`.
   - Gate: replace `APPROVED_RELEASE_COMMIT_PLACEHOLDER` with the exact 40-char lowercase deploy SHA before promotion. Services remain inactive.
2. `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql`
   - Current SHA-256: `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0`.
   - Adds the strict actor helpers and closed B1 step tuple contract.
3. `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql`
   - Current SHA-256: `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf`.
   - Blocked for apply: embedded staff/faculty IDs require fresh read-only identity and department verification; no mapping may be inferred.
4. `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql`
   - Current SHA-256: `769e8af5c3a34bc81c793fb4a36bcebf80a3a522c15ca6868f66b48d65d9e277`.
   - Installs fail-closed service persistence, exact direct-assignment workflow initialization, atomic submit/action boundaries, legacy B1 mutation guards, strict resubmit coverage, and closed action outcomes.
5. `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql`
   - Current SHA-256: `da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b`.
   - Vocabulary and specialized finance RPC only; no financial ledger fields.
6. `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`
   - Current SHA-256: `8487c5ae0ac8b85965de9dd08dafb934550a16e1450b0bedf4f847c5ef17849c`.
   - Depends on actor hardening, workflow tables, `log_audit`, submission boundary, storage schema, and separately approved private bucket/policy creation.
7. Five-service executable drafts (source-complete; unapplied):
   - `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` — `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c`
   - `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` — `c73b359baf55f1d9ac28aa588d4c2c1d13c63c2a6036184203e8ba4a1847fb27`
   - `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` — `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe`
   - `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` — `e75dd442ac226529a88f8aaee72ecd55971886b841583cf5b7d35af38326089a`
   - `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` — `ba163a3f2bc5115a22373e324d199817d58796284bb3ca0d095abc6bf12783a8`
   - `FINAL-CHANCE-CANONICAL-WRITE-03.sql` — `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704`
   - `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` — `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495`
   - `REQUEST-B1-SERVICE-DETAILS-05A.sql` — `82bab7a52b44dde51c71c12acbdfd3445d08d2d4c24176c66a0b0cc39f99118c`
8. Free-service inactive workflows:
   - `B1-FREE-SERVICE-WORKFLOWS-08.sql` — `6ae62b5346a21d10a43c88738477f1ecffe57826948d85c9854689debdc4f6f6`
   - Covers `enrollment_suspension` (3 steps), `excused_absence` (3 steps), `file_withdrawal` (7 steps). No payment steps.
9. Paid-service inactive workflows:
   - `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` — `f63ff4f526a5dea6b8896586375eaf01ec07433001c857f270f0f1ce155aa444`
   - Covers `department_transfer` and `final_chance` only.
10. ACL cutover:
    - `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` — `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383`
    - Requires the order-1 release stamp comment, proves absence/withdrawal RPC-write boundaries, invokes the three-table legacy cutover primitive once, and post-verifies all five detail tables.

Never apply documentary/superseded files: `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql`, `SUSPENSION-ABSENCE-SOURCE-01.sql`, `FILE-WITHDRAWAL-SOURCE-01.sql`, or the protected enrollment-certificate notification correction.

No exact production apply command is approved while release evidence, processing-domain identity verification, private bucket/policy approval, and explicit per-migration authorization remain open.

## Preflight for each single migration

- Pin main commit, migration bytes, SHA-256 (LF/git-blob), independent review PASS, and zero HIGH/CRITICAL findings.
- Verify migration history absence, target schema signatures, owners, ACLs, constraints, and dependencies.
- Snapshot `student_visible`, workflow versions, active request counts, storage objects/policies, and audit/event counts.
- Verify each referenced staff/faculty identity is active, user-linked, and correctly department-scoped without modifying it.
- Verify exactly one direct assignee for every B1 runtime step and separate source/target department heads.
- Prove the protected request IDs and preserved request/user are outside every mutation set; forbid historical notification backfill.
- Reject any fee type, amount, currency, invoice, gateway, balance, DROP, DELETE, TRUNCATE, reset, or cleanup operation.

## Sequential application protocol

For one migration only: preflight → exact apply → schema verification → authorization matrix → invariants → evidence capture. Do not start the next migration until every check passes. On failure or partial apply, stop only the migration chain, retain logs and database evidence, and do not reset or clean up.

Promotion order for the five services after schema/runtime migrations:

1. `enrollment_suspension`
2. `excused_absence`
3. `file_withdrawal`
4. `department_transfer`
5. `final_chance`

Per service after its schema prerequisites: workflow activation → RPC matrix → E2E → `student_visible` (separate approval) → Deploy/Publish (separate approval) → smoke → next service.

## Post-verification

- Recheck objects, function definitions, `SECURITY DEFINER` search paths, grants/revokes, constraints, and migration history.
- Run every B1 step ALLOW/DENY case directly through RPC with approved synthetic users only.
- Prove failed authorization creates no workflow, transition, event, detail, attachment access, or payment confirmation mutation.
- Verify department isolation, attachment direct-assignee-only download, payment negative no-advance, and payment positive exactly-one transition/audit.
- Verify free services bypass payment entirely and paid services store no financial ledger data.
- Verify `final_chance` new writes only, historical read compatibility, no backfill, and unchanged protected entities.
- Verify `enrollment_certificate` behavior is unchanged.
- Verify `student_visible` remains unchanged until its separate per-service activation gate is approved.
