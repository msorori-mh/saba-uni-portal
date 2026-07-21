# B1 Release Candidate Manifest 01

> **SUPERSEDED AS CURRENT RC (2026-07-21):** for the fresh tip use `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` with `expected_release_sha` = `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6`. This manifest remains the historical five-services RC contract from the preflight-blockers remediation cycle.

Status: `SOURCE_ONLY — DEPLOY GATE SEPARATE`
Scope: five services only
(`enrollment_suspension`, `excused_absence`, `file_withdrawal`,
`department_transfer`, `final_chance`).

## Purpose

Identify the web/server artifact that must be published **before** the first
database migration of the B1 sequence, while proving the five services remain
fail-closed until migrations and separate activation gates complete.

## Proposed Release Candidate

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Base | `origin/main@5435a877a17b7934c6b5fa462c337a1c9198c23c` |
| Branch | `codex/b1-preflight-blockers-source-remediation-01` |
| `PROPOSED_RELEASE_CANDIDATE_COMMIT` | set to the merge commit of this remediation PR after Web CI PASS (see promotion report) |
| `APPROVED_RELEASE_COMMIT_PLACEHOLDER` in stamp draft | **unchanged** — must not be replaced with an invented value |
| Final stamp value | only after a successful Deploy and a read of the **published** SHA |

## Code that must be deployed before first Migration

- Student-request adapters for the five services with
  `runtimeAvailable: false` (`src/lib/student-requests/request-service-adapter.ts`).
- Submit contracts that refuse runtime when unavailable.
- Secure-attachment contracts that return
  `SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE` when runtime is false.
- No client path that calls B1 atomic submit / detail RPCs as a live write
  path while adapters remain fail-closed.
- UI forms may exist as source, but must not enable student submission until
  `student_visible` + workflow activation + Deploy gates are separately approved.

## Fail-closed proofs (source)

| Proof | Evidence |
|---|---|
| Adapters fail-closed | Five-service adapters pin `runtimeAvailable: false` |
| No student_visible change | Production snapshot + this phase: `student_visible` untouched; activation is SEPARATE APPROVAL |
| Workflows not activated | Free/paid workflow drafts create `status='draft'`, `is_active=false` only |
| No live runtime RPC before migrations | Atomic submit / dispatcher / attachment RPCs remain unapplied drafts; client contracts refuse when runtime unavailable |
| Stamp placeholder locked | `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql` still contains `APPROVED_RELEASE_COMMIT_PLACEHOLDER` and fails closed until replaced with a real 40-char SHA |

## Explicit non-actions

```text
Deploy/Publish in this phase: NO
SQL / Migration apply: NO
student_visible mutation: NO
Workflow activation: NO
Invented stamp SHA: NO
```

## Next gate after this manifest

`RELEASE_DEPLOY_GATE` — publish the approved RC, read back the deployed commit
SHA, then (under a separate approval) substitute that SHA into the stamp draft
before ACL cutover.
