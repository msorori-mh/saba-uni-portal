# PORTAL-B1-SEQ21-SECURE-READ-PRODUCTION-PREFLIGHT-01

## Decision

**HOLD_B1_SEQ21_MISSING_PRODUCTION_DEPENDENCY_student_request_attachment_uploads**

G4 Production read-only evidence (Lovable-managed path against `wpmicqriltrowwonknox`) is now available and accepted.  
SEQ21 migration identity and local PG17 matrix remain green, but Production is **missing** `public.student_request_attachment_uploads`, which SEQ21 references at compile time. Applying SEQ21 now would fail with `type … does not exist`.

Therefore this preflight is **not** ready for SEQ21 apply approval.

No migration was applied. No Production DDL/DML. No activation / `student_visible` / Deploy / Publish.

## Decision change log

| Stage | Decision |
|---|---|
| Prior (no prod access) | `HOLD_B1_SEQ21_PRODUCTION_READONLY_ACCESS_UNAVAILABLE` |
| After Lovable G4 RO report | **`HOLD_B1_SEQ21_MISSING_PRODUCTION_DEPENDENCY_student_request_attachment_uploads`** |
| Not issued | `PASS_B1_SEQ21_SECURE_READ_PRODUCTION_PREFLIGHT` / `READY_FOR_SEPARATE_SEQ21_APPLY_APPROVAL` |

## G0 — Source tip

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| PR #221 merge commit (binding baseline) | `c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4` (ancestry of current `origin/main`) |
| `origin/main` at G4 resume | `121e5bfbf0e8e21a2740009d29a477b8dda74ddc` (includes Lovable G4 merge; docs-only / types churn; **not** a SEQ21 apply) |
| Worktree branch | `preflight/b1-seq21-secure-read-production-01` |
| Mode | READ-ONLY / PREPARATION-ONLY |

Local Secure Read PG17 / Bun suites from the prior stage were **not re-run**: promoted migration LF SHA-256 is unchanged at `cd716700…` on `c1a6a8e`, `origin/main`, and this branch tip.

## G1 — Migration 21 identity (unchanged)

