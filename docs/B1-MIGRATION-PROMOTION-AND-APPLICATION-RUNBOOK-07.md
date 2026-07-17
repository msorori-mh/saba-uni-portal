# B1 Migration Promotion and Application Runbook 07

Status: `SOURCE_ONLY — REQUIRES_USER_APPROVAL`  
Pinned source: `main@f375bc965505bc5e729143167e7efd8b4f8044b3`

This runbook prepares ordering and evidence only. No command below was run against
Supabase, and no draft is an approved migration. The local environment currently
has no `supabase` CLI executable.

## Files that must never be applied

- `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql`: documentary source contract.
- `SUSPENSION-ABSENCE-SOURCE-01.sql`: documentary source contract.
- `FILE-WITHDRAWAL-SOURCE-01.sql`: superseded by the stricter 05A detail draft.
- `ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql`: outside B1 and
  protected from historical notification backfill in this sequence.

## Exact coordinated dependency order

The reviewed atomic caller runtime must be deployed first while all five B1
services remain inactive. Before its RPC exists it fails closed; it never falls
back to legacy direct writes. This release-first gate prevents the ACL changes
embedded in secure-attachment, absence, withdrawal and final-chance drafts from
breaking an old deployed caller.

After that release evidence is captured, each SQL row must be independently
promoted to one timestamped file under `supabase/migrations`, reviewed, and
applied alone. A later row cannot be applied until the earlier row passes
post-verification. No service is activated anywhere in this sequence.

| Order | Draft | SHA-256 at pinned source | Gate |
|---:|---|---|---|
| 1 | Runtime release containing atomic caller | `MISSING RELEASE EVIDENCE` | Deploy reviewed web/server artifact from `f375bc9`; prove artifact/source SHA; all B1 services remain inactive |
| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `956b47dca679dcc6ce987889816799765aecb852404fc1e1e859c9771dfaa140` | Review current bytes and schema signatures |
| 3 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` | `bcc34dd68aa2683c8d7df35d12042bbd195545374d96e56a0dc293481fe5fc32` | Fresh read-only verification of every embedded identity and department |
| 4 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` | `6e0397ad5bfd49672acb9c1d4d5aadfaefd2897afcc8100834fbcc5b27f1ef17` | Installs the fail-closed dispatcher stub only |
| 5 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` | `f51fc5b20c55aec6b2ce7d94f3153345073f09ef24333dddb0489bf0885274c2` | External university confirmation; no `fee_type.code`, amount, currency, invoice, gateway transaction, or internal balance |
| 6 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `6ac787bea5df69441842b8a28dfb4dc004428f64aa41e727d195aedd9ea15bc8` | Caller release already proven; approved private bucket/policy prerequisite; no public URLs |
| 7 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `56dcdd09bb9f442277a6badebf928a94523aa171c64340c62e6defbfc7724610` | Exact academic reference catalog signatures |
| 8 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `928fe43e969c883e9dc58cef536e392daa8231f7240fd68204c15eadabf344e2` | Preserve historical values without mapping/backfill |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `a2df14b18d1ffc6876b2b619744539541bf9925f49f3236093689b6c60b335ca` | Caller release already proven; exact trigger, ACL, RLS and owner policy inventory |
| 10 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `0c8a07ef913e400f8479689d85843b24bbd23c4cf5d3ba18586a5af880b9c26f` | Caller release already proven; exact table/constraint/ACL/RLS inventory |
| 11 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `0075222b9e287af4b918d826179bb3516ac746d747006cd2af2ca3bfd2ba9209` | Secure opaque attachment contract present |
| 12 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `79b690f369804e4e1cef8484572dbed6f73b73a7482718267a1228de21f0b5a1` | Final exam chance only; new writes use `final_chance`; no scan or backfill |
| 13 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `347cdf7d3d933afe3f091c58b693a23622586c0ced7ba26ec10c1e004352545b` | Installs locked primitive without invoking it |
| 14 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `060f4fe6abcecb54cc350df81ca505c79dd96b0c3b5333a633437320bc6e4640` | Replaces stub with exact five-service dispatcher |
| 15 | Free-service workflows: `enrollment_suspension`, `excused_absence`, `file_withdrawal` | `MISSING — NO FILE/SHA` | One reviewed executable migration; no payment steps |
| 16 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` for `department_transfer` and `final_chance` only | `dadc1b61fd182c1e3ad2219c351b75f1253fb5ea122dfa9fc401237effc3e2d8` | Inactive drafts only; exact bindings; no duplicate definitions from row 15 |
| 17 | ACL cutover migration | `HOLD — HIGH=2` | Must prove all five boundaries and the row-1 release evidence before one atomic write-revoke cutover |
| 18 | Per-service activation and `student_visible` | `SEPARATE APPROVAL` | Never bundled with schema/runtime migrations |

## Single-migration command envelope

The final executable command is not pinned until a draft is promoted to a
timestamped migration and is the **only** local migration absent from remote
history. After fresh explicit approval, the operator must run this exact envelope
with the approved CLI version and already-approved project link:

```powershell
$expectedSha = '<APPROVED_LOWERCASE_SHA256>'
$migrationPath = '<APPROVED_SINGLE_TIMESTAMPED_MIGRATION_PATH>'
if ((Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLower() -ne $expectedSha) { throw 'MIGRATION_SHA_MISMATCH' }
supabase migration list --linked
supabase db push --linked --dry-run
if ((Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLower() -ne $expectedSha) { throw 'MIGRATION_SHA_CHANGED_AFTER_DRY_RUN' }
supabase db push --linked
supabase migration list --linked
```

Fail closed unless the dry-run reports exactly one expected timestamp and the
two `Get-FileHash` checks match the separately approved SHA.
`db push` is forbidden if it proposes zero, two, or more migrations. Never use
`--include-all`, `migration repair`, direct history writes, reset, cleanup, or a
raw `psql -f` substitute. These commands remain documentation, not authorization.

## Evidence required around every single apply

1. Record `origin/main` SHA, promoted migration path/SHA, CLI version, target
   project identity, and independent review PASS with CRITICAL/HIGH = 0.
2. Export read-only preflight evidence: migration history, object signatures,
   ACL/RLS/policies, active workflow versions, direct assignee counts,
   `student_visible`, storage and audit/event counts. Prove the mutation set excludes
   request `93807768-a281-42de-bfb4-0c0c03786b20`, request number
   `SR-20260713-2DE64041`, preserved request `SR-20260715-FEDCB3E1`, and user
   `USR-2026-000001`; prohibit historical notification backfill.
3. Capture complete dry-run output proving exactly one migration.
4. Apply once. On error or partial state, stop the chain and preserve evidence;
   do not repair, reset, delete, or continue.
5. Run schema verification, the complete direct RPC ALLOW/DENY matrix, no-mutation
   negative cases, policy invariants, protected-ID checks, and history verification.
6. Only after PASS may the next migration be promoted for a separate approval.

## Current decision

No application command is executable now: order 1 release evidence, order 3
identities, order 6 storage prerequisites, order 15 workflows, and order 17 cutover
are unresolved. `student_visible`, Deploy/Publish, and production writes remain
separate gates.
