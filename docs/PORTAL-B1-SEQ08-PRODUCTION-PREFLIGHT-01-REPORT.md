# PORTAL-B1-SEQ08-PRODUCTION-PREFLIGHT-01

## Decision

| Gate | Decision |
|---|---|
| SEQ08 identity + SHA pin | **PASS** |
| SEQ08 static SQL review | **PASS** |
| SEQ08 local PG17 (after local SEQ07 only) | **PASS_B1_SEQ08_LOCAL_PG17** |
| SEQ08 Production readiness | **HOLD_B1_SEQ08_MISSING_PRODUCTION_PREDECESSOR_SEQ07** |
| SEQ08 apply approval | **not issued** |

Root cause: Production SEQ07 apply is **HOLD**  
(`HOLD_B1_SEQ07_APPLY_TOOL_REJECTS_STORAGE_BUCKETS_INSERT_IN_UNMODIFIED_MIGRATION`).  
History tip remains `20260725002136`; `student_request_attachment_uploads` absent.

```
ONE MIGRATION ONLY = SEQ08   (package documentation)
THIS PHASE FORBIDS APPLY OF SEQ08
FORBIDDEN ALSO: SEQ09→24 · Gate 25 · Deploy · activation · student_visible
```

**No SEQ08 applied. No Production DDL/DML from this prep.**

---

## G0 — Source pins

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Production | `wpmicqriltrowwonknox` |
| `origin/main` | `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` |
| PROMOTION-MAP order | **8** |
| Manifest | `B1-TRUSTED-REFERENCE-VALIDATORS-08` / `sequence_order` **9** / predecessor **SEQ07** |
| Promoted migration | `supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql` |
| LF SHA-256 | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-POST-VERIFIER.sql` |
| Mode | READ-ONLY / PREPARATION-ONLY |

---

## G1 — What SEQ08 installs

| Item | Detail |
|---|---|
| Goal | Shared trusted-reference validators; no dispatcher; no service activation |
| Functions | `assert_b1_academic_period_reference(uuid,uuid)`, `assert_b1_active_course_enrollment(uuid,uuid)`, `assert_b1_target_program_department(uuid,uuid)` |
| Grants | **REVOKE ALL** from PUBLIC, anon, authenticated (no EXECUTE grant — inert until later callers) |
| Storage impact | **none** (no `storage.buckets` / objects writes) |
| Data mutation | **none** |
| Transaction | `BEGIN` … `COMMIT` |

### Static review

| Requirement | Result |
|---|---|
| Forward-only / no reset/delete/cleanup | PASS |
| No `student_visible` / activation | PASS |
| No anon grants | PASS |
| No broad admin bypass | PASS |
| SECURITY DEFINER + `search_path=public` | PASS (note: no `pg_temp` suffix; accepted as promoted shape) |
| Tool risk vs SEQ07 | **Lower** — pure function DDL + REVOKE; no `storage.buckets` INSERT |

---

## G2 — Dependency gate (Production)

| Dependency | Required by | Production state |
|---|---|---|
| SEQ07 secure attachments applied | sequential predecessor (manifest + PROMOTION-MAP) | **NOT APPLIED** (apply-tool HOLD) |
| `semesters`, `academic_years`, `student_enrollments`, `programs` | official SEQ08 preflight | expected present (SEQ07 G4/exec pre-check listed related catalog; not re-probed this phase for SEQ08-only RO) |
| `course_sections`, `course_offerings`, `departments` | function bodies / manifest external deps | expected present; official preflight SQL does not assert them |

**Content note:** SEQ08 SQL does not reference `student_request_attachment_uploads`. Sequential protocol still forbids skipping SEQ07.

---

## G3 — Local PG17 (SEQ08 alone after local SEQ07)

Harness: `tests/b1-seq08-validators/run-harness.ps1` · PG **17.10**

| Step | Result |
|---|---|
| Baseline + local SEQ07 | PASS |
| SEQ08 preflight | PASS (4/4) |
| Apply SEQ08 only | PASS |
| SEQ08 post-verifier | PASS (4/4) |
| SEQ09 in same session | **not executed** |

`PASS_B1_SEQ08_LOCAL_PG17`

---

## G4 — Production RO for SEQ08

**Not opened as apply-ready.** Predecessor SEQ07 absent on Production.

When SEQ07 later applies cleanly, run Lovable prompt:  
`docs/PORTAL-B1-SEQ08-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md`

Until then: **HOLD_B1_SEQ08_MISSING_PRODUCTION_PREDECESSOR_SEQ07**.

Accepted from SEQ07 apply-exec post-state (no SEQ08 objects expected yet):

| Check | State |
|---|---|
| History tip | `20260725002136` |
| SEQ08 version `20260725110100` | not registered (implied by SEQ07–24 absent) |
| SEQ08 assert_* functions | absent (implied; SEQ07 post-attempt inventory covered SEQ07 objects; SEQ08 not created) |
| Five services / protected digests | unchanged per apply-exec report |

---

## G5 — SEQ08 apply package (**DOCUMENTATION ONLY — DO NOT EXECUTE**)

```
ONE MIGRATION ONLY = SEQ08
DO NOT EXECUTE IN THIS PHASE
Prerequisite: SEQ07 applied + post-verified on Production
```

| Field | Value |
|---|---|
| Exact filename | `20260725110100_b1_08_trusted_reference_validators_05a.sql` |
| Exact LF SHA-256 | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` |

