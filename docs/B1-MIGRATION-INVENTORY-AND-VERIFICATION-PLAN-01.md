# B1 Migration Inventory and Verification Plan 01

Pinned source tip for this inventory refresh: preflight-blockers remediation
over `origin/main` after PR #163 / PreflightReadonly-01.

Canonical SHA-256 values are computed over **git-blob / LF-normalized** bytes.
Do not hash a Windows CRLF working-tree checkout with `Get-FileHash` unless the
file is first normalized to LF. Preferred check:

```powershell
git cat-file blob <rev>:docs/migration-drafts/<file.sql> | python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())"
```

## Inventory and dependency order

0. **Deploy gate (not a SQL migration):** reviewed Release Candidate web/server
   artifact with five-service adapters still `runtimeAvailable: false`.
   - Stamp draft keeps `APPROVED_RELEASE_COMMIT_PLACEHOLDER` until a successful
     Deploy and the published SHA is read back. Never invent a SHA.
   - Current stamp draft SHA-256: `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357`.

1. `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` — **first SQL apply**
   - Current SHA-256: `3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab`.
   - Asserts both 6-arg and 7-arg `public.log_audit` overloads remain.
   - Remediates `cancel_official_document` to an explicit typed 7-arg call.
   - Must precede every draft that calls `log_audit` (attachments / transfer).

2. `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` — **first B1 runtime migration**
   - Current SHA-256: `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0`.
   - Adds the strict actor helpers and closed B1 step tuple contract.

3. `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql`
   - Current SHA-256: `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf`.
   - Preflight evidence: units/roles already present in production; re-apply still
     requires fresh identity verification. No staff/assignment mutation from source.

4. `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql`
   - Current SHA-256: `a92505d71ba6e02d29b4993d10da8ff8e2f91e5fa62549a6a7efe74c1dc8b58a`.
   - Installs fail-closed service persistence and atomic submit/action boundaries.

5. `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`
   - Current SHA-256: `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357`.
   - Apply only after Deploy succeeds and the published commit SHA replaces the
     placeholder. Services remain inactive.

6. `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql`
   - Current SHA-256: `da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b`.

7. `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`
   - Current SHA-256: `bf95bb4bf87e5a8feea2dbba90bf76e56eed4c7e51e093acb7217d1fa3114f20`.
   - Depends on log_audit remediation, actor hardening, workflow tables, and a
     separately approved private bucket/policy plan. Explicit typed 7-arg
     `log_audit` calls only.

8. Five-service executable drafts (source-complete; unapplied):
   - `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` — `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c`
   - `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` — `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205`
   - `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` — `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe`
   - `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` — `1a2bba070d81b072faf61fe87b62fb8fe114b3fe3611ecb45ba18173cebf9ee9`
     - Creates `file_withdrawal_details`. Missing table is **not** a source blocker;
       it is created by this migration when separately approved.
   - `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` — `d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284`
   - `FINAL-CHANCE-CANONICAL-WRITE-03.sql` — `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704`
   - `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` — `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495`
   - `REQUEST-B1-SERVICE-DETAILS-05A.sql` — `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c`

9. Free-service inactive workflows:
   - `B1-FREE-SERVICE-WORKFLOWS-08.sql` — `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c`

10. Paid-service inactive workflows:
   - `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` — `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250`

11. ACL cutover:
   - `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` — `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383`

12. Per-service activation / `student_visible` / Deploy-Publish: **SEPARATE APPROVAL**
    gates. Never bundled with schema migrations.

Never apply documentary/superseded files: `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql`,
`SUSPENSION-ABSENCE-SOURCE-01.sql`, `FILE-WITHDRAWAL-SOURCE-01.sql`, or the
protected enrollment-certificate notification correction.

No exact production apply command is approved while release evidence, department
head identity decisions, private bucket/policy approval, and explicit
per-migration authorization remain open.
`B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.

## Preflight for each single migration

- Pin main commit, migration bytes, SHA-256 (LF/git-blob), independent review PASS, and zero HIGH/CRITICAL findings.
- Apply exactly one migration per approved stage.
- Post-verify schema/ACL/RLS before the next row.
- Keep Deploy, Storage, and `student_visible` as independent gates.
