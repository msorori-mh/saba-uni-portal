# PORTAL-PRODUCTION-COUNCILS-C2-APPLY-ONE-LONGRUN-09

**FINAL_DECISION:** `HOLD_PORTAL_PRODUCTION_COUNCILS_C2_G6_PREFLIGHT_CLASSIFIER_DISAGREE`

MODE: PRODUCTION APPLY — EXACTLY ONE MIGRATION (C2)  
DATE: 2026-08-10  
REPOSITORY: `msorori-mh/saba-uni-portal`  
PRODUCTION SUPABASE: `wpmicqriltrowwonknox`

---

## Identity pins

| Field | Value |
|---|---|
| MAIN_HEAD_SHA | `acf2e48c6f4dfdf2816c364743d35809ff26ddb7` |
| BRANCH | `main` (clean at gate; HEAD = `origin/main`) |
| PROJECT_REF | `wpmicqriltrowwonknox` |
| LOVABLE_PROJECT_ID | `90f4dcde-07fb-4441-b86a-6ad5510833b8` |
| MIGRATION | `supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql` |
| VERSION | `20260808122000` |
| FULL_SHA256_LF | `f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e` |
| HASH_CONTRACT | `SHA256_LF_NORMALIZED_V1` self-test PASS |
| `git diff --exit-code origin/main -- <C2 file>` | exit 0 |

### G3 target proof (not env-label only)

| Probe | Result |
|---|---|
| DATABASE_HOST (inet_server_addr) | `2a05:d016:2b6:b302:31a1:4c38:521f:adbb` |
| DNS `db.wpmicqriltrowwonknox.supabase.co` AAAA | **exact match** to server addr |
| CURRENT_DATABASE | `postgres` |
| CURRENT_USER / SESSION_USER | `postgres` |
| PG version | PostgreSQL 17.6 (aarch64) |
| `pg_is_in_recovery()` | false |
| application_name | `mgmt-api` |
| Lovable `get_project` latest_commit_sha | `acf2e48c…` (matches MAIN_HEAD) |

Channel used for all production SQL: Lovable MCP `query_database` on project `90f4dcde-07fb-4441-b86a-6ad5510833b8`.

---

## PRE_LEDGER_STATE

| Check | Result |
|---|---|
| Ledger total | **215** |
| C0 `20260808120000` / name `councils_c0_write_surface_hardening_01` | PRESENT |
| C1 original `20260808121000` | **ABSENT** (intentionally superseded) |
| C1 split `20260810003111` | PRESENT (`01d86704-d31c-42e9-9efa-aa5fe4d6a8c9`) |
| C1 split `20260810003305` | PRESENT (`c75271d6-2ef1-407a-96f5-66aaf2386afe`) |
| C2 `20260808122000` / `%councils_c2%` | **0** (NOT APPLIED) |
| C3 | NOT APPLIED |

### C1_SPLIT_LINEAGE

Confirmed LONGRUN-08 remediation lineage:

1. `20260810003111` — enum-only `ALTER TYPE … ADD VALUE IF NOT EXISTS 'minutes_review'`
2. `20260810003305` — C1 body with enum ADD VALUE commented as already committed

### C2_PRE_STATE (object surface)

| Object | Present? |
|---|---|
| C2 helpers (`can_submit_to_council_meeting_intake`, prepare/final review, `council_resubmit_topic`, lifecycle trigger) | **ABSENT** |
| C2 new submit/review signatures | **ABSENT** |
| Obsolete C0 `council_submit_topic(uuid,text,text,text)` | PRESENT |
| Obsolete C0 `council_review_topic(…, uuid)` | PRESENT |
| `council_add_topic_to_agenda(uuid,uuid,integer,text)` | PRESENT (**C0** surface; not partial C2) |
| `trg_actopics_lifecycle` | ABSENT |
| `trg_actopics_touch` only | PRESENT |

**Partial C2 surface:** NO → no `HOLD_C2_PARTIAL_OBJECT_SURFACE`.

### G5 prerequisites

| Prerequisite | Result |
|---|---|
| `academic_council_topics` / `meetings` / `agenda_items` | PRESENT |
| `council_require_auth_uid()` / `council_deny(text)` | PRESENT |
| meeting statuses include `intake_open`, `intake_closed`, `agenda_ready` | PRESENT (+ `minutes_review` from C1 split) |
| topic statuses include draft/submitted/under_review/needs_completion/accepted_for_agenda/rejected | PRESENT |
| Required columns on topic/meeting/agenda | PRESENT |

