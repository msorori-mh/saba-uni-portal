# PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-REVIEW-PACKAGE-01

> **SUPERSEDED for remediation status.** Multimodel findings against this integration
> baseline are remediated under
> `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT.md`
> on branch `fix/graduates-affairs-multimodel-remediation-01`.
> Use that report for post-fixiation finding status, suite counts, and
> `REMEDIATION_REVIEW_SHA`.

| Field | Value |
|---|---|
| Mission | PORTAL-GRADUATES-AFFAIRS-SINGLE-SHA-INTEGRATION-AND-REVIEW-BASELINE-01 |
| Branch | feat/graduates-affairs-single-sha-integration-01 |
| INTEGRATION_REVIEW_SHA | `5ccddc9f106bf3c97fab4368faa52ee19d8a0418` (historical package tip pin) |
| BASE_REVIEW_SHA (multimodel reviewers) | `724f040743c1017e4b322f68b8e248bde122d1c3` — authoritative review tip; remediation proceeds from this SHA on `fix/graduates-affairs-multimodel-remediation-01` |
| Integrated runtime+P0 content commit | 4ec6eccf04fc9dc55d08cfd223bea290b464f4ff |
| Base main | 4a6e16b9fa66d6738a17b1399c553144b13a5101 |
| PR #273 head | eddad8d2c510b955f92f9f6fa08adeb31e0aef66 (MERGED) |
| P0 recon source | a96c24748106a08b0bb4cf29b59183a1912d8326 |
| Runtime wiring source | feat/graduates-affairs-owner-gate-runtime-wire-01 worktree (preserved, uncommitted source) |
| Mode | SOURCE INTEGRATION ONLY |

Historical note: Codex / Qwen / Gemini / Kimi multimodel review used BASE_REVIEW_SHA
`724f0407…` (descendant tip of this package). Do not treat the older
`INTEGRATION_REVIEW_SHA` self-pin as the remediation baseline.

## Exact changed files (vs main 4a6e16b9)

docs/ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01-REPORT.md
docs/ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01-REPORT.md
docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04.md
docs/PORTAL-GRADUATES-AFFAIRS-GO-LIVE-RECONCILIATION-01-REPORT.md
docs/PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01.md
docs/PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01-REPORT.md
docs/PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01.md
docs/alumni/ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01.md
docs/alumni/ALUMNI-P0-GRADUATE-FACT-CONTRACT-01.md
docs/alumni/ALUMNI-P0-IMPLEMENTATION-COVERAGE-MATRIX-01.md
docs/alumni/ALUMNI-P0-INTEGRATED-DOMAIN-CONTRACT-01.md
docs/alumni/ALUMNI-P0-INTEGRATION-CONTRACT-01.md
docs/alumni/ALUMNI-P0-PRIVACY-CONTRACT-01.md
docs/alumni/ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01.md
docs/alumni/reconciliation/P0-A-GRADUATE-FACT-RECONCILIATION-01.md
docs/alumni/reconciliation/P0-B-AUTHORIZATION-RECONCILIATION-01.md
docs/alumni/reconciliation/P0-C-ACCOUNT-CONTINUITY-RECONCILIATION-01.md
docs/alumni/reconciliation/P0-D-AUDIT-PRIVACY-RECONCILIATION-01.md
docs/alumni/reconciliation/P0-G5-PR273-COMPATIBILITY-01.md
docs/alumni/reconciliation/P0-G5-RUNTIME-INTEGRATION-CHECK-01.md
docs/alumni/reconciliation/P0-RUNTIME-CONTINUITY-CONFLICT-RESOLUTION-01.md
docs/alumni/reconciliation/P0-TRUE-GAP-CLASSIFICATION-01.md
docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
src/lib/graduates-affairs/account-continuity.ts
src/lib/graduates-affairs/graduates-affairs.functions.ts
src/lib/graduates-affairs/rpc.ts
src/lib/graduates-affairs/runtime-gate.ts
src/lib/portal-features.ts
src/routes/staff.graduates-affairs.tsx
src/routes/staff.index.tsx
src/routes/student.graduates-affairs.index.tsx
src/routes/student.index.tsx
tests/graduates-affairs/graduates-affairs-completion-01.test.ts
tests/graduates-affairs/graduates-affairs-foundation-01.test.ts
tests/graduates-affairs/graduates-affairs-runtime-wire-01.test.ts
src/routeTree.gen.ts
docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-REVIEW-PACKAGE-01.md

