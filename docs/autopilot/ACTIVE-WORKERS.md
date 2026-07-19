# Active Workers

| slot | task_id | agent_type | branch/worktree | scope | started | state |
|---:|---|---|---|---|---|---|
| 1 | B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01 | DATABASE_SECURITY_AGENT | `codex/b1-preflight-blockers-source-remediation-01` / `C:\projects\saba-uni-portal-b1-preflight-blockers` | log_audit draft, RC manifest, storage plan, dept identity decisions, runbook | 2026-07-19 | ACTIVE |
| 2 | — | — | — | available | 2026-07-19 | READY |
| 3 | — | — | — | available | 2026-07-19 | READY |

No workers share an editable file or worktree with this ACTIVE remediation task.
DYNAMIC-QUEUE-STATE-RECONCILIATION-02 is complete (PR #161 merged) and no longer
occupies a slot. `B1-PRODUCTION-MIGRATION-SEQUENCE` remains
`REQUIRES_USER_APPROVAL` and occupies no worker slot.
