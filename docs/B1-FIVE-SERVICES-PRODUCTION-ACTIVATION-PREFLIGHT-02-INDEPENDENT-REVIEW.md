# Independent review — B1 production activation preflight 02

Reviewed artifact: Draft PR #173 at `1fd3994`

Review mode: source/read-only. The PR branch was not modified and no production
database, Storage, deployment, workflow or visibility mutation was attempted.

## Decision

**HOLD — CRITICAL 0 / HIGH 1 / MEDIUM 0 / LOW 1.**

The report correctly refuses the requested PASS after deployed-SHA provenance
cannot be proved, and correctly leaves every fresh production database assertion
as `NOT_RUN_FAIL_CLOSED`/HOLD. However, its proposed migration order conflicts
with the canonical application runbook on `origin/main`; therefore it is not a
safe sequential-apply plan yet.

## Findings

### HIGH — proposed 18-migration order contradicts the canonical runbook

PR #173 calls the release-evidence stamp order 1 and log-audit disambiguation
order 2. The merged canonical source
`docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md` instead defines:

- order 1: `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`;
- order 4: `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql`;
- order 5: `REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql`.

The runbook explicitly identifies log-audit as the first SQL apply and describes
the stamp as following the atomic submit dispatcher and deployed release. The PR
neither updates that canonical runbook nor provides reviewed dependency evidence
authorizing a reorder. Executing PR #173's numbered plan would thus depart from
the currently approved order. Reconcile the report to the runbook (or separately
review and change the canonical runbook) before any sequential-apply readiness
decision.

### LOW — production-query capability wording is stronger than the evidence

The body correctly says production reads were intentionally not attempted after
the SHA gate failed. The production-impact paragraph later says no production
query “was possible.” The evidence establishes `not attempted`, not necessarily
technical impossibility. Use the former wording consistently to avoid implying
an unproved credentials/connectivity fact.

## Checks that passed

- Recomputed SHA-256 directly from the 18 Git blobs at pinned commit
  `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`: all 18 values match PR #173.
- The report does not claim fresh production values after SHA failure. Visibility,
  workflow, request, migration, department-chair, bucket/policy and protected-row
  assertions are all explicitly stale baselines requiring re-read.
- The deployed endpoint and CI are not treated as proof of the deployed SHA.
- The placeholder release stamp is explicitly non-applicable and fail-closed.
- The per-migration plan requires one separately authorized migration, a verifier,
  invariant comparison, zero CRITICAL/HIGH/MEDIUM findings and stop/preserve on
  error or partial state.
- Workflow activation, direct RPC authorization tests, visibility and E2E are
  separate ordered gates; other services remain hidden/inactive.
- The report claims no production writes and none are introduced by the PR.

## Required remediation

Correct the numbered manifest and sequential plan to the canonical dependency
order, then recompute/restate all 18 hashes without changing their blob identity.
After independent re-review reaches CRITICAL/HIGH/MEDIUM zero, the preflight may
retain its current deployed-SHA HOLD until exact provenance is proved and fresh
production reads are authorized and completed.

Review impact on production: zero.
