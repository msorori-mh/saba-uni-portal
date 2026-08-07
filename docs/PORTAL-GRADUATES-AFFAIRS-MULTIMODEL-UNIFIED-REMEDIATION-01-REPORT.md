# PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT

| Field | Value |
|---|---|
| Mission | `PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01` |
| Branch | `fix/graduates-affairs-multimodel-remediation-01` |
| BASE_REVIEW_SHA | `724f040743c1017e4b322f68b8e248bde122d1c3` |
| REMEDIATION_REVIEW_SHA | `08544c5ef96968e76d86ab9f3dae62e2d94a3296` (code tip; doc pin may follow) |
| Mode | SOURCE-ONLY remediation (no migration apply, no deploy, no publish) |
| Supersedes review packaging | `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-REVIEW-PACKAGE-01.md` (pre-fix baseline) |

## Mission

Unify Codex / Qwen / Kimi / Antigravity multimodel findings against Graduates Affairs into one source remediation on the BASE_REVIEW_SHA tip: close confirmed authorization and runtime defects, freeze owner policy decisions where required, expand PG17 / bun coverage, and leave a single review SHA for targeted re-review after commit.

## Finding status matrix

Status vocabulary (only):

- `CONFIRMED_FIXED` — defect confirmed and fixed in source
- `POLICY_RESOLVED_AND_FIXED` — owner decision frozen, then implemented
- `REJECTED_WITH_EVIDENCE` — claim rejected; evidence shows intended / non-defect behavior
- `SEPARATE_NONBLOCKING_HYGIENE` — out of GA remediation scope; track separately

### Remediation ID → status (authoritative)

| ID | Topic | Status | Notes |
|---|---|---|---|
| R1 | Specialist department scope union | **CONFIRMED_FIXED** | Caller-owned active specialist departments only; bidirectional denial proven |
| R2 | Active staff profile status | **CONFIRMED_FIXED** | `staff_profiles.status = 'active'` on capability / assignee paths |
| R3 | Follow-up after revocation | **POLICY_RESOLVED_AND_FIXED** | Owner: immediate loss of authority; row retained for audit |
| R4 | Cross-scope follow-up delegation | **POLICY_RESOLVED_AND_FIXED** | Manager college-wide; specialist in-scope assignee only |
| R5 | Opportunity moderation / employer verification | **POLICY_RESOLVED_AND_FIXED** | Manager-only MVP (no invented object scope) |
| R6 | Self-write vs correction/revocation concurrency | **CONFIRMED_FIXED** | Approved-record `FOR SHARE` before self mutations |
| R7 | Corrected/revoked self-read | **POLICY_RESOLVED_AND_FIXED** | Lose GA private self-read; Official Documents domain remains separate |
| R8 | Account continuity policy versioning | **CONFIRMED_FIXED** | Multi-version + one current; atomic supersession; evaluator uses current |
| R9 | Server runtime trust boundary | **CONFIRMED_FIXED** | Client supplies capability/target only; server derives authority via AUTH-04 context RPCs |
| R10 | Follow-up FSM duplication | **CONFIRMED_FIXED** | Canonical transitions in `authorization.ts`; `communications.ts` re-exports |
| R11 | Route hash / stale counts / doc drift | **CONFIRMED_FIXED** | Route semantic hash re-pinned; stale suite-count / §G8·§G9 claims superseded here |

### Qwen (QGA-DB-01..09)

| Finding | Codex peer | Maps to | Status |
|---|---|---|---|
| QGA-DB-01 specialist scope union | A | R1 | **CONFIRMED_FIXED** |
| QGA-DB-02 `staff_profiles.status` ignored | B | R2 | **CONFIRMED_FIXED** |
| QGA-DB-03 direct assignee after revocation | C | R3 | **POLICY_RESOLVED_AND_FIXED** |
| QGA-DB-04 specialist cross-scope delegation | D | R4 | **POLICY_RESOLVED_AND_FIXED** |
| QGA-DB-05 scope-less moderation/verification | E | R5 | **POLICY_RESOLVED_AND_FIXED** |
| QGA-DB-06 self-write TOCTOU vs correction/revocation | F | R6 | **CONFIRMED_FIXED** |
| QGA-DB-07 corrected/revoked self-read divergence | G | R7 | **POLICY_RESOLVED_AND_FIXED** |
| QGA-DB-08 continuity policy revision path dead | — | R8 | **CONFIRMED_FIXED** |
| QGA-DB-09 route-tree semantic hash stale / suite red | — | R11 | **CONFIRMED_FIXED** |

### Codex (A–G)

| Finding | Peer | Maps to | Status |
|---|---|---|---|
| A specialist scope union | QGA-DB-01 | R1 | **CONFIRMED_FIXED** |
| B staff status not required | QGA-DB-02 | R2 | **CONFIRMED_FIXED** |
| C assignee access after revocation | QGA-DB-03 | R3 | **POLICY_RESOLVED_AND_FIXED** |
| D out-of-scope specialist assignee | QGA-DB-04 | R4 | **POLICY_RESOLVED_AND_FIXED** |
| E moderation/verification without scope | QGA-DB-05 | R5 | **POLICY_RESOLVED_AND_FIXED** |
| F self auth races correction/revocation | QGA-DB-06 | R6 | **CONFIRMED_FIXED** |
| G corrected/revoked self-read | QGA-DB-07 | R7 | **POLICY_RESOLVED_AND_FIXED** |

