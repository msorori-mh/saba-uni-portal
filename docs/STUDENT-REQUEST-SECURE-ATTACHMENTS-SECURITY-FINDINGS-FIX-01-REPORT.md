# STUDENT REQUEST SECURE ATTACHMENTS — SECURITY FINDINGS FIX 01

## Decision

`PASS_SECURE_ATTACHMENTS_HIGH_FINDINGS_SOURCE_FIX`

The three HIGH findings from the independent review are remediated in source and
Draft SQL. `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE` remains `false`. The Draft was
not executed or applied.

## Changes

- Direct-assignment authorization now evaluates assignment identities in strict
  priority order: user, staff profile, faculty profile, then position assignment.
  A populated higher-priority identity cannot be bypassed by a secondary match.
- Authenticated Storage SELECT policies were removed. Download remains behind
  the attached-only authorization RPC, short-lived signed URL, and audit path.
- Secure submit accepts exact attachment UUIDs, derives the student profile from
  `auth.uid()`, locks the request identity to that owner and editable state,
  rejects duplicates or non-attached/mismatched rows, and performs the assertion
  before the existing submit/workflow RPC in the same transaction.
- Generic TypeScript form validation no longer trusts client-provided request or
  student identity. The legacy attachment fallback does not apply to
  `excused_absence`.
- Source guards cover assignment precedence, absence of Storage SELECT policies,
  exact-ID submit ordering, trusted server identity, and removal of the client
  identity dependency.

## Files modified

- `docs/migration-drafts/STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`
- `src/lib/student-requests/student-request-submit-contract.ts`
- `tests/student-requests/secure-attachments-source-contract.test.ts`
- `docs/STUDENT-REQUEST-SECURE-ATTACHMENTS-SECURITY-FINDINGS-FIX-01-REPORT.md`

## Verification

- `bun install --frozen-lockfile --backend copyfile`: PASS (109 packages).
- `bun test tests/student-requests`: PASS — 320 pass, 0 fail, 1209 assertions,
  19 files.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS with existing dependency directive warnings.
- `git diff --check`: PASS.
- `bun run security:test`: not run; no authorized safe Supabase environment was
  used and no Runtime E2E claim is made.

## Assumptions and risks

- The existing reviewed `submit_student_request(uuid)` remains the authoritative
  status-transition and workflow-initialization RPC.
- The SQL remains a design Draft. Syntax and direct RPC ALLOW/DENY behavior must
  be independently reviewed and later verified in a safe non-production database
  before any activation request.
- Runtime activation and applying SQL remain explicitly outside this change.

## Blockers and production impact

- Blocker: independent second security review is required before push or PR.
- Production impact: none. No migration, SQL execution, Supabase command,
  production access, deploy, publish, push, or PR occurred.

`PASS_SECURE_ATTACHMENTS_HIGH_FINDINGS_SOURCE_FIX`
