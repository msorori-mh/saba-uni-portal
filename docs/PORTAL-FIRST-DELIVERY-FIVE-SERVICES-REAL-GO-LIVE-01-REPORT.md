# PORTAL-FIRST-DELIVERY-FIVE-SERVICES-REAL-GO-LIVE-01

## Decision

**PASS_REAL_GO_LIVE_SOURCE_PR_READY**

```
NO_PRODUCTION_WRITE
SOURCE_ONLY
NO_STUDENT_VISIBLE_MUTATION_IN_THIS_PR
NO_DEPLOY
```

## Scope

Complete the five-service B1 path from student card → draft/submit → staff `act_on` → real academic effect, by extending existing B1 surfaces only.

Services:

1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

Protected: `enrollment_certificate` — regression = NONE (no mutation in this track).

## Reused UI surfaces

| Surface | Role |
|---|---|
| `B1StudentRequestForm` | restore open draft/returned, autosave (~1s), STALE reload, submit → success |
| `B1SuccessState` | request number then route to B1 view |
| `B1StudentRequestDetail` | summary + attachments + messages + steps + resume |
| `B1AttachmentUploader` | progress / retry / 5MB contract |
| `B1EmployeeActionPanel` / `B1StaffWorkspace` | step-accurate Arabic labels; attachment download via existing adapter |
| `student.requests.index` / `student.requests.new` | B1 list/detail routes; legacy new-request redirect for five codes |

## Runtime activation (source)

- `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE = true`
- Cleared TS `activationBlockedReason` for `excused_absence`, `department_transfer`, `final_chance`
- Card visibility still gated by DB `studentVisible` (existing main migration out of scope; no new mutation here)

## Academic effects matrix

| Service | Terminal step | Marker | Effect |
|---|---|---|---|
| enrollment_suspension | registrar_apply / apply_decision | effect_applied_at | academic status suspended + period |
| excused_absence | record_apply / apply_decision | record_applied_at | excused ledger row |
| department_transfer | registrar_apply / apply_decision | effect_applied_at | dept/program swap + audit |
| final_chance | registrar_apply / apply_decision | chance_applied_at | student_extra_chances unique scope |
| file_withdrawal | registrar_apply after clearances | effect_applied_at | withdrawn + records_transferred_at |

Legacy `approved` triggers left untouched; B1 completes as `completed` and applies effects via SEQ27 `act_on` integration.

## Migrations (source-promoted, NOT applied to Production)

| Order | Draft | Migration | draft_sha_lf | migration_sha_lf |
|---|---|---|---|---|
| 25 | `B1-ACADEMIC-EFFECT-MARKERS-01.sql` | `20260727120000_b1_25_academic_effect_markers_01.sql` | `fc42a2c6cf8e26a7565494c5eea00c6f72323f9dd66db792abd6cced3b7f57f4` | `0184c9483a39ac8a274a7f65ae0394211245a3ba27b98c401d9f65b48b908109` |
| 26 | `B1-ACADEMIC-EFFECT-FUNCTIONS-01.sql` | `20260727120100_b1_26_academic_effect_functions_01.sql` | `73f7531245705b7c5fb7bbd9e56c3525cf666e02bff8eb914b44e373dd509668` | `d8a49c23d95118766360dfdf33153e69bdcfb40f8541c72f98db15adb63a71d7` |
| 27 | `B1-ACT-ON-ACADEMIC-EFFECT-INTEGRATION-01.sql` | `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` | `0b29034dd3d30d4e2e54516d09b53be87ec58a175a9b187db7203853f28b0937` | `7a8f46fdc9c1a12da3d5f864099ddff947b58fdcde1bbffae9637d6af45a598d` |

Companion preflight/post-verifiers under `docs/migration-drafts/b1-backend-verifiers/25-*` … `27-*`.
`PROMOTION-MAP.json` and `B1-SEQUENTIAL-APPLY-MANIFEST.json` updated through sequence 27.
Non-migration activation remains **gate 25** (after sequence 27 verifies green).

## Tests and harnesses

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test tests/student-requests` | PASS |
| `bun test` (full) | PASS (1893) |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `tests/b1-academic-effects/run-harness.ps1` | PASS_B1_ACADEMIC_EFFECT_MARKERS_HARNESS |
| Browser CDP smoke `tests/student-requests/b1-real-app-browser-smoke/run.ts` | PASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE |
| Source contract | `tests/student-requests/b1-academic-effects-go-live-01.test.ts` |

## Assumptions

- Production apply of SEQ25–27 is a separate human-approved gate.
- Local/TEST_ONLY harnesses may seed `student_visible` without shipping a new visibility mutation.
- Full positive/negative academic-effect actor matrix on disposable PG remains a FOLLOW-UP CI leg beyond the markers harness + source contracts.

## Risks

- Naming collision: non-migration **activation gate 25** vs migration **sequence_order 25** (academic markers). Documented in manifest `activation_gate`.
- Effect functions require `b1.atomic_action=1` and direct-assignee authorization; wrong-step / non-assignee must fail closed.
- Cloud attachment runtime still depends on deployed secure-attachment edge path; source flag is on, deploy is separate.

## Blockers

None for source PR readiness.

## Production impact

- **None written.** No Deploy/Publish, no Production catalog apply, no types regeneration from Production, no `student_visible` change in this PR.
- After approved apply of SEQ25–27, terminal `apply_decision` on the five services will write academic effects idempotently.

## Files modified (summary)

- Student/staff B1 UI + routes
- Secure attachments / adapter readiness
- SEQ25–27 drafts, migrations, verifiers, promotion map, apply manifest, apply-order pins
- Tests + academic-effects markers harness + this report
