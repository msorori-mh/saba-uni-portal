# PORTAL-GP-PRODUCTION-APPLY-AND-E2E-HANDOFF-04

**Mission:** `PORTAL-GP-PRODUCTION-GO-LIVE-HANDOFF-AND-E2E-PREFLIGHT-04`  
**PR:** `#340` · Branch: `feat/gp-final-closure-20260811`  
**Source HEAD:** `a56acc4a7d2e2732697aabdc3574a4edc8299186`  
**origin/main:** `140ca4ab3462e3d2a6a19551e6d5fa19d29d1cde` (= merge-base; **no merge required**)  
**Production project:** Lovable `90f4dcde-07fb-4441-b86a-6ad5510833b8` / Supabase `wpmicqriltrowwonknox`  
**Mode:** SOURCE + LOCAL PG17 + PRODUCTION **READ-ONLY** preflight only  
**Controls for this packet authoring:** `PRODUCTION_WRITE=0` · `PRODUCTION_RPC_MUTATIONS=0` · `MIGRATION_APPLY=0` · `MERGE=NO` · `DEPLOY=NO`

---

## A. Exact production starting assumptions

Verified **2026-08-11** via Lovable MCP `query_database` (SELECT/catalog only):

| Assumption | Evidence |
|---|---|
| SET U complete (U1–U4) | Ledger versions `20260806235348`, `20260807000230`, `20260807001114`, `20260807023229` present; count=4 |
| SET N absent | No ledger rows for `20260806120000` / `…20100` / `…20200` / `20260807003000` |
| **L4 eligibility guard APPLIED** | Ledger `20260808010000` / `gp_student_level4_only_eligibility_guard_01`; functions `student_is_current_fourth_academic_level(uuid)` + require helpers present; body uses `dense_rank` |
| Identity / revision-notes **NOT** applied | No `20260811010000`; `conclude_graduation_project_result` is **4-arg only** (no `p_notes`) |
| Remediation-02 **NOT** applied | No `20260811020000`; `gp_current_revision_final_ready` absent; `evaluation_round` columns absent |
| Foundation objects | `graduation_projects`, create-team, upload intent, upload predicate present |
| Storage | Bucket `graduation-projects` exists, `public=false`; INSERT policy `with_check` binds `can_upload_graduation_project_object(name)` |
| Academic config | `academic_levels.level_number=4` present (1 row); 3 departments; 7 programs |
| Population | Unique current L4 students ≈ **59**; L1–L3 ≈ **789**; ambiguous=0 |
| Existing GP rows | 4 projects (3 archived + 1 rejected) — all tied to **banned** TEST_ONLY actors |
| GP coordinator row | Sole `graduation_project_department_coordinators` row → banned `gp-e2e01-coordinator@…` |
| Hash contract | `SHA256_LF_NORMALIZED_V1` (LF-normalized; do **not** use Windows native file hash as STOP) |

**Stale prior reports** that said “L4 NOT_APPLIED” are superseded by this preflight.

**Do not apply:** SET N evidence files under `docs/migration-evidence/graduation-projects/duplicate-predecessor-set/`.  
**Do not rewrite:** any already-applied SET U / L4 migration files.

---

## B. Migration apply order (deterministic, one-at-a-time)

| Step | File | Classification | Depends on |
|---|---|---|---|
| — | SET U U1–U4 | `ALREADY_APPLIED_PRODUCTION` | — |
| — | `20260808010000_gp_student_level4_only_eligibility_guard_01.sql` | `ALREADY_APPLIED_PRODUCTION` | SET U |
| **1** | `20260811010000_gp_identity_options_and_revision_notes_01.sql` | `PENDING_REQUIRED_GP` | L4 applied |
| **2** | `20260811020000_gp_independent_security_audit_remediation_02.sql` | `PENDING_REQUIRED_GP` | Step 1 (identity/notes + L4) |
| — | Councils / GA / other `20260808+` ledger rows | `NOT_REQUIRED_FOR_GP` (already present; do not re-apply) | — |
| — | SET N duplicates | `DO_NOT_APPLY` | — |

