# PORTAL-PR316-FINAL-RC-EXACT-REPIN-AND-GO-LIVE-RUNBOOK-CLOSURE-04

**Exact FINAL SOURCE RC repin and go-live runbook closure for Draft PR #316**

- **MISSION_ID**: `PORTAL-PR316-FINAL-RC-EXACT-REPIN-AND-GO-LIVE-RUNBOOK-CLOSURE-04`
- **TARGET_PR**: `#316` (kept Draft)
- **BRANCH**: `docs/portal-final-production-runbook-prep-01`
- **WORKTREE**: `C:\projects\saba-final-runbook-316-repin`
- **DATE**: 2026-08-10

---

## Resolved heads (dynamic)

| Ref | Expected | Observed | Match |
|---|---|---|---|
| Draft PR `#313` FINAL SOURCE RC | `2a283003957b4ea490959a10594a7eaf6a3e115d` | `2a283003957b4ea490959a10594a7eaf6a3e115d` | YES |
| PR `#310` B1 final head | `1bdd2fafd37515e18031ef79b4f62233ecb12e12` | `1bdd2fafd37515e18031ef79b4f62233ecb12e12` | YES |

```
FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
RC313_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d
```

---

## Final composition

`#293` + `#291` + `#299` + `#311` + `#312` + `#314` + `#315` + `#317` + `#310`

Integration facts verified from FINAL RC ancestry:

| Stream | In RC | Migrations added vs main |
|---|---|---|
| `#314` | YES | 0 (UX-only relative to release SQL catalog) |
| `#315` | YES | **0** |
| `#317` | YES | **0** |
| `#310` B1 | YES (inserted) | **0 insertion migrations** |

No invented migration entries.

---

## Authoritative release migration graph (15)

| # | Filename |
|---|---|
| 1 | `20260808010000_gp_student_level4_only_eligibility_guard_01.sql` |
| 2 | `20260808120000_councils_c0_write_surface_hardening_01.sql` |
| 3 | `20260808121000_councils_c1_meeting_state_machine_01.sql` |
| 4 | `20260808122000_councils_c2_topic_intake_review_01.sql` |
| 5 | `20260808130000_councils_c3_attendance_quorum_01.sql` |
| 6 | `20260808140000_councils_c4_session_voting_01.sql` |
| 7 | `20260808150000_councils_c5_minutes_lifecycle_01.sql` |
| 8 | `20260808160000_councils_c6_decisions_followup_01.sql` |
| 9 | `20260808170000_councils_c7_audit_archive_01.sql` |
| 10 | `20260808171000_councils_c0_c8_final_security_closure_01.sql` |
| 11 | `20260808180000_councils_c9_notifications_reporting_01.sql` |
| 12 | `20260808210000_ga_mvp_foundation_01.sql` |
| 13 | `20260808210100_ga_mvp_completion_01.sql` |
| 14 | `20260808210200_ga_authorization_04.sql` |
| 15 | `20260809183940_e3eff340-d709-46e7-911b-1728767e4f41.sql` |

Apply-One semantics preserved:

`ONE migration → verify → only then next`

Any failure or partial apply: **STOP**.

---

## Removed stale pins

Removed from the four runbook package docs:

- `B1_FINAL_SHA=PENDING`
- `FINAL_RC_SHA=PENDING`
- `B1 #310 PENDING`
- old RC head `e3db0cc330106518d5ab9ca6874d70d9e98b1411`

```
STALE_SHA_COUNT=0
PENDING_PIN_COUNT=0
```

---

## Files updated

- `docs/release/PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01.md`
- `docs/release/PORTAL-FINAL-OWNER-GATE-BOARD-01.md`
- `docs/release/PORTAL-FINAL-READONLY-PREFLIGHT-PACKAGE-01.md`
- `docs/PORTAL-FINAL-PRODUCTION-RUNBOOK-PREP-01-REPORT.md`
- `tests/runbook/portal-final-production-runbook-prep-01.test.ts`
- `docs/reviews/PORTAL-PR316-FINAL-RC-EXACT-REPIN-AND-GO-LIVE-RUNBOOK-CLOSURE-04.md`

---

## Verification

| Check | Result |
|---|---|
| `bun test tests/runbook` | **PASS** (46/46) |
| `bun test tests/student-requests` | **PASS** (1066/1066) |
| `bunx tsc --noEmit` | **PASS** |
| `git diff --check` | **PASS** |
| `RUNBOOK_MIGRATION_COUNT` | `15` |
| `SOURCE_MIGRATION_COUNT` | `15` |
| `MISSING_FROM_RUNBOOK` | `0` |
| `EXTRA_IN_RUNBOOK` | `0` |

---

## Safety boundary

```
PRODUCTION_EXECUTION=NOT_PERFORMED
PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
PUBLISH=NO
MERGE=NO
```

Draft PR `#316` remains Draft. No merge to `main`.

---

## CI wait block

Resolved hard gates:

| Tip | Web CI | Migration Review |
|---|---|---|
| `01615703200d3d70c8b12195052d612186a37447` (exact-repin) | [PASS](https://github.com/msorori-mh/saba-uni-portal/actions/runs/31337435126) | [PASS](https://github.com/msorori-mh/saba-uni-portal/actions/runs/31337435129) |
| `41ab1233079eafff5fb5fa5523404bd6d2f45dd7` (CI evidence docs) | [PASS](https://github.com/msorori-mh/saba-uni-portal/actions/runs/31337823093) | [PASS](https://github.com/msorori-mh/saba-uni-portal/actions/runs/31337823097) |

```
WEB_CI=PASS
MIGRATION_REVIEW=PASS
CHECKS_PASS_COUNT=22
PR316_IS_DRAFT=YES
PR316_HEAD=41ab1233079eafff5fb5fa5523404bd6d2f45dd7
MERGE=NO
```

---

## Final token

`PASS_PORTAL_PR316_FINAL_RC_EXACT_REPIN_AND_GO_LIVE_RUNBOOK_CLOSURE_04`
