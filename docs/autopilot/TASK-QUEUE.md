# Portal Autopilot Task Queue

Updated: 2026-07-18 Asia/Riyadh  
Concurrency: 3 ACTIVE maximum. Queue changes never authorize production actions.

| task_id | title | domain | priority | dependencies | affected_files | required_agent_type | branch | worktree | owner | status | commit | PR | CI | review | blockers | production_impact |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DYNAMIC-AGENT-QUEUE-ACTIVATION-01 | Activate dynamic queue and worker registry | orchestration | P1 | none | `docs/autopilot/*` | ARCHITECTURE_AGENT | `codex/dynamic-agent-queue-01` | `C:\projects\saba-uni-portal-dynamic-queue` | root | ACTIVE | — | — | pending | self-audit pending | none | none |
| B1-FREE-SERVICE-WORKFLOWS-DRAFT-08 | Inactive workflows for three free B1 services | database-security | P1 | PR #145; authorization matrix | `docs/migration-drafts/B1-FREE-SERVICE-WORKFLOWS-08.sql`, focused test | DATABASE_SECURITY_AGENT | `codex/b1-free-service-workflows-draft-08` | `C:\projects\saba-uni-portal-b1-free-workflows` | root | READY | — | — | pending | PASS 0/0/0/0 | commit/PR gates | none; draft only |
| PORTAL-COHORT-DELIVERY-GROUP-INTEGRATION-AUDIT-01 | Inventory cohort/platform integration | integration-audit | P1 | none | read-only discovery | AUDIT_AGENT | unassigned | read-only | dynamic worker | ACTIVE | — | — | n/a | pending | none known | none |
| FLUTTER-BACKEND-CONSUMPTION-CONTRACT-AUDIT-01 | Inventory mobile backend consumption contracts | mobile-integration | P1 | none | read-only discovery | INTEGRATION_AGENT | unassigned | read-only | dynamic worker | ACTIVE | — | — | n/a | pending | none known | none |
| STUDENT-TO-COHORT-BINDING-AUDIT-01 | Prove authoritative student/cohort binding | data-contract | P1 | cohort integration audit | TBD after audit | BACKEND_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| COHORT-CURRENT-TERM-COURSE-READ-MODEL-01 | Define current-term cohort course read model | read-model | P1 | binding audit | TBD after audit | BACKEND_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| INDIVIDUAL-ACADEMIC-EXCEPTIONS-01 | Contract per-student academic exceptions | architecture | P1 | binding and course read model | TBD | ARCHITECTURE_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| STUDENT-CURRENT-TERM-COURSES-UI-01 | Student current-term courses UI | frontend | P2 | course read model | TBD | FRONTEND_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| TIMETABLE-CONSUMPTION-CONTRACT-01 | Portal timetable consumption | integration | P1 | course read model | TBD | INTEGRATION_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| COURSE-MATERIAL-AUDIENCE-CONTRACT-01 | Course-material cohort audience | authorization | P0 | binding audit | TBD | SECURITY_REVIEWER | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| LECTURE-EXECUTION-MONITORING-01 | Lecture execution monitoring contract | backend | P2 | timetable contract | TBD | BACKEND_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| LEGACY-SECTION-COMPATIBILITY-ADAPTER-01 | Compatibility for historical section identifiers | integration | P1 | integration audit | TBD | INTEGRATION_AGENT | unassigned | unassigned | unassigned | DISCOVERED | — | — | — | — | dependency | none |
| B1-ACL-CUTOVER-DRAFT-06 | Atomic B1 detail write cutover | database-security | P0 | runtime release evidence; all five boundaries | isolated draft files | DATABASE_SECURITY_AGENT | `codex/b1-acl-cutover-draft-06` | `C:\projects\saba-uni-portal-b1-acl-cutover-draft` | root | BLOCKED | — | — | — | HOLD HIGH=2 | trustworthy deployed release evidence missing | none; unapplied |
| B1-PRODUCTION-MIGRATION-SEQUENCE | Apply B1 migrations sequentially | production | P0 | runbook, identities, storage, workflows, release, cutover | production DB | DATABASE_SECURITY_AGENT | n/a | n/a | unassigned | REQUIRES_USER_APPROVAL | — | — | — | — | explicit approval and all gates | production writes if approved |
| B1-STUDENT-VISIBILITY-ACTIVATION | Activate services and visibility | production | P1 | all migrations and verification | `request_types.student_visible` | INTEGRATION_AGENT | n/a | n/a | unassigned | REQUIRES_USER_APPROVAL | — | — | — | — | separate explicit approval | production visibility change |

## Selection rule

Select the highest-priority `READY` task whose dependencies are complete and whose
affected files/worktree do not overlap any `ACTIVE` task. Findings CRITICAL/HIGH
create a P0 remediation task and freeze only the affected path.
