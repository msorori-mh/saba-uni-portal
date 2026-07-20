# B1-FRESH-PRODUCTION-READONLY-PREFLIGHT-03 — REPORT

**Date:** 2026-07-20
**Repository:** msorori-mh/saba-uni-portal
**Supabase production:** wpmicqriltrowwonknox
**Site:** https://quboolye.com
**Requested deployed SHA:** `6332095be8db2278d2240b91c76faca27778e00d`
**Current `origin/main` (reference):** `7d97a128a5c060749c05f15d6965dc205e007a6e`
**Workspace `HEAD` at preflight:** `df9e9db2778601d7bce282653d5ca3ad13e6a58b` (Lovable auto WIP; no source-of-truth diff relevant to this preflight — read-only phase)

Scope: read-only. No SQL writes, no migration apply, no data mutation, no bucket/policy creation, no workflow activation, no `student_visible` change, no publish/deploy, no reset/cleanup.

---

## 1. Live Deployment Smoke — `https://quboolye.com`

| Path | HTTP | Bytes | RouteTree/JS errors in HTML |
|---|---|---|---|
| `/` | 200 | 70777 | none |
| `/portal-login?type=student` | 200 | 25737 | none |
| `/portal-login?type=faculty` | 200 | 25737 | none |
| `/portal-login?type=staff` | 200 | 25638 | none |
| `/admin` | 200 | 8786 | none |
| `/verify-document` | 200 | 20164 | none |

No white page, no `routeTree` runtime error string, no missing JS/CSS asset markers in served HTML.

### Deployment provenance

- Source SHA published (per B1-CURRENT-MAIN-SYNC-AND-VERIFIABLE-DEPLOY-01 report): `6332095be8db2278d2240b91c76faca27778e00d`.
- Deployment ID / Artifact ID: **not exposed** to the read-only agent (Lovable does not surface a build fingerprint in HTTP responses or via any read-only tool available here).
- Publish time: previous turn (2026-07-20).
- Environment URL: https://quboolye.com

**Provenance limitation:** Live HTTP responses do not carry a build fingerprint that can be independently tied to `6332095…`. The linkage rests on the earlier deploy report only.

## 2. Services (read-only)

| code | is_active | student_visible | active workflows | requests |
|---|---|---|---|---|
| `enrollment_certificate` (control) | t | **t** | 1 | 4 |
| `department_transfer` | t | f ✅ | 0 ✅ | 0 ✅ |
| `enrollment_suspension` | t | f ✅ | 0 ✅ | 0 ✅ |
| `excused_absence` | t | f ✅ | 0 ✅ | 0 ✅ |
| `file_withdrawal` | t | f ✅ | 0 ✅ | 0 ✅ |
| `final_chance` | t | f ✅ | 0 ✅ | 0 ✅ |

Five deferred services remain hidden and unactivated with zero requests and zero test data. Control service `enrollment_certificate` unchanged.

## 3. Protected Records (read-only, unchanged)

| id | number | status | step |
|---|---|---|---|
| `93807768-a281-42de-bfb4-0c0c03786b20` | SR-20260713-2DE64041 | in_review | 0 |
| `9cfd55a4-b2bf-4266-9c06-52f007ef3afe` | SR-20260715-FEDCB3E1 | completed | 7 |
| `ec85cca4-ac93-462c-a0a5-83e8b915bedc` | SR-20260716-26BAD4C8 | completed | 7 |

Documents `USR-2026-000001` and `USR-2026-000002` both `archived`. No backfill or correction performed.

## 4. Migrations History

- `docs/migration-drafts/` contains **29 `.sql` files**, not 18. The authoritative "18 approved drafts" list is not enumerated inside the workspace, so a strict 18-file SHA-256 audit cannot be certified here.
- `git diff --stat 367d899e…  7d97a128…  -- docs/migration-drafts/` → empty; **no draft was modified** between the last release RC and current `origin/main`.
- Supabase `schema_migrations` table not readable via the exec role (`permission denied for schema supabase_migrations`), so direct applied-list enumeration is not possible from this agent.
- Presence of `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` in drafts and unchanged `log_audit` overload state (see §5) is consistent with **not applied**.
- First eligible draft per stated sequence: `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` (state: `not_applied`).

## 5. `log_audit` and shared functions

| overload | args |
|---|---|
| 6-arg | `_entity_type text, _entity_id uuid, _action_type text, _old jsonb, _new jsonb, _notes text` |
| 7-arg | `+ _actor_user_id uuid` |

Both overloads present; **ambiguity condition unchanged** (matches the `cancel_official_document` failure reported previously). `cancel_official_document(_document_id uuid, _reason text)` still installed. No partial B1 remediation detected.

## 6. Department Chairs (unchanged)

Faculty profile ↔ department binding (source of the CS/IT conflict):

