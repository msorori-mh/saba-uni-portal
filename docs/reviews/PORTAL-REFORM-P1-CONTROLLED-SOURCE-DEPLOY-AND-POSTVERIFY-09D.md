# PORTAL_REFORM_P1_CONTROLLED_SOURCE_DEPLOY_AND_POSTVERIFY_09D

MODE: deploy-only mission. No source edits, no migrations, no DB writes performed.

## G0 — Pre-deploy identity gate — PASS
- `git rev-parse HEAD` = `72546eab9855f94647d84d52c8caaa02f281f8f7` (matches authorized head)
- Working tree clean (`git status --porcelain` empty)
- `STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE = true`
- `P1_ATOMIC_SUBMIT_SERVICES` = exactly october_exam_entry_form, replacement_student_card, grade_appeal
- Normal path sends `testRunId: null` (→ `p_test_run_id = null`)
- Generic fallback for P1: zero (`P1_ATOMIC_SUBMIT_REQUIRED` fail-closed at line 692)
- Resubmit: `P1_RESUBMIT_NOT_SUPPORTED` fail-closed
- `department_transfer` E2E = PENDING
- 09C closure suite re-run read-only: 16/16 PASS

## G1 — Pre-deploy production snapshot (read-only) — CAPTURED
- Live build SHA (`/version.json` and `<meta name="build-sha">`): `3e47c1c65235f70198a507feb33b825814ab64af`
- student_visible: october_exam_entry_form=false, replacement_student_card=false, grade_appeal=false
- total student_requests = 75; P1 requests = 3
- latest migration version = 20260817002903
- The three TEST_ONLY requests remain `completed` (3/3)

## G2 — Controlled deploy — NOT EXECUTED (blocker)
Deploy was deliberately not executed because the resulting live build would
self-report a SHA other than the authorized head, which G3 defines as a HOLD.

### Exact blocker
`vite.config.ts:resolveBuildSha()` resolves the build stamp in this order:
`VITE_BUILD_SHA` / `GITHUB_SHA` / `CF_PAGES_COMMIT_SHA` → `git rev-parse HEAD`
→ `build-sha.generated.json` → sentinel.

The publish build sandbox has no `.git` directory and no SHA env var, so the
stamp is read from the committed fallback file `build-sha.generated.json`,
which still holds the previous release stamp
`3e47c1c65235f70198a507feb33b825814ab64af`.

Consequence: publishing head `72546eab…` would ship the correct P1 code but
would serve `LIVE_SOURCE_SHA = 3e47c1c6…` at `/version.json` and in the
`build-sha` meta tag → G3 identity check fails.

Resolving this requires updating the release stamp file, which is (a) a source
edit — denied by this mission — and (b) self-referential: committing the stamp
creates a new commit SHA that is no longer the authorized head
`72546eab…`. A new authorization for the resulting stamped commit is required.

## G3–G7 — NOT EXECUTED
Blocked by G2; no live build to verify.

## G8 — Database non-mutation postverify — PASS
- october_exam_entry_form.student_visible = false
- replacement_student_card.student_visible = false
- grade_appeal.student_visible = false
- STUDENT_VISIBLE_ROWS_CHANGED = 0
- NEW_REQUESTS_CREATED = 0
- REAL_STUDENT_DATA_CHANGED = 0
- MIGRATIONS_APPLIED = 0
- SR-20260816-14A2339B / SR-20260816-F01018CE / SR-20260816-E852B4E3: unchanged, completed

## G9 — Regression — PASS (source level, production untouched)
Production still serves the previously verified build `3e47c1c6…`; no behaviour
changed. Source-side regression suite for the release candidate passes 16/16.
`department_transfer` unchanged (E2E PENDING). GPA_ACTIVE = 0.

## G10 — Result
```
AUTHORIZED_SOURCE_SHA=72546eab9855f94647d84d52c8caaa02f281f8f7
DEPLOYED_SOURCE_SHA=NONE (deploy not executed)
PREVIOUS_LIVE_SOURCE_SHA=3e47c1c65235f70198a507feb33b825814ab64af
LIVE_SOURCE_SHA=3e47c1c65235f70198a507feb33b825814ab64af
AUTHORIZED_HEAD_MATCH=PASS
SOURCE_RELEASE_GATE=PASS
DEPLOY=BLOCKED
P1_ATOMIC_LIVE_CALL_PATH=NOT_EVALUATED
P1_GENERIC_FALLBACK_LIVE=NOT_EVALUATED
LIVE_P1_FORMS_SOURCE_READY=NOT_EVALUATED
LIVE_P1_SOURCE_READINESS=NOT_EVALUATED
DEPARTMENT_TRANSFER_UNCHANGED=PASS
LIVE_RUNTIME_SMOKE=NOT_EVALUATED
OCTOBER_STUDENT_VISIBLE=false
REPLACEMENT_CARD_STUDENT_VISIBLE=false
FINAL_RESULT_APPEAL_STUDENT_VISIBLE=false
STUDENT_VISIBLE_ROWS_CHANGED=0
NEW_REQUESTS_CREATED=0
REAL_STUDENT_DATA_CHANGED=0
MIGRATIONS_APPLIED=0
EXISTING_SERVICES_REGRESSION=PASS
B1_REGRESSION=PASS
GPA_ACTIVE=0
P2_STARTED=0
```

FINAL:
HOLD_PORTAL_REFORM_P1_CONTROLLED_SOURCE_DEPLOY_AND_POSTVERIFY_09D_RELEASE_STAMP_FILE_STILL_3E47C1C6_LIVE_SHA_CANNOT_EQUAL_AUTHORIZED_HEAD_WITHOUT_A_SOURCE_EDIT

## Minimal unblock path (requires new authorization)
1. Authorize a single source edit: set `build-sha.generated.json.sha` to the
   commit SHA of the stamping commit itself, or
2. Authorize deploying the commit produced by that stamp update as the new
   AUTHORIZED_SOURCE_HEAD, then re-run G2–G7 unchanged.
