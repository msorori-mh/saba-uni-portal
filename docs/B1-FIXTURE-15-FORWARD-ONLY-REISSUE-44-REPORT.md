# B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44

Date: 2026-08-03
Mode: MINIMAL SOURCE-ONLY REPAIR
Repository: `msorori-mh/saba-uni-portal`
Branch: `fix/b1-fixture-15-forward-only-reissue-44`
Base: `origin/main` @ `eee643f17442ed07bbc27feb9f397dc4c138b6bc`

## Final decision

`PASS_B1_FIXTURE_15_FORWARD_ONLY_REISSUE_READY_FOR_TARGETED_REVIEW`

Source-only. No production access, no migration apply, no workflow RPC, no
cleanup, no activation, no `student_visible=true`, no Deploy/Publish.

---

## Problem

Production facts (mission):

| Fact | Value |
|---|---|
| Migration head | `20260802225131` |
| Five B1 services | hidden + active |
| `enrollment_certificate` | unchanged |
| Fixture requests 01..19 | all exist |
| Active steps | **18/19** |
| Consumed fixture | `SR-20260801-13000015` (`file_withdrawal`) |
| Consumed shape | request `completed`, 7 completed steps, 0 active, 1 workflow event |

Contract must remain **19/19**, not be amended to 18/19.

---

## Authoritative Fixture 15 (derived)

Sources: `20260801021541` Fixture-13 seed, positive `MANIFEST.json` case 15,
`MATRIX.json` binding `SR-20260801-13000015|archive`, Capture-22 row, file_withdrawal
workflow / `act_on_b1_student_request_step_atomic` archive terminal path.

| Field | Value |
|---|---|
| Request number | `SR-20260801-13000015` |
| Request UUID | `f1300000-0000-4000-8000-000000000015` |
| Service | `file_withdrawal` |
| Marker | `TEST_ONLY_B1_FIXTURE_13` |
| Seed status | `in_review` |
| Steps | 7 (`000015000001`…`000015000007`) |
| Active step | `f1300001-0000-4000-8000-000015000007` (`archive`, order 7) |
| Predecessors | steps 1–6 `completed` |
| Direct assignee principal | `aec1303e-de6a-4580-94cf-7205c17b5535` (`archive_officer`) |
| Configured action | `archive` |
| RPC | `act_on_b1_student_request_step_atomic` |
| Seed details / academic effects | none (archive path does not apply withdrawal effect) |

Consumed archive (RPC) yields request `completed`, step 7 `completed`, and one
`student_request_workflow_events` row with `event_type='archived'`.

---

## Repair design

### New migration

`supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`

- Forward-only after current source tip `20260802225131`
- Transaction-local `b1.atomic_init=1` (documented Fixture-13 / Stage-3 channel)
- Fail-closed unless pre-state is **exactly** the documented consumed shape **or**
  already-restored (idempotent)
- Before mutate: append-only evidence row into
  `public.b1_fixture_15_reissue_44_evidence` (actor, completed_by, timestamps,
  event id/payload, RPC path metadata)
- **Does not delete or rewrite** `student_request_workflow_events` / audit logs
- Restores only request 15 + step-7 completion fields to seed shape
- Postchecks: Fixture 15 restored; package **19 requests / 19 active / 1 each**;
  five services remain `student_visible=false`

### Explicit non-goals

- No replacement identity
- No touch of other 18 fixtures, Auth, Storage, certificate surfaces, visibility,
  activation, or authorization artifacts
- No broadening to real student data

---

## Verification

| Check | Result |
|---|---|
| Disposable PG17 harness `scripts/b1-fixture-15-reissue-44-pg17/04-run.ps1` | `PASS_B1_44_FIXTURE_15_REISSUE_PG17` |
| Pre-repair active count | 18 |
| Post-repair | 19/19, one active per fixture |
| Other 18 content fingerprint | unchanged |
| enrollment_certificate fingerprint | unchanged |
| Service visibility | remains false |
| Second apply | idempotent |
| Unexpected pre-state | `B1_44_FIXTURE_15_UNEXPECTED_PRESTATE` (txn abort) |
| `bun test tests/b1-fixture-15-forward-only-reissue-44.test.ts` | 5/5 PASS |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | 14/14 PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | 201/201 PASS |
| Matrix contract | **267 / 267 / 0** |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success |
| `git diff --check` | clean |

---

## Changed files

1. `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
2. `scripts/b1-fixture-15-reissue-44-pg17/*` (schema/seed/verify/run)
3. `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
4. `docs/B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44-REPORT.md`

---

## Risks / assumptions

1. Production consumed shape matches the mission statement exactly (1 event,
   actor = archive officer, `event_type=archived`). Any other shape fails closed.
2. Reactivation of step 7 will re-run production
   `guard_b1_runtime_step_activation` / assignee assert; assignee metadata left
   intact so identity remains valid.
3. Immutable archive event remains after restore (seed had 0 events; restored
   package intentionally retains incident history).
4. Apply to production requires a separate owner-approved migration mission.

---

## Production impact

**None from this PR.** Source-only. Apply is not authorized here.

---

## Final decision (token)

`PASS_B1_FIXTURE_15_FORWARD_ONLY_REISSUE_READY_FOR_TARGETED_REVIEW`