| Field | Value |
|---|---|
| Sequence | **21** (ONE MIGRATION ONLY) |
| Promoted migration | `supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql` |
| Migration SHA-256 (LF) | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` |
| Preflight SQL | `docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-PREFLIGHT.sql` |
| Post-verifier SQL | `docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql` |
| Local harness | `tests/b1-secure-read/pg/` (prior: **25/25 PASS**) |
| Predecessor | seq **20** confirm-payment guard (and earlier B1 chain through seq **07** secure attachments) |

## G3 — Local results (prior; SHA-stable, not re-run)

| Gate | Result |
|---|---|
| PG17 Secure Read | **25/25 PASS** |
| Second-apply refuse | PASS |
| Bun contracts (manifest + secure-read) | **42 pass** |
| Static SQL review | PASS |

## G4 — Production read-only (Lovable evidence accepted)

Source: `PORTAL-B1-SEQ21-PRODUCTION-READONLY-G4-LOVABLE-01` (SELECT/catalog only).

### G4.1 Environment

| Check | Result |
|---|---|
| Project ref | `wpmicqriltrowwonknox` |
| Database / user | `postgres` / `sandbox_exec` (read-only) |
| PostgreSQL | **17.6** |
| Migration file SHA on inspected tree | `cd716700…` ✅ |
| Operator tree tip note | Lovable workspace tip `82e3d6df…` ≠ binding merge `c1a6a8e…` (informational); migration bytes still SHA-matched |

### G4.2 Migration history 21–24

`supabase_migrations.schema_migrations`: total **151**, latest **`20260725002136`**.

| version | state |
|---|---|
| `20260725130000` (SEQ21) | **NOT APPLIED** |
| `20260725140000` (SEQ22) | **NOT APPLIED** |
| `20260725150000` (SEQ23) | **NOT APPLIED** |
| `20260725160000` (SEQ24) | **NOT APPLIED** |

Hits for 21–24 = **0** → PASS for “not yet applied”.

### G4.3 Partial-apply inventory

All **18** SEQ21 objects (9 helpers + 9 RPCs) **ABSENT** (`18/18`).  
No SEQ21 views/policies/grants. No unexpected partial match / conflicting signature / owner / privileges → **NO PARTIAL APPLY**.

### G4.4 Dependencies — blocker

Present once (owner `postgres`, SECURITY DEFINER where expected), including:

- `user_matches_workflow_runtime_step(uuid)`
- `can_current_user_act_on_step(uuid,text)`
- related B1 atomic/submit/payment helpers listed in Lovable inventory
- required tables with RLS enabled (`student_requests`, workflow tables, `request_types`, `student_profiles`, assignments, …)

**MISSING (hard blocker):**

| Object | State | Impact |
|---|---|---|
| `public.student_request_attachment_uploads` | **NULL / not present** | SEQ21 will not compile (`b1_attachment_meta_json`, list/meta helpers, official PREFLIGHT) |

Creator migration: `20260725110000_b1_07_secure_attachments_source_01.sql` — **not applied**.  
Production history stops at `20260725002136`; chain `20260725110000`–`20260725120000` (SEQ07→SEQ20 band) is outside applied history.  
Legacy `student_request_attachments` (1 row) is **not** a signature-compatible substitute.

`enrollment_certificate` dependencies reported healthy / unaffected.

### G4.5 Hidden services

| code | student_visible | is_active | active workflows | rows |
|---|---|---|---|---|
| enrollment_suspension | false | true | 0 | 0 |
| excused_absence | false | true | 0 | 0 |
| department_transfer | false | true | 0 | 0 |
| final_chance | false | true | 0 | 0 |
| file_withdrawal | false | true | 0 | 0 |
| enrollment_certificate | true | true | 1 | 4 |

Five B1 services remain **HIDDEN** ✅

### G4.6 Service request counts

- Five-service `student_requests` = **0**
- Five-service workflows = **0**
- No `TEST_ONLY_FIRST_DELIVERY_5_SERVICES` markers ✅

### G4.7 Protected-record baseline (exactly one row each)

| record | status | updated_at | digest(md5 status+updated_at) |
|---|---|---|---|
| SR-20260713-2DE64041 | in_review | 2026-07-13 17:59:19.782271+00 | `c49518ae2ed2c26dda23ac16539cf534` |
| SR-20260715-FEDCB3E1 | completed | 2026-07-16 03:05:57.517147+00 | `806b9995a8036ae8fc3d00b59598ae11` |
| SR-20260716-26BAD4C8 | completed | 2026-07-16 04:44:29.338193+00 | `3a3b6136cb2cf50c9594b2cdb981a174` |
| USR-2026-000001 | archived | 2026-07-16 03:05:57.517147+00 | `ba8ff47b98d29ec9a992ad52325b83e3` |
| USR-2026-000002 | archived | 2026-07-16 04:44:29.338193+00 | `f337d9efbd6184c155b7b45f6e02293e` |

All three SR rows are `enrollment_certificate`. Digests recorded for later delta checks only.

### G4.8 Privilege findings

- No SEQ21 ACL yet (objects absent).
- Existing B1 functions owner=`postgres`, sensitive ones SECURITY DEFINER.
- `anon EXECUTE` false except `is_valid_b1_runtime_step_contract(...)` (non-DEFINER, no data access) — non-blocking; recommend later `REVOKE` hygiene.
- No broad admin/registrar/dean bypass observed on inspected objects; no storage-coordinate leaks via current views/functions.

### G4.9 Non-write confirmation

**NO PRODUCTION WRITE · NO MIGRATION APPLY · NO DEPLOY · NO ACTIVATION** — Lovable session used SELECT/catalog reads only.

## Why PASS is refused

1. **Missing Production dependency** `student_request_attachment_uploads` makes SEQ21 apply impossible / unsafe to approve.  
2. Recommended path: complete sequential apply **SEQ07 → SEQ20** (one migration per approved session with preflight/post-verifier), then **re-run G4 for SEQ21**.  
3. Only after G4 shows the attachment-uploads relation present and PREFLIGHT green may a separate human approval authorize **SEQ21 alone**.

## G5 / G6 — Apply package status

The previously documented ONE-MIGRATION-ONLY SEQ21 package remains valid **as documentation**, but is **blocked** until dependency gap closes. Do **not** execute `supabase db push` for SEQ21 under this HOLD.

## Explicit non-actions (this resume)

- Did **not** apply SEQ21–SEQ24  
- Did **not** activate gate 25  
- Did **not** change `student_visible`  
- Did **not** Deploy/Publish  
- Did **not** re-run local PG17 (migration SHA unchanged)  
- Did **not** merge docs PR to main as apply authorization
