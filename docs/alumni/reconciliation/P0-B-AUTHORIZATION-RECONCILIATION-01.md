# P0-B — Staff authorization reconciliation

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01` / STREAM B |
| Contract | `docs/alumni/ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01.md` |
| PR #273 head | `eddad8d2c510b955f92f9f6fa08adeb31e0aef66` (**ancestor of main**) |
| Main merge | `4a6e16b9` includes PR #273 |
| REMEDIATION-06 | `docs/PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-VISIBILITY-GATE-REMEDIATION-06-REPORT.md` |
| Mode | SOURCE RECONCILIATION — DO NOT REWRITE AUTH-04 |

## Compared surfaces

- `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`
- `src/lib/graduates-affairs/authorization.ts`
- `tests/graduates-affairs/graduates-affairs-authorization-04*.{ts,sql}`
- REMEDIATION-06 approved-lifecycle visibility predicates

## Required triad

| Requirement | Evidence | Status |
|---|---|---|
| Unit `graduate_affairs` | staff functional roles + Auth-04 helpers | `IMPLEMENTED_MAIN` / `IMPLEMENTED_PR273` |
| Functional role | manager / specialist / assignee codes | `IMPLEMENTED_MAIN` |
| Direct assignment / scope | assignment helpers + department scope | `IMPLEMENTED_MAIN` |

## Proof: `student_affairs` fallback ≠ authority

Auth-04 does **not** consult `app_role` / `has_any_role` for graduates-affairs staff RPCs. Compatibility fallback labels elsewhere are not grant paths. Status: `IMPLEMENTED_MAIN`.

## Bypass negatives (must DENY)

| Bypass | Covered? | Status |
|---|---|---|
| admin bypass | Auth-04 matrix + SQL no app_role | `IMPLEMENTED_MAIN` |
| dean bypass | same | `IMPLEMENTED_MAIN` |
| registrar bypass (for GA staff ops) | registrar is not GA unit authority; graduation approval remains registrar-controlled separately | `IMPLEMENTED_MAIN` |
| same-role-unassigned | assignment required | `IMPLEMENTED_MAIN` |
| wrong-department | specialist scope check | `IMPLEMENTED_MAIN` |
| wrong-program | cohort/program scoping (P1 refinement remains) | `PARTIALLY_IMPLEMENTED` → `P1_LATER` |

## REMEDIATION-06

Graduate-facing list RPCs gate on canonical current-self approved helper; RLS approved predicate parity preserved. **Do not rewrite.** Status: `IMPLEMENTED_MAIN`.

## Gaps

| ID | Finding | Class |
|---|---|---|
| G-B-01 | Program-as-assignment refinement | `P1_LATER` |
| G-B-02 | Ambiguous multi-identity DENY hardening | `P1_LATER` |

**Zero `P0_BLOCKING` authorization gaps.**

## Verdict

**P0-B: IMPLEMENTED (PR273 on main)** — reuse Authorization-04 + REMEDIATION-06 unchanged.