| emp # | name | fp.department_id | dept |
|---|---|---|---|
| F2025004 | د. رمزي حميد الجابري | `22222222-…` | IS |
| F2025005 | د. خالد قاسم محمد البراحي | `ce485c67-…` | IT |
| F2025006 | د. اسامه عبدالجليل احمد سيف | `ce485c67-…` | **IT (should be CS)** |

Active `department_head` assignments per department:

| dept | active chairs |
|---|---|
| علوم الحاسوب (CS) | **0** ❌ |
| تقنية المعلومات (IT) | **2** ❌ |
| نظم المعلومات (IS) | 1 ✅ |

PR #165 controlled-fix package **not applied**. State identical to previous audit. Not corrected in this phase.

## 7. Storage & Attachments

Buckets (relevant, private):
- `student-request-attachments` — `public=false` ✅
- `official-documents` — `public=false` ✅, with `official_documents_deny_client_select` (SELECT on `bucket_id <> 'official-documents'`)
- `payment-receipts` — `public=false` ✅
- `council-topic-attachments` — `public=false` ✅

`student-request-secure-attachments`: **does not exist**.

Storage policies on `storage.objects` reviewed (38 policies). Relevant for the five services' attachment contract:
- `sra_storage_insert_self` — INSERT scoped to owner folder
- `sra_storage_select_self` — SELECT owner-only
- `sra_storage_select_priv` — SELECT via `student_request_attachments` join and `can_access_student_service_request(auth.uid(), request_id)`
- `sra_storage_delete_self` / `sra_storage_delete_admin` / `sra_storage_update_own`
- No broad public SELECT on `student-request-attachments`.

**Contract classification:** `REUSE_SAFE` for `student-request-attachments` (private bucket, owner+privileged-role SELECT via RPC-guarded predicate, no broad public read). No new private bucket required at this stage. No policy delta required to preserve current invariants.

## 8. Roles & Assignments

Units (9): `archive`, `dean`, `department`, `finance`, `graduate_affairs`, `labs`, `library`, `registrar`, `student_affairs`.

Roles (11): `archive_officer`, `dean`, `department_head`, `revenue_finance_officer`, `graduate_affairs_manager`, `graduate_affairs_specialist`, `labs_manager`, `library_officer`, `registrar_general`, `student_affairs_manager`, `student_affairs_specialist`.

Active `request_processing_assignments`: **13**. No admin/registrar/dean broad bypass detected in the hardened `user_matches_workflow_runtime_step` chain (unchanged since STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING apply). No fabricated staff or invented role introduced this phase.

Direct-RPC authorization matrix readiness: gated by (a) `log_audit` disambiguation apply, and (b) CS/IT chair correction. Both blockers persist.

## 9. Compliance — Zero Production Writes

| Prohibition | Status |
|---|---|
| SQL writes | ❌ none |
| Migration apply / db push | ❌ none |
| Data modification | ❌ none |
| Bucket / policy create/modify | ❌ none |
| Workflow activation | ❌ none |
| `student_visible` change | ❌ none |
| Test request / document creation | ❌ none |
| Publish / Deploy | ❌ none |
| reset / cleanup / delete / backfill | ❌ none |
| Department chair modification | ❌ none |

## 10. Blockers (precise)

1. **Deployment provenance**: no build-ID signal exposed to the read-only agent to independently bind live site to `6332095…`. Linkage rests solely on the prior deploy report.
2. **18-draft SHA audit unfulfilled**: `docs/migration-drafts/` holds 29 files; the authoritative 18-file list is not enumerated in-workspace. Strict per-file SHA-256 attestation deferred until that list is provided.
3. **`schema_migrations` read blocked**: exec role has no read privilege on `supabase_migrations`, preventing an authoritative applied-vs-not-applied cross-check.
4. **CS/IT chair conflict persists**: CS = 0 chairs, IT = 2 chairs; PR #165 package not applied.
5. **`log_audit` ambiguity persists**: both 6-arg and 7-arg overloads coexist; `cancel_official_document` still exposed to prior failure mode.

## 11. Decision

# HOLD_B1_FRESH_READONLY_PREFLIGHT

Rationale: Service invariants, protected records, storage contract, roles/assignments, and draft-file integrity vs `origin/main` all pass. However, three of the mandated attestations cannot be independently satisfied from the read-only surface available to this agent — deployment build-ID linkage to `6332095…`, an authoritative 18-draft enumeration, and applied-migration listing from `supabase_migrations`. Additionally the two known blockers (`log_audit` ambiguity and CS/IT chair conflict) remain unresolved. Per scope, `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql` is **not** applied and awaits a separate explicit authorization phase.

### Requested unblocks (owner action, before first sequential apply)

1. Provide (or point to) the authoritative 18-draft ordered list so file-level SHA-256 attestation can be produced.
2. Provide a deployment fingerprint (Deployment ID / build hash) that binds `https://quboolye.com` to `6332095be8db2278d2240b91c76faca27778e00d`, or grant read on `supabase_migrations.schema_migrations`.
3. Confirm scope for CS/IT chair correction (PR #165 controlled-fix package) separately — not applied here.
