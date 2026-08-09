# PORTAL-RC313-PR314-SEMANTIC-INTEGRATION-REMEDIATION-LONGRUN-03

## Decision

**PASS** â€” PR #314 UX is integrated into Draft PR #313 without regressing RC313/#311 contracts.

## Codex findings closed

### HIGH_ROOT_CAUSE
Naive conflict resolution that kept the #314 `faculty-portal.academic-councils.tsx` orchestrator dropped #311/#313 consumers: topic review (`reviewCouncilTopic` / `getCouncilTopicReviewQueue`), edit/resubmit (`editCouncilTopic` / `resubmitCouncilTopic`), open-intake submit (`getOpenIntakeMeetingsForMember` + `meeting_id`), C9 governance/role dashboards, notification bell, and the reports discovery link.

### MEDIUM_ROOT_CAUSE
#314 and #313 both claimed the operational top-of-page composition. Stacking both wholesale would duplicate schedule/agenda/topic/work panels; choosing either side alone deleted the other streamâ€™s capabilities.

## Remediation composition (single spine)

1. **#314 operational hierarchy** â€” summary â†’ action required â†’ current councils â†’ next meeting â†’ Meetings/Topics/Archive tabs â†’ schedule/agenda/submit progressive dialogs.
2. **#311/#313 contracts retained inside that spine** â€” reports link + `CouncilNotificationBell`; role workspaces; `CouncilTopicReviewQueue` for chair/secretary; topic edit/resubmit on cards; submit dialog bound to open intake meetings (`meeting_id`); live session/governance workspace.

## Tokens

```
OLD_RC_SHA=e3db0cc330106518d5ab9ca6874d70d9e98b1411
PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f
NEW_RC_SHA=acc3fc4655265a436c7bba6b2edb1017046e60d5
HIGH_ROOT_CAUSE=NAIVE_#314_ROUTE_ORCHESTRATOR_DROPPED_#311_CONSUMERS
MEDIUM_ROOT_CAUSE=DUPLICATE_OPERATIONAL_SECTION_COMPOSITION_UNRESOLVED
REPORTS_DISCOVERY_PRESERVED=YES
SERVER_CONTRACTS_PRESERVED=YES
AUTHORIZATION_PRESERVED=YES
PR314_UX_PRESERVED=YES
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
NO_DIRECT_TABLE_WRITE_ADDED=YES
B1_FINAL_SHA=PENDING
B1_PR310_SHA=PENDING
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
MERGE=NO
```

## Integrated streams

`#293,#291,#299,#311,#312,#314` â€” `FACULTY_COUNCILS_UX_PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f`

## Local verification

| Gate | Result |
|---|---|
| `bun test tests/academic-councils` | 79 pass / 0 fail (includes PG17 PostgREST matrix) |
| `bun test tests/faculty-portal` | 79 pass / 0 fail |
| `bun test tests/graduates-affairs` | 175 pass / 0 fail |
| `bun test tests/graduation-projects` | 119 pass / 0 fail |
| `bun test tests/student-requests` | 1066 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Route semantic hash | `0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef` unchanged |

## Regression tests added

`tests/academic-councils/pr314-rc313-semantic-integration-remediation-03.test.ts` proves:

1. Reports discovery + routeTree registration survive.
2. Every RC313 server-function consumer remains on the faculty surface.
3. PR314 operational hierarchy remains the composition spine.
4. Councils reporting remains reachable without routeTree re-pin masking.
5. Authorization matrix surface unchanged (no admin/dean bypass).
6. No direct table writes on the faculty councils UI surface.
7. C9 session/governance + role dashboards remain mounted.

## Files touched (semantic remediation)

- `src/routes/faculty-portal.academic-councils.tsx` â€” compose #314 UX + #311 surfaces
- `src/components/portal/councils/CouncilTopicReviewQueue.tsx` â€” restored review queue
- `src/components/portal/councils/CouncilTopicCard.tsx` â€” edit/resubmit consumers
- `src/components/portal/councils/SubmitCouncilTopicDialog.tsx` â€” `getOpenIntakeMeetingsForMember` + `meeting_id`
- `src/components/portal/councils/CouncilTopicsWorkspace.tsx` â€” pass userId/onUpdated
- `src/components/portal/councils/shared.tsx` â€” review/edit Arabic error maps
- `src/components/portal/councils/index.ts` â€” export review queue
- `tests/academic-councils/pr314-rc313-semantic-integration-remediation-03.test.ts`
- `tests/academic-councils/faculty-operational-dashboard-ux-01.test.ts` â€” intake contract asserts
- `docs/release/PORTAL-FINAL-RC-V4-INTEGRATION-MANIFEST.md`

## Assumptions / risks / blockers / production impact

- Assumption: Draft PR #313 tip at LONGRUN-03 start for OLD_RC_SHA is `e3db0cc` (pre-#314 mechanical merge).
- Residual risk: UI gating still relies on membership role filters; server RPCs remain the authority boundary (unchanged).
- Blockers: none for source integration; CI must stay green on Web CI + Migration Review.
- Production impact: **none** â€” SOURCE-ONLY; no migrations applied; no deploy; no merge to main.

## FINAL TOKEN

`PASS_PORTAL_RC313_PR314_SEMANTIC_INTEGRATION_REMEDIATION_LONGRUN_03`
