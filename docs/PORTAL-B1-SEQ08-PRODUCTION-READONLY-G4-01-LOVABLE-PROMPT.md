# PORTAL-B1-SEQ08-PRODUCTION-READONLY-G4-01

## Mode

**SELECT / catalog only.**  
Forbidden: DDL, DML, write RPCs, migration apply, history repair, Deploy/Publish, activation, `student_visible` changes, **SEQ08 apply**.

Target: Supabase Production `wpmicqriltrowwonknox` (PostgreSQL 17).

## Binding identity

| Field | Value |
|---|---|
| Sequence | **SEQ08 only** (PROMOTION-MAP `order` 8) |
| Promoted migration | `supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql` |
| LF SHA-256 | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` |
| Predecessor | SEQ07 `20260725110000_b1_07_secure_attachments_source_01.sql` must already be **applied** |

Do **not** inspect-apply SEQ09→SEQ24 in this prompt.

## Required checks

### A — Predecessor SEQ07 applied

1. History contains `20260725110000`.  
2. `public.student_request_attachment_uploads` present.  
3. Bucket `student-request-secure-attachments` exists with `public=false`.  
If any fail → `DECISION=FAIL_SEQ08_PROD_RO:MISSING_SEQ07_PREDECESSOR`.

### B — SEQ08 not yet applied / no partial

1. History lacks `20260725110100`.  
2. These functions **ABSENT** (or document unexpected presence):
   - `assert_b1_academic_period_reference(uuid,uuid)`
   - `assert_b1_active_course_enrollment(uuid,uuid)`
   - `assert_b1_target_program_department(uuid,uuid)`

### C — External tables for SEQ08 bodies

Present: `semesters`, `academic_years`, `student_enrollments`, `course_sections`, `course_offerings`, `programs`, `departments`.

### D — Five services + protected records

Same matrix as SEQ07 G4 (hidden; requests=0; five protected digests).

### E — Non-write attestation

Confirm SELECT/catalog only.

## Output

Markdown `PORTAL-B1-SEQ08-PRODUCTION-READONLY-G4-01-RESULT` ending with  
`DECISION=PASS_SEQ08_PROD_RO` or `DECISION=FAIL_SEQ08_PROD_RO:<reason>`.
