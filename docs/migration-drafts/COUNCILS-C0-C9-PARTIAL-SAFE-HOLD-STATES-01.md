# Academic Councils C0–C9 — Partial Safe HOLD States

**Mission:** `ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13`\
**Rule:** Stopping mid-chain is a **safe HOLD**. No destructive rollback required.\
**Flags:** remain OFF. **UI kill-switch:** see FLAGS package (currently ungated).

Companion: `docs/migration-drafts/COUNCILS-C0-C9-ROLLBACK-BY-FORWARD-01.sql`

---

## Starting state (before C0)

| Classification | Meaning | Resume |
|---|---|---|
| `LEGACY_SUPPORTED` | Exact production predecessor schema present; C0+ objects absent. Safe to apply C0. | C0 |
| `C0_PARTIAL` | Some C0+ RPCs exist but no C1+ tables. Investigate before continuing. | HOLD |
| `C0-Cn_PARTIAL` | Some C1+ extension tables exist without complete ledger. Mixed state. | HOLD |
| `C0-C9_COMPLETE` | All ten promoted migrations already applied. Nothing to do. | N/A |
| `UNKNOWN_UNSAFE` | Does not match any known supported prestate. | HOLD |

Preflight V2 emits the classification and raises `HOLD:` for any state other than `LEGACY_SUPPORTED` or `C0-C9_COMPLETE`.

---

## Common HOLD rules (all partial states)

1. Do **not** re-apply a migration already in the ledger.
2. Do **not** DROP tables / truncate / reset.
3. Do **not** enable feature flags.
4. Do **not** run TEST_ONLY fixtures against production without separate approval.
5. Resume only with apply-one from the next pending step after post-verifier PASS on the last applied step.
6. If ledger says applied but objects incomplete → **HOLD mixed state**; investigate before any forward remediation.

---

## After C0 only

| Item | Expectation |
|---|---|
| Ledger | `…120000…c0…` present; later steps absent |
| Surface | Write-surface RPCs present; C1+ tables absent |
| Safety | Direct authenticated writes denied; MVP SELECT/RLS intact |
| Resume | Apply C1 only |
| Flags | OFF |

**HOLD label:** `SAFE_HOLD_AFTER_C0`

## After C1

| Item | Expectation |
|---|---|
| New | `academic_council_meeting_transition_events`, `council_transition_meeting` |
| Absent | C3 attendance tables, C4 votes, C9 notifications |
| Resume | C2 |
| HOLD | `SAFE_HOLD_AFTER_C1` |

## After C2

| Item | Expectation |
|---|---|
| New | Topic intake/review FSM RPCs (`council_resubmit_topic`, lifecycle trigger) |
| Absent | Attendance/quorum tables |
| Resume | C3 |
| HOLD | `SAFE_HOLD_AFTER_C2` |

## After C3

| Item | Expectation |
|---|---|
| New | Quorum policies, attendance rolls/rows, quorum evaluations, attendance audit |
| Absent | Votes / session open RPCs (`open_council_session`) |
| Resume | C4 |
| HOLD | `SAFE_HOLD_AFTER_C3` |

## After C4

| Item | Expectation |
|---|---|
| New | Votes, vote results, session/voting RPCs |
| Absent | Minutes amendments table / draft minutes RPCs (C5) |
| Resume | C5 |
| HOLD | `SAFE_HOLD_AFTER_C4` |

## After C5

| Item | Expectation |
|---|---|
| New | Minutes status enum, amendments, draft/submit/approve RPCs |
| Absent | Decision issuance follow-up columns/RPCs fully as C6 |
| Resume | C6 |
| HOLD | `SAFE_HOLD_AFTER_C5` |

## After C6

| Item | Expectation |
|---|---|
| New | Decision issue/follow-up/complete RPCs |
| Absent | Audit events table / archive RPC (C7) |
| Resume | C7 |
| HOLD | `SAFE_HOLD_AFTER_C6` |

## After C7

| Item | Expectation |
|---|---|
| New | Audit events, archive + report helper RPCs |
| Absent | C8 archived-child guards / decision FSM helper; C9 notifications |
| Safety | Archive path exists but H1–H4 security closure not yet applied — **do not** run production voting/decision load |
| Resume | C8 security closure (**required before C9**) |
| HOLD | `SAFE_HOLD_AFTER_C7_BEFORE_C8` |

## Before C9 (after C8 security closure)

| Item | Expectation |
|---|---|
| Ledger | Through `…171000…c0_c8_final_security_closure_01`; C9 absent |
| Surface | H1–H4 closure functions/triggers present; `academic_council_notifications` absent |
| Safety | Full C0–C8 governance safe for controlled ops; notifications/reports not live |
| Resume | C9 only |
| HOLD | `SAFE_HOLD_BEFORE_C9` |

## After C9 (complete chain)

| Item | Expectation |
|---|---|
| Ledger | All ten promoted migrations present |
| Next | Observability RO checks; flags remain OFF until FLAGS activation sequence |
| HOLD | N/A — chain complete; activation is a separate governed action |

---

## Mixed-state detection

If any later-step object exists without its ledger entry, or ledger exists without required objects:

- Label: `HOLD_MIXED_PARTIAL_STATE`
- Action: stop apply; run rollback-by-forward classifier; open forward remediation — never DROP reset.