### Pre-apply (future)

1. SEQ07 Production post-verifier green; history contains `20260725110000`  
2. SEQ08 Lovable RO G4 PASS  
3. Official `08-…-PREFLIGHT.sql` (ROLLBACK)  
4. SHA pin reconfirm  
5. Five services still hidden; protected digests stable  

### Apply command shape (not executed)

```powershell
# DOCUMENTATION ONLY — forbidden in this phase
$migrationPath = 'supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql'
$expectedSha  = 'e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2'
# single-file apply after SHA gate; never batch SEQ09+
```

### Post-apply (future)

1. `08-…-POST-VERIFIER.sql`  
2. Protected-record recheck  
3. History tip = `20260725110100` with no SEQ09+  
4. Stop on any ERROR / PARTIAL  

### Forward-only remediation

Replace functions via a **new** reviewed migration only. No down migration. No DELETE of production data.

---

## Stop conditions (this phase)

- Any attempt to apply SEQ08 while SEQ07 absent → **STOP**  
- Any SEQ09+ / Gate 25 / activation / Deploy → **STOP**  
- SEQ07 apply still tool-blocked → keep SEQ08 HOLD  

---

## Assumptions / risks / obstacles

| Item | Note |
|---|---|
| Assumption | SEQ07 apply-exec evidence is truthful (pre-execution reject; zero catalog drift) |
| Risk | Official SEQ08 preflight omits `course_sections` / `course_offerings` / `departments` asserts — recommend operator catalog spot-check before future apply |
| Obstacle | Production SEQ07 channel blocked on `storage.buckets` INSERT |

## Production impact

**Zero.**

## Files

| Path | Role |
|---|---|
| `docs/PORTAL-B1-SEQ08-PRODUCTION-PREFLIGHT-01-REPORT.md` | This report |
| `docs/PORTAL-B1-SEQ08-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md` | Future RO prompt |
| `docs/PORTAL-B1-SEQ07-PRODUCTION-APPLY-EXEC-01-INDEPENDENT-VERIFICATION.md` | SEQ07 apply HOLD verification |
| `tests/b1-seq08-validators/run-harness.ps1` | Local SEQ08 harness |

## Final codes

```
HOLD_B1_SEQ07_APPLY_TOOL_REJECTS_STORAGE_BUCKETS_INSERT_IN_UNMODIFIED_MIGRATION
HOLD_B1_SEQ08_MISSING_PRODUCTION_PREDECESSOR_SEQ07
# READY_FOR_SEPARATE_SEQ08_APPLY_APPROVAL — NOT ISSUED
# PASS_B1_SEQ08_PRODUCTION_PREFLIGHT — NOT ISSUED
```
