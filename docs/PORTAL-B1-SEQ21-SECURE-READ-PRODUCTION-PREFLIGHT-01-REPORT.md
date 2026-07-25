# PORTAL-B1-SEQ21-SECURE-READ-PRODUCTION-PREFLIGHT-01

## Decision

**HOLD_B1_SEQ21_PRODUCTION_READONLY_ACCESS_UNAVAILABLE**

Local source identity, static SQL review, disposable PostgreSQL 17 Secure Read matrix, second-apply refuse, and Bun contracts are **green**.  
Production read-only interrogation of project `wpmicqriltrowwonknox` could **not** be performed with any authorized tool available in this session (Supabase CLI list/link lacks privilege to that project ref; no DB URL / service-role credentials present). Per mission gate G4, this blocks full production preflight PASS.

No migration was applied. No Production DDL/DML. No activation / `student_visible` / Deploy / Publish.

When Production read-only access is restored, re-run G4 only (plus confirm SHA pin), then a **separate** human approval may authorize SEQ21 alone.

## G0 — Source tip

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| `origin/main` | `c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4` |
| PR #221 | **MERGED** (`mergedAt=2026-07-25T21:37:13Z`) |
| Merge commit | `c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4` (matches) |
| Worktree | `C:\projects\saba-uni-portal-b1-seq21-preflight-01` |
| Branch | `preflight/b1-seq21-secure-read-production-01` |
| Mode | READ-ONLY / PREPARATION-ONLY |

## G1 — Migration 21 identity (single authoritative pin)

Cross-checked: Final Unified Source RC ancestry · sequential apply final package · `B1-SEQUENTIAL-APPLY-MANIFEST.json` · `PROMOTION-MAP.json` · promoted migration file · verifiers · Secure Read PG harness.

