# P0-A — Graduate fact / authority reconciliation

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01` / STREAM A |
| Contract | `docs/alumni/ALUMNI-P0-GRADUATE-FACT-CONTRACT-01.md` |
| Main SHA | `4a6e16b9fa66d6738a17b1399c553144b13a5101` |
| Decision baseline | `82bf86399c293719b7e146db39a996098d72353b` |
| Mode | SOURCE RECONCILIATION — DRAFTS_ONLY_NO_APPLY |

## Compared surfaces

- Foundation: `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql`
- Completion: `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`
- TS gate helpers: `src/lib/graduates-affairs/*` (readiness / foundation)
- Academic candidate engine: `src/lib/academic-status.functions.ts` (`getGraduationCandidates`)
- Auth-04 / REMEDIATION-06 visibility gate (approved lifecycle only)

## Lifecycle: candidate → eligible → graduation_approved → graduate

| Stage | Contract | Existing implementation | Status |
|---|---|---|---|
| candidate | Computed read model only | `getGraduationCandidates` + admin UI | `IMPLEMENTED_MAIN` |
| eligible | Deterministic evaluation evidence | academic-status engine | `IMPLEMENTED_MAIN` |
| graduation_approved | Explicit registrar decision ledger | `graduate_official_decisions` + approved constraints | `IMPLEMENTED_MAIN` |
| graduate | Versioned record from approved decision only | `create_graduate_record_from_official_decision` + insert guards | `IMPLEMENTED_MAIN` |

**Authoritative fact requires explicit approved graduation decision:** YES — create path rejects non-approved / incomplete provenance.

## Cardinality / immutability / correction / revocation

| Requirement | Evidence | Status |
|---|---|---|
| One current graduate record per approved award | unique `(student_profile_id, program_id)` where `record_state='approved'` | `IMPLEMENTED_MAIN` |
| Immutable / versioned academic snapshot | immutability trigger + non-empty jsonb; version bump on state change | `IMPLEMENTED_MAIN` |
| Correction via supersession | `supersedes_decision_id` + create path | `IMPLEMENTED_MAIN` |
| Revocation semantics | propagate `approved→revoked/corrected` to records; Auth-04 / REMEDIATION-06 hide non-approved | `IMPLEMENTED_MAIN` |
| Correction/revocation domain audit events | `propagate_graduate_decision_state` emits `graduation_decision_*` + `graduate_record_state_changed` | `IMPLEMENTED_MAIN` (closed this mission) |

## Explicit non-facts (must not create graduate)

| Forbidden signal | Guard present? | Status |
|---|---|---|
| profile-status-only | create RPC / guards require official decision | `IMPLEMENTED_MAIN` |
| candidates-list-only | no insert from candidate adapters | `IMPLEMENTED_MAIN` |
| GP-completion-only | no GP→graduate_records path | `IMPLEMENTED_MAIN` |
| document-issued-only | no official_documents create path | `IMPLEMENTED_MAIN` |

## Gaps

| ID | Finding | Class |
|---|---|---|
| G-A-01 | `create_graduate_record_from_official_decision` is revoked from `authenticated`; no registrar approve RPC for clients | `P0_BLOCKING` remaining → runtime/RPC draft wave (no competing model) |
| G-A-02 | Snapshot §4.2 full key schema not enforced (non-empty only) | `P1_LATER` |
| G-A-03 | Eligibility evidence not forced before approve | `P1_LATER` |

## Verdict

**P0-A: PARTIAL** — fact model on main is correct and must be reused; remaining P0 blocker is the authenticated approve/create wiring path, not a missing domain model.
