# Project Execution State

Updated: 2026-07-17 (Asia/Riyadh)

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- `main`: `1905844289536de9040557d8317bbe1f09341193`
- `origin/main`: `1905844289536de9040557d8317bbe1f09341193`
- Divergence at last fetch: `0/0`
- Leader branch: `chore/portal-autopilot-orchestrator`
- Leader note: `AGENTS.md` contains an owner-authored, uncommitted policy update
  and is preserved outside the leader-state commit.

## Active worktrees and tasks

| Worktree / branch | HEAD | State | Owner / dependency | Next gate |
|---|---|---|---|---|
| `saba-uni-portal-autopilot` / `chore/portal-autopilot-orchestrator` | `1905844` | ACTIVE | leader state files | docs verification and local state-only commit |
| `saba-uni-portal-shared-foundation-fix2-b1` / `fix/request-b1-remaining-review-findings-01` | `d7c3d6a` | HOLD_REVIEW_FINDINGS, clean | fix2 owner after security ownership release | fix two HIGH and one MEDIUM, rerun gates and review |
| `saba-uni-portal-secure-attachments-review-b1` / `review/student-request-secure-attachments-source-01` | `200c018` | COMPLETE review / HOLD source | read-only security reviewer | fix all HIGH findings, then second independent review |
| `saba-uni-portal-secure-attachments-fix-b1` / `fix/student-request-secure-attachments-security-findings-01` | `24ba86b` | SECURITY_REVIEW_2, clean | independent security reviewer | second review PASS required before push/PR |
| `saba-uni-portal-agent-b1-01` / `feat/request-b1-suspension-absence` | `1905844` | HOLD, owned report artifact | B1-01 owner; waits for shared foundation | resume only after shared foundation PASS |
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
- Shared-foundation fix2 remediation resumed after the security owner released
  the overlapping file. It must fix two HIGH and one MEDIUM review findings.
- Secure-attachment HIGH source remediation committed at `24ba86b`; gates passed
  with 320/320 tests, typecheck, build and diff-check. Second review is active.
- B1-01/B1-02 integration: blocked on shared foundation.
- Realistic overall completion: not yet measurable as runtime-ready; source work
  remains gated by security review, functional decisions and later explicitly
  approved production migration work.

## Production impact

None. No migration/SQL apply, Supabase production access, data/storage write,
deploy, publish, secret change, production E2E, cleanup or discard was performed.
