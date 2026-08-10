# PORTAL-PRODUCTION-GO-LIVE-MASTER-AUTONOMOUS-EXECUTION-LONGRUN-01 — PHASE C HOLD

Mode: FINAL PRODUCTION DELIVERY. Owner standing authorization acknowledged.
Result: **HOLD at Phase C (Final Main Freeze)** — mandatory stop condition
"unknown / missing final source" reached. Phases D–Z were not started.
Zero production writes, zero migrations, zero deploys in this run.

---

## PHASE A — PRODUCTION READ-ONLY REALITY (re-captured now)

| Key | Value |
| --- | --- |
| PRODUCTION_PROJECT | `wpmicqriltrowwonknox` (Lovable Cloud, PostgreSQL 17.6) |
| MIGRATION_TIP | `20260810012715` (C4 managed alias) |
| Ledger tail | `20260810012715`, `20260810011456` (C3), `20260810010400` (C2) |
| Public schema fingerprint | `a5123b15a23b90e0a03b047688eb2af2` (unchanged) |

Council lineage vs expected:

| Stage | Expected | Observed |
| --- | --- | --- |
| C0 canonical | applied | PASS (`20260808120000`, 12 guard triggers) |
| C1 split | enum + body | PASS (`20260810003111` + `20260810003305`) |
| C2 | alias `20260810010400` | PASS — exact match |
| C3 | alias `20260810011456` | PASS — exact match |
| C4 | alias `20260810012715` | PASS — exact match, ledger tip |
| C5 V1 (`20260808150000`) | must NEVER be applied | **ABSENT — confirmed never applied** |
| C5 V2 | absent | ABSENT |
| C6 / C7 / C8 / C9 | absent | ABSENT (0 of the 6 probed C5–C8 RPCs exist) |

`extensions.digest` exists (pgcrypto in `extensions`; no `public.digest`) — the
C5 V1 search-path blocker is still real and is exactly what C5 V2 must fix.

GA1 / GA2 / GA3: **ABSENT (clean, zero partial objects)** — 0 `graduate\_%`
relations, 0 GA functions, 0 GA enums, no GA ledger rows.

B1 five services + enrollment certificate (`request_types`):

`department_transfer`, `enrollment_suspension`, `excused_absence`,
`file_withdrawal`, `final_chance`, `enrollment_certificate` — all
`is_active = true`, `student_visible = true`. **B1 = 5/5 visible; certificate
baseline intact** (`USR-2026-000001`, `USR-2026-000002` both `archived`;
protected SR records unchanged).

## PHASE B — DEMO DATA READ-ONLY REALITY (recorded, no repair)

Councils: 4 active (1 college, 3 department). 15 active memberships.
- duplicate active memberships: **0**
- multiple chairs per council: **0**
- expired-but-active memberships: **0** (`active_to` NULL on all)

| Actor | State |
| --- | --- |
| Dean (`b3dd71e6`) | `dean` app role + College Council **chair** — present |
| Dept heads | `97acbe02` (CS), `f602b62c` (CIS), `d4aaa5c9` (IT) via `position_assignments`, all active |
| Council chairs | CS `97acbe02`, CIS `f602b62c`, IT `d4aaa5c9` — present |
| Council secretaries | CS `9263754c`, CIS `3f478ec3`, IT `6874310f` — present |
| College members | `103c8988`, `0023ca37` — present |
| Registrar | `20ab1b26` (`registrar_officer`) — present |
| GP admin viewer | no dedicated viewer assignment found |
| GA manager / specialist | **not provisionable — GA schema absent until GA3** |
| Level-4 student | GP level-4 guard live; demo student to be pinned at Phase U |

Findings (record-only, Phase N candidates):
- **H1** — CS head `97acbe02` has `faculty_profiles.department_id` = IT department while holding `cs_department_head` and chairing the CS council → department-scoped reports resolve to the wrong department.
- **M1** — multi-council actor (dept-council chair **and** college-council member) does **not exist**; no dept chair holds a college membership row.
- **M2** — no user holds the `department_head` app role (position-only identity).

