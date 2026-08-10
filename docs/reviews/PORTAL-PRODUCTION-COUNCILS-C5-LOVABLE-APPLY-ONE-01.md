# PORTAL-PRODUCTION-COUNCILS-C5-LOVABLE-APPLY-ONE-01

**Mission:** PORTAL-PRODUCTION-COUNCILS-C5-LOVABLE-APPLY-ONE-01
**Owner authorization:** OWNER_APPROVE_COUNCILS_C5 (exactly C5 only)
**Decision:** `HOLD_PORTAL_PRODUCTION_COUNCILS_C5_LOCK_RPC_DIGEST_SEARCH_PATH_UNRESOLVABLE`
**Migrations applied this mission:** 0 (apply attempt NOT consumed)

---

## Blocking technical finding (pre-apply, read-only)

`public.approve_and_lock_council_minutes(uuid, text)` in the SHA-pinned C5 source is declared:

```
SECURITY DEFINER
SET search_path = public, pg_temp
...
v_fp := encode(digest(p_meeting_id::text || ':' || v_final_body || ':' || now()::text, 'sha256'), 'hex');
```

Production catalog truth:

| Fact | Value |
|---|---|
| `pgcrypto` installed schema | `extensions` (NOT `public`) |
| `digest` overloads present | `extensions.digest(text,text)`, `extensions.digest(bytea,text)` |
| `public.digest(...)` | ABSENT |
| Empirical resolution under `search_path = public, pg_temp` | `ERROR 42883: function digest(unknown, unknown) does not exist` |

Existing production precedent (`public._ec_sha256_hex`) uses `search_path = public, extensions, pg_temp`, confirming the required pattern.

**Consequence if applied as pinned:** the migration itself would succeed (plpgsql bodies are not resolved at CREATE time), but the *only* lock/approval RPC of the C5 contract would fail at first real invocation. Sections I (LOCK CONTRACT), K (MINUTES_FINGERPRINT / LOCK_EVIDENCE / APPROVAL_EVIDENCE) could not be satisfied functionally, and remediation would require an unauthorized additional migration. Consuming `C5_APPLY_ATTEMPT_COUNT=1` on a knowingly non-functional lock path was rejected.

Source modification is forbidden by this mission's scope (`SOURCE_C5_UNMODIFIED` must remain YES), so the correct terminal is HOLD with a forward-only source fix approved as a new C5 source revision (new authoritative SHA) before apply.

**Minimum forward-only source correction (NOT applied):** change the C5 lock RPC to `SET search_path = public, extensions, pg_temp` (or fully qualify `extensions.digest`), re-pin SHA256_LF, then re-authorize apply-one.

---

## A — Source identity

```
CURRENT_SOURCE_HEAD=92594b1508504fc6039028beacc855ea2ad415b4
SOURCE_C5_VERSION=20260808150000
SOURCE_SHA256_LF=85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25
SOURCE_PIN_MATCH=YES
SOURCE_C5_UNMODIFIED=YES
```

Hash contract: `SHA256_LF_NORMALIZED_V1` via `scripts/sha256_lf_normalized_v1.py`.

## B — Production prestate (READ ONLY)

```
PRODUCTION_TARGET_VERIFIED=YES
LEDGER_TIP=20260810012715 (C4), 20260810011456 (C3), 20260810010400 (C2), 20260810003305 / 20260810003111 (C1 + enum)
academic_council_votes=PRESENT
academic_council_vote_results=PRESENT
council_transition_meeting(uuid,status,status,jsonb)=PRESENT
C4_FUNCTIONAL_PREDECESSOR=PASS
academic_council_minutes_status (type)=ABSENT
academic_council_minutes_amendments=ABSENT
draft_council_minutes(...)=ABSENT
submit_council_minutes_for_review(...)=ABSENT
approve_and_lock_council_minutes(...)=ABSENT
tg_ac_minutes_lock_guard / tg_ac_meeting_source_evidence_lock_guard=ABSENT
C5_PRESTATE=COMPATIBLE_NOT_APPLIED
C6_TO_C9_APPLIED_COUNT=0
```

