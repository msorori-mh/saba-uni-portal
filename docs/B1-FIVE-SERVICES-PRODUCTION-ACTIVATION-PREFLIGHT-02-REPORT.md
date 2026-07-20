# B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02

Date: 2026-07-20 (Asia/Riyadh)

Repository: `msorori-mh/saba-uni-portal`

Pinned source: `origin/main@427b7eb48f8771f31bd08a46fc4590cf883ab7e2`

Mode: production read-only preflight; no migration, SQL write, activation, visibility change, deploy, publish, account creation, or data mutation.

## Decision

`HOLD_B1_PRODUCTION_ACTIVATION_PREFLIGHT`

The source package and its ordered 18-draft manifest are internally consistent, but gate 1 fails: the exact deployed Git SHA is not exposed by the live application. Per the fail-closed ordered preflight, no production database query was attempted after that failure. The required PASS decision is therefore not issued.

## Evidence collected in this cycle

| Gate | Fresh result | Decision |
|---|---|---|
| Source base | local branch and `origin/main` both resolve to `427b7eb48f8771f31bd08a46fc4590cf883ab7e2` after `git fetch` | PASS |
| GitHub Web CI | commit has successful `Install · Lint · Typecheck · Build` check (completed 2026-07-19 22:35 UTC) | PASS_SOURCE_CI |
| Public endpoint | `https://quboolye.com` returned HTTP 200 at 2026-07-20 02:22 UTC; deployment id `3a653d607edaa05f6429044dcf08e8aaba41a28bcecaa493437b799aaccd2edb`; bundles `index-Dfj_gwgH.js` and `index-DsquXoc8.js` | PASS_ENDPOINT_LIVE |
| Exact deployed SHA | neither response headers/HTML nor the deployment id proves `427b7eb...`; release stamp draft still contains `APPROVED_RELEASE_COMMIT_PLACEHOLDER` | **HOLD_RELEASE_SHA_UNPROVEN** |
| Production DB gates | not started because the preceding release-SHA gate failed | NOT_RUN_FAIL_CLOSED |
| Draft manifest | all 18 LF/git-blob SHA-256 values recomputed from pinned HEAD and match the canonical pack exactly | PASS_SOURCE_HASHES |

The GitHub build check and a responding web endpoint prove neither that the exact commit is published nor that the endpoint artifact was built from that commit. This preflight deliberately makes no such inference.

## Required production snapshot: current status

Production reads were intentionally not started after gate 1 failed. The most recent repository evidence is `B1-FIVE-SERVICES-PRODUCTION-PREFLIGHT-READONLY-01-REPORT.md`, captured 2026-07-18 22:38 UTC. It is useful only as a stale baseline and **does not satisfy this cycle's verifier**:

| Required assertion | Last recorded baseline | Fresh verdict |
|---|---|---|
| five `student_visible` flags | all `false` | HOLD — must re-read |
| active workflows for five services | zero for every service | HOLD — must re-read |
| production requests for five services | zero | HOLD — must re-read |
| 18 migration state | earlier 17-order inventory was mostly not applied, processing domains applied, secure attachments partial; current manifest now has 18 orders | HOLD — official history/object fingerprints must be re-read |
| department-chair package | draft exists; baseline assignments: CS=0, IT=2, CIS=1, therefore not ready/canonical | HOLD — package application and assignments must be re-read; do not create or alter staff |
| attachment bucket/policies | baseline private bucket with six `sra_*` policies and three existing objects | HOLD — re-read bucket and policies; do not inspect or modify objects |
| protected requests/documents | baseline IDs/numbers and `USR-2026-000001/2` unchanged | HOLD — re-read exact rows/checksums |

No production request, document, attachment object, student, staff member, assignment, or audit row was read or changed in this cycle.

## Canonical 18-migration order and verified hashes

| # | Draft | SHA-256 |
|---:|---|---|
| 1 | `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` | `3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab` |
| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0` |
| 3 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` | `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf` |
| 4 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` | `a92505d71ba6e02d29b4993d10da8ff8e2f91e5fa62549a6a7efe74c1dc8b58a` |
| 5 | `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` | `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357` |
| 6 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` | `da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b` |
| 7 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `bf95bb4bf87e5a8feea2dbba90bf76e56eed4c7e51e093acb7217d1fa3114f20` |
| 8 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205` |
| 10 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe` |
| 11 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `1a2bba070d81b072faf61fe87b62fb8fe114b3fe3611ecb45ba18173cebf9ee9` |
| 12 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284` |
| 13 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704` |
| 14 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495` |
| 15 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c` |
| 16 | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c` |
| 17 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250` |
| 18 | `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` |

