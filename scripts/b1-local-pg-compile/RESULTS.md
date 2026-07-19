# B1 local PostgreSQL 17 compile harness results

Local-only Docker harness; no production Supabase connection, credentials, deployment, or student-visible mutation was used.

Harness note: release stamp is applied after atomic SQL install so COMMENT survives CREATE OR REPLACE; real draft placeholder fail-closed is still proved first.

Order-1 real-draft fail-closed proof: psql:/tmp/stamp-real.sql:28: ERROR:  B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED
CONTEXT:  PL/pgSQL function inline_code_block line 13 at RAISE

| File | Compile | Idempotency | ACL/RLS | Writes | Error |
|---|---|---|---|---|---|
| REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | PASS | PASS | SKIP | SKIP |  |
| STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | PASS | PASS | SKIP | SKIP |  |
| REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | PASS | PASS | SKIP | SKIP |  |
| REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | PASS | PASS | SKIP | SKIP |  |
| REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | PASS | PASS | SKIP | SKIP |  |
| EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | PASS | PASS | SKIP | SKIP |  |
| STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | PASS | PASS | PASS | SKIP | BEGIN INSERT 0 1 psql:/tmp/repeat-6.sql:26: ERROR:  relation "student_request_attachment_uploads" already exists |
| REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | PASS | PASS | SKIP | SKIP |  |
| REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | PASS | PASS | SKIP | SKIP | BEGIN DO CREATE FUNCTION REVOKE psql:/tmp/repeat-8.sql:93: ERROR:  CANONICAL_ABSENCE_REASON_TRIGGER_MISMATCH CONTEXT:  PL/pgSQL function inline_code_block line 25 at RAISE |
| REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | PASS | PASS | PASS | SKIP |  |
| REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | PASS | PASS | PASS | SKIP |  |
| REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | PASS | PASS | SKIP | SKIP |  |
| FINAL-CHANCE-CANONICAL-WRITE-03.sql | PASS | PASS | PASS | PASS |  |
| REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | PASS | PASS | PASS | SKIP |  |
| REQUEST-B1-SERVICE-DETAILS-05A.sql | PASS | PASS | PASS | SKIP |  |
| B1-FREE-SERVICE-WORKFLOWS-08.sql | PASS | PASS | SKIP | SKIP |  |
| EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | PASS | PASS | SKIP | SKIP |  |
| REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | PASS | PASS | PASS | SKIP |  |

Overall: PASS_LOCAL_PG17_COMPILE
