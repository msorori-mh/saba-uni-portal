# PORTAL-GO-LIVE-PRODUCTION-READONLY-REALITY-CHECK-LONGRUN-01

MODE: PRODUCTION READ-ONLY ONLY — no DDL, no DML, no RPC execution, no migration apply,
no flag writes, no deploy/publish, no role changes. All evidence gathered via SELECT-only
catalog and business-table reads.

Captured: 2026-08-10 (UTC), immediately before the C5V2 → GA3 campaign.

---

## A — TARGET

| Key | Value |
| --- | --- |
| PRODUCTION_PROJECT | `wpmicqriltrowwonknox` (Lovable Cloud managed, `postgres`, PostgreSQL 17.6) |
| CURRENT_MIGRATION_TIP | `20260810012715` (C4 managed alias) |
| CURRENT_PUBLIC_SCHEMA_FINGERPRINT | `a5123b15a23b90e0a03b047688eb2af2` (md5 over public relations `r/v/m` + all public function identity signatures) |
| Public relation counts | 129 tables, 3 views/matviews |

PRODUCTION_TARGET = **PASS**

---

## B — COUNCILS LINEAGE

Ledger tail (descending): `20260810012715`, `20260810011456`, `20260810010400`,
`20260810003305`, `20260810003111`, `20260809183940`, `20260808120000`, `20260808010000`, …

| Stage | Expected | Observed | Result |
| --- | --- | --- | --- |
| C0 write-surface hardening | applied | `20260808120000` in ledger; 12 `trg_ac_*` guard triggers live | PASS |
| C1 state machine (split) | enum value + semantic body | `minutes_review` present in `academic_council_meeting_status`; `council_transition_meeting`, `council_meeting_transition_is_legal`, `council_assert_c1_contract_present`, transition-events table present; ledger `20260810003111` + `20260810003305` | PASS (split complete) |
| C2 alias | `20260810010400` | present | PASS |
| C3 alias | `20260810011456` | present | PASS |
| C4 alias | `20260810012715` | present (ledger tip) | PASS |
| C5 V1 | absent | 0/4 C5 functions (`draft_council_minutes`, `submit_council_minutes_for_review`, `approve_and_lock_council_minutes`, `tg_ac_minutes_lock_guard`); type `academic_council_minutes_status` absent | ABSENT |
| C5 V2 | absent | same evidence — no V2 artifacts, no V2 ledger row | ABSENT |
| C6 | absent | 0/3 (`issue_council_decision`, `complete_council_decision`, `update_council_decision_followup`) | ABSENT |
| C7 | absent | 0/3 (`archive_council_meeting`, `get_council_archive_summary`, `get_council_meeting_metrics`) | ABSENT |
| C8 | absent | `council_decision_transition_is_legal` absent; `close_agenda_item_vote` present but is the **C4-provided** voting RPC, not a C8 artifact | ABSENT |
| C9 | absent | 0 `get_council_report_*` functions; no `ac_notifications` surface | ABSENT |

Crypto prerequisite (C5 blocker from LONGRUN-C5-01):

- `pgcrypto` extension schema = `extensions`
- `extensions.digest` exists (2 overloads)
- `public.digest` does **not** exist → any C5 body must use `search_path = public, extensions, pg_temp`
  or qualify `extensions.digest(...)`.

EXTENSIONS_DIGEST = **PASS**

Councils business data present and untouched: 1 meeting, 2 topics, 0 minutes rows.

---

## C — GA (GRADUATES AFFAIRS)

Object census in `public`:

- tables matching `graduate%`: **0**
- functions matching `graduate%`: **0**
- enum types matching `graduate%`: **0**
- ledger rows for `20260808210000` / `20260808210100` / `20260808210200`: **none**

| Key | Value |
| --- | --- |
| GA_FOUNDATION_STATE | ABSENT (clean) |
| GA_COMPLETION_STATE | ABSENT (clean) |
| GA_AUTH04_STATE | ABSENT (clean) |
| GA_PARTIAL_OBJECTS | 0 |

No partial state ⇒ no HOLD from section C. (Pre-existing `graduation_project*` tables belong to
the GP MVP package and are unrelated to the GA namespace.)

---

## D — B1 + ENROLLMENT CERTIFICATE

Read-only `request_types` snapshot (exact codes confirmed):

| code | is_active | student_visible |
| --- | --- | --- |
| `enrollment_suspension` | true | true |
| `excused_absence` | true | true |
| `department_transfer` | true | true |
| `final_chance` | true | true |
| `file_withdrawal` | true | true |
| `enrollment_certificate` | true | true |

B1_FIVE_VISIBLE = **5/5 = PASS** (matches the atomic release migration `20260806005927`).

Enrollment certificate baseline:

- service state: active + student-visible, unchanged.
- protected documents: `USR-2026-000001` = `archived`, `USR-2026-000002` = `archived` (2 rows total,
  no additional documents).
- protected requests: `SR-20260713-2DE64041` = `in_review`, `SR-20260715-FEDCB3E1` = `completed`,
  `SR-20260716-26BAD4C8` = `completed`.
- No RPC executed against the certificate surface during this check.

ENROLLMENT_CERTIFICATE = **PASS**

---

## E — DEMO ROLE DATA (READ-ONLY)

Councils configured (all `is_active = true`):

| council_type | name | department_id |
| --- | --- | --- |
| college | مجلس الكلية | — |
| department | مجلس قسم علوم الحاسوب | `1111…1111` |
| department | مجلس قسم نظم المعلومات الحاسوبية | `2222…2222` |
| department | مجلس قسم تكنولوجيا المعلومات | `ce485c67…` |

