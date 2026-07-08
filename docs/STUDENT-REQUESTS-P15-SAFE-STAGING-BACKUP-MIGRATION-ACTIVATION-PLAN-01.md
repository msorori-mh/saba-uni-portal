# STUDENT-REQUESTS-P15-SAFE-STAGING-BACKUP-MIGRATION-ACTIVATION-PLAN-01

**Date:** 2026-07-08
**Repository:** `C:\projects\saba-uni-portal-git`
**Branch / HEAD:** `main` @ `e6ab5dc` (Merge PR #108 — P14 runtime readiness audit)
**Mode:** Planning / audit only — no migrations, apply, seed, DB writes, env changes, staging creation, publish, commit/push/PR
**Decision:** **PLAN_READY_WITH_BLOCKERS**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PLAN_READY_WITH_BLOCKERS** |
| **Contracts foundation (P9–P14)** | Merged on `main`; all execute capabilities disabled |
| **Staging DB** | **Does not exist** — single Supabase project shared with production traffic |
| **Backup status** | **BACKUP_NOT_VERIFIED** — no documented restorable snapshot before apply |
| **Student-request migrations** | Authored in repo; **not applied** to live DB |
| **Recommended next step** | **P15b — Staging project provisioning** (user/Lovable action) before any apply |

This document is a **future execution plan only**. No migration was applied, no environment was changed, and no Supabase project was created during P15.

---

## 2. Current Environment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     Lovable Cloud Project                        │
│  App: msorori-mh/saba-uni-portal                                 │
├─────────────────────────────────────────────────────────────────┤
│  Published URLs                                                  │
│    • https://saba-uni-portal.lovable.app                         │
│    • https://quboolye.com (custom domain)                        │
│  Preview URLs                                                    │
│    • https://id-preview--<id>.lovable.app                        │
├─────────────────────────────────────────────────────────────────┤
│  Single Supabase Backend (Lovable-managed)                       │
│    project_ref: wpmicqriltrowwonknox                             │
│    URL pattern: https://wpmicqriltrowwonknox.supabase.co       │
├─────────────────────────────────────────────────────────────────┤
│  Env injection                                                   │
│    • Build: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY    │
│    • SSR/server: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY         │
│    • Fallback hardcoded in vite.config.ts → same project ref     │
│    • Service role: server-only (process.env), not in client bundle│
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Current state |
|-------|---------------|
| **Git** | `main` @ `e6ab5dc` (includes P14 report via PR #108) |
| **Supabase project** | One project: `wpmicqriltrowwonknox` |
| **Staging project** | ❌ None |
| **Auth** | Shared — same user pool for preview and published |
| **Storage** | Shared buckets |
| **Migration apply path** | Lovable Cloud (Supabase-managed) on publish/sync — **not** automated via GitHub Actions CI |
| **GitHub Actions** | `migration-review.yml` — read-only SQL pattern scan on PRs only |
| **Supabase CLI in repo** | No `supabase` scripts in `package.json`; `supabase/config.toml` pins production ref |

---

## 3. Production / Preview Coupling

| Question | Answer |
|----------|--------|
| Do preview and production share the same DB? | **Yes** — same Supabase project ref |
| Do they share Auth? | **Yes** |
| Do they share Storage? | **Yes** |
| Can preview writes affect production users? | **Yes** — any write in preview hits live data |
| Is production traffic on this DB? | **Yes** — custom domain `quboolye.com` serves real users |
| Env var injection point | `vite.config.ts` (build-time define), Lovable Cloud env for deploy, `src/integrations/supabase/client.ts` (runtime read) |

**Conclusion:** Preview is **not** an isolation boundary. Treat `wpmicqriltrowwonknox` as **production-equivalent** for migration and seed decisions until a separate staging project exists.

---

## 4. Migration Chain Inventory

### 4.1 Student-request series (not applied)

| Order | File | Primary purpose |
|-------|------|-----------------|
| 1 | `20260710130000_student_request_types_schema.sql` | `request_types` audience columns; FK on `student_requests.request_type` (NOT VALID) |
| 2 | `20260710140000_student_request_types_rpc_rls.sql` | Student RPCs: create, submit, list, eligibility helpers |
| 3 | `20260710150000_student_request_types_rls_submit_bypass_fix.sql` | **Must follow 140000** — `protect_student_request` trigger; submit fix |
| 4 | `20260710160000_student_request_processing_units_schema.sql` | `request_processing_units`, roles, assignments + RLS |
| 5 | `20260710170000_student_request_admin_workflow_schema.sql` | Workflow config + runtime step/event tables + RLS |
| 6 | `20260710180000_student_request_actor_rpc_rls.sql` | Actor inbox/detail RPCs, `act_on_student_request_step`, admin get config; **save RPC DEFERRED** |
| 7 | `20260710190000_student_request_workflow_runtime.sql` | `initialize_student_request_workflow`, workflow init on submit |
| 8 | `20260711000000_staff_profiles_university_email.sql` | `staff_profiles.email` column |
| 9 | `20260711020000_student_requests_p1_foundations.sql` | Service windows, fee assessments, parallel groups, central signatories, eligibility RPC stubs |

**Last known applied migration on live DB (July 2026):** through `20260705232121` — **none** of the student-request series above.

### 4.2 Objects created (summary)

| Migration | Tables | Key RPCs / functions | RLS | SECURITY DEFINER |
|-----------|--------|----------------------|-----|------------------|
| 130000 | alters `request_types`, `student_requests` | — | existing tables | — |
| 140000 | — | `create_student_request`, `submit_student_request`, `get_my_student_requests`, eligibility fns | via RPC | Yes |
| 150000 | — | replaces `submit_student_request`, adds `protect_student_request` trigger | trigger + RPC | Yes |
| 160000 | `request_processing_units`, `request_processing_roles`, `request_processing_assignments` | — | Enabled | — |
| 170000 | `request_type_workflows`, steps, transitions, `student_request_workflow_steps`, events | — | Enabled | — |
| 180000 | — | `act_on_student_request_step`, inbox, detail, admin get config | RPC-only access pattern | Yes (many) |
| 190000 | — | `initialize_student_request_workflow`, `get_active_workflow_for_request_type` | RPC-only writes | Yes |
| 110000 | alters `staff_profiles` | — | existing | — |
| 11020000 | `student_request_service_windows`, `student_request_fee_assessments`, parallel group tables, `central_signatory_references` | eligibility context RPCs | Enabled | Yes |

### 4.3 Irreversible / high-risk operations

| Risk | Detail | Mitigation in plan |
|------|--------|-------------------|
| FK NOT VALID → VALIDATE | 130000 adds FK without validation; validate requires orphan cleanup | Pre-apply data audit on `student_requests.request_type` |
| `submit_student_request` replacement | 150000 replaces 140000 version — **140000 without 150000 breaks submit** | Atomic pair in same apply session |
| New RLS + broad authenticated GRANTs | 160000/170000 grant authenticated DML on config tables | Post-apply RLS penetration tests on staging |
| SECURITY DEFINER surface | 180000/190000 — large RPC auth surface | Security validation matrix (§11) before runtime pilot |
| `admin_save_request_workflow_config` | **Not created** (DEFERRED in 180000) | Separate phase after save RPC implementation |
| No down migrations | Supabase migrations are forward-only | Restore-from-backup rollback strategy (§9) |

---

## 5. Migration Dependency Order

```
130000 (schema)
  └─► 140000 (student RPCs)
        └─► 150000 (RLS submit fix)  ◄── MUST NOT SKIP
              └─► 160000 (processing units)
                    └─► 170000 (workflow config tables)
                          └─► 180000 (actor RPCs + act_on)
                                └─► 190000 (workflow init runtime)
                                      └─► 110000 (staff email) — independent column add
                                      └─► 11020000 (P1 foundations)
```

**Hard rules:**

1. Never apply `140000` without `150000` in the same session.
2. Apply `130000`→`190000` in timestamp order without skipping.
3. `110000` and `11020000` may follow `190000` (no reverse dependency).
4. Do **not** mix schema migrations with reference seed in the same migration file.

**Pre-existing dependencies (already on live DB):**

- `request_types`, `student_requests`, `student_profiles`, `staff_profiles` tables
- RBAC: `has_any_role`, role assignments (from prior migrations through `20260705232121`)
- `student_affairs_workflow_foundation` migrations (`20260706120000`, `20260707120000`) — legacy JSON workflow path

---

## 6. Proposed Staging Architecture

### 6.1 Target topology (future — not created in P15)

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  Lovable Staging Project │     │  Lovable Production       │
│  (NEW — separate)        │     │  (existing)               │
├──────────────────────────┤     ├──────────────────────────┤
│  project_ref:            │     │  project_ref:             │
│  <STAGING_PROJECT_REF>   │     │  wpmicqriltrowwonknox     │
│                          │     │                           │
│  Preview URL only        │     │  quboolye.com + publish   │
│  Staging secrets         │     │  Production secrets       │
└──────────────────────────┘     └──────────────────────────┘
         │                                    │
         └──────── NO shared DB ──────────────┘
```

### 6.2 Required components

| Component | Staging requirement |
|-----------|---------------------|
| Supabase project | **New** independent project |
| `project_ref` | Must differ from `wpmicqriltrowwonknox` |
| Auth | Independent user pool (test accounts only) |
| Storage | Independent buckets |
| Secrets | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — staging-only |
| App binding | Lovable staging/preview project OR branch preview wired to staging ref only |
| `supabase/config.toml` | Staging branch uses `<STAGING_PROJECT_REF>` — **never** production ref during apply tests |

### 6.3 Staging identity verification (mandatory Gate G0)

Before any migration apply, verify **all** of:

```text
# DO NOT RUN on production — examples for future staging verification only

# 1. Project ref in config matches staging placeholder
grep project_id supabase/config.toml
# Expected: project_id = "<STAGING_PROJECT_REF>"
# MUST NOT equal: wpmicqriltrowwonknox

# 2. App env points to staging URL
echo $VITE_SUPABASE_URL
# Expected: https://<STAGING_PROJECT_REF>.supabase.co

# 3. Runtime check from app (staging preview)
# Login page network tab → requests go to <STAGING_PROJECT_REF>.supabase.co
```

**Gate G0 FAIL until all three checks pass on a dedicated staging project.**

---

## 7. Backup and Restore Plan

### 7.1 Current status: **BACKUP_NOT_VERIFIED**

| Claim | Evidence |
|-------|----------|
| Automated Supabase backups may exist | Lovable Cloud / Supabase PITR — **not verified** in this audit |
| Manual snapshot before apply | **No documented snapshot** with timestamp, checksum, or restore test |
| CSV export via Lovable | Available — **not** a substitute for atomic restore |
| Restore test on separate environment | **Not performed** |

**Classification:** **BACKUP_NOT_VERIFIED** — treat as **no reliable backup** until proven.

### 7.2 Future backup procedure (before any apply — staging or production)

| Step | Action | Owner |
|------|--------|-------|
| B-1 | Confirm Supabase plan supports PITR / daily backups | User / Lovable support |
| B-2 | Record backup retention window and last backup timestamp | User |
| B-3 | Export schema: `pg_dump --schema-only` → `<BACKUP_PATH>/schema_<timestamp>.sql` | DBA / authorized operator |
| B-4 | Export data (critical tables): `pg_dump --data-only` for `student_requests`, `request_types`, `student_profiles`, auth-related refs | DBA |
| B-5 | Document migration history: `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version` | Operator |
| B-6 | Storage: export bucket manifest / critical objects list | Operator |
| B-7 | Compute checksum (SHA-256) for each backup artifact | Operator |
| B-8 | Store in secure location outside Lovable (encrypted storage) | User |
| B-9 | **Restore test** on disposable project or local Postgres | **Mandatory before G1 PASS** |
| B-10 | Sign-off document with backup ID, timestamp, verifier name | User |

### 7.3 Restore test criteria (Gate G1)

Backup is **acceptable** only when:

- Restore completes without manual intervention beyond documented steps
- Row counts match source for sampled critical tables (±0 for config tables)
- Migration history table restored correctly
- RLS policies and functions present after restore
- App smoke test passes against restored staging clone

---

## 8. Staging Migration Runbook (future — DO NOT RUN now)

### 8.1 Pre-check checklist

- [ ] **G0 PASS** — staging project ref confirmed ≠ `wpmicqriltrowwonknox`
- [ ] **G1 PASS** — backup verified + restore test documented
- [ ] **G2 PASS** — migration order reviewed; security review complete
- [ ] `main` branch up to date; working tree clean
- [ ] Migration file checksums recorded (git SHA of each `.sql`)
- [ ] Explicit reviewer approval recorded
- [ ] Maintenance window announced (even for staging — prevents confusion)
- [ ] Rollback decision tree reviewed (§9)
- [ ] No production preview URL pointing at staging DB

### 8.2 Apply procedure (ordered)

```text
# ═══════════════════════════════════════════════════════════════
# DO NOT RUN — future staging apply template only
# Target: <STAGING_PROJECT_REF> ONLY
# ═══════════════════════════════════════════════════════════════

# Pre: confirm project
# supabase link --project-ref <STAGING_PROJECT_REF>   # DO NOT RUN on production

# Apply in order (single session, stop on first error):
# 20260710130000_student_request_types_schema.sql
# 20260710140000_student_request_types_rpc_rls.sql
# 20260710150000_student_request_types_rls_submit_bypass_fix.sql  ← required after 140000
# 20260710160000_student_request_processing_units_schema.sql
# 20260710170000_student_request_admin_workflow_schema.sql
# 20260710180000_student_request_actor_rpc_rls.sql
# 20260710190000_student_request_workflow_runtime.sql
# 20260711000000_staff_profiles_university_email.sql
# 20260711020000_student_requests_p1_foundations.sql

# Log full stdout/stderr to <BACKUP_PATH>/apply_log_<timestamp>.txt
# Do NOT run seed automatically after apply
```

**Apply rules:**

- One migration at a time; verify success before next
- Stop immediately on error — do not skip failed migration
- No automatic seed
- No production project ref in any command
- No secrets in logs

### 8.3 Post-check checklist

- [ ] All 9 migrations appear in `supabase_migrations.schema_migrations`
- [ ] Tables exist: `request_processing_units`, `request_type_workflows`, `student_request_workflow_steps`, `student_request_fee_assessments`, `student_request_parallel_groups`, `central_signatory_references`
- [ ] RPCs exist: `act_on_student_request_step`, `initialize_student_request_workflow`, `create_student_request`, `submit_student_request`
- [ ] RLS enabled on all new tables
- [ ] `anon` has no unintended table access
- [ ] `authenticated` cannot bypass RPC authorization
- [ ] No unexpected changes to unrelated tables (spot-check `council_*`, `official_documents`)
- [ ] No automatic data created (zero rows in runtime tables unless seed phase)
- [ ] App build passes against staging env
- [ ] Dry-run contract panels still return `EXECUTION_UNAVAILABLE` (app flags unchanged)

---

## 9. Post-Migration Verification (schema-only phase)

| Check | Method | Pass criteria |
|-------|--------|---------------|
| Schema completeness | `\dt` / information_schema | All expected tables present |
| RPC signatures | `pg_proc` query | Functions match migration definitions |
| RLS enabled | `pg_tables.rowsecurity` | `true` on all new tables |
| Grant audit | `information_schema.role_table_grants` | No anon write grants |
| FK status | `pg_constraint` | NOT VALID FK documented; validate plan scheduled |
| Deferred save RPC | grep migration 180000 | `admin_save_request_workflow_config` absent |
| App compatibility | `npm run build` + staging smoke | Build PASS; login works |
| Contract gates | UI inspection | All execute buttons still disabled |

---

## 10. Seed and Configuration Plan (separate phase — DO NOT RUN with migrations)

Seed is **explicitly separate** from schema migrations.

| Seed domain | Contents | Depends on |
|-------------|----------|------------|
| **S-1 Request types** | 8 canonical types aligned with registry | Schema 130000 |
| **S-2 Processing units** | College-level units per department/faculty | Schema 160000 |
| **S-3 Workflow definitions** | Steps, transitions, parallel groups per type | Schema 170000 + admin save RPC (future) |
| **S-4 Actor assignments** | `request_processing_assignments` for staff | Schema 160000 + staff profiles |
| **S-5 Service windows** | `student_request_service_windows` per type | Schema 11020000 |
| **S-6 Role mappings** | App role → processing role keys | App config + DB assignments |
| **S-7 Finance config** | SA amount policy; revenue confirm policy (no payment portal) | Schema 11020000 + P12 contracts |
| **S-8 Parallel clearance** | file_withdrawal 4-member template | Schema 11020000 |
| **S-9 Document definitions** | Signatory requirements per document type | P13 contract + central signatory refs |
| **S-10 Central signatories** | `central_signatory_references` rows | Schema 11020000 |
| **S-11 October exam limits** | Qualified course rules | Eligibility RPC + config |
| **S-12 Eligibility config** | Per-type rules wired to RPCs | Schema 11020000 |

**Separation matrix:**

| Layer | Phase | Gate |
|-------|-------|------|
| Schema migrations | P16 (future) | G3 |
| Reference/config seed | P17 (future) | G4 |
| Runtime activation (flip app flags, wire RPCs) | P18–P21 (future) | G5 |
| Pilot test data | P18 pilot only | G5 |
| Production change | P22+ (future) | G6 |

---

## 11. Security Validation Plan (on staging after G3)

| Area | Tests |
|------|-------|
| **RLS per new table** | anon SELECT/INSERT/UPDATE/DELETE → denied; authenticated direct write → denied where RPC-only |
| **Student ownership** | Student A cannot read/write Student B requests |
| **Staff department scope** | `department_head` limited to own department students |
| **Revenue scope** | `revenue_finance_officer` cannot set SA amount; can only confirm receipt (future) |
| **Central signatory** | College staff cannot act as `university_registrar_general` |
| **SECURITY DEFINER search_path** | All new functions set `search_path = public` |
| **RPC authorization** | `act_on_student_request_step` rejects unauthorized actor |
| **Client trust** | Reject `actorUserId`, `actorRole`, `studentId` from client in all contract paths |
| **Direct browser writes** | No new table writable from browser except via intended RPCs |
| **Auditability** | Workflow events table receives entries only via RPC (future execution phase) |
| **Idempotency** | `clientActionId` / `expectedUpdatedAt` foundation tested (P11–P13 matrices) |
| **Concurrency** | Stale version warnings behave as documented |

Use existing security test harness: `tests/security/` with `SEC_TEST_SUPABASE_URL` pointing to **staging only**.

---

## 12. Functional Validation Matrix (future E2E on staging)

For each of the 8 canonical request types, test on **staging only**:

| Type | Eligibility | Submit | Workflow | Staff inbox | SA amount | Revenue confirm | Parallel clearance | Document preview | Archive readiness | Negative cases |
|------|-------------|--------|----------|-------------|-----------|-----------------|-------------------|------------------|-------------------|----------------|
| enrollment_suspension | ☐ | ☐ | ☐ | ☐ | N/A | N/A | N/A | ☐ | ☐ | unauthorized actor |
| grade_statement_non_graduate | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ (4 signatories) | ☐ | wrong document type |
| enrollment_certificate | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ (local only) | ☐ | central signatory rejected |
| file_withdrawal | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ (4 members) | ☐ (3 docs) | ☐ | incomplete clearance blocks |
| excused_absence | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ | ☐ | — |
| grade_appeal | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ | ☐ | — |
| department_transfer | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ | ☐ | dept scope |
| october_exam_entry_form | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | N/A | ☐ | ☐ | no qualified courses |

**Do not run this matrix on production DB.**

---

## 13. Rollback Decision Tree

```
Migration apply started
│
├─ Error BEFORE migration commits
│   └─► STOP — fix SQL, do not continue chain
│
├─ Migration commits but post-check FAILS
│   ├─ Schema-only failure (missing object)
│   │   └─► STOP — FIX-FORWARD migration on staging (never skip)
│   ├─ RLS regression detected
│   │   └─► STOP — ROLLBACK via restore from G1 backup
│   ├─ RPC auth failure
│   │   └─► STOP — disable app runtime flags; FIX-FORWARD or RESTORE
│   ├─ Data integrity failure
│   │   └─► RESTORE from verified backup
│   └─ Unrelated table affected
│       └─► RESTORE — treat as NO_GO for forward apply
│
├─ App build/runtime failure after schema OK
│   └─► STOP runtime activation — schema may remain; app stays on dry-run
│
├─ Preview connected to wrong project ref
│   └─► NO_GO — immediate env isolation fix before any writes
│
└─ Accidental production project detected during apply
    └─► NO_GO — abort; assess damage; RESTORE if any migration ran
```

| Action | When |
|--------|------|
| **STOP** | Any uncertainty; first error in chain |
| **ROLLBACK** | Restore from verified backup (only reliable method — no down migrations) |
| **RESTORE** | Data integrity or wrong-environment apply |
| **FIX-FORWARD** | Known fix on staging after isolated failure |
| **NO_GO** | Production touched without G6 approval |

**No rollback SQL is executed in P15.**

---

## 14. Gate Matrix G0–G6

| Gate | Name | Current status | Pass criteria | Evidence |
|------|------|----------------|---------------|----------|
| **G0** | Environment Identity | **FAIL / BLOCKED** | Staging project ref independent; no production secrets in staging preview | Only `wpmicqriltrowwonknox` exists; preview + prod share it |
| **G1** | Backup | **FAIL / BLOCKED** | Backup exists, checksum documented, restore test passed | **BACKUP_NOT_VERIFIED** |
| **G2** | Migration Review | **READY_WITH_NOTES** | Order approved, dependencies clear, security reviewed | 9 migrations inventoried; 140000+150000 pair documented; save RPC deferred |
| **G3** | Staging Apply | **NOT_STARTED** | Safe apply on staging + post-checks pass | Blocked by G0, G1 |
| **G4** | Seed/Config | **NOT_STARTED** | Schema OK + RLS tests pass + seed applied | Blocked by G3 |
| **G5** | Runtime Pilot | **NOT_STARTED** | Seed OK + E2E matrix pass on staging | Blocked by G4; app execute flags still false |
| **G6** | Production Change | **PROHIBITED** | Staging PASS + prod backup + maintenance plan + explicit user approval | STAGING-ENV-GATE-01 = NO_GO |

**No gate was elevated to PASS without evidence.**

---

## 15. Explicit Prohibited Actions (current and until G6)

- Apply any migration to `wpmicqriltrowwonknox` without G6 approval
- `supabase db push`, `supabase migration up`, `supabase link` against production ref
- Run seed/SQL against shared production DB
- Flip `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE` or any execute capability to `true` without G5
- Wire `act_on_student_request_step` in app before G5 staging pilot
- Publish Lovable production during migration/seed window
- Use production anon/service keys in staging preview
- Create test student/staff accounts on production for migration testing

---

## 16. Required User / Platform Inputs

| # | Input needed | From | Blocks |
|---|--------------|------|--------|
| 1 | **Dedicated Lovable/Supabase staging project** | User / Lovable | G0 |
| 2 | **Staging project ref** (`<STAGING_PROJECT_REF>`) | Lovable Cloud | G0 |
| 3 | **Staging env vars** wired to preview only | Lovable project settings | G0 |
| 4 | **Supabase dashboard access** or Lovable support channel | User | G1 backup verification |
| 5 | **PITR/backup retention confirmation** | Lovable / Supabase | G1 |
| 6 | **Authorized restore test** on disposable clone | User / DBA | G1 |
| 7 | **Decision: fork vs new Lovable project** for staging | User | G0 architecture |
| 8 | **`SUPABASE_ACCESS_TOKEN`** (if CLI apply chosen) | User — **never commit** | Optional apply path |
| 9 | **Explicit G6 approval** before any production apply | User | G6 |
| 10 | **`student_activities` role policy** resolution | User / governance | G4 seed |
| 11 | **Maintenance window** for production (if G6 ever approved) | User | G6 |

**Tools not available in current agent environment:**

- Supabase dashboard / Lovable Cloud admin UI
- `SUPABASE_ACCESS_TOKEN` (documented as not set in prior staging reports)
- `psql`, `pg_dump`, `supabase` CLI linked to any project
- Ability to create Supabase projects

---

## 17. Recommended Next Phase

### Immediate: **P15b — Staging Project Provisioning** (user/Lovable action)

1. Create separate Lovable Cloud project (or explicit staging Supabase project).
2. Obtain `<STAGING_PROJECT_REF>`.
3. Wire preview URL to staging env vars only.
4. Verify G0 checklist (§6.3).
5. Do **not** apply student-request migrations until G0 PASS.

### Then (ordered):

| Phase | Name | Gate unlocked |
|-------|------|---------------|
| P16 | Backup verification + restore test | G1 |
| P17 | Staging migration apply (9 files, ordered) | G3 |
| P18 | Post-migration security + schema verification | G3 |
| P19 | Reference seed / config (§10) | G4 |
| P20 | Runtime pilot on staging (flip flags, wire RPCs incrementally) | G5 |
| P21 | Production change proposal (only if staging E2E PASS) | G6 |

---

## 18. Final Decision

### **PLAN_READY_WITH_BLOCKERS**

| Ready | Blocked |
|-------|---------|
| Migration chain documented with dependencies | No separate staging DB |
| Apply runbook drafted | **BACKUP_NOT_VERIFIED** |
| Seed plan separated from schema | Shared production Supabase |
| Security + functional test matrices defined | Migrations not applied |
| Gate framework G0–G6 defined | Runtime/seed not started |
| Rollback decision tree documented | G0, G1 = FAIL |
| P9–P14 contracts merged; execute disabled | G6 = PROHIBITED |

---

## Appendix A — Safe Checks Executed (P15)

| Check | Result |
|-------|--------|
| `git branch --show-current` | `main` |
| `git log -3 --oneline` | `e6ab5dc` Merge PR #108; `9d14f68` P14 report; `5e4e1e1` PR #107 |
| `git status --short` | Clean (after build) |
| `git diff --check` | PASS |
| `npm run build` | **PASS** (~24s) |
| `git restore --worktree src/routeTree.gen.ts` | Restored |

**Not executed (prohibited):** `supabase db push`, `supabase link`, `psql`, `pg_dump`, restore, Lovable publish, migration apply.

---

## Appendix B — No-Write / No-Activation Assurance

This phase performed:

- ✅ Read-only repository and documentation review
- ✅ Migration file inventory (no edits)
- ✅ Grep / file inspection
- ✅ Build verification
- ❌ No migration apply
- ❌ No Supabase link/push
- ❌ No SQL execution
- ❌ No seed
- ❌ No env or secrets changes
- ❌ No staging project creation
- ❌ No workflow runtime activation
- ❌ No production publish
- ❌ No commit/push/PR
- ❌ No source code modifications

---

*End of P15 Safe Staging Backup Migration Activation Plan*
