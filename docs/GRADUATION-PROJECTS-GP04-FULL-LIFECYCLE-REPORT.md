# GRADUATION-PROJECTS — GP-04 FULL LIFECYCLE REPORT

- Phase: GP-04
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `2508f03dce0d9bfa6551f11143e496de135999de` (GP-03 commit)
- Migrations created: 0 — Migrations applied: 0 — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP04_FULL_LIFECYCLE_COMPLETE`

---

## 1. What was done

The lifecycle is now executable end-to-end through the portal UI + server
functions, not only via SQL. GP-03 wired 18 operations; GP-04 closed the
remaining six operations that made the 30-step journey unreachable from the UI:

| Step(s) | Addition |
|---|---|
| 2–3 team formation | `addGraduationProjectTeamMember` server fn + team picker in the new `AssignmentsPanel` |
| 7 supervisor/co-supervisor assignment | `assignGraduationProjectFaculty` (literal role enum) + faculty picker |
| assignment management | `endGraduationProjectAssignment` + per-row end action |
| 11 milestone plan | `setGraduationProjectMilestone` + form in `MilestonesPanel` (weight cap Σ≤100, unique sequence, kind literal) |
| 23 evaluation finalization | `finalizeGraduationProjectEvaluation` + gated button in `EvaluationPanel` (own submitted evaluation only) |
| 30 archival | `archiveGraduationProject` + clean-final-file selector in `ResultCorrectionsArchivePanel` |

Supporting changes:

- `listGraduationProjectAssignmentCandidates` — department picker data gated by
  the authorized project-detail RPC (no assignment ⇒ no candidates).
- **Server-side user-id derivation**: team/faculty assignment schemas accept
  profile ids only; the server resolves `user_id` from
  `student_profiles`/`faculty_profiles`. Clients never send actor user ids and
  components never render them (the portal privacy regression rule passes).
- `lifecycle.ts` action matrix extended with `add_team_member`, `set_milestone`,
  `finalize_evaluation` mirroring the SQL whitelists exactly (incl.
  `department_head` excluded from `set_milestone`; `co_supervisor` read-only).
- New tab «الفريق والتعيينات» in the workspace; all six handlers flow through
  the same mutation bus (single-flight busy state, Arabic error surface,
  auto-refresh).

## 2. Contract decisions (documented)

1. **Team invitations**: the existing contract is direct add by
   coordinator/department_head; no invite/accept contract exists, so GP-04 step
   3 («عند وجود هذا العقد») is satisfied by the direct-add path. Not extended.
2. **Final-manuscript lock**: enforced indirectly — archival requires a
   clean-scanned, accepted final-milestone file and zero unaccepted corrections
   (SQL). No separate lock object added.
3. **Weighted result**: criterion `maximum_score` already normalizes weights
   inside each evaluation; cross-criterion/rubric weighting policy stays a
   settings input owned by GP-06 rubric tables. `computeEvaluationTotal`
   unchanged (plain sum of awarded scores, mirroring the RPC).
4. No generic "approve" button exists anywhere: every UI control sends one
   literal action matching its RPC contract.

## 3. Test results

| Suite | Result |
|---|---|
| `bun test tests/graduation-projects` | 117 pass / 0 fail (992 expects; +13 new) |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success |
| `bun test` (full) | 1 pre-existing environmental fail (G4 wrangler spike), rest pass |
| `git diff --check` | clean |

New suite: `graduation-projects-lifecycle-completion-ui.test.ts` (action matrix
gates, server-fn presence + schema privacy, wiring/privacy assertions).
Updated: lifecycle matrix + portal integration + visual QA expectations for the
extended (but SQL-mirror) action surface.

## 4. Files changed

- `src/lib/graduation-projects/lifecycle.ts` (actions, labels, candidate types)
- `src/lib/graduation-projects/portal.functions.ts` (7 server functions)
- `src/components/graduation-projects/AssignmentsPanel.tsx` (new)
- `src/components/graduation-projects/GraduationProjectWorkspace.tsx`,
  `GraduationProjectPortalWorkspace.tsx`, `MilestonesPanel.tsx`,
  `EvaluationPanel.tsx`, `ResultCorrectionsArchivePanel.tsx`
- `tests/graduation-projects/graduation-projects-lifecycle-completion-ui.test.ts` (new)
- `tests/graduation-projects/graduation-projects-lifecycle.test.ts`,
  `-portal-integration-01.test.ts`, `-visual-ux-qa-01.test.ts` (expectation updates)

## 5. Assumptions / risks / blockers

- Idempotency/double-submit protection remains the RPC correlation-id contract;
  the UI additionally disables controls while a mutation is in flight.
- No B1 files touched; no shared files beyond GP scope modified.
- Blockers: none.
