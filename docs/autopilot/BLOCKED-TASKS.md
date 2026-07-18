# Blocked and Approval-Gated Tasks

| task_id | status | blocker | safe next action | production_impact |
|---|---|---|---|---|
| B1-ACL-CUTOVER-DRAFT-06 | BLOCKED | Independent review HIGH=2: incomplete five-boundary proof and no trustworthy deployed atomic-caller release evidence | retain isolated worktree; revise only after release evidence exists | none |
| B1-PRODUCTION-MIGRATION-SEQUENCE | REQUIRES_USER_APPROVAL | identities, storage, free workflows, release evidence, cutover review, exact single-migration dry run, and explicit approval | continue source/tests/docs and preflight preparation | would write production if approved |
| B1-STUDENT-VISIBILITY-ACTIVATION | REQUIRES_USER_APPROVAL | separate per-service approval and post-migration verification | keep unchanged | would change production visibility |
| PORTAL-DEPLOY-PUBLISH | REQUIRES_USER_APPROVAL | explicit deploy/publish authorization and release evidence | prepare source/release manifest only | would change deployed runtime |
| COHORT-INTEGRATED-RELEASE | BLOCKED | no canonical current-term resolver; enrollment imports/readiness unverified; cohort fallback can cross parallel sections; anonymous timetable reads and materials TOCTOU remain | complete P0 resolver, exact binding, anon ACL hardening, atomic materials mutation and authorization matrix source tasks | none until separately authorized release |
| FLUTTER-CONSUMER-CONTRACT-VERIFICATION | REQUIRES_USER_APPROVAL | no `pubspec.yaml` or `.dart` artifact exists in supplied repo/worktrees | provide/authorize the Flutter repository path; continue backend-only contracts independently | none |

No global HOLD is active. Protected request/user identifiers and historical
notifications remain outside every mutation set.