## PHASE C — FINAL MAIN FREEZE: **NOT MET**

Repository HEAD: `a98b76feefa1fd67ed868c6eefe8650dd8c66f45` — working tree clean.
Latest merge in history is **PR #321** (`fix/councils-preflight-ledger-lineage-10`).

Blocking gaps, all verified by direct inspection of the current source:

1. **PR328 not present.** Required C5 V2 migration
   `supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql`
   **does not exist**. Only the forbidden V1 (`20260808150000_..._01.sql`) is in tree.
2. **Operator packet missing.** `LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt`
   is not present anywhere in the repo → no authoritative hash list exists to
   validate C5V2→GA3 bodies against. Phase D cannot be satisfied.
3. **Release evidence absent.** No occurrence anywhere in the repo of
   `PASS_PORTAL_GO_LIVE_FINAL_RELEASE_CAPTAIN_AUTONOMOUS_LONGRUN_03`,
   `FINAL_MAIN_SHA=<sha>`,
   `PASS_PORTAL_GO_LIVE_C5V2_THROUGH_GA3_FULL_CHAIN_PG17_REHEARSAL_LONGRUN_01`, or
   `PASS_PORTAL_GO_LIVE_FINAL_INDEPENDENT_REVIEW_R2`.

Per the mission contract these are technical preconditions, not owner
approvals — so no approval token can substitute for them. Proceeding would
require either applying the forbidden C5 V1 or executing an unpinned,
un-rehearsed body, both of which are explicit stop conditions.

GA activation flag remains `staffGraduatesAffairs: false` in
`src/lib/portal-features.ts`, correctly gated until GA3 PASS (Phase O).

---

## RESULT BLOCK

```
PRODUCTION_TARGET=PASS (wpmicqriltrowwonknox)
MIGRATION_TIP=20260810012715
C0_C4_LINEAGE=PASS (C2/C3/C4 aliases match expected exactly)
C5V1_APPLIED=NO
C5V2_PRESENT_IN_SOURCE=NO
C6_C9_PRESENT=NO
EXTENSIONS_DIGEST=PASS
GA1_STATE=ABSENT  GA2_STATE=ABSENT  GA3_STATE=ABSENT  GA_PARTIAL_OBJECTS=0
B1_VISIBLE=5/5    ENROLLMENT_CERTIFICATE=BASELINE_INTACT
CHAIR_DUPLICATES=0  DUPLICATE_MEMBERSHIPS=0  MULTI_COUNCIL_ACTOR=ABSENT
ROLE_DATA_DRIFT=YES (1 HIGH, 2 MEDIUM — recorded only)
CURRENT_MAIN_SHA=a98b76feefa1fd67ed868c6eefe8650dd8c66f45
PR328_MERGED=NO
OPERATOR_PACKET=MISSING
RELEASE_EVIDENCE_TOKENS=0/3
PRODUCTION_WRITES=0  MIGRATIONS_APPLIED=0  DEPLOYS=0
UNEXPECTED_DATA_MUTATIONS=0
GO_LIVE=BLOCKED_AT_PHASE_C
```

FINAL TOKEN:
`HOLD_PORTAL_PRODUCTION_GO_LIVE_PHASE_C_FINAL_MAIN_FREEZE_NOT_REACHED_PR328_C5V2_AND_OPERATOR_PACKET_ABSENT`

## Resume conditions (unblocks D→Z automatically)

1. PR328 merged into main, delivering `20260810180000_councils_c5_minutes_lifecycle_02.sql`
   (with `search_path` including `extensions`, or `extensions.digest` qualified).
2. `LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt` committed with the
   authoritative SHA256_LF for C5V2, C6, C7, C8, C9, GA1, GA2, GA3.
3. The three PASS evidence tokens plus `FINAL_MAIN_SHA=<sha>` recorded in the repo.

Production prestate is clean and ready — the moment those land, the campaign
resumes at Phase D with no further reconciliation needed.
