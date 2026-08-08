# PORTAL-B1-FIXTURE-15-PRODUCTION-APPLY-AND-19-OF-19-VERIFY-55 — REPORT

**Final decision:** `HOLD_B1_FIXTURE_15_PRODUCTION_APPLY_PROTECT_STUDENT_REQUEST_TRIGGER_DENIED_MANAGED_CHANNEL_UPDATE`

Mission mode: single production migration apply + immediate read-only verification.
Owner authorization: explicitly granted (recorded).
Production project: `wpmicqriltrowwonknox`. Lovable project: `4b291119-790f-4484-9285-c2b774e1ba6f`.
Merged PR: #279. Merge commit: `701c864f9009857bdb947f48f68ce74552216e57`. Reviewed source head: `44b242a7a2b36d01220ce4d0009cd96b8a20bdcb`.
Report generated: 2026-08-03 (UTC).

---

## G1 — Pre-apply source identity: PASS

| Item | Value |
|---|---|
| Source migration | `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql` |
| Occurrences in merged source | exactly 1 |
| SHA-256 (as stored in worktree) | `8d28055fac1145a0f180e42c1f0b4961ffdc868efea84f6422f23bb02c5276fd` |
| Step 1 key | `student_affairs_intake` ✔ |
| Consumed-state predicate | `v_req.completed_at IS NOT NULL` ✔ |
| Seven-step authoritative contract | present, pre- and post-check loops ✔ |
| Deterministic row locking | `SELECT ... FOR UPDATE` on request; `PERFORM 1 ... ORDER BY step_order, id FOR UPDATE` on runtime rows ✔ |
| TEST_ONLY evidence preservation | `public.b1_fixture_15_reissue_44_evidence`, RLS enabled, PUBLIC/anon/authenticated revoked ✔ |
| Atomic fail-closed behaviour | every deviation raises `P0001` before mutation ✔ |

## G2 — Pre-apply production read (read-only): PASS (matched migration contract exactly)

Migration head before apply: **`20260802225131`**.

Fixture 15 (`f1300000-0000-4000-8000-000000000015` / `SR-20260801-13000015`):

- `request_type = file_withdrawal`
- `status = completed`, `completed_at = 2026-08-02T19:38:59.05336+00:00`
- `current_step_index = 7`
- runtime steps = 7; completed = 7; active = 0
- workflow events = 1, `event_type = archived`, `actor_user_id = aec1303e-de6a-4580-94cf-7205c17b5535`

Package pre-state:

| Metric | Value |
|---|---|
| Fixture requests (`TEST_ONLY_B1_FIXTURE_13`) | 19 |
| Active runtime steps | 18 |
| Fixtures with exactly one active step | 18 |
| Consumed fixture | `SR-20260801-13000015` |

Pre-apply fingerprints (baseline for G8/G9/G10):

- other-18 fixture fingerprint: `a75431fc42e334190211d12a5085b254` (18 rows hashed)
- request-type config fingerprint (6 services incl. `enrollment_certificate`): `a7ad4586f1aecc668466b738205ab463`
- `enrollment_certificate`: 4 requests, 21 runtime steps, 35 workflow events
- evidence table present before apply: **no** (0)

## G3 — Single migration apply: FAILED, ROLLED BACK

Exactly one apply attempt was made, through the Lovable managed production migration channel, with SQL byte-semantics equal to the merged source (no modification, no alternate SQL, no other migration replayed).

Exact production error:

```
ERROR:  P0001: Not authorized to modify this request
CONTEXT:  PL/pgSQL function protect_student_request() line 87 at RAISE
SQL statement "UPDATE public.student_requests r
       SET status = 'in_review',
           completed_at = NULL,
           current_step_index = 7,
           updated_at = now()
     WHERE r.id = k_req_id
       AND r.status = 'completed'"
PL/pgSQL function inline_code_block line 454 at SQL statement
```

**Root cause (exact):** the `BEFORE UPDATE` trigger function `public.protect_student_request()` authorizes an update only when one of the following holds:

1. `public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean','registrar','student_affairs'])`, or
2. `current_setting('b1.atomic_action', true) = '1'` **and** `auth.uid()` completed a runtime step of that request, or
3. `auth.uid()` is the owning student (restricted transitions only).

