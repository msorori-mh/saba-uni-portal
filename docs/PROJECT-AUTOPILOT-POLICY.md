# Project Autopilot Policy

Updated: 2026-07-17 (Asia/Riyadh)

The binding operating policy is `AGENTS.md` plus the owner's authorization
`AUTHORIZED_RESUME_OWNED_DIRTY_WORKTREES_NO_CLEANUP`.

## Autonomous scope

- Source code, tests, documentation, isolated branches/worktrees, local commits,
  normal feature/review pushes and pull requests after their gates pass.
- Tests, typecheck, build, lint, `git diff --check`, Git/PR/CI inspection.
- Draft SQL only under `docs/migration-drafts`; draft SQL is never applied.
- At most two active implementation paths for the current accelerated cycle.

## Hard prohibitions

- No reset, clean, stash, discard, destructive deletion or force push.
- No production Supabase command, SQL or migration apply, database/storage write,
  deploy, publish, secret change, or production E2E.
- No change to `request_types.student_visible` or protected
  `enrollment_certificate` behavior.
- No invented fee code, amount, currency or academic `chance_type` mapping.
- No bypass of CRITICAL/HIGH security findings.

## Owned dirty worktrees

The owner explicitly authorized resuming these worktrees without cleanup:

- `C:\projects\saba-uni-portal-agent-b1-01`: owned B1-01 report artifact.
- `C:\projects\saba-uni-portal-agent-b1-02`: owned B1-02 report artifact.
- `C:\projects\saba-uni-portal-shared-foundation-fix2-b1`: owned incomplete
  shared-foundation remediation.

Owned and scope-verified work resumes only by its owner. Unexpected or
cross-scope work is held locally without blocking independent safe work.
