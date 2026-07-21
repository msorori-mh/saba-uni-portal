# LEARNING-MATERIALS-SECURE-ACTIVATION-01 — PostgreSQL 17 Verification Result

**Status: PASS** (executed, not just authored)
**Server:** PostgreSQL 17.10 (disposable embedded cluster, no shared infrastructure)
**Date:** 2026-07-21
**Subject:** `docs/drafts/20260721000000_materials_secure_activation.draft.sql` (FORWARD DRAFT ONLY — never applied from this PR)

## Execution

```bash
npm install embedded-postgres@17 pg   # local prereq, not a repo dependency
node tests/materials/run-postgres-verifier.mjs
```

Pipeline (single run, exit 0):

1. `tests/materials/postgres-minimal-schema.sql` — prerequisite portal tables +
   base materials tables verbatim from the design-only
   `docs/migrations-design/20260714000000_course_materials_mvp.sql`, plus
   supabase-style roles (`anon`/`authenticated`/`service_role`) and an
   `auth.uid()` shim driven by a test GUC.
2. The draft under test (applied verbatim to the disposable cluster).
3. `tests/materials/postgres-secure-activation-verifier.sql` — 37 check groups;
   every group raises `CHECK FAILED: <n>` on the first broken invariant; the
   script ends with `ROLLBACK` so nothing persists.

Observed output:

```
postgres 17.10
applied: postgres-minimal-schema.sql
applied: 20260721000000_materials_secure_activation.draft.sql
applied: postgres-secure-activation-verifier.sql
VERIFIER PASS
```

## Coverage summary

| Area | Checks | Result |
| --- | --- | --- |
| week_number linkage (1..20, nullable) | 01 | PASS |
| scan_state default/check constraint | 02 | PASS |
| events vocabulary + `file_scanned` | 03 | PASS |
| narrow-only policy settings seeds | 04 | PASS |
| reserve RPC: happy path, idempotent replay, version allocation | 05, 06, 08 | PASS |
| reserve RPC: key reuse, anon, non-owner, mime/size/ext/missing-size, archived, non-current section | 07, 09–16 | PASS |
| finalize RPC: happy path, replay, cross-phase key reuse, tamper mismatch, non-owner, anon | 17, 18, 18b, 19–21 | PASS |
| scanner RPC: authenticated ACL denial, invalid state, clean transition + audit, terminal immutability | 22–25 | PASS |
| download audit: enrolled student, pending file (student + owner), not-enrolled, study-system, draft, target binding, anon | 26–33 | PASS |
| security metadata (definer + `search_path=public, pg_temp`) on all four functions | 34 | PASS |
| execute ACLs: cutover RPCs authenticated-only; scanner service_role-only | 35, 36 | PASS |

## Notes

- The three cutover RPCs (`faculty_reserve_course_material_upload(uuid,uuid,jsonb)`,
  `faculty_finalize_course_material_upload(uuid,uuid,jsonb)`,
  `record_course_material_download(uuid,uuid)`) satisfy the metadata + ACL
  expectations that `apply_materials_rpc_only_dml_cutover` enforces
  (definer, pinned search_path, authenticated-only EXECUTE). Their reviewed
  definition SHA-256 hashes must be computed from `pg_get_functiondef` after
  applying to the review clone, and supplied to the cutover procedure out of band.
- SQL cannot observe storage objects; the object write between reserve and
  finalize remains a service-role runtime concern (same boundary documented by
  the atomic draft). No bucket or storage-policy change is part of this task.
