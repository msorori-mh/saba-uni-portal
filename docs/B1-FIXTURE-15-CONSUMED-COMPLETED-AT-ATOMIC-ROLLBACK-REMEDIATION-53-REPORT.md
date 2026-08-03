# PORTAL B1 PR #279 CONSUMED COMPLETED_AT ATOMIC ROLLBACK REMEDIATION REPORT

**MISSION ID**: `PORTAL-B1-PR279-CONSUMED-COMPLETED-AT-ATOMIC-ROLLBACK-REMEDIATION-53`
**PR NUMBER**: `#279`
**BRANCH**: `fix/b1-fixture-15-forward-only-reissue-44`
**REVIEWED HEAD**: `fa393b0512ee653ef6be1a0830f08fd0d84b5b75`
**FINAL COMMIT SHA**: `a7f44b525406c88e38bb9fc488cae15b191a0eee`
**FINAL OUTPUT TOKEN**: `PASS_B1_PR279_CONSUMED_COMPLETED_AT_ATOMIC_ROLLBACK_READY_FOR_REVIEW`

---

## 1. Exact original HOLD

`HOLD_B1_PR279_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_NOT_ENFORCED`

A request with `status = 'completed'` and `completed_at = NULL` could be treated as the documented consumed Fixture-15 prestate. That malformed state must fail closed before evidence insertion, request mutation, or archive-step mutation.

---

## 2. Migration predicate - before and after

File: `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`

### Before

`v_consumed` required `status = 'completed'`, seven completed steps, zero active steps, archive completed by the archive actor, and one workflow event - but did **not** require `v_req.completed_at IS NOT NULL`.

### After

`v_consumed` retains all prior conditions and adds:

```sql
AND v_req.completed_at IS NOT NULL
```

Dedicated fail-closed path (before evidence / request / archive mutation):

```sql
MESSAGE = 'B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING'
DETAIL  = 'status=completed completed_at=<null>'
```

No silent normalize/repair of the malformed consumed state. `UNEXPECTED_PRESTATE` detail now also surfaces `completed_at`.

---

## 3. New PG17 drift/prestate case

Case name: `consumed_request_completed_at_null` (11th class; additional to the prior ten).

Seed path:

1. Reset Fixture 15 to the exact authoritative consumed state (`status=completed`, `completed_at=now()`, seven completed steps, one archive event, evidence count 0).
2. Mutate only `student_requests.completed_at = NULL`.
3. Apply exact migration bytes.

Proved:

| Assertion | Result |
|---|---|
| Migration rejects with `B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING` | PASS |
| SQL transaction rolls back | PASS |
| Full seven-row runtime fingerprint unchanged | PASS |
| Request fingerprint unchanged after reject (drift retained; no restore) | PASS |
| Workflow-event fingerprint unchanged | PASS |
| Evidence row count remains zero | PASS |
| No partial request mutation | PASS |
| No partial archive-step mutation | PASS |

Log marker: `PG17_CONSUMED_COMPLETED_AT_NULL_FAIL_CLOSED`.

---

## 4. Success and idempotent paths

### Success (valid consumed seed)

Consumed seed retains `status = completed` and `completed_at IS NOT NULL`.

Post-restore package:

- request `status = in_review`
- request `completed_at = NULL`
- `current_step_index = 7`
- steps 1-6 completed; exact archive step active
- package = 19/19; other 18 Fixtures unchanged
- immutable workflow events preserved
- step 1 key remains `student_affairs_intake`

### Idempotent second apply

Restored-state requirements preserved (`in_review`, `completed_at IS NULL`, six completed + one active archive, full seven-step contract). Second apply remains a no-op with no duplicate evidence.

---

## 5. Diff hygiene (G5)

Removed trailing whitespace from:

`docs/B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44-REPORT.md` (header metadata lines)

Complete PR-range check:

```text
git diff --check eee643f17442ed07bbc27feb9f397dc4c138b6bc..HEAD
```

Result: empty (no trailing whitespace / conflict markers).

Working-tree `git diff --check`: empty.

---

## 6. Verification results

| Command | Result |
|---|---|
| `bun test tests/b1-fixture-15-forward-only-reissue-44.test.ts` | PASS (7/7) |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | PASS (14/14; `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19`) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS (201/201) |
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | PASS (5/5) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS (empty) |
| `git diff --check eee643f17442ed07bbc27feb9f397dc4c138b6bc..HEAD` | PASS (empty after this commit) |

Explicit confirmations:

- step 1 remains `student_affairs_intake`
- MATRIX, applied workflow, migration, and PG17 seed still agree
- `workflow_step_id` postconditions remain enforced
- previous rollback fingerprints remain enforced
- new `completed_at`-null case rejects atomically
- 19/19 remains intact
- 267/267/0 remains intact

---

## 7. Changed files

- `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
- `docs/B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44-REPORT.md` (trailing whitespace only)
- `docs/B1-FIXTURE-15-CONSUMED-COMPLETED-AT-ATOMIC-ROLLBACK-REMEDIATION-53-REPORT.md` (this report)

---

## 8. Scope / safety declarations

- PR remains **Draft**
- `ZERO_PRODUCTION_ACCESS`
- `ZERO_RPC_CALLS`
- `NO_MIGRATION_APPLY`
- `NO_DEPLOY`
- `NO_MERGE`

Untouched: other 18 Fixtures, real student requests, `request_types`, `student_visible`, `is_active`, `enrollment_certificate`, official documents, Auth, Storage, workflow RPCs, application runtime.

---

## 9. Decision

`PASS_B1_PR279_CONSUMED_COMPLETED_AT_ATOMIC_ROLLBACK_READY_FOR_REVIEW`
