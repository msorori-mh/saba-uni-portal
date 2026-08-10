# PORTAL-B1-GO-LIVE-MIGRATION-DRIFT-TESTONLY-D02-FINAL-CLOSURE-LONGRUN-01

| field | value |
|---|---|
| branch | `fix/b1-go-live-final-drift-d02-closure-01` |
| source SHA (traceability only) | `38578b6533f20407c02ed775b5af18d11fcb85eb` |
| deployed SHA | `UNKNOWN` — no deploy claim |
| production access | NONE |
| date | 2026-08-10 |

## Scope

Close the three remaining independent-review Go-Live blockers without reopening
already-PASS B1 runtime functionality:

1. B1 migration-source drift.
2. TEST_ONLY migration present in the production migration path.
3. Broken D-02 department-chair sensor.

## A — Authoritative B1 migration truth

Canonical source is the 27-entry sequential apply manifest rebuilt at current
branch tip. Production applied state is **unknown** because this mission had no
production access; the manifest explicitly forbids treating name-matching
`supabase_migrations.schema_migrations` rows as proof.

### Canonical B1 apply-set (sequence 1..27)

| FILE | ROLE | CANONICAL/SUPERSEDED/TEST_ONLY | PRODUCTION_APPLIED_STATE | HASH_SOURCE | RUNBOOK_REFERENCES | ACTION_REQUIRED |
|---|---|---|---|---|---|---|
| docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | B1-LOG-AUDIT-CALL-DISAMBIGUATION-01 | CANONICAL | NOT_APPLIED (source-only; prove with D-02) | 3eb01f9901e031231a2d67375dd0874bc3b8000bfd165ce6d0b329bfb31789b0 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol after predecessor verifies green |
| docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | B1-ACTOR-AUTHORIZATION-HARDENING-02 | CANONICAL | NOT_APPLIED | bc08fcb6e1ce35c1e575b29fee56dd87714f7e7c53d17a0b376bc97102ac1b2d | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql | B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02 | CANONICAL | NOT_APPLIED | 3aa28371119674ca21d334b5721be4d8bd1b8d7797d4ac8838f8fcf3087b3b54 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | B1-PROCESSING-DOMAINS-EXPANSION-03 | CANONICAL | NOT_APPLIED | 0a2a4d6c1c354a7a951d4393de0a986ab009633ce483cdceff7aedd81bbde58d | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | B1-ATOMIC-SUBMIT-ACTION-04 | CANONICAL | NOT_APPLIED | e7f755c501a2e106a0e3146e54429a1fbf224f362255b050dc092a4a08e5a644 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-05 | CANONICAL | NOT_APPLIED | 717a99a0259d388b1d9ab09a2e4855a08042d97feb0724b3f6444bf02a95df48 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | B1-EXT-UNI-PAYMENT-CONFIRMATION-06 | CANONICAL | NOT_APPLIED | 00706047e8b5801e41c089ed98d32550699c3bd19d94eff98bc9429d21691a94 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | B1-SECURE-ATTACHMENTS-SOURCE-07 | CANONICAL | NOT_APPLIED | 66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | B1-TRUSTED-REFERENCE-VALIDATORS-08 | CANONICAL | NOT_APPLIED | e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | B1-EXCUSED-ABSENCE-VOCABULARY-09 | CANONICAL | NOT_APPLIED | 9ecf6c57167a748399edd0798e9b100e3a6ec9bbad4d09975df448f73fa41ae0 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | B1-EXCUSED-ABSENCE-DETAIL-10 | CANONICAL | NOT_APPLIED | ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | B1-FILE-WITHDRAWAL-DETAILS-11 | CANONICAL | NOT_APPLIED | 35468e00c544833626ddec23a8cf5d81659d4a51a16bbaa1d1f3ad99944e6401 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | B1-TRANSFER-SECURE-ATTACHMENT-12 | CANONICAL | NOT_APPLIED | 224186f4b9b06b9b57e9460492e7bc74383e8bd18a949bf66b4946aff9d84cd9 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/FINAL-CHANCE-CANONICAL-WRITE-03.sql | B1-FINAL-CHANCE-CANONICAL-WRITE-13 | CANONICAL | NOT_APPLIED | ac71b01ca78d0946152be39fee6eb1e659031dcc820f492f419eb7855947be46 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | B1-DETAIL-RPC-WRITE-BOUNDARIES-14 | CANONICAL | NOT_APPLIED | 3d3f274d1d0f864b8ed387138f92a78bb3952e1cedfe9232d9a657564f50399b | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-SERVICE-DETAILS-05A.sql | B1-SERVICE-DETAILS-DISPATCHER-15 | CANONICAL | NOT_APPLIED | a1d1e143e89ca457b0776f06d11e0e50f1e8c471e8799debad3ef5dd79d0b8c2 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-FREE-SERVICE-WORKFLOWS-08.sql | B1-FREE-SERVICE-WORKFLOWS-16 | CANONICAL | NOT_APPLIED | b6034a7f61b8de71c5cd0eb8648c6ff16df4a685dcc43c140f19dfe51ca380ae | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | B1-EXT-UNI-PAYMENT-WORKFLOWS-17 | CANONICAL | NOT_APPLIED | 841daba372958e2e7d53d3bc3364dd93cfd67e1b95057c0d58c2a0207c4a8f01 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | B1-DETAIL-ACL-CUTOVER-18 | CANONICAL | NOT_APPLIED | 3eb6501f03ccab78ed739253e1ce64f2d5b48ac2b812121397d924f045359e3c | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql | B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-19 | CANONICAL | NOT_APPLIED | e4a9f7f3a9a9fe060fdf325a5aa39e8d3437170b71795ce431ca629166622335 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql | B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20 | CANONICAL | NOT_APPLIED | cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql | B1-SECURE-DRAFT-MUTATIONS-21 | CANONICAL | NOT_APPLIED | da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql | B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-23 | CANONICAL | NOT_APPLIED | 4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql | B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-24 | CANONICAL | NOT_APPLIED | 67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-ACADEMIC-EFFECT-MARKERS-01.sql | B1-ACADEMIC-EFFECT-MARKERS-25 | CANONICAL | NOT_APPLIED | 4d818e9df43b6eaa3a8cc13de00c23f470886e7bb18a96e0cfb0fed9d6153065 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-ACADEMIC-EFFECT-FUNCTIONS-01.sql | B1-ACADEMIC-EFFECT-FUNCTIONS-26 | CANONICAL | NOT_APPLIED | 7cafecd5e4fc1a49aac123616640163478eb8680df9aee00b297b48dcb4ac305 | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |
| docs/migration-drafts/B1-ACT-ON-ACADEMIC-EFFECT-INTEGRATION-01.sql | B1-ACT-ON-ACADEMIC-EFFECT-INTEGRATION-27 | CANONICAL | NOT_APPLIED | 7a8f46fdc9c1a12da3d5f864099ddff947b58fdcde1bbffae9637d6af45a598d | docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md | APPLY via sequential protocol |