## Architecture invariants
1. Graduate fact = registrar-approved decision only (candidate/eligible/GP/document never alone).
2. corrected/revoked fail closed (REMEDIATION-06 + runtime gate).
3. Same auth.users + student_profiles.user_id; no second IdP.
4. Continuity undecided denies; student vs graduate capabilities separated.
5. Adapters -> AUTH-04 RPC allowlist only.
6. DIRECT_TABLE_MUTATION_PATHS = NONE.
7. studentGraduatesAffairs=false; staffGraduatesAffairs=false.

## Authorization invariants
- graduate_affairs unit + role + assignment/scope
- student_affairs never grants; no admin/dean/registrar alumni-ops bypass
- Registrar academic intake separate
- AUTH-04 + REMEDIATION-06 intact / not forked

## DB migration sequence (PREPARED_NOT_EXECUTED)
1. FOUNDATION-01 sha256 45d85d4775f65d876ac74bd917e10be97cd04662477f9302a9d82e0118bec17c
2. COMPLETION-01 sha256 b3c8521bf687842e5ef185b34f930117fe24b896ecbd5dc085de4580491e281c
3. AUTHORIZATION-04 sha256 b968dab5598a783819722d34bb24e00f62adae698b8f41791a2ee2fe46dbec51
4. Governed assignment seed (not applied)

## Runtime wiring paths
- src/lib/graduates-affairs/runtime-gate.ts
- src/lib/graduates-affairs/rpc.ts (13 self + 7 staff)
- src/lib/graduates-affairs/graduates-affairs.functions.ts
- /student/graduates-affairs/ ; /staff/graduates-affairs
- P0 account-continuity.ts (APPROVED_BASELINE + §6.1)

## Feature flags OFF
studentGraduatesAffairs=false; staffGraduatesAffairs=false

## P0 references
docs/alumni/* contracts, coverage matrix, reconciliation/*, ALUMNI-P0 reports; continuity conflict resolved keeping P0 module.

## Tests
Pre-remediation package claims (e.g. “136 pass”) are **stale** and **superseded**
by `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT.md`
— see that report for post-fixiation counts (do not invent counts here).
PG17 / tsc / build / diff-check results likewise re-verified on the remediation branch.

## Deferred fail-closed
Approve/create client path; login/recovery wiring; P1/P2 dual audit/notifications; D-3..D-12 expansions; promotion/seed/flag enablement not executed.

## Package references
PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01.md (PREPARED_NOT_EXECUTED)
PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01.md (PREPARED_NOT_EXECUTED)
PORTAL-GRADUATES-AFFAIRS-GO-LIVE-RECONCILIATION-01-REPORT.md
PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01-REPORT.md

## Safety
PRODUCTION_RPC_CALLS 0; PRODUCTION_WRITES 0; MIGRATION_APPLIED NO; ROLE_SEED_APPLIED NO; DEPLOY NO; PUBLISH NO

## Decision
PASS_PORTAL_GRADUATES_AFFAIRS_SINGLE_SHA_READY_FOR_MULTIMODEL_FINAL_REVIEW
(historical — multimodel review completed against BASE_REVIEW_SHA `724f0407…`)

NEXT: see `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT.md`
(`PASS_PORTAL_GRADUATES_AFFAIRS_MULTIMODEL_REMEDIATION_REVIEW_SHA_READY`, pending commit SHA)