### Kimi (traceability items touching this remediation)

| Item | Maps to | Status |
|---|---|---|
| Missing fail-closed reason-path coverage for specialist/revocation/delegation/moderation negatives | R12 + AUTH-04 pg-verify section R | **CONFIRMED_FIXED** |
| Stale suite-count / INTEGRATION_REVIEW_SHA / §G8·§G9 package cross-refs | R11 + this report | **CONFIRMED_FIXED** |
| Continuity SQL comment / versioning traceability drift | R8 | **CONFIRMED_FIXED** |
| Repository-wide production-export hygiene / publishable anon fallback key (if raised against the SHA) | — | **SEPARATE_NONBLOCKING_HYGIENE** |

### Antigravity (architecture notes)

| Note | Maps to | Status |
|---|---|---|
| Runtime trust: client-supplied ownership / lifecycle / continuity / assignments / scope | R9 | **CONFIRMED_FIXED** |
| Follow-up FSM duplicated across `authorization.ts` and `communications.ts` | R10 | **CONFIRMED_FIXED** |
| Route semantic hash pin + stale inventory/counts | R11 | **CONFIRMED_FIXED** |

### Rejected / hygiene (explicit)

| Claim / item | Status | Evidence |
|---|---|---|
| Manager must not create cross-department follow-ups | **REJECTED_WITH_EVIDENCE** | OWNER / R4: manager scope is college-wide; specialist assignee must still be active GA staff |
| Feature flags are authorization controls | **REJECTED_WITH_EVIDENCE** | Flags remain release gates only; AUTH-04 SQL is authoritative |
| Workstation-only outside-git operator / env reds are GA package defects | **REJECTED_WITH_EVIDENCE** | R11: not treated as product failures; CI must still be green |
| Repository-wide production-export hygiene | **SEPARATE_NONBLOCKING_HYGIENE** | Not mixed into GA remediation |
| Publishable anon fallback key hygiene | **SEPARATE_NONBLOCKING_HYGIENE** | Not mixed into GA remediation |

## Files changed summary (major paths)

SQL drafts / matrix:

- `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`
- `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`
- `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-MATRIX-04.md`

Runtime TypeScript:

- `src/lib/graduates-affairs/adapter-input.ts` (new — strict wire schemas)
- `src/lib/graduates-affairs/graduates-affairs.functions.ts`
- `src/lib/graduates-affairs/runtime-gate.ts`
- `src/lib/graduates-affairs/rpc.ts`
- `src/lib/graduates-affairs/communications.ts`

Tests / verifiers:

- `tests/graduates-affairs/graduates-affairs-authorization-04-sql.test.ts`
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql`
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql`
- `tests/graduates-affairs/graduates-affairs-completion-01.pg-verify.sql`
- `tests/graduates-affairs/graduates-affairs-remediation-concurrency-01.pg-verify.sql` (new)
- `tests/graduates-affairs/graduates-affairs-runtime-wire-01.test.ts`
- `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` (route hash re-pin)

Documentation (this pass):

- `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT.md` (this file)
- `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-REVIEW-PACKAGE-01.md`
- `docs/PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01-REPORT.md`
- `docs/PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01.md`
- `docs/PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01.md`
- `docs/ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01-REPORT.md`

## Verification commands

```bash
bun test tests/graduates-affairs
bunx tsc --noEmit
bun run build
git diff --check
```

### PG17 disposable chains (note)

CI-equivalent legs (`.github/workflows/ci.yml` `pg-verifiers`, `postgres:17`):

1. **foundation** — `graduates-affairs-foundation-01.pg-setup.sql` → `GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` → foundation pg-verify
2. **completion** — foundation setup → foundation draft → `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` → completion pg-verify
3. **authorization-04** — `graduates-affairs-authorization-04.pg-setup.sql` → foundation → completion → `GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` → authorization-04 pg-verify (includes multimodel section R)

Additional local / targeted disposable chains for this remediation:

- concurrency (`graduates-affairs-remediation-concurrency-01.pg-verify.sql`)
- multi-specialist / revocation / delegation / lifecycle / continuity coverage embedded in the expanded authorization-04 and completion verifiers

All PG17 work is disposable local/CI only — **no production database contact**.

Post-fixiation suite counts: record actual `bun test` totals on the remediation tip after commit; do not reuse pre-fix integration package counts (114 / 135 / 136).

## Safety counters

| Counter | Value |
|---|---|
| PRODUCTION_RPC_CALLS | 0 |
| PRODUCTION_WRITES | 0 |
| MIGRATION_APPLIED | NO |
| ROLE_SEED_APPLIED | NO |
| DEPLOY | NO |
| PUBLISH | NO |
| FEATURE_FLAGS_ENABLED | NO |

## Decision

**PASS_PORTAL_GRADUATES_AFFAIRS_MULTIMODEL_REMEDIATION_REVIEW_SHA_READY**

`REMEDIATION_REVIEW_SHA` pinned after remediation commit (see header). Tip SHA after this doc pin is the immutable review artifact for targeted Codex/Qwen re-review.

NEXT: `TARGETED_CODEX_AND_QWEN_REVIEW_ON_EXACT_REMEDIATION_REVIEW_SHA`