| Field | Value |
|---|---|
| Sequence | **21** (ONE MIGRATION ONLY) |
| Canonical draft | `docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql` |
| Draft SHA-256 (LF) | `0470e807fe3733658930b7916524c36e0f00b96ea5f48d962ea582144ecdd027` |
| Draft git blob SHA-1 | `50a862770dd0ea55cc316720f25f8dff2843942a` |
| **Promoted migration (apply artifact)** | `supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql` |
| **Migration SHA-256 (LF)** | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` |
| Migration git blob SHA-1 | `397059177c4de3baa8d569489bde2a4d871764f9` |
| Manifest `canonical_id` | `B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20` |
| Manifest `sequence_order` | 21 |
| Predecessor | `B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-19` (seq 20) — required before apply |
| Preflight SQL | `docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-PREFLIGHT.sql` |
| Post-verifier SQL | `docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql` |
| Local harness | `tests/b1-secure-read/pg/run-harness.ps1` → `40-verifier.sql` |
| Follow-on (not this batch) | seq **22–24** migrations; gate **25** non-migration |

Recomputed LF SHA-256 of promoted migration at `c1a6a8e…` **matches** PROMOTION-MAP + manifest `migration_sha_lf`.

### Objects created / replaced

**Internal helpers (no authenticated GRANT):**

1. `b1_canonical_to_stored_codes(text)` — SQL IMMUTABLE  
2. `b1_stored_to_canonical(text)` — SQL IMMUTABLE  
3. `b1_is_five_service_type(text)` — SQL IMMUTABLE  
4. `b1_map_ui_staff_action(text)` — SQL IMMUTABLE  
5. `b1_require_auth_uid()` — PL/pgSQL STABLE **SECURITY DEFINER**  
6. `b1_deny_read()` — PL/pgSQL STABLE **SECURITY DEFINER**  
7. `b1_attachment_meta_json(student_request_attachment_uploads)` — SQL STABLE  
8. `b1_list_attachment_metas_for_request(uuid)` — SQL STABLE **SECURITY DEFINER**  
9. `b1_map_request_status(text)` — SQL IMMUTABLE  

**Nine authenticated read RPCs (SECURITY DEFINER, `search_path = public, pg_temp`):**

1. `get_b1_secure_read_runtime_capability()`  
2. `get_b1_request_form_options(text)`  
3. `get_b1_request_draft_for_student(uuid)`  
4. `get_b1_request_details_for_student(uuid)`  
5. `list_b1_requests_for_student(integer,integer)`  
6. `get_b1_assigned_inbox_for_actor(integer,integer)`  
7. `get_b1_assigned_request_details_for_actor(uuid)`  
8. `get_b1_step_allowed_actions(uuid)`  
9. `list_b1_request_attachments_for_viewer(uuid)`  

### GRANT / REVOKE

- Helpers: `REVOKE ALL … FROM public, anon, authenticated`  
- Nine RPCs: `REVOKE ALL … FROM public, anon` then `GRANT EXECUTE … TO authenticated` only  
- No GRANT to `anon`  
- No table GRANTs  

### Dependencies (runtime)

- `public.user_matches_workflow_runtime_step(uuid)` must exist  
- `public.can_current_user_act_on_step(uuid,text)` must exist  
- Relations: `student_requests`, `student_request_workflow_steps`, `request_types` (+ `student_visible`), `request_type_workflows`, `student_profiles`, `student_request_attachment_uploads`, plus catalog tables used by form options  

Refuse-on-retry: if `get_b1_secure_read_runtime_capability()` already exists → exception `b1 secure read contracts already exist; refuse ambiguous retry`.

## G2 — Static SQL review

| Check | Result |
|---|---|
| Single `BEGIN` … `COMMIT` transaction | PASS |
| No uncontrolled dynamic SQL | PASS |
| No DELETE / TRUNCATE / data reset / cleanup | PASS |
| No mutation of existing request rows | PASS |
| No `student_visible` write | PASS |
| No workflow activation | PASS |
| No workflow history rewrite | PASS |
| No admin/registrar/dean broad bypass | PASS (assignment helpers only) |
| No GRANT to anon | PASS |
| No bucket/path/object_key/signed URL in DTOs | PASS (`storage_ref = 'att:' \|\| id`) |
| Auth via `auth.uid()` + fail-closed | PASS (`AUTHENTICATION_REQUIRED` / `B1_READ_ACCESS_DENIED`) |
| Does not target `enrollment_certificate` | PASS (source contracts + independent review assert) |

## G3 — Local PostgreSQL 17 (disposable)

Harness: `tests/b1-secure-read/pg/run-harness.ps1` on `postgres:17-alpine`.

| Gate | Result |
|---|---|
| Server version | **17.10** |
| Preflight | `PREFLIGHT_OK_B1_SECURE_READ_CONTRACTS_01` |
| Apply (draft track used by harness) | COMMIT |
| Post-verifier | `POST_OK_B1_SECURE_READ_CONTRACTS_01` |
| Secure Read matrix | **25/25 PASS** (`B1_SECURE_READ_PG17_PASS`) |
| Authorization positive/negative (RPC direct) | embedded in 25 cases — **0 FAIL** |
| Zero-mutation assertion | PASS (`requests=2 steps=2 attachments=1 events=0 notifications=0`) |
| Second-apply refuse | PASS — ERROR `already exist; refuse ambiguous retry` (exit ≠ 0; transaction aborted) |
| Bun contracts (manifest + secure-read + independent review) | **42 pass / 0 fail** |
| Enrollment certificate outside track | asserted by independent-review test |

Production was **not** used for G3.

## G4 — Production read-only preflight

| Attempt | Result |
|---|---|
| Target project ref | `wpmicqriltrowwonknox` (required) |
| `bunx supabase projects list` | Authenticated account sees other projects (`kaovsim…`, `sjmtiwz…`, `pgiidp…`) — **not** `wpmicqriltrowwonknox` |
| `bunx supabase link --project-ref wpmicqriltrowwonknox` | **FAIL** — `LegacyLinkProjectStatusError` / insufficient privileges |
| Local `.env` / DB URL / service role | **Absent** in worktree |
| MCP / other approved prod SQL tools | **None available** in this agent session |

Therefore **no** migration-history SELECT, object inventory, protected-row hashes, or hidden-service confirmation could be captured from Production without violating READ-ONLY credential policy.

**HOLD_B1_SEQ21_PRODUCTION_READONLY_ACCESS_UNAVAILABLE**

Required before apply approval (when access is restored — SELECT-only / ROLLBACK scripts):

1. Confirm `current_setting` / project identity = `wpmicqriltrowwonknox`  
2. Migration history: `20260725130000_b1_21_secure_read_contracts_01` **absent**  
3. Migrations 22–24 filenames **absent**  
4. Nine secure-read RPCs **absent** (no partial apply)  
5. Dependencies `user_matches_workflow_runtime_step` / `can_current_user_act_on_step` present once with expected signatures  
6. No conflicting grants on those names  
7. PostgreSQL 17 + required extensions  
8. Five B1 `request_types.student_visible = false`  
9. No operational B1 requests outside expected test markers  
10. No unexpected `TEST_ONLY_FIRST_DELIVERY_5_SERVICES` bleed  
11. Protected IDs unchanged (hash/count/status only):  
    `SR-20260716-26BAD4C8`, `SR-20260715-FEDCB3E1`, `SR-20260713-2DE64041`, `USR-2026-000001`, `USR-2026-000002`  
12. Run `21-…-PREFLIGHT.sql` (ends in `ROLLBACK`)

## G5 — Apply risks (documented; not executed)

| Topic | Assessment |
|---|---|
| Objects changing | CREATE OR REPLACE of 9 helpers + 9 RPCs; ACL revoke/grant |
| Lock duration | Catalog/function replace under single transaction; expect brief AccessExclusive on function OIDs — low row lock risk (no table DML) |
| CREATE OR REPLACE on live functions | First apply should be create-new; REPLACE path exists for forward remediation only |
| Transaction | Single transaction; failure → full ROLLBACK of this migration |
| Rollback behavior | No down-migration; refuse ambiguous retry if capability RPC present |
| Partial apply | Mitigated by transaction + refuse-on-retry + post-verifier requiring full nine-RPC set |
| Post-apply verifier | `21-…-POST-VERIFIER.sql` + local `40-verifier.sql` pattern + Bun source contracts |
| Immediate stop | SHA mismatch; dry-run ≠ exactly one migration; preflight fail; post-verifier fail; ACL drift; any mutation/privacy fail; EC regression |
| Forward-only remediation | New reviewed migration to replace/revoke; never edit applied SQL; never rewrite history |

## G6 — Next apply package (**DO NOT EXECUTE HERE**)

**ONE MIGRATION ONLY = SEQ21**

```powershell
# DOCUMENTATION ONLY — requires SEPARATE explicit human approval
# Forbidden in this mission: db push, any DDL/DML, seq 22-24, gate 25

