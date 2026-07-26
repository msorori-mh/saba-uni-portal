# PORTAL-B1-SEQ07-B Lovable Execution Package (DOCUMENTATION ONLY)

**Not authorized by the preflight track.** Requires: (1) source merge of SEQ07-B package, (2) CI green, (3) fresh Production RO, (4) separate human apply approval for B0 then B1.

## Binding identities

| Stage | Identity |
|---|---|
| Original SEQ07 (do **not** apply on Lovable) | `20260725110000_b1_07_secure_attachments_source_01.sql` · SHA `66ba4c96…` |
| SEQ07-B SQL | `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` · SHA `a49d615b…` |

## B0 — Storage tool

Create bucket:

- id/name: `student-request-secure-attachments`
- `public=false`
- `file_size_limit=5242880`
- mime: `application/pdf`, `image/jpeg`, `image/png`
- no public URL; no broad policies

## B1 — Single migration

1. Preflight: `07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-PREFLIGHT.sql` (ROLLBACK)  
2. Apply **only** `20260725110050_b1_07b_secure_attachments_sql_only_01.sql`  
3. History must gain **exactly** `20260725110050`; `20260725110000` must stay absent  
4. Post-verifier: `07B-…-POST-VERIFIER.sql`  
5. Protected records + five services still hidden  
6. **STOP** — no SEQ08+

## Forbidden

`--include-all`, seed, repair, manual history writes, applying original SEQ07, SEQ08+, Gate 25, activation, `student_visible`, Deploy/Publish, reset/cleanup/delete.