Dependency helpers required by C5 all present: `can_write_council_agenda`, `has_council_role`, `meeting_has_valid_quorum`, `council_meeting_transition_is_legal`, `council_attendance_emit_audit`, `council_attendance_require_auth_uid`, `is_council_admin`, `is_council_member`.

Existing `academic_council_minutes` columns: `id, meeting_id, body, drafted_by, is_locked, approved_by, locked_at, created_at, updated_at`.
C5 would add: `status, approved_at, locked_by, version, fingerprint` (`approved_by`, `locked_at` already exist; `ADD COLUMN IF NOT EXISTS` is compatible).

## C — Pre-apply business snapshot (unchanged, no writes)

| Table | Rows |
|---|---|
| academic_council_minutes | 0 |
| academic_council_meetings | 1 |
| academic_council_agenda_items | 0 |
| academic_council_votes | 0 |
| academic_council_vote_results | 0 |

## D — Transaction / Lovable mapping (analysis only)

```
NON_TRANSACTIONAL_BOUNDARY=NONE
C5_TRANSACTION_MODEL=SAFE
C5_ENUM_BOUNDARY_HAZARD=NO   (CREATE TYPE only; no ALTER TYPE ADD VALUE)
```

## E/F — Apply & ledger

```
C5_APPLY_ATTEMPT_COUNT=0
MIGRATIONS_APPLIED_THIS_MISSION=0
LOVABLE_MANAGED_C5_VERSION=NONE
C5_LEDGER_MAPPING=NOT_ATTEMPTED
UNAUTHORIZED_ADDITIONAL_MIGRATIONS=0
C6_APPLIED=NO
```

## G — Source-derived C5 inventory (from pinned SQL, not applied)

```
C5_TYPES=1  (academic_council_minutes_status: minutes_draft|minutes_review|minutes_locked)
C5_TABLES=1 (academic_council_minutes_amendments)
C5_COLUMNS=7 on academic_council_minutes (status, approved_at, approved_by, locked_at, locked_by, version, fingerprint)
C5_FUNCTIONS=5 (tg_ac_minutes_lock_guard, tg_ac_meeting_source_evidence_lock_guard,
                draft_council_minutes, submit_council_minutes_for_review,
                approve_and_lock_council_minutes)
C5_TRIGGERS=4 (trg_ac_minutes_lock_guard, trg_ac_agenda_items_lock_guard,
               trg_ac_votes_lock_guard, trg_ac_vote_results_lock_guard)
C5_POLICIES=1 (ac_minutes_amendments_select, SELECT TO authenticated)
C5_INDEXES=1  (idx_ac_minutes_amendments_meeting)
C5_CONSTRAINTS=amendment_number>0, version>0, UNIQUE(minutes_id, amendment_number), FKs ON DELETE RESTRICT/SET NULL
C5_ACL=REVOKE ALL on amendments FROM PUBLIC/anon/authenticated; GRANT SELECT to authenticated+service_role;
       GRANT ALL to service_role; REVOKE ALL on 3 RPCs FROM PUBLIC/anon;
       GRANT EXECUTE on 3 RPCs to authenticated+service_role
```
Status of all above in production: **NOT INSTALLED** (HOLD before apply).

## H — Minutes lifecycle contract (source review)

```
MINUTES_LIFECYCLE=PASS_BY_SOURCE (minutes_draft → minutes_review → minutes_locked)
SECRETARY_DRAFT_AUTHORITY=PASS_BY_SOURCE (can_write_council_agenda gate)
SECRETARY_REVIEW_SUBMIT_AUTHORITY=PASS_BY_SOURCE (has_council_role secretary, exact)
CHAIR_APPROVE_LOCK_AUTHORITY=BLOCKED (chair-exact gate correct, but RPC body unrunnable — digest finding)
C1_TRANSITION_CONTRACT_PRESERVED=YES_BY_SOURCE (council_meeting_transition_is_legal + append-only
  transition event for the secretary edge; council_transition_meeting for the chair lock edge)
```

## I — Lock / immutability contract (source review, no production DML)

