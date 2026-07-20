# B1-PRODUCTION-ACTIVATION-COMMAND-CYCLE-01

Date: 2026-07-20 (Asia/Riyadh)

Repository: `msorori-mh/saba-uni-portal`

Pinned source: `origin/main@427b7eb48f8771f31bd08a46fc4590cf883ab7e2`

Latest source-only integration tip after safe merges:
`origin/main@b565200851b4988f0257133498af015b7ef2e053`. This does not change
the Release Candidate SHA whose deployed provenance must be proved.

Mode: command preparation and review only. No Deploy, Publish, production SQL,
Migration apply, Supabase write, Workflow activation, `student_visible` change,
request creation, document creation, or data mutation is authorized by this report.

## Command decision

`HOLD_B1_COMMAND_CYCLE`

The current public endpoint is live, and GitHub Web CI passed for the pinned
source, but the deployed artifact does not expose evidence that proves it was
built from `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`. The release gate therefore
fails closed. Production database preflight and every apply authorization remain
blocked behind that gate.

The initial order conflict in PR #173 was remediated by commit `d754049`.
Independent re-review now records CRITICAL=0 / HIGH=0 / MEDIUM=0 / LOW=0,
canonical order 1-18, and 18/18 matching Git-blob hashes. The release-evidence
stamp still contains `APPROVED_RELEASE_COMMIT_PLACEHOLDER` and remains
non-applicable until exact release provenance is proved and a reviewed promoted
file replaces the placeholder.

## Workstream status

| Workstream | Artifact | Status |
|---|---|---|
| Release and production preflight | PR #173 merged as `0477206`; report in main | HOLD: deployed SHA unproven; production DB reads not started |
| 18-draft integrity | PR #173 | PASS: canonical order reviewed; 18/18 LF/git-blob SHA-256 values match |
| Academic clearance | PR #175 merged as `b565200` | PASS source: independent review zero findings; PG17, tests, typecheck, build, Web CI PASS |
| Graduation projects | PR #174 merged as `f970b9c` | PASS source: independent review zero findings; PG17 matrix, tests, typecheck, Web CI PASS |
| Graduates affairs | PR #179 merged as `53c4014` | PASS source: independent review zero findings; PG17 verifier, tests, typecheck, Web CI PASS |

No workstream has production impact.

## Release gate

Evidence collected by the read-only preflight:

- `origin/main` resolves to the pinned SHA.
- GitHub `Install · Lint · Typecheck · Build` passed for the pinned SHA.
- `https://quboolye.com` returned HTTP 200 and a deployment id.
- Response headers, HTML, bundle metadata, and the deployment id do not bind the
  live artifact to the pinned Git SHA.
- The release-evidence stamp remains a source draft with a placeholder.

Required external action: the authorized deployment operator must publish the
reviewed Release Candidate and expose or return independently verifiable build
provenance for the exact Git SHA. Codex will not deploy or publish.

Stop condition: if the read-back SHA is absent or differs, stop. Do not query
production DB, substitute a guessed SHA, or advance to Migration authorization.

## Fresh production preflight after release proof

After the release gate passes, perform read-only checks and record a new
timestamped snapshot:

1. Official Migration history plus object-definition fingerprints for all 18
   candidates.
2. The five request types remain `student_visible=false`.
3. Active Workflow count is zero for each service.
4. Production request count is zero for each service.
5. Department-chair package state and existing assignments; do not create or
   modify identities or assignments.
6. Attachment Bucket privacy, RLS/Storage policies, and policy fingerprints;
   do not inspect, move, or mutate objects.
7. Protected request and document identifiers/checksums remain unchanged.

Any unexpected delta, incomplete evidence, or non-zero active/visible state is
a stop condition and produces HOLD.

## Single-Migration package contract

Each of the 18 rows must have its own reviewed package and independent user
authorization. A package is not executable until all placeholders are pinned:

| Field | Required content |
|---|---|
| Preflight | deployed SHA proof; fresh DB snapshot id; official history; object/ACL/RLS fingerprints; protected invariants; exact LF SHA-256 |
| Apply command | one promoted Migration file only; exact production project ref and operator; `ON_ERROR_STOP`; no glob, directory apply, history repair, activation, visibility, storage mutation, backfill, or data cleanup |
| Verifier | migration-history row; expected definitions/owners/grants/RLS; before/after invariants; five services still hidden/inactive; zero unexpected mutation |
| Rollback by forward fix | preserve failure evidence; author a new reviewed forward-only corrective Migration; never reset, delete, edit applied history, or silently re-run |
| Stop conditions | SHA mismatch, partial apply, unexpected object/data delta, verifier failure, missing review, any CRITICAL/HIGH/MEDIUM finding, or CI/typecheck/build/test failure |

The operator must apply exactly one separately authorized package and return the
full result. The command cycle then verifies it and stops before requesting the
next authorization.

## Canonical-order reconciliation required

The 18 files, hashes, and executable order are reconciled in PR #173 at
`d754049`. The manifest preserves these dependency facts:

1. Log-audit disambiguation precedes every draft that calls `log_audit`.
2. Actor authorization hardening precedes B1 runtime writes.
3. Processing domains precede Workflows that reference their unit/role tuples.
4. Atomic submit/action foundations precede service detail writers.
5. Release evidence may be promoted only after exact deployed SHA proof replaces
   the placeholder.
6. Secure attachments require the separately approved private Bucket/policy
   decision and their prerequisites.
7. Trusted references and service detail drafts precede inactive Workflow seeds.
8. ACL cutover is last among schema packages.
9. Workflow activation and `student_visible` are never part of these 18 applies.

The first SQL package in that order is
`REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`. It is not ready for apply
authorization until exact deployed SHA proof and the fresh read-only production
preflight pass. Therefore `FIRST_MIGRATION_READY_FOR_APPLY_AUTHORIZATION = NONE`.

## Department-chair package

The last repository snapshot reported CS=0, IT=2, CIS=1 assignments. It is stale
and not canonical. The package must contain read-only identity evidence, the
intended department-to-chair mapping supplied by an authorized owner, positive
and negative direct-RPC authorization tests, a no-general-bypass proof, and a
forward-only correction plan. Codex must not invent academic mappings or create
or change staff/assignments. Current decision: `HOLD_DEPARTMENT_CHAIRS`.

## Secure Storage decision

The stale baseline described a private Bucket with six `sra_*` policies and
three existing objects. A fresh read-only fingerprint is required. The decision
package must require a private Bucket, deny public URLs, scope student and staff
access through authorized request relationships, forbid object mutation during
preflight, and prove protected objects unchanged. Any Bucket or policy mutation
requires a separate user authorization. Current decision: `HOLD_STORAGE_FRESH_SNAPSHOT`.

## Per-service command sequence

After all schema packages pass, activate one service at a time in this order:

1. `enrollment_suspension`
2. `excused_absence`
3. `file_withdrawal`
4. `department_transfer`
5. `final_chance`

For each service, stop between independently authorized gates:

`schema verifier -> direct RPC authorization matrix -> Workflow activation -> authenticated safe E2E -> student_visible=true -> post-activation smoke`

The RPC matrix must ALLOW only the direct assignee matching both
`processing_unit` and `processing_role`, and DENY every other role including any
generic admin, registrar, or dean bypass. A denied call must prove zero mutation.
Authenticated E2E must not use a real production user and requires a separately
approved safe environment and identity.

## Reviews, tests, risks, and production impact

- Required independent review threshold: CRITICAL=0 / HIGH=0 / MEDIUM=0.
- PR #173 remediation `d754049` passed independent re-review with
  CRITICAL=0 / HIGH=0 / MEDIUM=0 / LOW=0. Production reads were not attempted
  after the release-provenance gate failed.
- Web CI, typecheck, build, focused tests, security tests in a safe environment,
  and `git diff --check` are mandatory before merge or execution.
- Risk: a live endpoint can mask source drift when build provenance is absent.
- Risk: stale production snapshots cannot authorize a current change.
- Production impact: zero.

## Next authorized boundary

No production action is authorized now. The next external action is Release
Candidate publication/provenance by the authorized deployment operator. After
exact SHA proof, Codex may resume fresh production reads only. It must not ask
for the first Migration apply authorization until the preflight passes and the
canonical 18-row order has independent review with zero findings.

Eligible PASS after those gates:

`PASS_B1_COMMAND_CYCLE_READY_FOR_FIRST_SEQUENTIAL_PRODUCTION_APPLY_AUTHORIZATION`