### TEST_ONLY / superseded migration drift table

| FILE | ROLE | CANONICAL/SUPERSEDED/TEST_ONLY | PRODUCTION_APPLIED_STATE | HASH_SOURCE | RUNBOOK_REFERENCES | ACTION_REQUIRED |
|---|---|---|---|---|---|---|
| supabase/migrations/20260727071538_122ddb4e-9ca5-4bc8-8445-06164813ca52.sql | TEST_ONLY fixture profile adjustment | TEST_ONLY | UNKNOWN | 556457035649f3cf226340a475264c166072b7b6 | — | EXCLUDE_FROM_NEW_RELEASE_PATH; classify HISTORICAL_APPLIED if schema_migrations shows applied |
| supabase/migrations/20260727071651_9a525ae0-2f8e-4447-aeee-6bdc8479a84e.sql | TEST_ONLY first-delivery fixture snapshot + assignments | TEST_ONLY | UNKNOWN | 3e179578efbab80ad7ac39ed9dad07d05bd8cd3c | — | EXCLUDE_FROM_NEW_RELEASE_PATH |
| supabase/migrations/20260727075603_a8b94d89-b6ff-4a77-955e-cb3c3e974df5.sql | TEST_ONLY first-delivery fixture restore / cleanup | TEST_ONLY | UNKNOWN | 89f9d0afa8b37108f061ed9c7d266b826dbe62ff | — | EXCLUDE_FROM_NEW_RELEASE_PATH |
| supabase/migrations/20260727165538_84075c1c-e9da-46c1-bcea-727159d46863.sql | TEST_ONLY second fixture student insert | TEST_ONLY | UNKNOWN | 08eee7388276584769536509ec644d5b0e97918a | — | EXCLUDE_FROM_NEW_RELEASE_PATH |
| supabase/migrations/20260731203030_8e3ed620-f5d3-4f20-a326-e4f6366f44fd.sql | TEST_ONLY Stage-3 limited cleanup (forward-only) | TEST_ONLY | UNKNOWN | 538e8df7b90631b347f568d2c474a62c2dd76f6a | docs/B1-STAGE3-TESTONLY-FORWARD-ONLY-CLEANUP-PRODUCTION-APPLY-136-REPORT.md | EXCLUDE_FROM_NEW_RELEASE_PATH |
| supabase/migrations/20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql | TEST_ONLY safe-RPC fixture package (Fixture 13) | TEST_ONLY | UNKNOWN | a4c916c038d963853deaef9d8c9a6d8407477a66 | docs/B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15-REPORT.md | EXCLUDE_FROM_NEW_RELEASE_PATH |
| supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql | TEST_ONLY Fixture 15 reissue | TEST_ONLY | UNKNOWN | 42a0388fc5cd42883727b13987fbac524b2470b8 | docs/B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44-REPORT.md | EXCLUDE_FROM_NEW_RELEASE_PATH |
| docs/migration-drafts/test-only-archive/20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql | Duplicate managed alias of Fixture 15 reissue | SUPERSEDED/TEST_ONLY | UNKNOWN | 42a0388fc5cd42883727b13987fbac524b2470b8 | docs/B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44-REPORT.md | ARCHIVED; removed from Go-Live apply graph |
| supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql | TEST_ONLY request-scoped E2E support | TEST_ONLY | UNKNOWN | 40b8b50912ee10f8b97b310faf1e8906d1a27dee | docs/PORTAL-B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97-REPORT.md; docs/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md | EXCLUDE_FROM_NEW_RELEASE_PATH |
| docs/migration-drafts/test-only-archive/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql | Duplicate of B1_E2E_88 request-scoped E2E support | SUPERSEDED/TEST_ONLY | UNKNOWN | identical to 20260804120000_b1_88_request_scoped_e2e_support.sql (newline only) | docs/PORTAL-B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97-REPORT.md | ARCHIVED; removed from Go-Live apply graph |

