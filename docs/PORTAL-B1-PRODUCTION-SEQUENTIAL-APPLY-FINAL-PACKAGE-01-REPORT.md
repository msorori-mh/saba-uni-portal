# PORTAL-B1-PRODUCTION-SEQUENTIAL-APPLY-PACKAGE-FINALIZATION-01

## Decision

**PASS_B1_PRODUCTION_SEQUENTIAL_APPLY_PACKAGE_READY**

This package is **READ-ONLY / PREPARATION-ONLY**. It finalizes the production sequential-apply runbook for binding sequence **21–25** from PR **#238** HEAD. It does **not** apply migrations, Deploy/Publish, activate workflows, or change `student_visible`.

## Exact source HEAD

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Source PR | [#238](https://github.com/msorori-mh/saba-uni-portal/pull/238) |
| Exact HEAD | `a8d6f639f3e89c70253d6fbd85561e5ea8563edd` |
| Prep branch | `prep/b1-production-sequential-apply-final-01` |
| Stacked base | `integration/b1-final-backend-ui-contracts-01` |
| Mode | SOURCE-ONLY preparation; no Production/Staging write |

Verified: `gh pr view 238 --json headRefOid` = `a8d6f639f3e89c70253d6fbd85561e5ea8563edd`.

## Binding migration sequence (one migration per batch)

| Seq | Track | Kind | Canonical draft | Promoted migration |
|---:|---|---|---|---|
| **21** | Secure Read Contracts | migration | `docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql` | `supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql` |
| **22** | Secure Draft Mutations | migration | `docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql` | `supabase/migrations/20260725140000_b1_22_secure_draft_mutations_01.sql` |
| **23** | Transfer Department Scope Position Assignment | migration | `docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql` | `supabase/migrations/20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` |
| **24** | File Withdrawal Impact Acknowledgment NULL Guard | migration | `docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql` | `supabase/migrations/20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` |
| **25** | Activation Gate | **non-migration** operational gate | N/A — separate reviewed activation after 21–24 PASS | N/A |

Manifest IDs (for cross-reference; naming lags sequence integers historically):

| Seq | Manifest `canonical_id` | Manifest `sequence_order` | PROMOTION-MAP `order` |
|---:|---|---:|---:|
| 21 | `B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20` | 21 | 21 |
| 22 | `B1-SECURE-DRAFT-MUTATIONS-21` | 22 | 22 |
| 23 | `B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-23` | 23 | 23 |
| 24 | `B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-24` | 24 | 24 |
| 25 | *(not a migrations[] entry)* | — | — |

Global policy (manifest): `batch_apply_forbidden=true`, `max_migrations_per_apply_session=1`, `parallel_apply_forbidden=true`, `ci_auto_apply_forbidden=true`.

## SHA table (recomputed at package HEAD)

Authoritative pins are **LF-normalized SHA-256** in `PROMOTION-MAP.json` + manifest `sha256` / `source_promotion.migration_sha_lf`, and **git blob SHA-1** for drafts (`git hash-object`).

| Seq | Artifact | git blob SHA-1 | SHA-256 (LF) | Pin match |
|---:|---|---|---|---|
| 21 | draft | `50a862770dd0ea55cc316720f25f8dff2843942a` | `0470e807fe3733658930b7916524c36e0f00b96ea5f48d962ea582144ecdd027` | PASS (manifest + PROMOTION-MAP `draft_sha_lf`) |
| 21 | migration | `397059177c4de3baa8d569489bde2a4d871764f9` | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` | PASS (PROMOTION-MAP / manifest `migration_sha_lf`) |
| 22 | draft | `c4e6ad0f85e0ebd8a7fa5e7ca4620386a39527ae` | `e8610fbe35c166af1c0552990566fd3eb5e295de582e4e59f0fabf8483110fa6` | PASS |
| 22 | migration | `b9ba016cbeb3ac2ac4a6bb189001c715cd0ace1b` | `da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242` | PASS |
| 23 | draft | `c80e74efe9761e9efe352dce4f208b6e73c579f4` | `85d6a256127584f4e8793d2db7ed0a5925e7787dea36d0d255a76e11a45271d2` | PASS |
| 23 | migration | `0768c627b7a08aa8c16856a9649c5dc2bdededfc` | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` | PASS |
| 24 | draft | `b1cc3d0fd48ac2b92e485136c5e1600f763592e6` | `684aac3bc3801e7e50bb9c65ff041489afb3d9bf91083b28b97b63faa0434425` | PASS |
| 24 | migration | `21fa0d3ffa01279e6008a43134f397fe0c9e7275` | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` | PASS |

Notes:

- Apply production using the **promoted migration** path + `migration_sha_lf`, not the draft path (draft is provenance; migration may include promotion wrapper bytes).
- Manifest `byte_size` for secure-read draft historically listed `31648`; measured LF size at this HEAD is `30868`. **SHA pins match**; byte_size is informational drift only — do not use byte_size as an apply gate.
- Local harness apply-order (`tests/b1-rpc-matrix/pg/20-draft-apply-order.txt`) pins the same draft blob SHAs for lines 21–24; gate 25 is non-migration (`30-pre-activation` / `35-activate-local-only`). Item `90` (actor/action hardening) is a harness remediation, **not** activation gate 25.

## Prerequisite before seq 21

Sequence **20** (`B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-19` / promoted `20260725120000_b1_confirm_payment_predecessor_guard_01.sql`) must already be applied and post-verified green before starting this package’s first batch. This package does not re-authorize seq 1–20.

## Shared G0–G5 protocol (every batch)

### G0 — Source provenance (local / CI; no Production write)

```powershell
git fetch origin --prune
git rev-parse HEAD
# must equal a8d6f639f3e89c70253d6fbd85561e5ea8563edd (or a later reviewed package tip that re-pins SHAs)

$migrationPath = '<PROMOTED_MIGRATION_PATH>'
$expectedSha = '<migration_sha_lf FROM TABLE ABOVE>'
$bytes = git cat-file blob ("HEAD:" + ($migrationPath -replace '\\','/'))
# LF-normalize then SHA-256; must equal $expectedSha
```

Also confirm:

- `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json` order matches seq.
- Manifest entry `status` remains `NOT_APPLIED` until catalog/object evidence proves otherwise (name-matching Lovable UUID history rows is **forbidden** as proof).
- Independent review for that batch: CRITICAL=0 / HIGH=0.

### G1 — Production preflight (READ-ONLY)

Run **only** the batch preflight SQL (each ends in `ROLLBACK`):

| Seq | Preflight (read-only) |
|---:|---|
| 21 | `docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-PREFLIGHT.sql` |
| 22 | `docs/migration-drafts/b1-backend-verifiers/22-B1_22_SECURE_DRAFT_MUTATIONS_01-PREFLIGHT.sql` |
| 23 | `docs/migration-drafts/b1-backend-verifiers/23-B1_23_TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01-PREFLIGHT.sql` |
| 24 | `docs/migration-drafts/b1-backend-verifiers/24-B1_24_FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01-PREFLIGHT.sql` |

Capture baselines (SELECT-only) before apply:

- Official migration history presence for the single expected promoted filename (object proof remains authoritative).
- Relevant `pg_proc` / ACL / `search_path` baselines.
- Five B1 `request_types.student_visible` (expect `false`).
- Active workflow counts for five B1 types (expect inactive/draft until gate 25).
- Counts for B1 requests / details / events / attachments (delta must be zero from apply unless documented).
- Protected rows unchanged (see Protection).
- `enrollment_certificate` workflow/objects not targeted.

### G2 — Exact apply command (**DOCUMENTATION ONLY — DO NOT EXECUTE IN THIS PACKAGE**)

Per `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`. Substitute path/SHA for the single authorized batch. Forbidden: `--include-all`, `migration repair`, history rewrite, reset, cleanup, delete, raw multi-file `psql -f` batching.

```powershell
# DOCUMENTATION ONLY — requires separate explicit per-migration human approval
# Target: production/staging project ONLY after that approval. NOT authorized by this package.

$migrationPath = 'supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql'  # example: seq 21
$expectedSha  = 'cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca'

# 1) Pin SHA (LF SHA-256 of HEAD blob)
$actualSha = <# compute LF SHA-256 of git cat-file blob HEAD:$migrationPath #>
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_MISMATCH' }

# 2) Dry-run must propose EXACTLY this one migration
supabase migration list --linked
supabase db push --linked --dry-run
# STOP unless dry-run lists exactly one expected timestamped migration

$actualSha = <# recompute #>
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_CHANGED_AFTER_DRY_RUN' }

# 3) Apply once
supabase db push --linked

# 4) Re-list history; proceed only after G3+G4 PASS
supabase migration list --linked
```

Substitute for each batch:

| Seq | `$migrationPath` | `$expectedSha` (`migration_sha_lf`) |
|---:|---|---|
| 21 | `supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql` | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` |
| 22 | `supabase/migrations/20260725140000_b1_22_secure_draft_mutations_01.sql` | `da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242` |
| 23 | `supabase/migrations/20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` |
| 24 | `supabase/migrations/20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` |

### G3 — Post-verifier (READ-ONLY catalog / harness)

| Seq | SQL post-verifier | Bun source contract | Local PG17 harness |
|---:|---|---|---|
| 21 | `…/21-B1_21_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql` | `tests/student-requests/b1-secure-read-contracts-01.test.ts` | `tests/b1-secure-read/pg/` (25/25) |
| 22 | `…/22-B1_22_SECURE_DRAFT_MUTATIONS_01-POST-VERIFIER.sql` | `tests/student-requests/b1-secure-draft-mutations-01.test.ts` | `tests/b1-secure-draft/pg/` (35/35) |
| 23 | `…/23-B1_23_TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01-POST-VERIFIER.sql` | `tests/student-requests/b1-integrated-runtime-e2e-01.test.ts` | `tests/b1-integrated-runtime/pg/run-harness.ps1` |
| 24 | `…/24-B1_24_FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01-POST-VERIFIER.sql` | same integrated runtime suite | same integrated harness; require **5/5** completed, `fail_rows=0`, EC regression green |

After each apply also re-check:

- No unexpected new objects beyond expected_object_proof.
- Protected enrollment_certificate surfaces unchanged.
- Five services still `student_visible=false`; workflows still inactive until gate 25.

### G4 — Authorization smoke (prepare matrix; execute only under later apply approval)

Direct RPC calls only. No UI-only evidence. Every DENY must prove **zero mutation** (request/step/event/detail/attachment/notification/`updated_at`).

Do **not** create real users, send SMS/Email, or touch protected IDs.

### G5 — Stop conditions (hard halt; no next batch)

Stop the entire chain and do **not** advance when any of:

- apply failure
- partial apply / ambiguous catalog state
- verifier mismatch (SQL or harness)
- unexpected object / ACL / search_path drift
- authorization bypass (positive role missing or negative role allowed)
- protected `enrollment_certificate` regression
- any attempt to reset / cleanup / delete / repair migration history
- dry-run proposing zero, two, or more migrations

On stop: preserve evidence; remediate **only** via reviewed **forward** migration (`rollback_by_forward`). Never down-migrate; never rewrite historical rows.

---

## Per-stage cards (21–25)

### Stage 21 — Secure Read Contracts

| Gate | Content |
|---|---|
| **G0** | Draft blob `50a86277…` / draft SHA-256 `0470e807…`; migration SHA-256 `cd716700…`; PROMOTION-MAP order 21; manifest sequence_order 21 |
| **G1** | Preflight asserts assignment helpers + required relations exist; **nine** secure-read RPCs **absent** |
| **G2** | Apply **only** `20260725130000_b1_21_secure_read_contracts_01.sql` (doc command above) |
| **G3** | Post-verifier: nine SECURITY DEFINER RPCs; authenticated EXECUTE only; anon/PUBLIC denied; helpers private; capability not hardcoded `true`; no viewer identity |
| **G4** | Smoke: capability fail-closed; owner student read ALLOW; non-owner DENY+zero mutation; unassigned staff inbox empty/deny; attachment metadata omits bucket/path/object_key |
| **G5** | Any signature/ACL/privacy/mutation failure → STOP |

Creates reads only. Does **not** open draft writes. Does **not** activate.

### Stage 22 — Secure Draft Mutations

| Gate | Content |
|---|---|
| **G0** | Draft blob `c4e6ad0f…` / SHA-256 `e8610fbe…`; migration SHA-256 `da6754dc…`; order 22 |
| **G1** | Secure-read helpers present; draft RPCs **absent**; trusted validators present |
| **G2** | Apply **only** `20260725140000_b1_22_secure_draft_mutations_01.sql` |
| **G3** | create/save RPCs authenticated-only; idempotency table without authenticated DML; unique open-draft index; capability `writes_available` gated |
| **G4** | Smoke: create ALLOW for eligible student when readiness true; DENY when `student_visible` false / no workflow; save requires `expectedUpdatedAt`; stale → `B1_STALE_REQUEST_VERSION`; idempotent retry; non-owner DENY+zero mutation |
| **G5** | Any harness FAIL / ACL miss → STOP |

Submit remains `submit_b1_student_request_atomic` (already in earlier stack). Activation still gate 25.

### Stage 23 — Transfer Department Scope Position Assignment

| Gate | Content |
|---|---|
| **G0** | Draft blob `c80e74ef…` / SHA-256 `85d6a256…`; migration SHA-256 `4bc35f9b…`; order 23 |
| **G1** | Preflight for transfer scope function baseline |
| **G2** | Apply **only** `20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` |
| **G3** | Function body uses `assigned_position_assignment_id` path; anon EXECUTE denied |
| **G4** | Smoke: exact active position_assignment + matching unit/role/department ALLOW; wrong source/target department DENY+zero mutation; no admin/registrar/dean bypass vocabulary |
| **G5** | Scope bypass or harness FAIL → STOP |

### Stage 24 — File Withdrawal Impact Ack NULL Guard

| Gate | Content |
|---|---|
| **G0** | Draft blob `b1cc3d0f…` / SHA-256 `684aac3b…`; migration SHA-256 `67257aa9…`; order 24 |
| **G1** | Preflight for persist_validated_b1_request_details baseline |
| **G2** | Apply **only** `20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` |
| **G3** | Body uses `IS DISTINCT FROM true` for impact acknowledgment; integrated harness 5/5 |
| **G4** | Smoke: missing / JSON null / false ack DENY; true ack path remains for eligible owner; EC regression suite green |
| **G5** | NULL-unsafe compare regression or EC regression → STOP |

### Stage 25 — Activation Gate (separate; after 21–24 all PASS)

**Not a migration.** Do not place activation SQL in the same batch as 21–24.

Prerequisites (all required):

1. Seq 21–24 each have independent apply approval + G0–G4 PASS evidence.
2. Integrated runtime proof **5/5** with `fail_rows=0` on disposable PG17 (or approved equivalent).
3. Production read-only reconfirm: all five `student_visible=false`; workflows inactive until explicitly activated.
4. Protected records checksums unchanged.
5. Deploy/release SHA provenance proven for the runtime that will serve the services (independent gate).
6. Separate human approvals for: workflow activation (per service), then `student_visible` (per service), then Deploy/Publish — never bundled with migration apply.

Recommended activation order (one service at a time):

`enrollment_suspension` → `excused_absence` → `file_withdrawal` → `department_transfer` → `final_chance`

For each service:

1. Activate **only** that reviewed workflow version (`is_active=true`); re-read others remain inactive.
2. Run full direct-RPC positive/negative matrix for that service (below).
3. Only after matrix PASS, separately authorize `student_visible=true` for **that** service alone.
4. Smoke; then proceed to next service.

This package **does not** authorize any of those writes.

---

## Production authorization verification matrix (PREPARED — not executed)

Rules: **direct RPC** only; **zero mutation** on every DENY; no real identity creation; do not touch protected IDs.

### Role cells (apply to each relevant RPC / step)

| Cell | Expectation |
|---|---|
| **Positive** | Exact direct assignee with matching `processing_unit` + `processing_role` (+ department/position_assignment rules for transfer) → ALLOW |
| Negative: anon | DENY + zero mutation |
| Negative: unauthenticated / wrong JWT | DENY + zero mutation |
| Negative: student non-owner | DENY + zero mutation |
| Negative: student owner on staff-only RPC | DENY + zero mutation |
| Negative: same role, not assigned | DENY + zero mutation |
| Negative: wrong unit | DENY + zero mutation |
| Negative: wrong role | DENY + zero mutation |
| Negative: admin / registrar / dean broad bypass | DENY + zero mutation (no bypass) |
| Negative: confirm_payment via generic `act_on` | DENY; payment only via specialized RPC with `stepId` + optional note |

### RPC groups to exercise (after corresponding stage applied)

| Stage | RPCs |
|---|---|
| 21 | `get_b1_secure_read_runtime_capability`, form options, draft/details/list student reads, staff inbox/details, step allowed actions, attachment metadata list |
| 22 | `create_b1_request_draft_for_student`, `save_b1_request_draft_for_student` (incl. stale / idempotent / duplicate) |
| 23 | transfer department scope helper via staff act path on transfer steps |
| 24 | withdrawal submit/persist path with ack variants |
| Prior stack (already required) | `submit_b1_student_request_atomic`, `act_on_b1_student_request_step_atomic`, `record_external_university_payment_confirmation` |

Attachment download: browser may send **attachmentId only**; signed URL generation stays server-side; DENY must not leak bucket/path/object_key.

---

## Safe-disable / rollback-by-forward plan

| Situation | Action |
|---|---|
| Defect found **before** gate 25 activation | Prefer forward migration that REVOKEs/replaces defective functions or keeps capability fail-closed; draft workflow rows may be corrected while still inactive |
| Defect found **after** a schema apply but services still hidden | Keep `student_visible=false`; forward-fix RPC bodies; do not activate |
| Need to disable a live service later | Safe-disable = set workflow `is_active=false` and/or `student_visible=false` via **new reviewed forward change** under separate approval — never delete historical requests/attachments/events |
| Partial / failed apply | STOP; do not repair `schema_migrations` manually; do not reset/cleanup/delete; escalate with evidence; remediate forward-only |
| Forbidden | down-migrations; `migration repair`; editing applied migration files; backfill/delete of protected or historical data |

Per-entry `rollback_by_forward` strings in the manifest remain authoritative for each seq 21–24 object set.

---

## Protection (never touch)

Do not read-for-mutation, rewrite, or delete:

- `SR-20260716-26BAD4C8`
- `SR-20260715-FEDCB3E1`
- `SR-20260713-2DE64041`
- `USR-2026-000001`
- `USR-2026-000002`

Also protected: live `enrollment_certificate` workflow v2, historical attachment objects, historical absence/chance aliases, audit history. No real user creation; no SMS/Email.

---

## Local verification executed in this package cycle

SOURCE-ONLY checks at package branch from HEAD `a8d6f639f3e89c70253d6fbd85561e5ea8563edd`:

| Check | Result |
|---|---|
| SHA recompute vs PROMOTION-MAP / manifest for seq 21–24 | **PASS** |
| `bun test tests/b1-manifest` | **PASS** 20/20 |
| `bun test` secure-read + secure-draft + integrated-runtime e2e source + independent-review | **PASS** 37/37 |
| `git diff --check` | **PASS** |
| Production / Staging SQL apply | **NOT RUN** |
| Deploy / Publish / activation / `student_visible` | **NOT RUN** |
| Disposable PG17 full harness re-run | **NOT REQUIRED** for this prep package (pins + source contracts green; prior cycle already proved 25/25 + 35/35 + 5/5) |

## Proof that no production operation occurred

This cycle:

- Created only a local git worktree/branch and documentation.
- Ran local fingerprint + Bun source/manifest tests.
- Did **not** link or push SQL to Production/Staging.
- Did **not** run `supabase db push` against any remote.
- Did **not** Deploy/Publish, activate workflows, flip `student_visible`, create users, or send notifications.

## Assumptions / risks

- Seq 1–20 production apply state is outside this package; operators must prove predecessor seq 20 green before seq 21.
- Manifest `byte_size` drift on secure-read draft is non-blocking while SHA pins match.
- Activation gate 25 still requires separate release-SHA / Deploy provenance proof before any visibility change.
- UI remains fail-closed while services stay hidden — expected and required.

## Production impact

**None** from this package. Preparation and documentation only.

## Verification Evidence

```
HEAD: a8d6f639f3e89c70253d6fbd85561e5ea8563edd
bun test tests/b1-manifest → 20 pass / 0 fail
bun test (
  tests/student-requests/b1-secure-read-contracts-01.test.ts
  tests/student-requests/b1-secure-draft-mutations-01.test.ts
  tests/student-requests/b1-integrated-runtime-e2e-01.test.ts
  tests/student-requests/b1-integrated-runtime-independent-review-01.test.ts
) → 37 pass / 0 fail
git diff --check → clean
Decision: PASS_B1_PRODUCTION_SEQUENTIAL_APPLY_PACKAGE_READY
```