Active memberships (15 rows, all `is_active = true`, `active_from` 2026-07-04/05, `active_to = NULL`):

| council | role | user_id |
| --- | --- | --- |
| College | chair | `b3dd71e6` (dean) |
| College | member | `103c8988` |
| College | member | `0023ca37` |
| CS dept | chair | `97acbe02` |
| CS dept | secretary | `9263754c` |
| CS dept | member | `6e46bad6` |
| CIS dept | chair | `f602b62c` |
| CIS dept | secretary | `3f478ec3` |
| CIS dept | member | `103c8988` |
| IT dept | chair | `d4aaa5c9` |
| IT dept | secretary | `6874310f` |

Checks:

- Duplicate active rows per (user, council): **0**
- Councils with more than one active chair: **0** → CHAIR_DUPLICATES = **0**
- Dean `b3dd71e6`: holds `dean` + `faculty_member` app roles and is **college-council chair**.
- Department-head multi-council actor (dept-council chair **and** college-council member):
  **NOT PRESENT**. Active college members are `103c8988` (CIS dept-council *member*, not chair)
  and `0023ca37` (no dept-council membership). None of the three dept-council chairs
  (`97acbe02`, `f602b62c`, `d4aaa5c9`) holds a college-council membership row.

MULTI_COUNCIL_DATA = **ABSENT** (demo-data gap, not corruption)

Other observations (no writes made):

- The app_role enum contains `department_head`, but **no user holds it**; department-head identity is
  expressed only through `position_assignments` (`cs_department_head` → `97acbe02`,
  `is_department_head` → `f602b62c`, `it_department_head` → `d4aaa5c9`, all active from 2026-07-24,
  plus two `test_only_b1_dept_head_*` TEST_ONLY positions).
- Dean role assignment count: `dean = 2` in `user_roles`.

---

## F — REPORTS SCOPE DATA (READ-ONLY)

Report scope resolution (`src/lib/reports/scope/resolve-scope.server.ts`) derives the actor's
department from `faculty_profiles.department_id`, plus explicit org bindings.

| Actor | position binding | `faculty_profiles.department_id` | Consistent? |
| --- | --- | --- | --- |
| `97acbe02` (CS dept head, CS council chair) | `cs_department_head` | قسم تكنولوجيا المعلومات (`ce485c67`) | **NO — points at IT** |
| `f602b62c` (CIS dept head, CIS council chair) | `is_department_head` | قسم نظم المعلومات الحاسوبية (`2222…`) | yes |
| `d4aaa5c9` (IT dept head, IT council chair) | `it_department_head` | قسم تكنولوجيا المعلومات (`ce485c67`) | yes |
| `b3dd71e6` (dean) | `dean` position catalog present | قسم نظم المعلومات الحاسوبية | dean scope is college-wide via `dean` app role — available |

- Department-head department binding: available for 2 of 3 heads; **1 mismatch** (CS head bound to IT
  department in `faculty_profiles`) would resolve CS-head reports to the IT department scope.
- Dean/college binding: available (`dean` app role held by `b3dd71e6`).
- Admin explicit-scope capability dependencies: `organizational_positions` (24 rows),
  `position_assignments` (5 active), `user_role_assignments` (12 rows, columns
  `user_id`/`role_code` only — this table carries **no scope columns**), `roles_catalog` present.
  Explicit scope therefore depends entirely on position assignments + `faculty_profiles`
  department binding.

No scope writes performed.

---

## FINDINGS

CRITICAL: 0

HIGH: 1
- H1 — CS department head (`97acbe02`) has `faculty_profiles.department_id` = IT department while
  holding the `cs_department_head` position and chairing the CS council. Department-scoped reports
  and any department-derived authorization for this actor will resolve to the wrong department.
  (Data-level; remediation requires a separate authorized write mission.)

MEDIUM: 2
- M1 — No department-head actor is simultaneously a dept-council chair and a college-council member,
  so the multi-council demo scenario cannot be exercised as specified.
- M2 — No user holds the `department_head` app role; department-head identity is position-only.
  Any surface that gates on the app role will not recognize the three heads.

---

## RESULT BLOCK

```
PRODUCTION_TARGET=PASS
C0_C4_LINEAGE=PASS
C5V1_ABSENT=PASS
C5V2_ABSENT=PASS
C6_C9_ABSENT=PASS
EXTENSIONS_DIGEST=PASS
GA1_STATE=ABSENT
GA2_STATE=ABSENT
GA3_STATE=ABSENT
GA_PARTIAL_OBJECTS=0
B1_FIVE_VISIBLE=PASS (5/5 is_active=true, student_visible=true)
ENROLLMENT_CERTIFICATE=PASS
MULTI_COUNCIL_DATA=ABSENT
CHAIR_DUPLICATES=0
ROLE_DATA_DRIFT=YES (1 HIGH: CS head department binding mismatch)
PRODUCTION_WRITES=0
RPC_MUTATIONS=0
MIGRATIONS_APPLIED=0
CRITICAL_COUNT=0
HIGH_COUNT=1
```

FINAL TOKEN: `PASS_PORTAL_GO_LIVE_PRODUCTION_READONLY_REALITY_CHECK_LONGRUN_01`

Notes for the C5V2 → GA3 campaign:
1. C5 V2 must pin `search_path = public, extensions, pg_temp` (or qualify `extensions.digest`).
2. GA namespace is completely clean — GA1 may be applied without reconciliation.
3. H1/M1/M2 are demo/role data items; they do not block schema migrations but do block the
   multi-council and department-scoped report demos until a separate authorized data mission runs.