Notes:
- No already-applied migration was deleted or rewritten.
- All remaining TEST_ONLY migrations under `supabase/migrations/` are classified
  `EXCLUDE_FROM_NEW_RELEASE_PATH`. Release orchestration must skip them.
- The two duplicate files that appeared later in the production path were moved
  to `docs/migration-drafts/test-only-archive/` as historical evidence.

## B — TEST_ONLY migration in production path

- `TEST_ONLY_PRODUCTION_PATH_UNKNOWN`: **0**
- `TEST_ONLY_RELEASE_GRAPH_SAFE`: **YES**

All TEST_ONLY-bearing migrations are catalogued in
`docs/migration-drafts/B1-TESTONLY-EXCLUSION-MANIFEST-01.json`. The duplicate
managed aliases were removed from `supabase/migrations/`; the remaining TEST_ONLY
files are intentionally left in place (applied state unknown) and must be
skipped by fresh release orchestration.

## C — D-02 chair sensor

Fixed in `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` and
`docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-02.md`.

Sensor semantics:
- `request_processing_units.code = 'department'` and `is_active`
- `request_processing_roles.code = 'department_head'` and `is_active`
- `request_processing_assignments.assignment_type = 'faculty_profile'`
- assignment active and currently effective (`starts_at`/`ends_at` window)
- counted per audited department using the documented immutable expected-chair
  fixture UUIDs

No `ilike '%chair%'` pattern matching remains in the current D-02 sensor.

### D-02 focused verification

| check | result |
|---|---|
| `D02_NONCHAIR_ASSIGNMENT_NOT_COUNTED` | PASS (PG17 disposable harness) |
| `D02_CHAIR_ASSIGNMENT_COUNTED` | PASS (PG17 disposable harness) |
| `D02_DUPLICATE_ACTIVE_CHAIR_DETECTED` | PASS (PG17 disposable harness) |
| `D02_MISSING_CHAIR_DETECTED` | PASS (PG17 disposable harness) |
| `D02_STALE_SHA_REMOVED` | PASS from current D-02 package |

Source-contract test:
`tests/b1-d02-chair-sensor-semantic-01/d02-sensor-source-contract.test.ts` — 5/5 PASS.

## D — B1 source vs production contract

Current read-only preflight contracts:

- `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-02.md` (current V2)
- `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` (historical V1)
- `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md`
- `docs/B1-PREFLIGHT-FRESH-BASELINE-01.md`

Dimensions separated:

