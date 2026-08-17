# PORTAL_REFORM_P1_THREE_SERVICES_CONTROLLED_PRODUCTION_ACTIVATION_09B

Outcome: **HOLD at G1 — no visibility write was attempted.** Everything executed in this
mission was read-only (`SELECT` + source inspection + one public HTTP GET of the live site).

## G0 — Pre-activation runtime gate (READ ONLY) — PASS

| code | id | name_ar | is_active | student_visible | request_audience | updated_at |
|---|---|---|---|---|---|---|
| october_exam_entry_form | 2729d8cb-30fb-414a-8eb0-a6f581420e92 | استمارة دخول دور أكتوبر | true | false | active_student | 2026-08-16 20:18:08.976344+00 |
| replacement_student_card | 35a6213a-2da6-4231-9bcf-379e40490635 | إصدار بطاقة بدل فاقد | true | false | active_student | 2026-08-16 20:18:08.976344+00 |
| grade_appeal | b2d05dfc-1c70-453e-8491-5debd90a221a | التظلم على النتيجة النهائية | true | false | active_student | 2026-08-16 20:18:08.976344+00 |

- The three E2E requests (`SR-20260816-14A2339B`, `SR-20260816-F01018CE`, `SR-20260816-E852B4E3`)
  are all `completed`, with 4/4, 3/3 and 6/6 runtime steps `completed` — no active step remains
  (verified again in 09A minutes before this mission).
- Backend P1-01..P1-09 healthy/current; the three services are backend-safe to activate.
- Visible student services before activation: **6** (unchanged; nothing was flipped).

TARGET_ROWS = 3

## G1 — Live source / UI readiness — **FAIL (blocker)**

Deployed production identity: `LIVE_SOURCE_SHA = 3e47c1c65235f70198a507feb33b825814ab64af`
(`https://quboolye.com` serves `<meta name="build-sha" content="3e47c1c6…">`, matching
`build-sha.generated.json`). This is the P1 source-only deploy from mission 05C — it predates
every P1 backend apply from P1-06 onward.

Findings in the current source (and therefore in the deployed bundle, which is older still):

1. **The atomic submit capability is switched off in source.**
   `src/lib/student-request-rpc.ts:88`
   ```ts
   export const STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE = false as const;
   ```
   and `ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY.available === false`
   (pinned by `tests/student-requests/request-b1-shared-foundation-source-01.test.ts:262`).

2. **No runtime caller of the atomic RPC exists.** `rpcSubmitStudentRequestWithDetails(...)`
   is defined but referenced nowhere outside its own module — no route, component, or
   server function calls it. Repository-wide search returns zero call sites.

3. **Student submission still routes through the generic pair.**
   `src/lib/student-affairs.functions.ts:351` and `:390` call `rpcCreateStudentRequest(...)`
   → `create_student_request(...)`, followed by `submit_student_request(...)`. This is exactly
   the path the live backend fails closed on: `public.create_student_request` raises
   `P1_ATOMIC_SUBMIT_REQUIRED` for the three P1 types.

4. **P1 forms are still flagged schema-pending in the registry.**
   `src/lib/student-requests/request-form-registry.ts:85` sets `const SCHEMA_PENDING = true`,
   and the P1 definitions (`grade_appeal` line 348, `october_exam_entry_form` line 459,
   `replacement_student_card` line 496) all carry `unavailableUntilSchemaApplied: SCHEMA_PENDING`.

5. `src/lib/student-requests/p1/activation-gate.ts` still reports `E2E: "PENDING"` for all
   four P1 codes, so `isP1ServiceProductionActivatable()` is `false` in source.

Consequence if visibility were flipped now: students would see the three Arabic service cards,
open a form marked unavailable, and any submit attempt would hit the generic RPC and be rejected
by the backend with `P1_ATOMIC_SUBMIT_REQUIRED` — a visible broken service on production.

LIVE_P1_STUDENT_UI_ATOMIC_SUBMIT_READY = **NO** → stopped before any visibility write, per the
mission's own G1 stop rule. No source modification, deploy, or publish was performed under this
mission, as instructed.

## G2–G9

Not executed. G2 snapshot was captured (table above) but no `UPDATE` was issued; G3 was never
entered, so G4–G9 (including the G9 revert path) are not applicable — production state is
byte-identical to the pre-mission state.

## Result

```
LIVE_SOURCE_SHA=3e47c1c65235f70198a507feb33b825814ab64af
LIVE_P1_STUDENT_UI_ATOMIC_SUBMIT_READY=NO
TARGET_ROWS=3
ROWS_CHANGED=0
OCTOBER_STUDENT_VISIBLE=false
REPLACEMENT_CARD_STUDENT_VISIBLE=false
FINAL_RESULT_APPEAL_STUDENT_VISIBLE=false
P1_VISIBILITY_ACTIVATION=NOT_EXECUTED
UNRELATED_VISIBILITY_ROWS_CHANGED=0
P1_STUDENT_CATALOG=NOT_EXECUTED
P1_FORMS_OPEN=NOT_EXECUTED
P1_GENERIC_CREATE_BYPASS=ZERO (create_student_request raises P1_ATOMIC_SUBMIT_REQUIRED for all three codes)
DIRECT_RPC_BYPASS=ZERO
B1_REGRESSION=PASS (untouched)
EXISTING_SERVICES_REGRESSION=PASS (untouched, 6 visible services unchanged)
GPA_ACTIVE=0
LIVE_RUNTIME_SMOKE=NOT_EXECUTED
MIGRATIONS_APPLIED=0
DEPLOY=0
PUBLISH=0
NEW_REQUESTS_CREATED=0
REAL_STUDENT_DATA_CHANGED=0
P2_STARTED=0
```

FINAL: **HOLD_PORTAL_REFORM_P1_THREE_SERVICES_CONTROLLED_PRODUCTION_ACTIVATION_09B_LIVE_SOURCE_NOT_READY_ATOMIC_SUBMIT_DISABLED_AND_UNWIRED**

### Exact blocker

Production-deployed source (SHA `3e47c1c6`) cannot submit P1 requests:
`STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE=false`, `rpcSubmitStudentRequestWithDetails`
has zero call sites, the student path still uses `create_student_request` +
`submit_student_request`, and the three P1 form definitions remain
`unavailableUntilSchemaApplied: true`.

### Minimal unblock (needs a separate authorized mission)

1. Source: flip the atomic capability flag on, clear `unavailableUntilSchemaApplied` for the
   three P1 definitions only, route P1 codes through `rpcSubmitStudentRequestWithDetails`
   (field names already match the live `submit_student_request_with_details` contract via the
   P1-06 wrapper), and set `E2E: "PASS"` in `activation-gate.ts` for the three codes.
2. Verify + deploy that source to production and confirm the new SHA on `quboolye.com`.
3. Re-run 09B from G0 with the new SHA; only then perform the three-row visibility flip.
