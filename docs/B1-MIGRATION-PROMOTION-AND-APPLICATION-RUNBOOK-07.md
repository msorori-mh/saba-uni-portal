# B1 Migration Promotion and Application Runbook 07

Status: `SOURCE_ONLY — REQUIRES_USER_APPROVAL`

Pinned source: controlled promotion branch over `origin/main@ae959be`

Checksum rule: git-blob / LF-normalized SHA-256 only

This runbook prepares ordering and evidence only. No command below was run against
Supabase, and no draft is an approved migration.

## Files that must never be applied

- `REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql`: documentary source contract.
- `SUSPENSION-ABSENCE-SOURCE-01.sql`: documentary source contract.
- `FILE-WITHDRAWAL-SOURCE-01.sql`: superseded by the stricter 05A detail draft.
- `ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql`: outside B1 and
  protected from historical notification backfill in this sequence.

## Exact coordinated dependency order

The reviewed atomic caller runtime must be deployed first while all five B1
services remain inactive. Before its RPC exists it fails closed; it never falls
back to legacy direct writes. Capture that deploy as the order-1 stamp comment
before any draft that revokes legacy detail writes.

After that release evidence is captured, each SQL row must be independently
promoted to one timestamped file under `supabase/migrations`, reviewed, and
applied alone. A later row cannot be applied until the earlier row passes
post-verification. No service is activated anywhere in this sequence.

| Order | Draft | SHA-256 (LF/git-blob) | Gate |
|---:|---|---|---|
| 1 | Runtime release containing atomic caller + `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` | stamp `893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357`; release SHA `MISSING RELEASE EVIDENCE` | Deploy reviewed web/server artifact; replace placeholder with exact 40-char lowercase SHA; all B1 services remain inactive |
| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` | `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0` | Review current bytes and schema signatures |
| 3 | `REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` | `e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf` | Fresh read-only verification of every embedded identity and department |
| 4 | `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql` | `a92505d71ba6e02d29b4993d10da8ff8e2f91e5fa62549a6a7efe74c1dc8b58a` | Installs the fail-closed dispatcher stub only |
| 5 | `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` | `da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b` | External university confirmation; no `fee_type.code`, amount, currency, invoice, gateway transaction, or internal balance |
| 6 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `8487c5ae0ac8b85965de9dd08dafb934550a16e1450b0bedf4f847c5ef17849c` | Caller release already proven; approved private bucket/policy prerequisite; no public URLs |
| 7 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` | Exact academic reference catalog signatures |
| 8 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205` | Preserve historical values without mapping/backfill |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe` | Caller release already proven; exact trigger, ACL, RLS and owner policy inventory |
| 10 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `1a2bba070d81b072faf61fe87b62fb8fe114b3fe3611ecb45ba18173cebf9ee9` | Caller release already proven; exact table/constraint/ACL/RLS inventory |
| 11 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `4b2124a829b3e6b57979ce50a7638d3b9b6af798f83f6a4e8772cb8ff36ceded` | Secure opaque attachment contract present |
| 12 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704` | Final exam chance only; new writes use `final_chance`; no scan or backfill |
| 13 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495` | Installs locked primitive without invoking it |
| 14 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c` | Replaces stub with exact five-service dispatcher |
| 15 | Free-service workflows `B1-FREE-SERVICE-WORKFLOWS-08.sql` | `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c` | Inactive drafts for `enrollment_suspension`, `excused_absence`, `file_withdrawal`; no payment steps |
| 16 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` for `department_transfer` and `final_chance` only | `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250` | Inactive drafts only; exact bindings; no duplicate definitions from row 15 |
| 17 | ACL cutover `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` | Requires row-1 release evidence comment; proves all five detail boundaries; one atomic write-revoke cutover |
| 18 | Per-service activation and `student_visible` | `SEPARATE APPROVAL` | Never bundled with schema/runtime migrations |

## Single-migration command envelope

The final executable command is not pinned until a draft is promoted to a
timestamped migration and is the **only** local migration absent from remote
history. After fresh explicit approval, the operator must run this exact envelope
with the approved CLI version and already-approved project link:

```powershell
$expectedSha = '<APPROVED_LOWERCASE_SHA256>'
$migrationPath = '<APPROVED_SINGLE_TIMESTAMPED_MIGRATION_PATH>'
$actualSha = (git cat-file blob ("HEAD:" + ($migrationPath -replace '\\','/')) | python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())")
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_MISMATCH' }
supabase migration list --linked
supabase db push --linked --dry-run
$actualSha = (git cat-file blob ("HEAD:" + ($migrationPath -replace '\\','/')) | python -c "import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())")
if ($actualSha -ne $expectedSha) { throw 'MIGRATION_SHA_CHANGED_AFTER_DRY_RUN' }
supabase db push --linked
supabase migration list --linked
```

Fail closed unless the dry-run reports exactly one expected timestamp and the
two SHA checks match the separately approved SHA.
`db push` is forbidden if it proposes zero, two, or more migrations. Never use
`--include-all`, `migration repair`, direct history writes, reset, cleanup, or a
raw `psql -f` substitute. These commands remain documentation, not authorization.
`Get-FileHash` on a CRLF working tree is not authoritative.

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

## Per-service promotion after schema PASS

For each service in order
`enrollment_suspension` → `excused_absence` → `file_withdrawal` →
`department_transfer` → `final_chance`:

1. preflight
2. pin SHA
3. apply one migration only
4. post-verification
5. RPC authorization matrix
6. service-specific E2E
7. activate that service workflow only
8. change `student_visible` for that service only (separate approval)
9. Deploy/Publish (separate approval)
10. smoke test
11. proceed to the next service only after PASS

## Current decision

No application command is executable now: order 1 release evidence, order 3
identities, order 6 storage prerequisites, and explicit per-migration approval
remain unresolved. Free-service workflows and ACL cutover source drafts are pinned.
`student_visible`, Deploy/Publish, and production writes remain separate gates.
