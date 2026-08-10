# ALUMNI-P0-IMPLEMENTATION-COVERAGE-MATRIX-01

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01` |
| Main SHA (reconcile base) | `4a6e16b9fa66d6738a17b1399c553144b13a5101` (includes merged PR #273) |
| Decision baseline commit | `82bf86399c293719b7e146db39a996098d72353b` |
| PR #273 head | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` (**ancestor of main**) |
| Mode | SOURCE RECONCILIATION — DRAFTS_ONLY_NO_APPLY |

Status vocabulary: `IMPLEMENTED_MAIN` · `IMPLEMENTED_PR273` · `PARTIALLY_IMPLEMENTED` · `NOT_IMPLEMENTED` · `OBSOLETE_BY_NEW_DECISION` · `CONFLICTS_WITH_NEW_DECISION`

> Prefer `IMPLEMENTED_MAIN` when PR #273 content is already on main.

---

## P0-A — Graduate fact / authority

| Requirement | Status | Evidence |
|---|---|---|
| Candidate = computed read model | `IMPLEMENTED_MAIN` | `getGraduationCandidates` |
| Eligible = deterministic evaluation | `IMPLEMENTED_MAIN` | academic-status engine |
| Official decision ledger | `IMPLEMENTED_MAIN` | Foundation `graduate_official_decisions` |
| Graduate record from approved decision only | `IMPLEMENTED_MAIN` | `create_graduate_record_from_official_decision` + guards + TS readiness |
| One current record per award | `IMPLEMENTED_MAIN` | unique `(student_profile_id, program_id)` where approved |
| Immutable academic snapshot | `IMPLEMENTED_MAIN` | immutability trigger + non-empty jsonb |
| Snapshot field schema §4.2 completeness | `PARTIALLY_IMPLEMENTED` | non-empty required; full key schema not enforced |
| Correction via supersession | `IMPLEMENTED_MAIN` | `supersedes_decision_id` + create path |
| Revocation semantics + visibility gate | `IMPLEMENTED_MAIN` | propagate + Auth-04 / REMEDIATION-06 approved lifecycle |
| Correction/revocation domain audit events | `IMPLEMENTED_MAIN` | Foundation `propagate_graduate_decision_state` emits events (gap closed this mission) |
| No profile/candidates/GP/document-only create | `IMPLEMENTED_MAIN` | guards + TS readiness exclude them |
| Registrar approve / authorized create RPC for clients | `NOT_IMPLEMENTED` | create RPC revoked from authenticated; no approve RPC |
| Lifecycle vocabulary bridge eligibility→approval | `PARTIALLY_IMPLEMENTED` | evidence exists; no forced eligibility gate before approve |

## P0-B — Staff authorization

| Requirement | Status | Evidence |
|---|---|---|
| Unit `graduate_affairs` + functional roles | `IMPLEMENTED_MAIN` | staff-functional-roles + Auth-04 |
| Role + unit + direct assignment/scope | `IMPLEMENTED_MAIN` | Auth-04 predicates |
| `student_affairs` fallback ≠ authority | `IMPLEMENTED_MAIN` | no app_role consult in Auth-04 |
| No admin/dean/registrar bypass | `IMPLEMENTED_MAIN` | Auth-04 negative matrix |
| No same-role-unassigned | `IMPLEMENTED_MAIN` | Auth-04 |
| No wrong dept/program | `IMPLEMENTED_MAIN` | Auth-04 (program cohort scoped) |
| REMEDIATION-06 approved visibility | `IMPLEMENTED_MAIN` | Auth-04 SQL + pg-verify J* |
| Program-as-assignment binding | `PARTIALLY_IMPLEMENTED` | P1_LATER refinement |
| Ambiguous multi-identity DENY | `PARTIALLY_IMPLEMENTED` | P1_LATER |

## P0-C — Account continuity

| Requirement | Status | Evidence |
|---|---|---|
| Same `auth.users` / `student_profiles.user_id` | `IMPLEMENTED_MAIN` | no second IdP; foundation FK model |
| Separate student vs graduate capabilities | `PARTIALLY_IMPLEMENTED` | request audience + continuity evaluator; login unwired |
| Product decision closed in source | `IMPLEMENTED_MAIN` | TS baseline + contract (gap closed this mission) |
| Fail-closed undecided default | `IMPLEMENTED_MAIN` | `ACCOUNT_CONTINUITY_POLICY_UNDECIDED` |
| Capability vocabulary vs §6.1 | `IMPLEMENTED_MAIN` | expanded allow-list (this mission) |
| University email reuse deny flag | `IMPLEMENTED_MAIN` | evaluator + baseline `false` |
| Login / session continuity wiring | `NOT_IMPLEMENTED` | portal-login does not call evaluator |
| Personal recovery channel wiring | `NOT_IMPLEMENTED` | forgot-password university-email only |
| Import detach-before-reuse | `NOT_IMPLEMENTED` | P1/runtime |
| Request audience graduated gating | `IMPLEMENTED_MAIN` | `assert_student_can_use_request_type` |

## P0-D — Audit / privacy foundation

| Requirement | Status | Evidence |
|---|---|---|
| Domain events append-only | `IMPLEMENTED_MAIN` | Foundation table + Auth-04 writes |
| Sensitive staff read/write audit | `PARTIALLY_IMPLEMENTED` | Auth-04 domain events; dual `log_audit` not wired |
| Immutable academic evidence | `IMPLEMENTED_MAIN` | Foundation immutability |
| Protected PII not in ordinary DTOs | `IMPLEMENTED_MAIN` | Auth-04 portal deny / contact protect |
| Aggregate small-cell suppression | `IMPLEMENTED_MAIN` | reports TS + completion |
| Self-service allowlist | `PARTIALLY_IMPLEMENTED` | profile fields; continuity gate unwired |
| No sensitive notification bodies | `PARTIALLY_IMPLEMENTED` | no alumni writers yet; P2 vocabulary |
| Correction/revocation audit events | `IMPLEMENTED_MAIN` | closed this mission in Foundation draft |

---

## Gap class summary

| Gap | Class | Action this mission |
|---|---|---|
| G-APPROVE-RPC / grant create under registrar auth | `P0_BLOCKING` remaining | **Deferred** to runtime/RPC draft wave (no duplicate model) |
| G-SNAPSHOT-SCHEMA keys | `P1_LATER` | No code |
| Login/recovery wiring | `P0_BLOCKING` remaining (runtime) | **Deferred** — NEXT_STEP |
| Continuity decision drift in TS | `P0_BLOCKING` | **FIXED** |
| Correction/revocation domain events | `P0_BLOCKING` | **FIXED** |
| Dual-channel `log_audit` | `P1_LATER` | No code |
| Auth-04 program-assignment / ambiguous identity | `P1_LATER` | No Auth-04 rewrite |
| Notifications / surveys / jobs apps | `P2_LATER` | No code |

---

## Reuse verdict

- **EXISTING_WORK_REUSED:** Foundation, Completion, Authorization-04, REMEDIATION-06, TS libraries, PG17 verifiers
- **DUPLICATE_IMPLEMENTATION_AVOIDED:** no second `graduate_records`, no Auth-04 fork, no competing continuity evaluator
- **TRUE_GAPS_FIXED:** continuity decision encoding; correction/revocation audit events
- **TRUE_GAPS_REMAINING:** registrar approve/create client path; login/recovery wiring
