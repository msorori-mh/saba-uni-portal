# Blocked and Approval-Gated Tasks

| task_id | status | blocker | safe next action | production_impact |
|---|---|---|---|---|
| B1-ACL-CUTOVER-DRAFT-06 | BLOCKED | Independent review HIGH=2: incomplete five-boundary proof and no trustworthy deployed atomic-caller release evidence | retain isolated worktree; revise only after release evidence exists | none |
| B1-PRODUCTION-MIGRATION-SEQUENCE | REQUIRES_USER_APPROVAL | identities, storage, free workflows, release evidence, cutover review, exact single-migration dry run, and explicit approval | continue source/tests/docs and preflight preparation | would write production if approved |
| B1-STUDENT-VISIBILITY-ACTIVATION | REQUIRES_USER_APPROVAL | separate per-service approval and post-migration verification | keep unchanged | would change production visibility |
| PORTAL-DEPLOY-PUBLISH | REQUIRES_USER_APPROVAL | explicit deploy/publish authorization and release evidence | prepare source/release manifest only | would change deployed runtime |

No global HOLD is active. Protected request/user identifiers and historical
notifications remain outside every mutation set.
