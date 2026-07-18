# Blocked and Approval-Gated Tasks

| task_id | status | blocker | safe next action | production_impact |
|---|---|---|---|---|
| B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01 | SOURCE_MERGED; HOLD_B1_FIVE_SERVICES_RUNTIME_PROMOTION | Source merged via PR #162; production sequence still gated on release evidence, identities, storage, safe RPC matrix, and explicit approval | begin production preflight only after separate approval; do not apply | none |
| B1-ACL-CUTOVER-DRAFT-06 | SOURCE_MERGED_UNAPPLIED | Cutover draft merged in #162; apply still requires order-1 release stamp with real deploy SHA | do not apply until stamp approved | none |
| B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01 | ACTIVE_SOURCE | log_audit/source plan remediation; Deploy/Storage/dept-head gates remain | merge source after CI+review; stop before Deploy/apply | none |
| REMAINING-STUDENT-REQUESTS-SOURCE-READINESS-01 | DEFERRED_USER_LIFECYCLE_INPUT | Owner has not approved lifecycles for the six deferred services | keep deferred; no Workflow/SQL/UI work | none |
| B1-PRODUCTION-MIGRATION-SEQUENCE | REQUIRES_USER_APPROVAL | identities, storage, release evidence, cutover review, exact single-migration dry run, and explicit approval | production preflight preparation only; no apply without approval | would write production if approved |
| B1-STUDENT-VISIBILITY-ACTIVATION | REQUIRES_USER_APPROVAL | separate per-service approval and post-migration verification | keep unchanged | would change production visibility |
| PORTAL-DEPLOY-PUBLISH | REQUIRES_USER_APPROVAL | explicit deploy/publish authorization and release evidence | prepare source/release manifest only | would change deployed runtime |
| COHORT-INTEGRATED-RELEASE | BLOCKED | resolver and security source work is merged, but migration drafts remain unapplied, feature flags remain inactive, production enrollment/import readiness is unverified, and PR #155's read-model architecture remains on HOLD | resolve PR #155 independently; verify production data readiness; retain unapplied drafts and inactive flags until separate migration/release authorization | none until separately authorized release |
| FLUTTER-CONSUMER-CONTRACT-VERIFICATION | REQUIRES_USER_APPROVAL | no `pubspec.yaml` or `.dart` artifact exists in supplied repo/worktrees | provide/authorize the Flutter repository path; continue backend-only contracts independently | none |
| PORTAL-COHORT-DELIVERY-GROUP-INTEGRATION-AUDIT-01 | HOLD_OPEN_DRAFT_NOT_MERGED | audit work is `PASS_AUDIT_COMPLETE`, but Draft PR #149 (`audit/portal-cohort-delivery-group-integration-01` at `d569dda`) remains OPEN despite CI PASS | retain the open artifact state until the draft is independently made merge-ready and merged; do not claim merged completion | none |
| COHORT-CURRENT-TERM-COURSE-READ-MODEL-01 | BLOCKED | PR #155 is OPEN with an architectural HOLD despite CI PASS; its interface/provenance contract is not accepted | keep fail-closed, resolve the architecture finding in its isolated branch, obtain independent PASS before merge | none |
| GRADUATION-PROJECTS-IMPLEMENTATION | BLOCKED | PR #159 completed audit/design only; academic mappings and P0/P1/P2 gates remain unapproved | retain `HOLD_PENDING_ACADEMIC_DECISIONS`; continue only separately authorized source tasks | none |
| GRADUATES-AFFAIRS-IMPLEMENTATION | BLOCKED | PR #160 completed audit/design only; requires graduation-projects implementation plus graduate definition, results, accounts, documents, privacy and staff authorization | retain `HOLD_PENDING_GRADUATE_DOMAIN_DECISIONS`; do not infer mappings | none |

No global HOLD is active. Protected request/user identifiers and historical
notifications remain outside every mutation set.
