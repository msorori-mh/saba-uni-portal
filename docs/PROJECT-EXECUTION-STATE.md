# Project Execution State

Updated: 2026-07-17 (Asia/Riyadh)

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- Original cycle baseline: `1905844289536de9040557d8317bbe1f09341193`
- Current `origin/main`: `682b63ef93936a5fcc275c0437df4816355c41be`
- PR #130 merge: `7a7e35f315a89b5376ed8eb4f2cb5c949510f7cb`
- PR #129 merge: `be38c319aedd6d9a9257e30d0623e1b1b66b6bb7`
- PR #131 Android heap merge: `d29949230b4f0c603f46dce6785f6e48e5b32d72`
- PR #132 Capacitor assets merge: `682b63ef93936a5fcc275c0437df4816355c41be`
- Leader branch: `chore/portal-autopilot-orchestrator`
- Leader note: `AGENTS.md` contains an owner-authored, uncommitted policy update
  and is preserved outside the leader-state commit.

## Active worktrees and tasks

| Worktree / branch | HEAD | State | Owner / dependency | Next gate |
|---|---|---|---|---|
| `saba-uni-portal-autopilot` / `chore/portal-autopilot-orchestrator` | `1905844` | ACTIVE | leader state files | docs verification and local state-only commit |
| `saba-uni-portal-shared-foundation-fix2-b1` / `fix/request-b1-remaining-review-findings-01` | `98c9713` | COMPLETE, PR #129 MERGED | completed | post-merge main CI monitoring |
| `saba-uni-portal-secure-attachments-review-b1` / `review/student-request-secure-attachments-source-01` | `200c018` | COMPLETE review / HOLD source | read-only security reviewer | fix all HIGH findings, then second independent review |
| `saba-uni-portal-secure-attachments-fix-b1` / `fix/student-request-secure-attachments-security-findings-01` | `e162edb` | COMPLETE, PR #130 MERGED | completed source/security path | runtime SQL/RPC verification still requires a safe environment |
| `saba-uni-portal-agent-b1-01` / `feat/request-b1-suspension-absence` | `aca8179` | PR #133 DRAFT, CI_PENDING | complete source / GitHub CI | CI PASS before source-only merge |
| `saba-uni-portal-agent-b1-02` / `feat/request-b1-transfer-final-chance` | `1905844` | HOLD, owned report artifact | B1-02 owner; waits for shared foundation and decisions | shared foundation PASS plus approved fee/chance semantics |
| `saba-uni-portal-agent-b1-03` / `feat/request-b1-file-withdrawal` | `1e4d761` | SOURCE PASS, integration HOLD | preserved commit | shared foundation PASS and later reviewed migration/RPC gates |
| `saba-uni-portal-shared-foundation-b1` / `feat/request-b1-shared-foundation-source-01` | `cde27fc` | SOURCE PASS, superseded by fixes | upstream of `9ba31d9` | remediation and review |

## Security status

- Secure attachments: `SECURITY_FIX_REQUIRED`.
- Binding review verdict:
  `HOLD_SECURE_ATTACHMENTS_SECURITY_REVIEW_FINDINGS_REQUIRE_FIX`.
- Runtime feature flag must remain closed.
- Direct assignment must have absolute priority; no admin, registrar or dean
  bypass is permitted.
- Runtime RPC ALLOW/DENY verification remains blocked until a safe environment
  exists and source review passes.

## GitHub status (separate from current B1 path)

- Latest Web CI on `main` passed at the baseline above.
- PR #49: separate legacy item; Migration Review failing.
- PR #118: separate legacy item; merge state `DIRTY`.
- PR #98: separate legacy draft; merge state `DIRTY`.
- These items do not block the current isolated B1/security source work and are
  not being modified during the priority cycle.

## Progress and priority

- Repository/worktree/PR baseline inventory: complete.
- Governance state setup: active.
- Shared foundation and security fixes passed reviews/CI and merged through PRs
  #130 then #129. Post-merge main CI is active.
- B1-01 suspension/absence source implementation passed local gates and
  independent review; Draft PR #133 is awaiting CI. Runtime remains HOLD until
  attachment/RPC enforcement can be verified in a safe environment.
- B1-01/B1-02 integration: blocked on shared foundation.
- Realistic overall completion: not yet measurable as runtime-ready; source work
  remains gated by security review, functional decisions and later explicitly
  approved production migration work.

## Production impact

None. No migration/SQL apply, Supabase production access, data/storage write,
deploy, publish, secret change, production E2E, cleanup or discard was performed.
