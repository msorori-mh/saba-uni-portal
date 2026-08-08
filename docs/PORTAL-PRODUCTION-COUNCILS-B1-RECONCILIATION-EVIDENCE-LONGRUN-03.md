# PORTAL-PRODUCTION-COUNCILS-B1-RECONCILIATION-EVIDENCE-LONGRUN-03

MODE: PRODUCTION DATABASE **READ-ONLY** (0 writes, 0 RPC calls, 0 migrations)
TARGET: `wpmicqriltrowwonknox` — PostgreSQL 17.6
MIGRATION LEDGER TIP: `20260807023229` (count 210)

---

## PART A — Councils legacy pre-state (authoritative)

`COUNCILS_SCHEMA_FINGERPRINT` = `3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9`

| Object class | Count |
|---|---|
| Tables (`academic_council*`) | 8 (all RLS ENABLED, owner `postgres`) |
| Constraints | 48 |
| Indexes | 35 |
| Triggers | 10 |
| Enums | 5 (`academic_council_type`, `_member_role`, `_topic_status`, `_meeting_status`, `_decision_status`) |
| Functions | 16 |
| Policies | 23 public + 2 storage |

Live data topology: 4 councils (1 `college`, 3 `department`), 11 members, 2 topics.

**Blocking condition for C0–C9:** the intended `20260808*` councils migrations are
ABSENT from the ledger while the legacy schema already exists. Any `CREATE TYPE` /
`CREATE TABLE` in C0–C9 will collide. Reconciliation must be forward-only and
adoptive (`IF NOT EXISTS` / `ALTER` / `CREATE OR REPLACE`), never re-creating.

Privilege note: `authenticated` currently holds `arwDxtm` (full DML) on the council
tables; C0–C9 must re-scope these GRANTs explicitly, since RLS alone is the only
thing narrowing writes today.

---

## PART B — B1 function-graph reconciliation (RESOLVED)

### B.1 Hash normalization — resolved

The manifest hash is **not** raw `pg_get_functiondef`. The harness
(`scripts/b1-rpc-principal-harness-01/00-preflight.sql`) uses:

```sql
btrim(regexp_replace(pg_get_functiondef(oid), '\s+', ' ', 'g'))
-- then sha256(convert_to(v_norm,'UTF8'))
```

Recomputing all 28 pinned signatures with that exact normalization reduces the
previously reported drift from 27/28 to **4/28**. The earlier "27 mismatches" was a
measurement artifact, not production drift.

### B.2 Real drift — exactly 4 signatures

| Signature | Manifest sha256 | Live sha256 |
|---|---|---|
| `public.can_current_user_act_on_step(uuid,text)` | `8925ba22…e38fdf` | `5d2b46d7…766e22` |
| `public.current_user_matches_transfer_department_scope(uuid,text)` | `a606fb50…37d51c7` | `a307d085…7acbbd` |
| `public.record_external_university_payment_confirmation(uuid,text)` | `bbd71af7…f0f5875` | `edbae98c…e983ca` |
| `public.user_matches_workflow_runtime_step(uuid)` | `4f87c554…5118b6` | `2ecf741a…4ebfced` |

All four drifted because of migration `20260806003612_b1_payment_e2e_gate.sql` and the
Migration-88 request-scoped E2E branches. `security`, `owner` and `search_path`
attributes are unchanged for all 28. No unpinned semantic change was found.

### B.3 Canonical closure size — **36, not 28 or 29**

Transitive closure from the 28 pinned functions (comment-stripped body scan,
schema-qualified and unqualified call sites) reaches **36** public functions.
The 8 unpinned reachable functions are all Migration-88 E2E helpers:

| Unpinned function | Reached from |
|---|---|
| `current_user_has_b1_e2e_88_actor_binding` | `record_external_university_payment_confirmation`, `can_current_user_act_on_step` |
| `current_user_has_b1_e2e_88_department_binding` | `current_user_matches_transfer_department_scope` |
| `b1_e2e_88_request_is_marked` | both bindings above |
| `b1_e2e_88_correlations_aligned` | both bindings above |
| `b1_e2e_88_request_correlation` | `b1_e2e_88_correlations_aligned` |
| `b1_e2e_88_parse_correlation` | `b1_e2e_88_request_correlation`, `_request_is_marked` |
| `b1_e2e_88_marker` | `_request_is_marked`, both bindings |
| `b1_e2e_88_is_five_service` | `b1_e2e_88_request_is_marked` |

The earlier "84" figure came from a wider BFS seeded with all DML trigger functions;
it is not the manifest contract. **36 is the canonical trigger-aware closure.**

Required manifest reconciliation (source-only, no production write):
1. Update the 4 drifted `definition_sha256` values (or record them as
   `definition_sha256_superseded`).
2. Add the 8 E2E-88 helpers as pinned entries so the graph is closed at 36.

---

## PART C — Fixture 13 actionable topology (19/19 active, all `in_review`)