The managed migration channel executes with **no `auth.uid()`** and the migration sets only the transaction-local GUC **`b1.atomic_init`**, which `protect_student_request()` does not consult (it reads `b1.atomic_action` and `student_request.submit_via_rpc`). The final `RAISE EXCEPTION 'Not authorized to modify this request'` therefore fires. This is a genuine authorization contract gap between the Fixture-13 seed channel (`b1.atomic_init`) and the request-protection trigger, not a transient failure.

No retry was performed and no state was modified before retrying.

## G4 — Migration history: no migration recorded

Post-failure read-only verification proves a clean, complete rollback:

| Check | Value |
|---|---|
| Migration head after attempt | `20260802225131` (unchanged) |
| New migration rows | 0 |
| `public.b1_fixture_15_reissue_44_evidence` exists | no (0) — DDL rolled back with the DO block |

## G5 — Fixture-15 post-attempt state: unchanged (still consumed)

- `status = completed`, `completed_at = 2026-08-02 19:38:59.05336+00`
- active runtime steps = 0
- request UUID, request number, request type unchanged
- no replacement request or runtime rows created

## G6 — Audit evidence

- Original `archived` workflow event remains present (1 event, actor `aec1303e-…`).
- No workflow event deleted or rewritten.
- No reissue evidence row exists — the evidence table itself was never committed.

## G7 — Authoritative package: **18 / 19** (target not reached)

| Metric | Expected | Actual |
|---|---|---|
| Fixture requests | 19 | 19 |
| Active runtime steps | 19 | **18** |
| Fixtures with exactly one active step | 19 | **18** |
| Fixture 15 included in 19/19 | yes | **no** |

Full 19/19 inventory is intentionally **not** published in this report: the 19/19 state does not exist in production, and emitting an inventory implying otherwise would be false evidence.

## G8 — Other 18 fixtures: UNCHANGED

Post-attempt fingerprint `a75431fc42e334190211d12a5085b254` is byte-identical to the pre-apply fingerprint. No request row, runtime row, active-step identity, status, binding, assignment identity, or workflow-event count changed outside Fixture 15 — and Fixture 15 itself was not changed either.

## G9 — Protected `enrollment_certificate`: UNCHANGED

Request-type configuration fingerprint `a7ad4586f1aecc668466b738205ab463` unchanged (covers `is_active` and `student_visible` for `enrollment_certificate` and the five B1 services). No `enrollment_certificate` write of any kind occurred.

## G10 — Five-service visibility: COMPLIANT

| Service | `is_active` | `student_visible` |
|---|---|---|
| `enrollment_suspension` | true | false |
| `excused_absence` | true | false |
| `department_transfer` | true | false |
| `final_chance` | true | false |
| `file_withdrawal` | true | false |

Visibility was not activated in this mission.

## G11 — Production safety inventory

| Side effect | Count |
|---|---|
| Migration applications (committed) | **0** (1 attempt, fully rolled back) |
| Workflow RPC calls | 0 |
| Operational test cases executed | 0 |
| Auth changes | 0 |
| Storage changes | 0 |
| Role/GRANT changes | 0 |
| Deploy | 0 |
| Publish | 0 |
| Cleanup | 0 |
| Real student-request mutations | 0 |
| Fixture 15 restoration | **not performed** |

All production reads used the trusted read-only channel. No secrets appear in this report.

## Unblock options (require a new owner authorization; source-only, forward-only)

Chosen follow-up (mission 56, source-only — not applied here):

Amend the unapplied Fixture-15 repair migration so the exact `student_requests` UPDATE temporarily satisfies the **existing** `protect_student_request()` B1 contract via transaction-local `request.jwt.claim.sub = archive actor` and `b1.atomic_action = '1'`, then restores prior GUCs. Do **not** weaken `protect_student_request()`, disable triggers, set `session_replication_role`, or honour `b1.atomic_init` inside that trigger.

Rejected for this incident:

1. Extending `protect_student_request()` to honour `b1.atomic_init` (permanent bypass surface).
2. Admin/service-role exceptions or trigger disablement.

This report records the failed apply only. It does **not** claim the migration was applied or that production reached 19/19.

---

**FINAL:** `HOLD_B1_FIXTURE_15_PRODUCTION_APPLY_PROTECT_STUDENT_REQUEST_TRIGGER_DENIED_MANAGED_CHANNEL_UPDATE`