$migrationPath = 'supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql'
$expectedSha  = 'cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca'

# 0) Provenance
git fetch origin --prune
git rev-parse origin/main
# must be c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4 or a later reviewed tip that re-pins SHA

# 1) LF SHA-256 pin of HEAD blob must equal $expectedSha

# 2) Production READ-ONLY preflight (G4 checklist) — PASS required

# 3) Dry-run must list EXACTLY this one migration
supabase migration list --linked
supabase db push --linked --dry-run
# STOP unless exactly: 20260725130000_b1_21_secure_read_contracts_01

# 4) Apply once (after approval)
# supabase db push --linked

# 5) Post-apply
# psql -f docs/migration-drafts/b1-backend-verifiers/21-B1_21_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql
# re-check student_visible=false for five services; migration history has 21 only from this batch

# Proof 22-24 NOT applied in same run:
# - dry-run listed one file only
# - migration list after apply shows 21 present and 22/23/24 still absent
# - max_migrations_per_apply_session=1 / batch_apply_forbidden=true
```

Stop conditions: apply failure · partial/ambiguous catalog · verifier mismatch · unexpected objects/ACLs · auth bypass · EC regression · dry-run 0/2+ migrations · any attempt to batch 22–24.

## Explicit non-actions (this mission)

- Did **not** apply migration 21  
- Did **not** apply migrations 22–24  
- Did **not** activate gate 25  
- Did **not** change `student_visible`  
- Did **not** Deploy/Publish  
- Did **not** write to Production  
- Did **not** merge this docs PR to main (if opened)

## Residual blockers

1. **Production read-only access** for `wpmicqriltrowwonknox` must be granted to the approved operator/tooling.  
2. After G4 PASS: separate human approval for SEQ21-only apply.