---

## G6 — OFFICIAL PREFLIGHT

File: `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`

Classifier result (byte-faithful Phase A–C logic executed read-only against production):

| Field | Value |
|---|---|
| PREFLIGHT_LEDGER_STATE | `LEDGER_NONE` |
| LEDGER_HITS (`sm.name = ANY(v_promoted)` full filenames) | **0** |
| PREFLIGHT_SCHEMA_STATE | `SCHEMA_PARTIAL_EXACT` |
| SCHEMA_PREFIX | **2** (markers `1100000000` = C0+C1 only) |
| PREFLIGHT_STATE_CLASSIFICATION | **`UNKNOWN_UNSAFE`** |

### Why classifier ≠ reconciled lineage

| Match mode | Hits | Notes |
|---|---|---|
| Official `sm.name = ANY(v_promoted)` | 0 | Production Lovable stores **short** names (`councils_c0_…`), not full `20260808120000_councils_c0_…` |
| Composite `version \|\| '_' \|\| name` | 1 | C0 only |
| Promoted **versions** among C0–C9 originals | 1 | C0 only; original C1 version absent |
| C1 split versions present | 2 | `20260810003111` + `20260810003305` — **not** in `v_promoted` |

Reconciled operator reading of production:

- Schema next step = **C2** (prefix 2 exact; C2 marker `council_resubmit_topic` absent)
- Ledger next step = **C2** after C0 + C1-split remediation

Official classifier terminal = `UNKNOWN_UNSAFE` (not `PARTIAL_NEW_CHAIN_EXACT_PREFIX` with next C2).

Per mission G6:

- Do **not** override HOLD merely because an older plan expected original C1 filename.
- If classifier and reconciled lineage disagree → **STOP**.
- **No false PASS.**

No alternate current-main classifier file exists that maps Lovable short names + C1 split → `PARTIAL_NEW_CHAIN_EXACT_PREFIX` / next=C2.

---

## G7 — PRE_C2 SNAPSHOT

| Metric | PRE |
|---|---|
| Ledger count | 215 |
| `academic_council_topics` | 2 |
| `academic_council_meetings` | 1 |
| `academic_council_agenda_items` | 0 |
| Topic status dist | `{submitted: 2}` |
| Meeting status dist | `{scheduled: 1}` |
| `council_submit_topic` overloads | `(uuid,text,text,text)` only |
| `council_review_topic` overloads | `(uuid, academic_council_topic_status, text, uuid)` only |
| Triggers on `academic_council_topics` | `trg_actopics_touch` only |
| B1 five-service `student_visible` | **5** |
| All `request_types.student_visible=true` | 6 (includes `enrollment_certificate=true`; sentinel for this mission is the five-service set = 5) |

ACL posture (pre): C0 topic RPCs = SECURITY DEFINER, `search_path=public, pg_temp`, execute for `authenticated` + `service_role`.

---

## G8 — LOCAL SOURCE TESTS

| Test | Result |
|---|---|
| `bun test tests/academic-councils/councils-c2-topic-intake-review.test.ts` | **8 pass / 0 fail** |
| `bun test tests/academic-councils/councils-c1-c3-session-gate.test.ts` | **2 pass / 0 fail** |

Source tests PASS. Production write still blocked by G6.

---

## APPLY (G9) — NOT EXECUTED

| Field | Value |
|---|---|
| APPLY_METHOD | N/A — stopped before write |
| APPLY_START | N/A |
| APPLY_END | N/A |
| APPLY_RESULT | **NOT_ATTEMPTED** |
| MIGRATION_APPLIED | **NO** |

Available channel note (informational only; unused): Lovable MCP `query_database` as `postgres` can execute DDL and read/write `supabase_migrations.schema_migrations`. Historical `supabase--migration` tool is **not** present in the current Lovable MCP catalog. G9 was never reached.

---

## POST gates (G10–G13) — NOT RUN

No apply → no post-verifier, no extended structural postcheck, no PRE/POST mutation compare after apply.

| Field | Value |
|---|---|
| POST_VERIFIER_RESULT | NOT_RUN |
| POST_VERIFIER_MARKER | ABSENT (expected; C2 not applied) |
| C2_LEDGER_COUNT | **0** |
| FUNCTION_SURFACE | PRE-C2 / C0 signatures only |
| OBSOLETE_SIGNATURES_ABSENT | NO (still present; expected pre-C2) |
| TRIGGER_COUNT (`trg_actopics_lifecycle`) | 0 |
| ACL_VERDICT | unchanged C0 posture |
| BUSINESS_ROW_MUTATION | none (no apply) |
| B1_VISIBLE_COUNT_BEFORE | 5 (five-service set) |
| B1_VISIBLE_COUNT_AFTER | 5 (unchanged; no apply) |

