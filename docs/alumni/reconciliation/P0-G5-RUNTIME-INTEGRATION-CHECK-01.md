# G5 — P0 vs runtime integration check

| Field | Value |
|---|---|
| Branch | `feat/graduates-affairs-single-sha-integration-01` |
| Base main | `4a6e16b9fa66d6738a17b1399c553144b13a5101` |
| P0 source | `a96c24748106a08b0bb4cf29b59183a1912d8326` |
| Runtime source | uncommitted `feat/graduates-affairs-owner-gate-runtime-wire-01` worktree (preserved) |

| # | Invariant | Result |
|---|---|---|
| 1 | candidate ≠ graduate | PASS — runtime gate voids candidate; requires owned approved record |
| 2 | eligible ≠ graduate | PASS — no eligibility→record path in adapters |
| 3 | graduation_approved required | PASS — `graduateRecordState === "approved"` required |
| 4 | corrected/revoked fail closed | PASS — explicit denials in `evaluateGraduateSelfRuntimeAccess` |
| 5 | same auth identity retained | PASS — OWNER_D2 / P0 continuity; no second IdP |
| 6 | student vs graduate capabilities separated | PASS — continuity allow-list + request audience gates |
| 7 | continuity undecided fails closed | PASS — `ACCOUNT_CONTINUITY_POLICY_UNDECIDED` default |
| 8 | `graduate_affairs` canonical unit | PASS — Auth-04 + runtime staff gate |
| 9 | `student_affairs` fallback never grants | PASS — `NON_AUTHORITATIVE_APP_ROLES` + Auth-04 |
| 10 | no admin bypass | PASS |
| 11 | no dean bypass | PASS |
| 12 | no registrar alumni-ops bypass | PASS — registrar not GA authority |
| 13 | registrar academic graduation authority separate | PASS — OFFICIAL_DECISION_INTAKE |
| 14 | AUTH-04 authoritative | PASS — RPC allowlist only |
| 15 | REMEDIATION-06 intact | PASS — Auth-04 draft untouched this mission |

P1/P2 not reopened. D-3…D-12 remain fail-closed.