No shared pending dependency beyond L4 (already applied). No batch apply.

### Pending migration inventory detail

#### STEP 1 — Identity options + revision notes

- **Filename:** `supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql`
- **SHA256_LF FULL:** `1af08a71e9533a7e59aea8c7374189541bf539575634aade3772063fbb0395ab`
- **SHA256_LF BODY (from `begin;`):** `0333c25c9cf7f770bc0d6af25c8b81e7c41abcc5747d66573cfe0fb6d44e5357`
- **Purpose:** Persist optional `p_notes` on conclude; require notes for `revisions_required`; expose `revisions_notes`, `identity_options`, `committee_count` via `get_graduation_project_detail`
- **Dependency:** `student_is_current_fourth_academic_level(uuid)` must exist (PASS now)
- **Objects:** replaces `conclude_graduation_project_result` (drop 4-arg / 5-arg then create 5-arg with default null notes); replaces `get_graduation_project_detail(uuid)`
- **Tables:** reads `graduation_projects`, assignments, events, discussions, evaluations, profiles — no new tables
- **RLS:** no policy changes
- **Forward-only:** YES (function body replace)
- **Local PG17:** PASS (package-d / revisions / remediation harnesses)
- **Post-apply expect:** `conclude_…(uuid,text,bigint,uuid,text)` present; 4-arg absent; detail JSON keys `identity_options`, `revisions_notes`, `defense.committee_count`

#### STEP 2 — Independent security audit remediation 02

- **Filename:** `supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql`
- **SHA256_LF FULL:** `cb9efc4917cc21ddffa83ce158b05d97dc70e8154c5109e17c08682c74ac48f6`
- **SHA256_LF BODY (from `begin;`):** `4267361c4efdec2bc55149e81ba1cd8202408aad26d3b0c6d4f66cc32dbc83ef`
- **Purpose:** H-01 evaluation rounds; M-01 program/dept scoping on create_team; H-03 identity_options scope; M-02 committee_count; M-03 archive projection; L-01 leader parity; stale-eval negative; revisions re-eval readiness
- **Dependency:** Step 1 conclude 5-arg + L4 + foundation
- **Objects/columns:** `graduation_projects.evaluation_round`; `graduation_project_evaluations.evaluation_round` + unique `(discussion_id, panel_member_id, evaluation_round)`; helper `gp_current_revision_final_ready(uuid)`; replaces `create_graduation_project_team`, `submit_graduation_project_evaluation`, `conclude_graduation_project_result`, `get_graduation_project_detail`
- **Tables affected:** `graduation_projects`, `graduation_project_evaluations`; defensive `ADD COLUMN IF NOT EXISTS` on `programs` / profile tables (production already has columns)
- **RLS:** no policy changes
- **Forward-only:** YES (explicit R7: do not rewrite SET U / L4 / identity files)
- **Includes data touch on apply:** `UPDATE … SET status='active' WHERE status IS NULL` on student/faculty profiles (null-status backfill only)
- **Local PG17:** PASS (`gp-independent-security-audit-remediation-02.test.ts` disposable harness)
- **Post-apply expect:** `evaluation_round` columns; round unique constraint; `gp_current_revision_final_ready`; conclude still 5-arg; detail includes `archive` + scoped `identity_options`

#### Already applied L4 (do not re-apply)

