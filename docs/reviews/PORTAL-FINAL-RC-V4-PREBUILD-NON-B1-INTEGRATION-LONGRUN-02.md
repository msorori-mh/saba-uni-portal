# PORTAL-FINAL-RC-V4-PREBUILD-NON-B1-INTEGRATION-LONGRUN-02

## Mission

`PORTAL-RC313-INTEGRATE-PR314-FACULTY-COUNCILS-UX-LONGRUN-02`

Integrate green Faculty Academic Councils operational UX PR **#314** into
already-green non-B1 Draft RC PR **#313**, preserving prior streams.

## Verdict

**PASS**

`PASS_PORTAL_RC313_PR314_INTEGRATION_LONGRUN_02`

---

## Return block

```
OLD_RC_SHA=e3db0cc330106518d5ab9ca6874d70d9e98b1411
PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f
NEW_RC_SHA=<post-commit tip>

INTEGRATED_PRS=#293,#291,#299,#311,#312,#314

MERGE_CONFLICTS=1 mechanical (faculty-portal.academic-councils.tsx → #314 orchestrator base)
SEMANTIC_CONFLICTS=1 resolved (#311 C9 role/session/governance + topic review consumers re-wired into #314 IA)
MIGRATION_COLLISIONS=NONE

GP_TESTS=PASS (119 pass / 0 fail)
GA_TESTS=PASS (175 pass / 0 fail)
COUNCILS_TESTS=PASS (72 pass / 0 fail; + remediation-03 source contracts)
FACULTY_TESTS=PASS (79 pass / 0 fail)
SR_TESTS=PASS (1066 pass / 0 fail)
FULL_SUITE=PASS (2812 pass / 0 fail)
TSC=PASS
BUILD=PASS
DIFF_CHECK=PASS

WEB_CI=<pending push>
MIGRATION_REVIEW=<pending push>

B1_FINAL_SHA=PENDING

PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
MERGE=NO
```

---

## A — Head verification (runtime via `gh`)

| Ref | SHA | CI |
|---|---|---|
| PR #313 head (start) | `e3db0cc330106518d5ab9ca6874d70d9e98b1411` | green |
| PR #314 head | `faaf96533a6a4b54aed3d453309cfb5779c79e6f` | green |
| `origin/main` | `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f` | n/a |

Stop rule: #314 was not red → proceed.

---

## B — Integration

Branch: `rc/portal-final-v4-prebuild-non-b1-01`

- Non-fast-forward merge of `origin/feat/councils-faculty-operational-ui-01`
  (`faaf965`) → merge commit `954ba665`.
- Follow-up coherence commit restores #311 consumers into #314 IA.

### MERGE_CONFLICTS

| File | Class | Resolution |
|---|---|---|
| `src/routes/faculty-portal.academic-councils.tsx` | mechanical + semantic | Base: #314 slim orchestrator. Follow-up: re-attach #311 C9 surfaces (notification bell, reports link, chair/secretary/member/responsible workspaces, session/governance) and topic review / edit / resubmit consumers without reverting #314 operational IA. |

**No** weakening of backend/server authorization. UI continues to call the same server functions; no direct `academic_council*` table mutations added.

---

## C — Faculty UX coherence

### Faculty home (#312 retained)

- daily summary, schedule, grades, processing, councils card, announcements, academic profile
- councils card → `/faculty-portal/academic-councils`

### Academic Councils page (#314 + #311 surfaces)

- operational summary, action required, current councils, next meeting
- Meetings / Topics / Archive + progressive dialogs
- C9 role dashboards + live session/governance
- topic review queue (chair/secretary) + topic edit/resubmit

---

## D — #314 security contract

| Contract | Status |
|---|---|
| CURRENT_COUNCILS_PRIORITY | YES |
| NEXT_MEETING_PRIORITY | YES |
| ACTION_REQUIRED | YES |
| MEETINGS_CONSOLIDATED | YES |
| SCHEDULE_PROGRESSIVE_DISCLOSURE | YES |
| AGENDA_PROGRESSIVE_DISCLOSURE | YES |
| TOPICS_CONSOLIDATED | YES |
| SUBMIT_TOPIC_PROGRESSIVE_DISCLOSURE | YES |
| ARCHIVE_TAB | YES |
| AUTHORIZATION_PRESERVED | YES |
| SERVER_FUNCTION_CONTRACTS_PRESERVED | YES |
| NO_DIRECT_TABLE_WRITE_ADDED | YES |

Proved by `faculty-operational-dashboard-ux-01` + `pr314-rc313-semantic-integration-remediation-03`.

---

## E — Route tree / semantic hash

#314 does **not** modify `src/routeTree.gen.ts`.

`ROUTE_SEMANTIC_SHA256=0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef`

Pin retained after verified recomputation. Councils + reports paths remain present.

---

## F — Manifest

Updated `docs/release/PORTAL-FINAL-RC-V4-INTEGRATION-MANIFEST.md`:

- `FACULTY_COUNCILS_UX_PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f`
- Integrated: #293, #291, #299, #311, #312, #314
- `B1_PR310_SHA=PENDING`
- Order step 9 = integrate(#314)

---

## G — RC SHA vocabulary (unambiguous)

| Label | SHA | Meaning |
|---|---|---|
| `RC_IMPLEMENTATION_SHA` | `0fc1d7b9384be7d0b00fd8d2feb41a00d2a12938` | LONGRUN-01 integration tip before docs-only follow-up |
| `RC_PREVIOUS_HEAD_SHA` | `e3db0cc330106518d5ab9ca6874d70d9e98b1411` | Draft PR #313 tip at LONGRUN-02 start |
| `RC_CURRENT_HEAD_SHA` | `<post-commit tip>` | Tip after #314 merge + coherence + docs |

Do not describe multiple tips simply as `RC_SHA`.

---

## H — Local tests

```
bun install --frozen-lockfile          # PASS
bun test tests/academic-councils       # 72 pass / 0 fail
bun test tests/faculty-portal          # 79 pass / 0 fail
bun test tests/graduation-projects     # 119 pass / 0 fail
bun test tests/graduates-affairs       # 175 pass / 0 fail
bun test tests/student-requests        # 1066 pass / 0 fail
bunx tsc --noEmit                      # PASS
bun run build                          # PASS
git diff --check                       # PASS
bun test tests                         # 2812 pass / 0 fail
```

D02 outside-git operator artifact: present locally this run (PASS). In CI it follows skip semantics when absent — not a product regression.

---

## I — Commit / push / CI

- Same branch: `rc/portal-final-v4-prebuild-non-b1-01`
- Same Draft PR: #313
- Await Migration Review + Web CI green

---

## Assumptions

- #314 was based on main tip without #311 UI wiring; RC must retain #311 surfaces.
- Storage upload via signed prep + `supabase.storage.from` is not a table mutation.

## Risks

- Combined #312 + #314 + #311 surfaces increase councils page density; IA order locked by contract tests.
- B1 `#310` still PENDING.

## Production impact

None. Source-only. No production reads/writes. No deploy. No merge to main.

## Decision

**PASS**
