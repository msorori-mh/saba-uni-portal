# PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01-REPORT

| Field | Value |
|---|---|
| Mission | `PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-UNIFIED-REMEDIATION-01` (+ `PORTAL-GRADUATES-AFFAIRS-CODEX-FINAL-HIGH-REMEDIATION-03`) |
| Branch | `fix/graduates-affairs-multimodel-remediation-01` |
| PR | `#291` |
| BASE_REVIEW_SHA | `724f040743c1017e4b322f68b8e248bde122d1c3` |
| REMEDIATION_REVIEW_SHA | `9356fad2a71517807e9117c704883cc3544c7cc7` (prior multimodel fix set) |
| OLD_HELD_SHA | `e613f40e286d35f61ef4bf0643daf9988c86c44b` |
| Mode | SOURCE-ONLY remediation (no migration apply, no deploy, no publish) |
| Supersedes review packaging | `docs/PORTAL-GRADUATES-AFFAIRS-MULTIMODEL-REVIEW-PACKAGE-01.md` (pre-fix baseline) |

## Mission

Unify Codex / Qwen / Kimi / Antigravity multimodel findings against Graduates Affairs into one source remediation on the BASE_REVIEW_SHA tip: close confirmed authorization and runtime defects, freeze owner policy decisions where required, expand PG17 / bun coverage, and leave a single review SHA for targeted re-review after commit.

`REMEDIATION_REVIEW_SHA` pins the substantive remediation commit (`fix(graduates-affairs): unify multimodel authorization remediation`). Branch tip may include subsequent documentation pins; reviewers should use the PR tip for CI and the pinned SHA for code/SQL review of the fix set.

## Finding status matrix

Status vocabulary (only):

- `CONFIRMED_FIXED` — defect confirmed and fixed in source
- `POLICY_RESOLVED_AND_FIXED` — owner decision frozen, then implemented
- `REJECTED_WITH_EVIDENCE` — claim rejected; evidence shows intended / non-defect behavior
- `SEPARATE_NONBLOCKING_HYGIENE` — out of GA remediation scope; track separately

### Remediation ID → status (authoritative)

| ID | Topic | Status | Notes |
|---|---|---|---|
| R1 | Specialist department scope union | **CONFIRMED_FIXED** | Authorizing-profile-bound departments only; bidirectional denial proven; tightened by CODEX-FINAL-HIGH-2 |
| R2 | Active staff profile status | **CONFIRMED_FIXED** | `staff_profiles.status = 'active'` on capability / assignee paths; tightened by CODEX-FINAL-HIGH-1 for direct-user assignments |
| R3 | Follow-up after revocation | **POLICY_RESOLVED_AND_FIXED** | Owner: immediate loss of authority; row retained for audit |
| R4 | Cross-scope follow-up delegation | **POLICY_RESOLVED_AND_FIXED** | Manager college-wide; specialist in-scope assignee only |
| R5 | Opportunity moderation / employer verification | **POLICY_RESOLVED_AND_FIXED** | Manager-only MVP (no invented object scope) |
| R6 | Self-write vs correction/revocation concurrency | **CONFIRMED_FIXED** | Approved-record `FOR SHARE` before self mutations |
| R7 | Corrected/revoked self-read | **POLICY_RESOLVED_AND_FIXED** | Lose GA private self-read; Official Documents domain remains separate |
| R8 | Account continuity policy versioning | **CONFIRMED_FIXED** | Multi-version + one current; atomic supersession; evaluator uses current |
| R9 | Server runtime trust boundary | **CONFIRMED_FIXED** | Client supplies capability/target only; server derives authority via AUTH-04 context RPCs |
| R10 | Follow-up FSM duplication | **CONFIRMED_FIXED** | Canonical transitions in `authorization.ts`; `communications.ts` re-exports |
| R11 | Route hash / stale counts / doc drift | **CONFIRMED_FIXED** | Route semantic hash re-pinned; stale suite-count / §G8·§G9 claims superseded here |
| CODEX-FINAL-HIGH-1 | Direct user assignment active-staff bypass | **CONFIRMED_FIXED** | `assignment_type='user'` must resolve fail-closed to exactly one active `staff_profiles` row; zero/>1/inactive/suspended ⇒ DENY |
| CODEX-FINAL-HIGH-2 | Specialist scope unbound from authorizing profile | **CONFIRMED_FIXED** | Scope binds only to the resolver's authorizing profile; other owned active profiles contribute zero departments |
| QWEN-FINAL-F1 | `updateOwnProfile` RPC arg `p_row_version` ≠ SQL `p_expected_row_version` | **CONFIRMED_FIXED** | After `ccb2b0ad…`; TS payload key aligned to SQL; durable contract test |
| QWEN-FINAL-F2 | ERROR_LABELS missed `GRADUATE_PROFILE_VERSION_CONFLICT` | **CONFIRMED_FIXED** | After `ccb2b0ad…`; canonical mapping + STALE_VERSION compat alias |
| QWEN-FINAL-NOTE-CONTEXT-RPC | Context RPC actor matrix only external/ad-hoc | **CONFIRMED_FIXED** | After `ccb2b0ad…`; persisted PG17 functional matrix + CI leg |
| QWEN-FINAL-NOTE-REVERSE-RACE | Reverse lifecycle→self-write TOCTOU not in repo | **CONFIRMED_FIXED** | After `ccb2b0ad…`; reverse direction persisted in concurrency verifier |

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

