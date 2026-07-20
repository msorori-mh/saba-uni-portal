# DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01

## Decision

`PASS_ACADEMIC_CLEARANCE_FOUNDATION_SOURCE_READY`

Source, SQL draft, UI component and tests only. No SQL was applied and no production, migration, workflow, visibility, deployment or data operation occurred.

## Delivered

- Versioned clearance cases subordinate to one `department_transfer` request, with official source-course and target-plan snapshots, equivalency decisions, accepted/remaining credits, proposed level, approvals, minutes and append-only audit.
- Composite same-case foreign keys, one decision per source course, one credit-bearing mapping per target course, source/target credit caps, approved transcript binding and exact target-plan binding.
- Exact active target-department head authorization through canonical `request_processing_units`, `request_processing_roles` and direct `request_processing_assignments.user_id`; duplicate assignments fail closed.
- Academic-affairs review remains fail-closed. `academic_clearance_authority_config` is empty and has no client write path. Academic owners must approve existing canonical unit/role codes and the official passed-result status; this source does not invent them.
- `apply_transfer_on_approval` is replaced forward-only in the draft and calls `assert_department_transfer_clearance_approved` before changing the student profile. The already-applied migration is untouched.
- Approval requires complete source-course comparison and zero unresolved decisions, recomputes totals without clamping invalid over-credit, and derives the proposed level from the first unfulfilled required target-plan course.
- Approved evidence is immutable. `correct_academic_clearance` supersedes the approved case and creates a linked replacement with rationale and audit provenance.
- Chair UI supports target-course selection, decision, accepted hours with source/target maximum, and rationale editing.
- Reports include completed/overdue cases and accepted, partial and rejected outcomes; rejected rows remain visible without a target course.

## Remediated review findings

All initial `HIGH=5 / MEDIUM=4` findings were addressed: canonical schema names, unapproved mapping, dormant transfer guard, cross-case/provenance integrity, over-credit/duplicate target, immutable correction, exact direct assignee, comparison coverage, proposed level, usable UI, rejected outcome reporting and executable security/integrity tests.

The first re-review found three additional HIGH and two MEDIUM findings. They were remediated by unique source-course credit, chair save/submit RPCs bound to the active workflow step's `assigned_user_id`, expanded RLS/RPC negative and positive execution, an explicit aggregate plan cap, and documented `proposed_level_id=NULL` semantics (all required target courses fulfilled). UTF-8 source inspection confirms the Arabic UI strings are not mojibake.

## Verification

- Isolated PostgreSQL 17 compile and executable positive/negative verifier: PASS.
- Verifier covers fail-closed missing mapping, wrong actor denial, final-transfer denial before approval, credit cap, approved reviewer path, immutable evidence, correction provenance and RLS/ACL default deny.
- Targeted Bun tests: PASS, 11 tests / 63 assertions.
- `tsc --noEmit`: PASS.
- `bun run build`: PASS.
- `git diff --check`: PASS.
- Independent re-review requires `CRITICAL=0 / HIGH=0 / MEDIUM=0`.

## Assumptions and decisions needed

- Required decision: approve exact existing `request_processing_units.code`, `request_processing_roles.code`, and official course-result status for academic-affairs review. Until configured through separately authorized SQL, review and source-course ingestion deny access.
- No pass/fail academic mapping, level mapping, employee identity or course equivalency was invented.
- The draft must receive a separate migration promotion/review/apply authorization.

## Risks and production impact

- Runtime remains unavailable until the authority/result config decision and a separately approved migration.
- Source snapshots depend on stable official transcript/result provenance and are intentionally rejected without it.
- Production impact: zero.
