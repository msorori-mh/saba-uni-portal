# PORTAL-B1-FIXTURE-15-MANAGED-CHANNEL-TRIGGER-CONTEXT-REMEDIATION-56 — REPORT

**Final decision:** `PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_READY_FOR_REVIEW`

Mission mode: SOURCE REMEDIATION ONLY — NO PRODUCTION APPLY.
Repository: `msorori-mh/saba-uni-portal`.
Base: `origin/main` (includes merged PR #279 @ `701c864f9009857bdb947f48f68ce74552216e57`).
Branch: `fix/b1-fixture15-managed-channel-trigger-56`.
Report generated: 2026-08-03 (UTC).

---

## Root cause

Production apply of `20260803030000_b1_44_restore_sr_20260801_13000015.sql` failed with:

```
ERROR: P0001: Not authorized to modify this request
CONTEXT: PL/pgSQL function protect_student_request() line 87 at RAISE
```

The Lovable managed migration channel has **no JWT / `auth.uid()`**. The migration set only transaction-local `b1.atomic_init`, which authorizes B1 **runtime-step** boundary writes but is **not** consulted by `protect_student_request()` on `student_requests` UPDATE.

Full rollback was verified in mission 55: migration head remained `20260802225131`, evidence table absent, Fixture 15 still consumed, 19/18 package unchanged. See `docs/B1-FIXTURE-15-PRODUCTION-APPLY-AND-19-OF-19-VERIFY-55-REPORT.md`.

## Exact trigger contract (G1 — confirmed, unmodified)

Latest source definition: `supabase/migrations/20260727072629_e89f780b-0c1a-407b-8720-4f676df058be.sql`.

B1 authorization path requires **all** of:

1. `current_setting('b1.atomic_action', true) = '1'`
2. `auth.uid() IS NOT NULL`
3. An existing runtime step on `OLD.id` where `completed_by = auth.uid()` and `status IN ('completed','rejected','returned')`

`b1.atomic_init` alone does **not** authorize `student_requests` UPDATE.

**This PR does not modify `protect_student_request()`.**

## Why `b1.atomic_init` was insufficient

| GUC / context | Runtime steps guard | `protect_student_request()` |
|---|---|---|
| `b1.atomic_init=1` | allows | ignored |
| `b1.atomic_action=1` + `auth.uid()` + matching `completed_by` | allows | allows (B1 path) |
| Managed channel default (no JWT) | n/a | denies |

## Chosen narrow remediation

Inside the existing unapplied migration, **only immediately around** the exact Fixture-15 `UPDATE public.student_requests`:

1. Capture prior `request.jwt.claim.sub` and `b1.atomic_action`
2. `set_config(..., true)` transaction-local:
   - `request.jwt.claim.sub = aec1303e-de6a-4580-94cf-7205c17b5535`
   - `b1.atomic_action = '1'`
3. Perform the constrained UPDATE (`id` + `status='completed'`)
4. Restore prior values
5. Postcheck restore; fail with `B1_44_MANAGED_CHANNEL_AUTH_CONTEXT_RESTORE_FAILED` if mismatch

Archive runtime-step UPDATE continues under `b1.atomic_init` only (no impersonated auth retained).

### Temporary identity justification

Actor `aec1303e-de6a-4580-94cf-7205c17b5535` is independently proven by the migration as:

- archive step `completed_by`
- archive workflow-event `actor_user_id`
- exact archive assignee principal

At request-UPDATE time, step 7 is still `completed` by that actor, so the existing B1 trigger path authorizes without weakening the trigger.

## Offline proof summary

| Gate | Result |
|---|---|
| Old managed-channel UPDATE (`atomic_init=1`, `auth.uid()` NULL, `atomic_action` unset) | Denied: `Not authorized to modify this request`; full rollback; evidence absent |
| Remediated migration under same initial managed-channel state | Restores Fixture 15 → one active archive step; package **19/19** |
| Prior auth context restored / not leaked after migration txn | PASS |
| Wrong JWT actor / `atomic_action` unset / no completed step for actor | Trigger deny; fingerprints unchanged |
| Archive `completed_by` ≠ `k_archive_actor` | Migration `UNEXPECTED_PRESTATE`; no partial write |
| Event actor mismatch | Migration `EVENT_ACTOR_MISMATCH`; no partial write |
| Idempotent second apply | PASS |
| Other 18 fixtures fingerprint | Unchanged |
| `enrollment_certificate` fingerprint | Unchanged |
| Five services `student_visible` | Remains false |
| Negative matrix | **267 / 267 / 0** |
| No permanent bypass (no trigger rewrite, no `session_replication_role`, no DISABLE TRIGGER, no RLS/GRANT/Auth user changes) | PASS |

## Changed files

- `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/00-schema.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/04-run.mjs`
- `scripts/b1-fixture-15-reissue-44-pg17/04-run.ps1`
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
- `docs/B1-FIXTURE-15-PRODUCTION-APPLY-AND-19-OF-19-VERIFY-55-REPORT.md` (normalized; still HOLD)
- `docs/B1-FIXTURE-15-MANAGED-CHANNEL-TRIGGER-CONTEXT-REMEDIATION-56-REPORT.md` (this file)

## Tests run

| Command | Result |
|---|---|
| `bun test tests/b1-fixture-15-forward-only-reissue-44.test.ts` | **9/9 PASS** (legacy deny + remediated 19/19 + wrong-actor negatives) |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | **14/14 PASS** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **201/201 PASS** (267/267/0 intact) |
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | **5/5 PASS** |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `git diff --check origin/main..HEAD` | PASS |

## Safety inventory (this mission)

| Constraint | Status |
|---|---|
| `NO_PRODUCTION_ACCESS` | YES |
| `NO_PRODUCTION_WRITE` | YES |
| `NO_RPC_CALLS` | YES |
| `NO_MIGRATION_APPLY` | YES |
| `NO_DEPLOY` | YES |
| `NO_MERGE` | YES |

## Final commit SHA

- Remediation: `7d9d10e1258a80419d070606b88bb80ccf1b6ee2`
- Branch: `fix/b1-fixture15-managed-channel-trigger-56` (tip after docs stamps)

---

**FINAL:** `PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_READY_FOR_REVIEW`