## CODEX-FINAL-HIGH remediation (mission 03)

Final Codex review on held tip `e613f40e` confirmed exactly two residual HIGH authorization defects. R5–R11 remained closed and were not reopened.

### Frozen direct-user assignment resolution rule

ALL Graduate Affairs operational staff authority requires an ACTIVE staff identity:

1. **`assignment_type = 'staff_profile'`** — `assignment.staff_profile_id` must exist, belong to the target/caller user, and `status = 'active'`.
2. **`assignment_type = 'user'`** — `assignment.user_id` must match; the user must resolve fail-closed to **exactly one** active `staff_profiles` row (zero ⇒ DENY; more than one ⇒ DENY; inactive/suspended do not qualify).

Canonical helpers (internal, SECURITY DEFINER, revoked from anon/authenticated):

- `graduate_affairs_resolve_authorized_staff_profile_id(user, role)`
- `graduate_affairs_resolve_caller_authorized_staff_profile_id(role)`

Manager / specialist / active-staff capability and specialist department scope all route through the resolver. Specialist scope never unions departments from non-authorizing profiles owned by the same user. Follow-up read/transition authority is lost immediately when the authorizing profile becomes inactive/suspended, even if a direct user assignment row remains active; the historical follow-up row is retained.

Executable matrix: `tests/graduates-affairs/graduates-affairs-codex-final-high-profile-binding-03.pg-verify.sql` (CI leg `graduates-affairs-codex-final-high-profile-binding`).

## Qwen wiring + coverage remediation (mission 04)

These closures land **after** start SHA `ccb2b0ad7f15f9a705ca128aed1724759b6616bc` (Codex HIGH-1/HIGH-2 tip). They do **not** reopen R1–R11. This tip is a **PRE-#292 GA SHA** — not the final immutable merge-review SHA.

| ID | Topic | Status | Evidence |
|---|---|---|---|
| QWEN-FINAL-F1 | `GraduatesAffairsRpcClient.updateOwnProfile` sent `p_row_version`; SQL expects `p_expected_row_version` | **CONFIRMED_FIXED** | `src/lib/graduates-affairs/rpc.ts`; `tests/graduates-affairs/graduates-affairs-rpc-contract-04.test.ts` compares live runtime args to SQL signature |
| QWEN-FINAL-F2 | Runtime ERROR_LABELS used `GRADUATE_PROFILE_STALE_VERSION`; SQL raises `GRADUATE_PROFILE_VERSION_CONFLICT` | **CONFIRMED_FIXED** | Canonical `GRADUATE_PROFILE_VERSION_CONFLICT` mapping; STALE_VERSION retained as compatibility alias only |
| QWEN-FINAL-NOTE-CONTEXT-RPC | Context RPC ACL existed; actor behavior matrix was external | **CONFIRMED_FIXED** | `tests/graduates-affairs/graduates-affairs-context-rpc-functional-matrix-04.pg-verify.sql` + CI leg `graduates-affairs-context-rpc-functional-matrix` |
| QWEN-FINAL-NOTE-REVERSE-RACE | Forward R6 concurrency only | **CONFIRMED_FIXED** | Reverse lifecycle→self-write TOCTOU appended to `graduates-affairs-remediation-concurrency-01.pg-verify.sql` (dblink + async block proof) |

CODEX-FINAL-HIGH-1 / HIGH-2 resolvers and profile-binding verifier remain intact and are re-run as regression.

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
4. **remediation-concurrency** — auth setup → foundation → completion → AUTH-04 → `graduates-affairs-remediation-concurrency-01.pg-verify.sql` (forward R6 + reverse TOCTOU)
5. **codex-final-high-profile-binding** — auth setup → foundation → completion → AUTH-04 → `graduates-affairs-codex-final-high-profile-binding-03.pg-verify.sql`
6. **context-rpc-functional-matrix** — auth setup → foundation → completion → AUTH-04 → `graduates-affairs-context-rpc-functional-matrix-04.pg-verify.sql`

Additional coverage for this remediation is embedded in the expanded authorization-04 and completion verifiers (multi-specialist, revocation, delegation, lifecycle, continuity supersession).

All PG17 work is disposable local/CI only — **no production database contact**.

### Post-remediation verification results

| Check | Result |
|---|---|
| `bun test tests/graduates-affairs` | **152 pass / 0 fail** |
| `bun test tests/graduation-projects` | **108 pass / 0 fail** |
| `bun test tests/student-requests` | **1066 pass / 0 fail** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |
| PG17 foundation | **PASS** |
| PG17 completion | **PASS** |
| PG17 authorization-04 | **PASS** |
| PG17 remediation-concurrency (incl. reverse) | **PASS** |
| PG17 codex-final-high-profile-binding | **PASS** |
| PG17 context-rpc-functional-matrix | **PASS** |

Do not reuse pre-fix integration package counts (114 / 135 / 136).

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

**PASS_PORTAL_GA_QWEN_WIRING_COVERAGE_REMEDIATED_PRE292_SHA_READY**

NEXT: `MERGE_PR292_FIRST_THEN_SYNC_PR291_TO_NEW_MAIN`