| dimension | source state | deployed SHA | production DB state | service visibility | function graph | fixture state |
|---|---|---|---|---|---|---|
| value | current branch tip `38578b65…` | `UNKNOWN` | not read in this mission | source contract only | source contract only | source contract only |
| how proven | `git rev-parse HEAD` | independent deploy read-back only | D-02 Q1–Q3j when authorized | D-02 Q3e when authorized | D-02 Q3a/Q3c when authorized | D-02 Q3g + fixture audit when authorized |

No source SHA is treated as deployed proof. Stale pins `0e2d25c9…`,
`427b7eb4…`, `8f229d09…` are historical only.

## E — B1 negative matrix status

- 267-case negative contract: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json` — reconciled.
- Fresh render / workflow step IDs / direct-assignee constraints: pinned.
- Baseline posture: `PINNED` and valid per `stale-baseline-invalidation-09.test.ts`.
- Positive harness separation: positive cases held back from negative execution.
- B1 five-services visibility: source contract asserts exactly the five canonical
  services plus isolated `enrollment_certificate`; tests pass.

The historical HOLD reports that were superseded by the current canonical package
are **not reopened**.

## F — Tests

| suite | result |
|---|---|
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **202 pass / 0 fail** |
| `bun test tests/student-requests` | **1066 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** (only autocrlf LF warning, no whitespace errors) |
| `bun test tests/b1-d02-chair-sensor-semantic-01` (source contract) | **5 pass / 0 fail** |
| Disposable PG17 D-02 logic harness | **PASS** (5/5 notices) |

## G — Release output

### Files changed

- `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` — refreshed D-02 package, removed stale SHA, semantic chair sensor, Q3j TEST_ONLY check.
- `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-02.md` — current V2 D-02 package (new).
- `docs/B1-PREFLIGHT-FRESH-BASELINE-01.md` — refreshed to current source SHA, no deployed claim.
- `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` — refreshed to current source SHA, no deployed claim.
- `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` — canonical 27-entry graph rebuilt at HEAD.
- `docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json` — canonical graph artifact (new).
- `docs/b1/B1-FUNCTION-PROVENANCE-NOTES-01.md` — function provenance notes (new).
- `docs/b1/B1-RPC-AUTHORIZATION-MATRIX-CURRENT-TRUTH-01.md` — negative matrix current truth (new).
- `docs/migration-drafts/B1-TESTONLY-EXCLUSION-MANIFEST-01.json` — TEST_ONLY classification (new).
- `docs/migration-drafts/test-only-archive/20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql` — archived duplicate (moved).
- `docs/migration-drafts/test-only-archive/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql` — archived duplicate (moved).
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts` — updated to find archived file.
- `tests/b1-d02-chair-sensor-semantic-01/` — new source-contract + PG17 harness.
- `tests/student-requests/b1-confirm-payment-predecessor-guard-01.test.ts` — manifest SHA assertion aligned.
- `tests/student-requests/b1-final-unified-backend-stack-independent-review-01.test.ts` — manifest SHA assertion aligned.

### Final field summary

```text
B1_MIGRATION_SOURCE_DRIFT=CLOSED — canonical 27-entry graph rebuilt at current branch tip
B1_CANONICAL_GRAPH=docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json (seq 1..27) + docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json
TEST_ONLY_MIGRATIONS_FOUND=10 (8 in supabase/migrations, 2 archived duplicates)
TEST_ONLY_RELEASE_PATH_STATUS=SAFE — TEST_ONLY_PRODUCTION_PATH_UNKNOWN=0
D02_CHAIR_SENSOR=FIXED — exact semantic unit+role+assignment_type+active-window
D02_FALSE_POSITIVE_FIXED=PASS (PG17 disposable harness + source contract)
STALE_RELEASE_SHA_REFERENCES=PASS — current contracts use 38578b65… as traceability only; no source SHA treated as deployed proof
B1_NEGATIVE_MATRIX_CURRENT_STATUS=PASS — 267-case contract reconciled; baseline PINNED and valid
B1_PRODUCTION_E2E_READY=NO — source packaged; production E2E gated by deploy, independent DEPLOYED_SHA proof, authorized D-02 execution, and USER_APPROVAL

STUDENT_REQUESTS=1066/1066 PASS
B1_AUTHZ_TESTS=202/202 PASS
TSC=PASS
BUILD=PASS
DIFF=PASS

CRITICAL_COUNT=0
HIGH_COUNT=0
```

### Decision

**PASS_PORTAL_B1_GO_LIVE_MIGRATION_DRIFT_TESTONLY_D02_FINAL_CLOSURE_LONGRUN_01**

The three blockers are closed at source. No production writes, no production RPC
execution, no deploy, and no main merge occurred in this mission.
