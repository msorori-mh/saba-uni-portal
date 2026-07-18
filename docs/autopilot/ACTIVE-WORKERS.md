# Active Workers

| slot | task_id | agent_type | branch/worktree | scope | started | state |
|---:|---|---|---|---|---|---|
| 1 | B1-SAFE-RPC-MATRIX-HARNESS-01 | QA_SECURITY_AGENT | `codex/b1-safe-rpc-matrix-harness-01` / isolated | Draft PR #166; security findings isolated | 2026-07-19 | HOLD_CRITICAL_0_HIGH_3 |
| 2 | DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01 | DATABASE_SECURITY_AGENT | `codex/department-chairs-controlled-fix-package-01` / isolated | Draft PR #165 | 2026-07-19 | COMPLETE_SOURCE_ONLY |
| 3 | B1-RELEASE-AND-FIRST-SERVICE-PREFLIGHT-PACK-01 | RELEASE_INTEGRATION_AGENT | `codex/b1-release-first-service-preflight-pack-01` / isolated | Draft PR #164 | 2026-07-19 | COMPLETE_SOURCE_ONLY |

`B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.

No production SQL, staff/chair data write, workflow activation,
`student_visible`, deploy, or publish occurred. The Cursor-owned
`B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01` worktree and its dirty files were
excluded from all three worker diffs.
