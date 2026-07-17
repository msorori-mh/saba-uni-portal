# Project Execution State

Updated: 2026-07-17 (Asia/Riyadh)

## Cycle 12 — external university payment confirmation

- Policy governance commit: `64c45dc`.
- Source branch: `codex/external-university-payment-confirmation`.
- Source commit: `211f692`.
- Draft PR: #136, mergeable, Web CI initially in progress.
- Policy: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` for `department_transfer` and `final_chance`; no fee type, amount, currency, invoice, gateway, reference, or internal balance.
- `final_chance` new academic value is `final_chance` only; legacy values are read-normalized only.
- Independent review: PASS after closing two HIGH fail-open findings.
- Local gates: TypeScript PASS, student-request suite PASS, build PASS, diff-check PASS. Repository-wide lint remains baseline-failing on CRLF/Prettier in unrelated files.
- Runtime remains fail-closed with `BLOCKED_PENDING_EXTERNAL_PAYMENT_RUNTIME`.
- No migration/SQL apply, `student_visible` change, production access/write, deploy, or publish.

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- Original cycle baseline: `1905844289536de9040557d8317bbe1f09341193`
- Current `origin/main`: `2dbd299b865610f3b885ef9985ce620f91027648`
- PR #130 merge: `7a7e35f315a89b5376ed8eb4f2cb5c949510f7cb`
- PR #129 merge: `be38c319aedd6d9a9257e30d0623e1b1b66b6bb7`
- PR #131 Android heap merge: `d29949230b4f0c603f46dce6785f6e48e5b32d72`
- PR #132 Capacitor assets merge: `682b63ef93936a5fcc275c0437df4816355c41be`
- PR #133 B1-01 merge: `2834e577e89588c9e358cdf782114d40ed3cb881`
- PR #134 B1-03 merge: `bb48c3acd7123268cfb73c5c9817200a356f4520`
- PR #135 B1-02 source merge: `2dbd299b865610f3b885ef9985ce620f91027648`
- Leader branch: `chore/portal-autopilot-orchestrator`
- Leader note: `AGENTS.md` contains an owner-authored, uncommitted policy update
  and is preserved outside the leader-state commit.

## Active worktrees and tasks

| Worktree / branch | HEAD | State | Owner / dependency | Next gate |
|---|---|---|---|---|
| `saba-uni-portal-autopilot` / `chore/portal-autopilot-orchestrator` | local state commits | COMPLETE_LOCAL | leader state files | preserve owner-authored `AGENTS.md` outside commits |
| `saba-uni-portal-shared-foundation-fix2-b1` / `fix/request-b1-remaining-review-findings-01` | `98c9713` | COMPLETE, PR #129 MERGED | completed | post-merge main CI monitoring |
| `saba-uni-portal-secure-attachments-review-b1` / `review/student-request-secure-attachments-source-01` | `200c018` | COMPLETE historical review | read-only security reviewer | superseded by merged remediation and PASS review 2 |
| `saba-uni-portal-secure-attachments-fix-b1` / `fix/student-request-secure-attachments-security-findings-01` | `e162edb` | COMPLETE, PR #130 MERGED | completed source/security path | runtime SQL/RPC verification still requires a safe environment |
| `saba-uni-portal-agent-b1-01` / `feat/request-b1-suspension-absence` | `aca8179` | COMPLETE, PR #133 MERGED | completed source | runtime attachment/RPC verification remains pending |
| `saba-uni-portal-agent-b1-02` / `feat/request-b1-transfer-final-chance` | `16c86f8` | COMPLETE SOURCE, PR #135 MERGED | runtime blocked by owner decisions | approve fee and chance semantics before activation |
| `saba-uni-portal-agent-b1-03` / `feat/request-b1-file-withdrawal` | `785c6f9` | COMPLETE, PR #134 MERGED | completed source | later reviewed migration/RPC gates |
| `saba-uni-portal-shared-foundation-b1` / `feat/request-b1-shared-foundation-source-01` | `cde27fc` | SOURCE PASS, superseded by fixes | upstream of `9ba31d9` | remediation and review |

## Security status

- Secure attachments source remediation: `PASS_SOURCE_SECURITY_REVIEW_2`.
- All original HIGH findings and follow-up bypass/TOCTOU findings were closed in
  merged PR #130.
- Runtime feature flag must remain closed.
- Direct assignment must have absolute priority; no admin, registrar or dean
  bypass is permitted.
- Runtime RPC ALLOW/DENY verification remains blocked until a safe
  non-production environment exists and a separately approved migration apply
  makes the Draft contracts available.

## GitHub status (separate from current B1 path)

- Latest Web CI and Android CI on `main@2dbd299` passed.
- PR #49: separate legacy item; Migration Review failing.
- PR #118: separate legacy item; merge state `DIRTY`.
- PR #98: separate legacy draft; merge state `DIRTY`.
- These items do not block the current isolated B1/security source work and are
  not being modified during the priority cycle.

## Progress and priority

- Repository/worktree/PR baseline inventory: complete.
- Governance state setup: complete locally.
- Shared foundation, attachment security, B1-01, B1-02 source contracts and
  B1-03 passed independent reviews and CI and are merged.
- Android CI was repaired and now passes end to end, including APK/AAB uploads.
- Remaining runtime readiness is blocked by explicit fee/chance decisions,
  migration/SQL apply approval, and safe-environment RPC authorization testing.

## Production impact

None. No migration/SQL apply, Supabase production access, data/storage write,
deploy, publish, secret change, production E2E, cleanup or discard was performed.