- **Filename:** `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
- **SHA256_LF BODY:** `9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3` (matches pinned draft BODY)
- **Classification:** `ALREADY_APPLIED_PRODUCTION`
- If re-applied: migration **self-STOP** via `GP_STUDENT_L4_GUARD_PREDICATE_EXISTS`

---

## C. Precheck (each migration) — READ-ONLY SQL

### STEP 1 precheck (`PRECHECK_SQL_READ_ONLY`)

```sql
-- Expect: all true / matching before apply of 20260811010000
select
  to_regclass('public.graduation_projects') is not null as has_gp,
  to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is not null as has_l4,
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid)') is not null as conclude_4arg,
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid,text)') is not null as conclude_5arg,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260811010000') as already_applied;
-- STOP if has_gp/has_l4 false, conclude_4arg false, conclude_5arg true, or already_applied true
```

### STEP 2 precheck

```sql
select
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid,text)') is not null as conclude_5arg,
  to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is not null as create_team,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='graduation_projects' and column_name='evaluation_round') as has_eval_round,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260811020000') as already_applied;
-- STOP unless conclude_5arg=true, create_team=true, has_eval_round=false, already_applied=false
```

---

## D. Apply command / action required from Lovable

**Rules:** single migration per approval · no batch · no concurrent applies · no force · no SET N · no rewrite of applied SQL.

1. Maintenance advisory (brief function catalog lock only).
2. Run STEP 1 precheck → must PASS.
3. Apply **only** `supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql` (Lovable Cloud migration apply / authorized SQL runner).
4. Run STEP 1 postcheck → must PASS.
5. Run STEP 2 precheck → must PASS.
6. Apply **only** `supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql`.
7. Run STEP 2 postcheck → must PASS.
8. **STOP** before any Production E2E writes until Actor Matrix gate clears (Section G).

Hash verify before each apply:

```bash
python scripts/sha256_lf_normalized_v1.py supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql --body
# BODY_SHA256_LF=0333c25c9cf7f770bc0d6af25c8b81e7c41abcc5747d66573cfe0fb6d44e5357

python scripts/sha256_lf_normalized_v1.py supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql --body
# BODY_SHA256_LF=4267361c4efdec2bc55149e81ba1cd8202408aad26d3b0c6d4f66cc32dbc83ef
```

---

## E. Postcheck (each migration) — READ-ONLY SQL

### STEP 1 postcheck

```sql
select
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid)') is null as old_4arg_gone,
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid,text)') is not null as conclude_5arg,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260811010000') as ledger_row,
  position('identity_options' in pg_get_functiondef('public.get_graduation_project_detail(uuid)'::regprocedure)) > 0 as detail_has_identity,
  position('revisions_notes' in pg_get_functiondef('public.get_graduation_project_detail(uuid)'::regprocedure)) > 0 as detail_has_notes;
-- EXPECTED: old_4arg_gone=true, conclude_5arg=true, ledger_row=true, both detail flags true
-- EXPECTED_OBJECTS: conclude_5arg, get_graduation_project_detail with identity_options/revisions_notes
-- EXPECTED_COUNTS: +1 schema_migrations row for 20260811010000
```

### STEP 2 postcheck

```sql
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='graduation_projects' and column_name='evaluation_round') as gp_round,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='graduation_project_evaluations' and column_name='evaluation_round') as eval_round,
  exists(select 1 from pg_constraint where conname='graduation_project_evaluations_discussion_panel_round_key') as round_unique,
  to_regprocedure('public.gp_current_revision_final_ready(uuid)') is not null as rev_ready,
  to_regprocedure('public.conclude_graduation_project_result(uuid,text,bigint,uuid,text)') is not null as conclude_5arg,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260811020000') as ledger_row,
  position('archive' in pg_get_functiondef('public.get_graduation_project_detail(uuid)'::regprocedure)) > 0 as detail_has_archive;