| Request | Request id | Type | Active step id | step_key | ord | unit / role | action | assignee |
|---|---|---|---|---|---|---|---|---|
| SR-20260801-13000001 | f1300000-…-0001 | department_transfer | f1300001-…-000001000002 | source_department_head_approval | 2 | department / department_head | approve | 9c608c94 |
| SR-20260801-13000002 | …-0002 | department_transfer | …-000002000003 | target_department_head_approval | 3 | department / department_head | approve | bde82530 |
| SR-20260801-13000003 | …-0003 | department_transfer | …-000003000004 | dean_approval | 4 | dean / dean | approve | ce2f9190 |
| SR-20260801-13000004 | …-0004 | department_transfer | …-000004000005 | payment_confirmation | 5 | finance / revenue_finance_officer | confirm_payment | 233c9c36 |
| SR-20260801-13000005 | …-0005 | department_transfer | …-000005000006 | registrar_apply | 6 | registrar / registrar_general | apply_decision | 89d5e758 |
| SR-20260801-13000006 | …-0006 | enrollment_suspension | …-000006000002 | manager_approval | 2 | student_affairs / student_affairs_manager | approve | b3966846 |
| SR-20260801-13000007 | …-0007 | enrollment_suspension | …-000007000003 | registrar_apply | 3 | registrar / registrar_general | apply_decision | 89d5e758 |
| SR-20260801-13000008 | …-0008 | excused_absence | …-000008000002 | manager_review | 2 | student_affairs / student_affairs_manager | approve | b3966846 |
| SR-20260801-13000009 | …-0009 | excused_absence | …-000009000003 | record_apply | 3 | student_affairs / student_affairs_specialist | apply_decision | 06f48015 |
| SR-20260801-13000010 | …-0010 | file_withdrawal | …-000010000002 | library_clearance | 2 | library / library_officer | clear | 4a838311 |
| SR-20260801-13000011 | …-0011 | file_withdrawal | …-000011000003 | labs_clearance | 3 | labs / labs_manager | clear | b59e6e45 |
| SR-20260801-13000012 | …-0012 | file_withdrawal | …-000012000004 | activities_clearance | 4 | student_affairs / student_affairs_manager | clear | b3966846 |
| SR-20260801-13000013 | …-0013 | file_withdrawal | …-000013000005 | finance_clearance | 5 | finance / revenue_finance_officer | clear | 233c9c36 |
| SR-20260801-13000014 | …-0014 | file_withdrawal | …-000014000006 | registrar_apply | 6 | registrar / registrar_general | apply_decision | 89d5e758 |
| SR-20260801-13000015 | …-0015 | file_withdrawal | …-000015000007 | archive | 7 | archive / archive_officer | archive | df2b0ebf |
| SR-20260801-13000016 | …-0016 | final_chance | …-000016000002 | manager_review | 2 | student_affairs / student_affairs_manager | approve | b3966846 |
| SR-20260801-13000017 | …-0017 | final_chance | …-000017000003 | dean_decision | 3 | dean / dean | approve | ce2f9190 |
| SR-20260801-13000018 | …-0018 | final_chance | …-000018000004 | payment_confirmation | 4 | finance / revenue_finance_officer | confirm_payment | 233c9c36 |
| SR-20260801-13000019 | …-0019 | final_chance | …-000019000005 | registrar_apply | 5 | registrar / registrar_general | apply_decision | 89d5e758 |

Every active step has exactly one assignee (`num_nonnulls = 1`), satisfying the
`can_current_user_act_on_step` B1 pre-gate. The matrix harness can therefore drive
all 19 steps without provisioning.

---

## PART D — Operator role contract (still UNSATISFIED)

| Login role | super | bypassrls | Verdict |
|---|---|---|---|
| `authenticator` | f | f | no direct DB read grant path for attestation |
| `pgbouncer` | f | f | infrastructure only |
| `postgres` | f | **t** | fails OPC |
| `sandbox_exec` | f | **t** | fails OPC |
| `supabase_admin` | **t** | t | fails OPC |
| `supabase_etl_admin` | f | **t** | fails OPC |
| `supabase_read_only_user` | f | **t** | fails OPC |
| `supabase_auth_admin` / `storage_admin` / `replication_admin` | f | f | scoped to reserved schemas |

No existing login role satisfies "read-only, NOBYPASSRLS, NOSUPERUSER, non-owner".
Creating one is a production write and is therefore out of scope for this mission;
it must be a separate authorized forward-only migration
(`CREATE ROLE b1_attest_ro NOLOGIN NOBYPASSRLS` + `GRANT pg_read_all_data`, plus a
login grant) before any OPC-compliant attestation can pass.

---

## DECISION

`PASS_PORTAL_PRODUCTION_COUNCILS_B1_RECONCILIATION_EVIDENCE`

- Councils: legacy pre-state fully fingerprinted; C0–C9 must be adoptive forward-only.
- B1: hash-normalization mystery resolved; **real drift is 4 signatures**, canonical
  closure is **36** (28 pinned + 8 E2E-88 helpers).
- Fixtures: 19/19 active and actionable, exact UUIDs captured.
- Operator role: **still blocked**, requires a separate authorized write.
- Production impact of this mission: **none** (0 writes, 0 RPC calls).
