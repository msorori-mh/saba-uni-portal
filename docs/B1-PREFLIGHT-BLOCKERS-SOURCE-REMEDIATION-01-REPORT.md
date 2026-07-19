# B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01 — Report

Updated: 2026-07-19 (Asia/Riyadh)
Repository: `msorori-mh/saba-uni-portal`
Branch: `codex/b1-preflight-blockers-source-remediation-01`
Base: `origin/main@5435a877a17b7934c6b5fa462c337a1c9198c23c`
Worktree: `C:\projects\saba-uni-portal-b1-preflight-blockers`

## Decision

```text
PASS_B1_PREFLIGHT_BLOCKERS_SOURCE_REMEDIATED_READY_FOR_RELEASE_DEPLOY_GATE
```

Source blockers identified by PreflightReadonly-01 that are remediable without
production writes are closed in drafts/docs. Remaining gates are Deploy,
Storage approval, department-head administrative decisions, and explicit
per-migration approval. `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.

## Scope

In scope: `enrollment_suspension`, `excused_absence`, `file_withdrawal`,
`department_transfer`, `final_chance`.

Deferred (untouched): six services under
`REMAINING-STUDENT-REQUESTS-SOURCE-READINESS-01 = DEFERRED_USER_LIFECYCLE_INPUT`.

## 1) log_audit remediation (adopted)

### Inventory

| Overload | Signature | Status |
|---|---|---|
| 6-arg | `log_audit(text,uuid,text,jsonb,jsonb,text)` | retained (last defined 20260601) |
| 7-arg | `log_audit(text,uuid,text,jsonb,jsonb,text,uuid)` | retained (latest body 20260624); uses `COALESCE(_actor_user_id, auth.uid())` |

Untyped 5/6-arg positional calls are ambiguous under dual overloads (PostgreSQL
`42725` / “function is not unique”) — the failure class previously observed on
`cancel_official_document`.

### Legal call contract for B1

Every B1 call must use the **explicit typed 7-arg** form (same pattern as
`import_students_account_audit_fix`):

```sql
PERFORM public.log_audit(
  <entity>::text,
  <id>::uuid,
  <action>::text,
  <old>::jsonb,   -- or NULL::jsonb
  <new>::jsonb,   -- or NULL::jsonb
  <notes>::text,  -- or NULL::text
  <actor>::uuid   -- auth.uid() / v_uid; NULL::uuid only when intentional
);
```

Do **not** rely on PostgreSQL overload resolution or DEFAULT on the 7th argument.

### Call sites remediated

| File | Calls | Change |
|---|---|---|
| `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | 5 | untyped 6-arg → typed 7-arg with actor |
| `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | 1 | untyped 6-arg → typed 7-arg with actor |

### Forward-only draft

`REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`
SHA-256: `3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab`

- Asserts both overloads exist; **does not DROP** either.
- Remediates `cancel_official_document` via `CREATE OR REPLACE` with typed 7-arg.
- Does not rewrite historical `audit_logs`.
- Ordered **before** any migration that calls `log_audit`.

## 2) PostgreSQL 17 local compile

Harness: `scripts/b1-local-pg-compile/` (Docker `postgres:17` only).

Pre-checks:

- Untyped 6-arg `log_audit` → `function is not unique` (expected).
- Typed 7-arg → success (no `ambiguous_function` / `undefined_function`).

| File | Compile |
|---|---|
| REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | PASS |
| STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | PASS |
| REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | PASS |
| REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | PASS |
| REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | PASS |
| EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | PASS |
| STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | PASS |
| REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | PASS |
| REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | PASS |
| REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | PASS |
| REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | PASS |
| REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | PASS |
| FINAL-CHANCE-CANONICAL-WRITE-03.sql | PASS |
| REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | PASS |
| REQUEST-B1-SERVICE-DETAILS-05A.sql | PASS |
| B1-FREE-SERVICE-WORKFLOWS-08.sql | PASS |
| EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | PASS |
| REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | PASS |

Overall: `PASS_LOCAL_PG17_COMPILE` (18/18 including new log_audit draft).

Soft idempotency notes unchanged: bare `CREATE TABLE` / trigger inventory rechecks
on attachments and absence vocabulary.

## 3) Release Candidate

See `docs/B1-RELEASE-CANDIDATE-MANIFEST-01.md`.

| Field | Value |
|---|---|
| Proposed RC commit | merge commit of this PR (fill after merge; never invent into stamp) |
| Stamp placeholder | still `APPROVED_RELEASE_COMMIT_PLACEHOLDER` |
| Fail-closed adapters | `runtimeAvailable: false` for all five |
| student_visible | unchanged / separate gate |
| Workflow activation | drafts remain inactive |
| Runtime before migrations | no live B1 write path while adapters fail-closed |

## 4) Storage read-only decision (plan only — not executed)

Evidence from PreflightReadonly-01:

| Item | Production evidence | B1 draft contract |
|---|---|---|
| Bucket | `student-request-attachments` (`public=false`, 3 objects) | `student-request-secure-attachments` |
| Policies | six `sra_*` PERMISSIVE on `authenticated` (select/insert/delete/update variants) | `secure_attachment_insert` only; **no SELECT** policy; audited signed-download RPC |
| Public URLs | none observed | forbidden |
| Download model | policy-level select variants | owner + **directly assigned** staff via RPC only |

### Decision

**Safe reuse of the current bucket as-is: NO.**

Reasons:

1. Bucket **name mismatch** (`student-request-attachments` vs
   `student-request-secure-attachments`).
2. Policy **model mismatch**: existing `sra_*` SELECT/UPDATE surfaces conflict with
   the B1 “no wide SELECT / RPC-signed download only” contract.
3. Existing objects (3) must not be exposed by a permissive SELECT rewrite.

### Required plan (approval-gated; not executed here)

Option A (preferred for B1 contract isolation):

1. Separate Storage approval to create private bucket
   `student-request-secure-attachments` (`public=false`, MIME/size limits).
2. Apply only the draft’s INSERT policy + RPC download path.
3. Forbid public URLs and any broad `SELECT` on `storage.objects` for that bucket.

Option B (reuse existing bucket name — Policy Delta):

1. Separate Storage approval for a Policy Delta that:
   - keeps `public=false`
   - removes/replaces wide `sra_*` SELECT with assignee/owner RPC-only access
   - preserves existing 3 objects without public exposure
2. Align draft CHECK constraints / bucket id to the approved name before apply.
3. Still forbid public URLs.

**This phase writes no bucket and no policy.**

## 5) Department transfer identity decisions (administrative — not executed)

Source: PreflightReadonly-01 processing-domain snapshot. Public report masks
emails; names retained as already published in that report.

| Department | Active heads | Required administrative change |
|---|---|---|
| قسم علوم الحاسوب | **0** | Appoint exactly one active `department_head` for this department (or suspend `department_transfer` until filled) |
| قسم تكنولوجيا المعلومات | **2** — د. خالد قاسم محمد البراحي; د. اسامه عبدالجليل احمد سيف | End/deactivate all but one active head so exactly one direct assignee remains |
| قسم نظم المعلومات الحاسوبية | **1** — د. رمزي حميد الجابري | OK — no change required |

No staff/faculty/assignment mutation is performed in this phase.

## 6) Apply-plan updates

1. **Deploy gate** independent of SQL.
2. **First SQL:** `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`.
3. **First B1 runtime migration:** Actor Authorization Hardening.
4. `file_withdrawal_details` is created by its own migration — **not** a source
   blocker.
5. One migration per approved stage.
6. Deploy, Storage, and `student_visible` remain independent gates.

## 7) Local validation

| Gate | Result |
|---|---|
| Isolated PG17 compile | PASS_LOCAL_PG17_COMPILE (18/18) |
| Focused remediation/runbook/queue tests | PASS |
| `bun test tests/student-requests` | PASS 534/534 |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Independent review | CRITICAL=0 HIGH=0 MEDIUM=0 |
| Production SQL apply | NO |
| Deploy/Publish | NO |

## Non-execution confirmation

```text
Production SQL / Migration apply: NO
student_visible change: NO
Workflow activation: NO
Deploy/Publish: NO
Staff/head/assignment mutation: NO
Bucket / storage policy create or modify: NO
Deferred six services: NO
Applied migrations edited: NO
```

## Next authorized action

Open/merge this source PR, then enter the **Release Deploy Gate** using the RC
manifest. Do not apply migrations until Deploy SHA, Storage approval, department
head decisions, and explicit per-migration approval are obtained.