### Cross-domain sentinels (read-only, post-stop)

| Sentinel | Result |
|---|---|
| B1 five visible | 5/5 unchanged |
| GP (`graduation_projects`) | present (untouched) |
| GA cases table | null/absent as before |
| enrollment certificate type row | present; `student_visible=true` (untouched) |
| C3 | NOT APPLIED |
| Deploy / publish | NOT PERFORMED |

---

## Controls

| Control | Value |
|---|---|
| BUSINESS_RPC_CALLS | **0** |
| PRODUCTION_READS | YES (identity, ledger, prerequisites, classifier, snapshot, sentinels) |
| PRODUCTION_WRITES | **0** (no migration apply; no DML/DDL on durable objects; session temp diagnostic table only) |
| MIGRATION_APPLIED | **NO** |
| C3_APPLIED | **NO** |
| DEPLOY | **NO** |
| PUBLISH | **NO** |

---

## Assumptions

1. Lovable Cloud DB for `90f4dcde-…` is the production database for `wpmicqriltrowwonknox` (proven by DNS AAAA identity match).
2. C1 split pair is the authoritative remediation for original `20260808121000` (LONGRUN-08).
3. G6 forbids treating reconciled “next=C2” intuition as a PASS when the official classifier returns `UNKNOWN_UNSAFE`.

## Risks / blockers

1. **Hard blocker:** official preflight name-matching does not recognize Lovable short ledger names, and `v_promoted` does not include C1 split versions → perpetual `LEDGER_NONE` + partial schema → `UNKNOWN_UNSAFE` until a **source** classifier update (or ledger name-format reconciliation) lands on main under a separate approval.
2. Even under composite matching, original C1 version absence would yield ledger_prefix=1 vs schema_prefix=2 → `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH` unless the classifier learns the split lineage.
3. Applying C2 while the official classifier HOLDs would be a false PASS against G6.

## Production impact

None. C2 was **not** applied. No deploy, no publish, no B1 visibility change, no business RPC calls.

## What would unblock a future C2 apply (separate mission)

1. Source update to preflight (or companion current-main classifier) that:
   - accepts Lovable `version` + short `name` composite **or** equivalent ledger attestation, and
   - treats `20260810003111` + `20260810003305` as satisfied C1 for prefix classification,
   - emits `PARTIAL_NEW_CHAIN_EXACT_PREFIX` with `PARTIAL_NEXT_EXPECTED = 20260808122000_councils_c2_topic_intake_review_01`
2. Re-run this LONGRUN with fresh explicit C2 approval after that classifier PASS.
3. Confirm exact-one apply + ledger record primitive for version `20260808122000` / name `councils_c2_topic_intake_review_01` (or full-name convention if classifier requires it).

---

## FINAL OUTPUT BLOCK

```
MAIN_HEAD_SHA=acf2e48c6f4dfdf2816c364743d35809ff26ddb7
PROJECT_REF=wpmicqriltrowwonknox
C2_HASH=f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e
PRECHECK=HOLD_G6_OFFICIAL_PREFLIGHT_UNKNOWN_UNSAFE
C2_APPLY=NOT_ATTEMPTED
C2_LEDGER_COUNT=0
POST_VERIFIER=NOT_RUN
POST_VERIFIER_MARKER=ABSENT
FUNCTION_SURFACE=PRE_C2_C0_ONLY
TRIGGER=trg_actopics_lifecycle_ABSENT
BUSINESS_ROW_MUTATION=NONE
B1_VISIBLE_BEFORE=5
B1_VISIBLE_AFTER=5

PRODUCTION_READS=YES
PRODUCTION_WRITES=0
BUSINESS_RPC_CALLS=0
MIGRATION_APPLIED=NO

C3_APPLIED=NO
DEPLOY=NO
PUBLISH=NO

REPORT_PATH=docs/reviews/PORTAL-PRODUCTION-COUNCILS-C2-APPLY-ONE-LONGRUN-09.md
FINAL_DECISION=HOLD_PORTAL_PRODUCTION_COUNCILS_C2_G6_PREFLIGHT_CLASSIFIER_DISAGREE
```