```
LOCKED_MINUTES_IMMUTABLE=PASS_BY_SOURCE (BEFORE UPDATE raises COUNCIL_MINUTES_LOCKED_IMMUTABLE)
LOCKED_MINUTES_DELETE_DENIED=YES (all direct DELETE denied; locked DELETE denied explicitly)
LOCKED_AGENDA_EVIDENCE_IMMUTABLE=PASS_BY_SOURCE
LOCKED_VOTES_IMMUTABLE=PASS_BY_SOURCE
LOCKED_VOTE_RESULTS_IMMUTABLE=PASS_BY_SOURCE
```
Not installed in production (HOLD). Guards keyed on `academic_council_minutes.is_locked`.

## J — Amendment model

```
AMENDMENT_MODEL=PASS_BY_SOURCE (additive rows; ON DELETE RESTRICT; no rewrite path to locked minutes)
HISTORICAL_MINUTES_REWRITE_ALLOWED=NO
AMENDMENT_RLS=PASS_BY_SOURCE (RLS enabled; single SELECT policy: council admin or council member)
AMENDMENT_ACL=PASS_BY_SOURCE (authenticated SELECT only; no INSERT/UPDATE/DELETE; service_role ALL)
```

## K — Fingerprint / version evidence

```
MINUTES_VERSIONING=PASS_BY_SOURCE (version default 1, incremented per draft revision)
MINUTES_FINGERPRINT=FAIL (digest() unresolvable under the function search_path — blocking finding)
APPROVAL_EVIDENCE=BLOCKED (approved_at/approved_by written only by the unrunnable lock RPC)
LOCK_EVIDENCE=BLOCKED (locked_at/locked_by/is_locked written only by the unrunnable lock RPC)
```

## L — Authorization

```
UNIVERSAL_ADMIN_OPERATIONAL_BYPASS=0
UNIVERSAL_DEAN_BYPASS=0
UNIVERSAL_REGISTRAR_BYPASS=0
```
`is_council_admin` appears only in the amendments SELECT (read) policy — technical read visibility, not academic approval authority.

## M — Business data preservation

No production writes were performed.

```
EXISTING_MINUTES_ROWS_MUTATED=0
EXISTING_MEETING_ROWS_MUTATED=0
EXISTING_AGENDA_ROWS_MUTATED=0
EXISTING_VOTE_ROWS_MUTATED=0
EXISTING_VOTE_RESULT_ROWS_MUTATED=0
AMENDMENT_ROWS_CREATED_BY_MIGRATION=0
C4_FUNCTIONAL_STATE_PRESERVED=YES
C3_FUNCTIONAL_STATE_PRESERVED=YES
C2_FUNCTIONAL_STATE_PRESERVED=YES
C1_FUNCTIONAL_STATE_PRESERVED=YES
C0_SECURITY_PRESERVED=YES
GP_L4_GUARD_PRESERVED=YES
B1_VISIBILITY_CHANGED=NO
ENROLLMENT_CERTIFICATE_REGRESSION=NO
SANDBOX_EXEC_DEFAULT_GRANT_STATE=INHERITED_RESTRICTED_READONLY_ROLE (psql exec role cannot read
  supabase_migrations schema nor EXECUTE functions; all evidence taken via managed read tool) — not remediated
```

## N — Focused tests

```
DOCKER_PG17_AVAILABLE=NO
COUNCILS_SUITE=63 pass / 16 fail (all 16 = harness-launch failures, disposable PG17 unavailable; 0 logic assertion failures)
C5_TEST=NOT_RUN_HARNESS_LAUNCH (councils-c4-c8-late-lifecycle: Docker unavailable)
COUNCILS_READINESS_TEST=NOT_RUN_HARNESS_LAUNCH (Docker unavailable)
TSC=PASS
DIFF_CHECK=PASS
```

## Counts

```
CRITICAL_COUNT=0
HIGH_COUNT=1  (C5 lock RPC digest/search_path — pre-apply, source-level)
MEDIUM_COUNT=0
DEPLOY=NO
PUBLISH=NO
MERGE=NO
C6_APPLIED=NO
```

**FINAL TOKEN:** `HOLD_PORTAL_PRODUCTION_COUNCILS_C5_LOCK_RPC_DIGEST_SEARCH_PATH_UNRESOLVABLE`