-- EXPECTED: all true
-- EXPECTED_OBJECTS: evaluation_round cols, round unique, gp_current_revision_final_ready, updated RPCs
-- EXPECTED_COUNTS: +1 schema_migrations row for 20260811020000
```

**ROLLFORWARD_IF_FAIL:** if apply errors mid-statement → **STOP + inspect** (transaction should abort). Do **not** destructive rollback of a committed migration. Fix-forward only with a new approved migration if a committed partial ever appears (should not with single-file transactional migrations).

---

## F. Stop conditions

Stop and escalate if any of:

1. Precheck fails or ledger already contains the target version unexpectedly mismatched with objects.
2. BODY SHA256_LF mismatch vs this packet.
3. Partial apply / unknown objects / missing grants after apply.
4. Bucket becomes public or INSERT policy loses `can_upload_graduation_project_object(name)`.
5. Attempt to apply SET N or re-apply L4/SET U.
6. **Any Production E2E write** while `ACTOR_MATRIX=BLOCKED_NO_SAFE_PRINCIPAL`.
7. Request to reactivate banned `gp-e2e01-*` / `testonly.gp.*` principals.
8. GitHub Actions still without runners → **do not treat as migration STOP**, but **do not merge PR #340** until CI runners restored (documented merge gate).

---

## G. Actor Matrix (READ-ONLY discovery — 2026-08-11)

**Verdict: `ACTOR_MATRIX=BLOCKED_NO_SAFE_PRINCIPAL`**

Hard rules honored: no user creation, no role changes, no unban, no invented identities.

### Positive lifecycle roles — all blocked

| Role needed | Candidate found? | SAFE_FOR_E2E | Reason |
|---|---|---|---|
| L4 student leader | Historical `gp-e2e01-leader@…` (`e4599003-72ff-49e1-ad61-fa3177cf5c55`) | **NO** | TEST_ONLY proven but **banned**; reactivation forbidden |
| L4 team member | `gp-e2e01-member_a/b@…` | **NO** | banned |
| Supervisor | `gp-e2e01-supervisor@…` (`8b50f7ef-c0e0-436f-b320-7b6062ba1ae1`) | **NO** | banned; still referenced on archived projects |
| Department coordinator | `gp-e2e01-coordinator@…` (`e8fb43dd-3ff3-490f-b896-f38da99d0a1d`) | **NO** | banned; **sole** live `graduation_project_department_coordinators` row |
| Committee A/B | `gp-e2e01-committee_1/2@…` | **NO** | banned |
| Admin overview | `b1e2e88.admin.negative@…` (`81114672-02c2-4d91-bd0b-b9fb84a17670`) | **UNKNOWN→NO for GP E2E** | TEST_ONLY admin exists, but no authorized GP E2E window / not paired with safe L4 team |

### Unbanned TEST students (usable only as **negative L4 deny** probes)

| user_id | profile_id | email | level | SAFE_FOR_E2E |
|---|---|---|---|---|
| `e571cbb9-5e82-4ee5-b84b-c7c3945d27f5` | `51b9c5e9-8538-4f70-baaa-d254118535c3` | `student.test.01d@quboolye.test` | L1 | **YES — DENY-only** |
| `57e805dc-f975-4834-b1cb-f99c09756980` | `b1e20002-0000-4000-8000-000000000002` | `test-only.b1.e2e02@…` | L1 | **YES — DENY-only** |
| `3a279561-f8e6-41d9-b8ca-ce60682c9eab` | `65f55997-6fd0-40d0-9235-70ac65afeac2` | `test-only.b1.e2e03@…` | L1 | **YES — DENY-only** |

No unbanned TEST student is unique-current L4. Promoting academic level would be a **production write** — forbidden here.

### Real L4 students (~59)

`SAFE_FOR_E2E=NO` — not TEST_ONLY; operational academic records; must not be used for mutation E2E without separate explicit human authorization outside this packet.

### Residue note

All 4 production `graduation_projects` and their active assignments belong to banned TEST_ONLY GP E2E principals. Do not “continue” those journeys.

**Unblock path (out of scope for this agent):** authorized Lovable/operator provisioning of a **new** TEST_ONLY actor set (or explicit approved window) — **without** inventing accounts in this handoff and **without** reactivating banned users. Until then Production E2E lifecycle remains blocked.

---

## H. Production E2E ordered steps (execute only AFTER migrations + safe actors)

Canonical packet: `docs/go-live/operator-packets/PRODUCTION-E2E-GRADUATION-PROJECTS.txt`  
Authority: frozen RPC names in that packet + Package D verifier Branch B.

### Preconditions

1. Steps 1–2 migrations applied + postchecks PASS.
2. `ACTOR_MATRIX=READY_WITH_EXISTING_SAFE_PRINCIPALS` (currently **false**).
3. Private bucket still non-public; INSERT policy predicate-bound.

### Journey skeleton (each step must record ACTOR / PRECONDITION / CALL / EXPECTED DB / EXPECTED UI / NEGATIVE / AUDIT)

**Student L4**

1. Visibility + nav + `/student/graduation-projects` route guard  
2. `create_graduation_project_team`  
3. `add_graduation_project_team_member`  
4. `upsert_graduation_project_proposal` + register/finalize proposal file  
5. `submit_graduation_project_proposal`  
6. Attachment signed download authz-before-replay

**Coordinator / dept scope**

7. `review_graduation_project_proposal` return → `revision_required`  
8. Resubmit → accept → approved  
9. `assign_graduation_project_supervisor`

**Supervisor**

10. `respond_graduation_project_supervision` accept → active  
11. `submit_graduation_project_progress` (+ optional file)  
12. `review_graduation_project_progress`  
13. `submit_graduation_project_final` → `review_graduation_project_final` ready

**Defense**

14. `schedule_graduation_project_defense`  
15. `assign_graduation_project_committee_member` × ≥2 (exact contract)  
16. `mark_graduation_project_defense_held` → evaluating  
17. `submit_graduation_project_evaluation` × panel (current `evaluation_round` only)

**Final / revisions**

18. `conclude_graduation_project_result(..., 'revisions_required', ..., notes)` — notes required  
19. `archive_graduation_project` **DENY**  
20. Corrected final + review ready + second evaluation round (stale prior-round eval **DENY**)  
21. Conclude `passed|failed` → archive ALLOW → archived detail (no storage paths)

**Negatives (can partially run now with L1 TEST students for eligibility only)**

- non-L4 create/list/mutate DENY  
- wrong department / program / non-team user DENY  
- wrong committee / stale evaluation / unauthorized direct RPC DENY  
- signed download replay / cross-project DENY  

**Audit:** each mutating RPC writes `graduation_project_events` with actor + correlation; assert event_type and payload keys.

---

## I. Final acceptance criteria

| Gate | Required for |
|---|---|
| Local source green (GP 138, student-requests 1066, tsc, build, PG17 chains) | Handoff PASS |
| Production drift preflight documented | Handoff PASS |
| Ordered apply of Step1 → Step2 with pre/post checks | Production schema READY |
| `ACTOR_MATRIX` safe principals | Production E2E READY |
| Full lifecycle + revisions + negatives evidence | Production E2E PASS |
| GitHub Actions runners restored + PR checks green | **Merge** READY |
| Deploy/publish | Explicit separate approval (not this packet) |

### Local rehearsal evidence (this mission)

```
bun test tests/graduation-projects          → 138 pass / 0 fail
bun test tests/student-requests             → 1066 pass / 0 fail
bunx tsc --noEmit                           → PASS
bun run build                               → PASS
git diff --check                            → PASS
PG17 L4 / storage / remediation-02 suites   → PASS (disposable docker)
```

### Decision for this handoff package

**`PASS_PORTAL_GP_PRODUCTION_GO_LIVE_HANDOFF_READY_04`**

Meaning: Lovable can execute **migration apply Steps 1–2** from this document without re-analyzing the repo.  
Production **E2E lifecycle** remains gated on `ACTOR_MATRIX=BLOCKED_NO_SAFE_PRINCIPAL`.  
PR **merge** remains gated on GitHub Actions runner restoration (`EXTERNAL_HOLD_NO_RUNNER_ASSIGNED`).
