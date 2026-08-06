# GRADUATION-PROJECTS-MVP-PACKAGE-B-01-REPORT

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_B_RUNTIME_ADAPTER_IMPLEMENTATION_01`  
**Branch:** `feat/gp-mvp-package-b-01`  
**Frozen contract SHA:** `7b67539aeb21bd223287de39d480cb1e6c0332b0`  
**Sole authority:** `docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md`  
**Decision:** `PASS_GRADUATION_PROJECTS_MVP_PACKAGE_B_RUNTIME_READY`

---

## Summary

Package B implements the Graduation Projects MVP runtime adapter against the frozen contract: canonical `lifecycle_state` + separate `final_decision`, leader/member and supervisor pending/accepted distinction, structured proposal/file DTOs, frozen RPC inventory, correlation/version handling, Arabic error families (authorization not swallowed), query keys, mutation invalidation, service orchestration, and Package C hooks.

Stale `PACKAGE_B_EXECUTION_HANDOFF_READY` / draft dean-head conclude-archive / `completed`·`corrections_required` result vocabulary are **not** used where they conflict with the freeze.

---

## Files modified

### Runtime (`src/lib/graduation-projects/**`)

| File | Role |
|---|---|
| `domain.ts` | Canonical lifecycle, `final_decision`, actor kinds, fail-closed authz, transitions, defense readiness |
| `lifecycle.ts` | DTOs (team/proposal/supervision/progress/final/defense/evaluations/result/archive/files), labels, UX action mirror, evaluation visibility filters, queue filters |
| `rpc.ts` | Frozen RPC client + upload finalize/signed-download adapters + Package A signature dependency table |
| `errors.ts` | Arabic error families; authorization denials preserved |
| `correlation.ts` | Correlation-ID generation + retry reuse store |
| `query-keys.ts` | my projects, detail, faculty, coordinator queues, defense, administration overview |
| `invalidation.ts` | Mutation → cache invalidation rules |
| `service.ts` | Orchestration, stale-version refresh hook, file begin/finalize/download |
| `hooks.ts` | React Query hooks for Package C |
| `index.ts` | Public barrel export |

### Tests

| File | Role |
|---|---|
| `tests/graduation-projects/graduation-projects-foundation.test.ts` | Domain freeze matrix |
| `tests/graduation-projects/graduation-projects-lifecycle.test.ts` | Actions, visibility, queues |
| `tests/graduation-projects/graduation-projects-runtime-adapter.test.ts` | Adapter/service/error/correlation/invalidation |
| `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts` | Client assertion retargeted to frozen inventory (SQL draft assertions unchanged) |

### Docs

| File | Role |
|---|---|
| `docs/GRADUATION-PROJECTS-MVP-PACKAGE-B-01-REPORT.md` | This report |

### Not edited (per ownership)

- SQL / migrations / `docs/migration-drafts/**`
- `src/components/graduation-projects/**`
- routes / navigation
- production data / generated live types
- Package D fixtures / E2E

---

## Mandatory corrections implemented

1. **Leader / member** — `isLeader` on student authority; leader-only write transitions; members read-only in action mirror.
2. **Supervisor pending / accepted / declined** — `supervisionStatus`; pending may only respond; accepted may review progress/final.
3. **Structured proposal + attachment** — `ProposalDto` fields title/problem/objectives/summary + proposal file category registration.
4. **Private progress/final attachment adapters** — `register` → `finalize` → `create_graduation_project_signed_download`; bucket `graduation-projects-files`.
5. **`final_decision`** — `passed` \| `revisions_required` \| `failed` separate from `lifecycle_state`.
6. **Coordinator sole operational actor** — review, supervisor assign, defense schedule, committee, conclude, archive.
7. **No dean/head/admin/registrar bypass** — titles resolve to `unrelated` / zero operational actions.

---

## Package A signature dependencies

Exact RPC argument contracts expected from Package A are documented in:

`src/lib/graduation-projects/rpc.ts` → `PACKAGE_A_SIGNATURE_DEPENDENCIES`

Notable freeze names (not draft aliases):

- `create_graduation_project_team` (not draft `create_graduation_project`)
- `schedule_graduation_project_defense` (not `schedule_graduation_project_discussion`)
- `assign_graduation_project_committee_member`
- `conclude_graduation_project_result` with `p_final_decision`
- `list_administration_graduation_projects_overview` (not department report RPCs as operational bypass)
- `respond_graduation_project_supervision` with `accept` \| `decline`

Handwritten DTOs remain until generated Supabase types are refreshed after Package A apply.

Legacy draft UI method shims (`createProject`, `scheduleDiscussion`, `saveEvaluation`, …) map into frozen RPCs or fail closed — they do not reintroduce dean/head powers.

---

## Tests and results

| Check | Result |
|---|---|
| `bun test tests/graduation-projects` | **58 pass / 0 fail** |
| `bunx tsc --noEmit` | **pass** |
| `git diff --check` | **pass** |
| `bun test tests/student-requests` | **1064 pass / 1 fail** — pre-existing `b1-five-services-terminal-visibility-34` (`student_visible` polarity). Unrelated to GP Package B; AGENTS.md forbids changing `request_types.student_visible`. |

Covered Package B suites:

- adapter argument/return contract
- service orchestration + stale-version refresh
- error mapping (auth not swallowed)
- correlation retry reuse
- query invalidation
- visibility/filtering (no cross-member evaluation leakage)

---

## Assumptions

1. Package A will expose the frozen RPC names/parameters listed in `PACKAGE_A_SIGNATURE_DEPENDENCIES` (development may be concurrent; merge order remains A → B).
2. Unrouted draft components may still import legacy action/outcome names; Package B maps them to freeze vocabulary at the RPC boundary.
3. Administration overview authorization is enforced server-side; client only calls the frozen read RPC.
4. Binary storage upload bytes remain caller-driven after register intent; adapter never persists public URLs.

---

## Risks

1. Until Package A applies freeze SQL, live RPC calls return unavailable → Arabic “service updating” (by design).
2. Unrouted components still show draft copy (`completed` / dean panels); Package C must rewire to freeze UX — runtime already denies title bypass.
3. Detail payload shape may gain/lose keys when Package A finalizes jsonb; handwritten DTOs are intentionally permissive.

---

## Blockers

None for Package B source delivery. Runtime execution remains blocked on separately authorized Package A schema/storage apply (expected).

---

## Production impact

**None.** Source-only adapter/types/tests/docs. No migrations, no deploy, no production data, no storage apply.

---

## Decision

**PASS_GRADUATION_PROJECTS_MVP_PACKAGE_B_RUNTIME_READY**
