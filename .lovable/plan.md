# PORTAL_B1_FIXTURE15_FAILED_ATTEMPT_HASH_RECONCILIATION_82

Strict read-only reconciliation. No SQL executed against production beyond SELECTs, no migration applied, no source file modified.

## Decision

PASS_B1_MANAGED_VERSION_ALIAS_PREFLIGHT

- Project ref: wpmicqriltrowwonknox (confirmed connected)
- Source commit (local HEAD lineage contains): 2fd16584bdcb596ee49b43bb89d5391c83dbfd66
- Current migration path: supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql
- Current source version: 20260803030000
- Current byte count: 31,778 (matches)
- Current SHA-256: adf8749631feb780fc6a3cfdaa61844be26753f8741990ab3f148bd9bc7328c3 (matches)

## 1 — Current remediation markers (all present)

- request.jwt.claim.sub: PRESENT (captured at L532, set at L535, restored at L547)
- archive actor: PRESENT (aec1303e-de6a-4580-94cf-7205c17b5535)
- b1.atomic_action = '1': PRESENT (L536, restored L548)
- exact Fixture-15 update: PRESENT (SR-20260801-13000015, archive step + predecessor_set)
- GUC restoration: PRESENT (both GUCs restored transaction-locally)
- restoration fail-closed code: PRESENT (B1_44_MANAGED_CHANNEL_AUTH_CONTEXT_RESTORE_FAILED, L556)

## 2 — Failed attempt identity

- Failure timestamp: 2026-08-03 (mission 55 managed-channel attempt), transaction ROLLBACK
- Failure error: P0001 "Not authorized to modify this request" from protect_student_request()
- Postgres log evidence: UNAVAILABLE. Analytics log retention window currently spans only
  ~2026-08-04 00:15 → 00:24 UTC (2,177 rows); no row matches the failure text or B1_44.
- Submitted SQL SHA-256: 8d28055fac1145a0f180e42c1f0b4961ffdc868efea84f6422f23bb02c5276fd
  - This is the SHA recorded in the mission-55 report for the submitted file, and it matches
    byte-for-byte the file content at merge commit 701c864f (PR #279), size 29,522 bytes.
- Auth-context remediation present in that content: NO
  - occurrences of request.jwt.claim.sub: 0
  - occurrences of b1.atomic_action: 0
  - occurrences of B1_44_MANAGED_CHANNEL_AUTH_CONTEXT_RESTORE_FAILED: 0
- The remediation was introduced later, in commit 2fd16584 (PR #280, 2026-08-04 01:09 +03).

Classification: **PRE_REMEDIATION_OLD_CONTENT**

Basis: recorded submitted-file SHA from the failed attempt equals the pre-remediation blob SHA
and differs from the approved current SHA. Execution-log corroboration is unavailable (retention),
so the classification rests on the recorded submission SHA plus git blob identity, not on a
title/fixture-ID/intent similarity.

## 3 — Current production read-only state

- Source version 20260803030000 recorded remotely: NO (count = 0)
- Remote migration head: 20260802225131
- Partial migration record: NONE
- Partial Fixture-15 mutation: NONE — SR-20260801-13000015 remains status `completed`
  (updated_at 2026-08-02 19:38:59Z, i.e. unchanged by the 2026-08-03 attempt)
- Fixture set: 19 fixture requests present, 18 active fixture steps (known consumed state)
- Five services student_visible=true count: 0 (all remain hidden)
- enrollment_certificate: unchanged (student_visible = true)

## 4 — Managed version alias capability

- Exact current bytes accepted: YES — the managed migration channel executes the submitted SQL text verbatim
- SQL rewriting: NONE performed by the channel
- Generated managed version: YES — the channel stamps a newly generated version (e.g. previous
  local 20260802070000 was recorded as 20260802225131); source version 20260803030000 is not preserved
- Generated version returned after execution: YES — readable immediately via a read-only query of
  supabase_migrations.schema_migrations (head version), enabling audit mapping
- Unrelated migrations: NONE pending
- Publish required: NO
- Deploy required: NO
- Storage / visibility change: NONE

## Production writes

ZERO. Migration apply: NONE.

## Final recommendation

READY_FOR_OWNER_APPROVED_HASH_PINNED_MANAGED_APPLY

The earlier failure is attributable to pre-remediation content that lacked the transaction-local
auth-context handling; the current approved bytes (SHA adf87496…) contain it. A single
hash-pinned managed submission of exactly these bytes is the next step, on explicit owner
authorization, followed by an immediate read-only capture of the generated managed version and
19/19 fixture verification.
