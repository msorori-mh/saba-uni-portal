# PORTAL-B1-PR276-TERMINAL-VISIBILITY-INDEPENDENT-FINAL-REVIEW-38 — Report

Mode: **LONG INDEPENDENT SOURCE-ONLY FINAL REVIEW**  
(no production connection, no production/staging migration apply, no Gate25 activation,
no RPC matrix execution, no RLS/role/workflow/storage/document change, no modification of
PR #276 source, no merge)

| Field | Value |
| --- | --- |
| Mission | `PORTAL-B1-PR276-TERMINAL-VISIBILITY-INDEPENDENT-FINAL-REVIEW-38` |
| Repository | `msorori-mh/saba-uni-portal` |
| PR | [#276](https://github.com/msorori-mh/saba-uni-portal/pull/276) |
| Reviewed SHA (exact) | `1d0036c2a8fa7f498b4fa76f505d8ce674513dce` |
| Remote PR head | `1d0036c2a8fa7f498b4fa76f505d8ce674513dce` (equal) |
| Base main | `3b743d7237b40219ae3d172581afc7faa0ab2b48` |
| Review branch | `review/b1-pr276-terminal-visibility-38` |
| PR title | fix(b1): terminal student_visible=false for five services (B1-34) |
| CI (exact SHA) | [Web CI 30731688467](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30731688467) + [Migration Review 30731688449](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30731688449) — **all success** |

## Verdict (summary)

PR #276 adds exactly one forward-only migration after source head `20260801021541` that
terminally sets `student_visible=false` for the five B1 request types, fail-closes on
missing/duplicate target rows, leaves `enrollment_certificate` and unrelated types unchanged,
is idempotent on second apply, and does not activate Gate25 or touch RPC/RLS/role/workflow/
storage/document surfaces.

**Final decision:** `PASS_B1_PR276_TERMINAL_VISIBILITY_INDEPENDENT_FINAL_REVIEW_READY_FOR_MERGE`

This PASS authorizes **merge of PR #276 source** only. It does **not** authorize production
or staging apply of the migration, Gate25 activation, deploy, or publish.

---

## Phase A — Source gate

| Check | Result |
| --- | --- |
| Local HEAD = `1d0036c2…` | **PASS** |
| PR `headRefOid` = reviewed SHA | **PASS** |
| Working tree clean at review start | **PASS** |
| PR base = `main` @ `3b743d72…` | **PASS** |
| Single commit on PR vs main | **PASS** (`1d0036c2`) |
| No unreviewed later commit on PR head | **PASS** |

### Changed-file inventory (8 files)

| Path | Role |
| --- | --- |
| `supabase/migrations/20260802070000_b1_34_five_services_terminal_visibility_false.sql` | forward-only terminal visibility fix |
| `tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | source contract for terminal false writer |
| `scripts/b1-five-services-terminal-visibility-34-pg17/00-schema.sql` | disposable PG17 schema |
| `scripts/b1-five-services-terminal-visibility-34-pg17/01-seed.sql` | five + EC + unrelated seed |
| `scripts/b1-five-services-terminal-visibility-34-pg17/02-replay-visibility-history.sql` | ordered true/false history replay |
| `scripts/b1-five-services-terminal-visibility-34-pg17/03-verify-and-fail-closed.sql` | post-fix + EC/unrelated checks |
| `scripts/b1-five-services-terminal-visibility-34-pg17/04-run.ps1` | disposable `postgres:17` runner |
| `docs/B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34-REPORT.md` | implementation report |

---

## Phase B — Nine required checks

### 1. Migration after head `20260801021541`

**PASS.** Ordered `supabase/migrations` ends with:

1. `20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql` (previous head)
2. `20260802070000_b1_34_five_services_terminal_visibility_false.sql` (this PR)

`20260802070000` is lexicographically after `20260801021541`, and the source contract test
asserts the fix is the sole last migration file.

### 2. Targets exactly the five B1 service codes

**PASS.** Migration `IN (...)` lists only:

- `enrollment_suspension`
- `excused_absence`
- `department_transfer`
- `final_chance`
- `file_withdrawal`

Executable body (comments stripped) does not reference `enrollment_certificate`.

### 3. Requires exactly five unique rows; fails atomically on missing/duplicate

**PASS.** Single `DO` block with no `EXCEPTION WHEN` handler:

| Guard | Token |
| --- | --- |
| `count(*) = 5` and `count(DISTINCT code) = 5` | `B1_34_TARGET_COUNT_MISMATCH` |
| every code exists | `B1_34_MISSING_TARGET_CODE` |
| no duplicate code rows | `B1_34_DUPLICATE_TARGET_CODE` |
| `ROW_COUNT = 5` after UPDATE | `B1_34_UPDATE_COUNT_MISMATCH` |
| post-check all five `student_visible IS DISTINCT FROM false` | `B1_34_POSTCHECK_VISIBLE_REMAINS` |

Disposable PG17 harness confirmed missing-target and duplicate-target fail-closed, and a
simulated partial failure rolled back (five rows remained true).

### 4. Changes only `student_visible=false` and `updated_at`

**PASS.** Sole UPDATE assignment is:

```sql
SET student_visible = false,
    updated_at = now()
```

No `is_active`, `name_ar`, `form_schema`, workflow, or other column writes.

### 5. `enrollment_certificate` and unrelated request types unchanged

**PASS.** PG17 harness compared EC + unrelated markers before/after fix:

- `PG17_EC_AND_UNRELATED_UNCHANGED`
- verify SQL requires EC remains `student_visible=true`, `grade_appeal` remains visible/active,
  `official_transcript` remains hidden/inactive

### 6. Ordered PG17 replay ends with the five services hidden

**PASS.** Disposable Docker `postgres:17` → **17.10**:

| Step | Result |
| --- | --- |
| Replay history through terminal true writer (`20260727115111`) | five true (`REPRO`) |
| Apply B1-34 migration | five false |
| Verify harness | `B1_34_VERIFY_PASS` |
| Final banner | `PASS_B1_34_TERMINAL_VISIBILITY_PG17` |

### 7. Second apply is safe

**PASS.** Harness re-applied the migration then re-verified:

- `PG17_SECOND_APPLY_SAFE`
- five remain `student_visible=false`

Visibility outcome is idempotent; `updated_at` may bump (documented, acceptable).

### 8. No Gate25 activation / production apply / RPC / RLS / role / workflow / storage / document change

**PASS.** Diff inventory is migration + source contract test + disposable PG17 scripts + docs only.

| Forbidden surface | Evidence |
| --- | --- |
| Gate25 activation | no `Gate25` / `gate_25` / `is_active=` assignment in migration executable body |
| Production/staging apply | review did not connect; harness used disposable Docker only |
| RPC / function DDL | no `CREATE OR REPLACE FUNCTION` |
| RLS / GRANT / REVOKE | absent |
| Role / workflow / storage / document | absent from diff |
| UI / `src/` runtime | unchanged |

### 9. Targeted tests, full tests, typecheck, build, diff-check, exact-SHA CI

| Command / gate | Result |
| --- | --- |
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | **4/4 PASS** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **201/201 PASS** |
| `bun test tests/student-requests --timeout 30000` | **1064/1064 PASS** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |
| Exact-SHA CI (Web CI + Migration Review) | **all SUCCESS** on `1d0036c2…` |
| Local `bun test --timeout 30000` / `60000` | **2404 pass / 2 fail** under full load |

Local full-suite failures were environmental only and unrelated to PR #276:

1. `template workbook structure` / Wrangler Arabic-PDF worker — timeout under suite load; pass in isolation.
2. PR232 sequence/hash test — `spawnSync git ETIMEDOUT` while hashing apply-order blobs under load; **pass in isolation** (5/5), and does not assert Gate25 activation.

Exact-SHA CI `Bun tests (tests/)` concluded **success**, which is the authoritative full-suite signal for this SHA.

---

## Phase C — Assumptions

- Source migration head before this fix is `20260801021541`.
- The five canonical `request_types.code` rows exist as exactly one row each when the migration runs.
- Production/staging apply remains a separate authorized gate (out of scope for this review).
- Local full-suite timeouts under heavy Windows load do not override green exact-SHA CI.

## Phase D — Risks

- Apply aborts if any of the five codes is missing or duplicated (intentional fail-closed).
- Re-apply bumps `updated_at` even when already false.
- Does not rewrite historical migrations that previously set `true`; relies on the new terminal writer + source contract.

## Phase E — Blockers / obstacles

None for merge of PR #276 source. Production apply is intentionally not performed.

## Phase F — Production impact

**None in this review mission.** Source-only verification. No production connection, no migration apply, no Gate25 activation, no deploy/publish, no merge of PR #276 by this agent.

## Phase G — Constraint compliance

- No production/staging access or apply
- No Gate25 activation
- No edit of PR #276 source files
- No merge to main
- No cleanup / backfill / delete of existing requests
- Review report only committed on `review/b1-pr276-terminal-visibility-38`

## Phase H — Modified files (this review agent)

| File | Change |
| --- | --- |
| `docs/B1-PR276-TERMINAL-VISIBILITY-INDEPENDENT-FINAL-REVIEW-38-REPORT.md` | this report |

## Final

`PASS_B1_PR276_TERMINAL_VISIBILITY_INDEPENDENT_FINAL_REVIEW_READY_FOR_MERGE`