Order 5 remains intentionally non-applicable while its placeholder is present. Before any SQL begins, the exact deployed SHA must be independently proved. After orders 1–4 install the audited atomic caller prerequisites, that proven SHA may be substituted only in a reviewed, separately authorized order-5 promoted migration.

## Sequential apply plan (planning only)

For each order 1 through 18, use a distinct authorization and execute exactly one promoted migration:

1. Pin source SHA, promoted migration path, LF/git-blob SHA-256, production project ref, operator, and independent review with `CRITICAL=0 / HIGH=0 / MEDIUM=0`.
2. Capture fresh read-only before-state: official migration history, relevant object definitions/owners/ACL/RLS, five visibility values, active workflow counts, B1 request/detail/event/attachment counts, department assignments, bucket/policies, and protected-row/document checksums.
3. Dry-run and prove the mutation set contains exactly the one authorized migration and excludes protected records, history repair, backfill, activation, visibility, deploy, and publish.
4. Apply once by the separately authorized operator. On any error or partial state, stop and preserve evidence; do not reset, repair, delete, or continue.
5. Run that order's verifier plus a complete before/after invariant comparison. Require no unexpected delta and `CRITICAL=0 / HIGH=0 / MEDIUM=0`.
6. Only after PASS may the next order receive its own authorization.

All five services stay hidden and all workflows inactive throughout orders 1–18. Existing attachment objects are never touched. Deploy/publish, Storage policy mutation, workflow activation, and `student_visible` are independent approvals.

## First activation: `enrollment_suspension`

This starts only after all 18 migrations and their verifiers pass:

1. **Apply complete:** confirm the exact reviewed runtime is deployed; all 18 schema orders passed; all five services remain hidden/inactive; protected checksums unchanged.
2. **Verify:** validate the suspension detail schema/validators/atomic dispatcher, its three free-service steps, no payment data, private attachment invariants, and zero pre-existing suspension requests.
3. **Workflow activation (separate authorization):** activate only the reviewed `enrollment_suspension` workflow version. Re-read that the other four have zero active workflows and all five remain `student_visible=false`.
4. **Direct RPC authorization matrix:** invoke RPCs directly in an approved safe test context. For every step, ALLOW only the exact direct assignee with matching `processing_unit` and `processing_role`; DENY anonymous, student, unassigned same-role user, wrong unit, wrong role, admin, registrar/dean bypass, and non-assignee. Every DENY must prove zero request-step/event/detail/notification mutation. Do not create production identities or assignments.
5. **Visibility (separate authorization):** only after the full positive/negative matrix passes, set `student_visible=true` for `enrollment_suspension` alone. Re-read all four other flags as false.
6. **Authenticated E2E:** use only an explicitly approved non-real safe identity/environment. Cover eligibility, create/submit, direct assignment, each transition, final registrar apply, document behavior, and no payment artifacts; compare protected baselines afterward. Production E2E on a real user is forbidden.

Any failed gate returns the service to HOLD without attempting rollback SQL or advancing another service.

## Assumptions, risks, blockers, and production impact

- Assumption: `quboolye.com` is the intended public endpoint and `wpmicqriltrowwonknox` remains the intended production Supabase ref, based on repository records; neither assumption authorizes a write.
- Risk: a responding endpoint with a deployment id can mask source drift; exact artifact provenance remains mandatory.
- Risk: the 2026-07-18 database snapshot may have drifted. It must not be reused as current evidence.
- Sole current blocker to continuing the production preflight: independently verifiable evidence that the deployed artifact is exactly `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`. Once proved, the remaining production reads become the next ordered checks, not pre-existing independent blockers.
- Production impact: **zero**. No production database or Storage query was attempted after the release-evidence gate failed, and no write, migration, activation, visibility change, deploy, publish, or production E2E occurred.

## Exit criteria

First prove the exact deployed SHA is `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`. Then run the fresh read-only production checks in this report and require every invariant to pass. At that point, and only then, the eligible decision is:

`PASS_B1_PRODUCTION_ACTIVATION_PREFLIGHT_READY_FOR_SEQUENTIAL_APPLY_AUTHORIZATION`
