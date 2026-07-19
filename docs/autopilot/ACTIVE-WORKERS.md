# Active Workers

| slot | task_id | agent_type | branch/worktree | scope | started | state |
|---:|---|---|---|---|---|---|
| 1 | B1-REPRODUCIBLE-RELEASE-BUILD-REMEDIATION-01 | RELEASE_INTEGRATION_AGENT | `codex/b1-reproducible-release-build-remediation-01` / `C:\projects\saba-uni-portal-reproducible-release-fix` | deterministic install, tests, route generation and build evidence | 2026-07-19 | ACTIVE |
| 2 | — | — | — | available | 2026-07-19 | READY |
| 3 | — | — | — | available | 2026-07-19 | READY |

No workers share an editable file or worktree. This worker is isolated from Cursor
and all other active worktrees.

B1 source closure tasks are merged: predecessor remediation #169, safe RPC
matrix #166, department-chair source package #165, and release preflight #164.
No production SQL, staff/chair data write, workflow activation,
`student_visible`, deploy, or publish occurred.

`B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.
