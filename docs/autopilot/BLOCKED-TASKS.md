# Blocked and Approval-Gated Tasks

| task_id | status | blocker | safe next action | production_impact |
|---|---|---|---|---|
| B1-ACL-CUTOVER-DRAFT-06 | BLOCKED | Independent review HIGH=2: incomplete five-boundary proof and no trustworthy deployed atomic-caller release evidence | retain isolated worktree; revise only after release evidence exists | none |
| B1-PRODUCTION-MIGRATION-SEQUENCE | REQUIRES_USER_APPROVAL | identities, storage, free workflows, release evidence, cutover review, exact single-migration dry run, and explicit approval | continue source/tests/docs and preflight preparation | would write production if approved |
| B1-STUDENT-VISIBILITY-ACTIVATION | REQUIRES_USER_APPROVAL | separate per-service approval and post-migration verification | keep unchanged | would change production visibility |
| PORTAL-DEPLOY-PUBLISH | REQUIRES_USER_APPROVAL | explicit deploy/publish authorization and release evidence | prepare source/release manifest only | would change deployed runtime |
| COHORT-INTEGRATED-RELEASE | BLOCKED | resolver and security source work is merged, but migration drafts remain unapplied, feature flags remain inactive, production enrollment/import readiness is unverified, and PR #155's read-model architecture remains on HOLD | resolve PR #155 independently; verify production data readiness; retain unapplied drafts and inactive flags until separate migration/release authorization | none until separately authorized release |
| FLUTTER-CONSUMER-CONTRACT-VERIFICATION | REQUIRES_USER_APPROVAL | no `pubspec.yaml` or `.dart` artifact exists in supplied repo/worktrees | provide/authorize the Flutter repository path; continue backend-only contracts independently | none |
| COHORT-CURRENT-TERM-COURSE-READ-MODEL-01 | BLOCKED | PR #155 is OPEN with an architectural HOLD despite CI PASS; its interface/provenance contract is not accepted | keep fail-closed, resolve the architecture finding in its isolated branch, obtain independent PASS before merge | none |
| GRADUATION-PROJECTS-IMPLEMENTATION | BLOCKED | PR #159 completed audit/design only; academic mappings and P0/P1/P2 gates remain unapproved | retain `HOLD_PENDING_ACADEMIC_DECISIONS`; continue only separately authorized source tasks | none |
| GRADUATES-AFFAIRS-IMPLEMENTATION | BLOCKED | PR #160 completed audit/design only; requires graduation-projects implementation plus graduate definition, results, accounts, documents, privacy and staff authorization | retain `HOLD_PENDING_GRADUATE_DOMAIN_DECISIONS`; do not infer mappings | none |

No global HOLD is active. Protected request/user identifiers and historical
notifications remain outside every mutation set.
