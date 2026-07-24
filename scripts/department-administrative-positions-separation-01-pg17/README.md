# PG17 authorization harness

Run against an ephemeral PostgreSQL 17 database only:

`powershell -File scripts/department-administrative-positions-separation-01-pg17/02-run.ps1`

The harness is source-only and refuses any non-local database URL. It covers
cross-affiliation ALLOW/DENY, expired/duplicate assignments, malformed runtime,
and the production-shaped safe-disable contract. The safe-disable fixture keeps
`department_transfer.is_active=true` while `student_visible=false`, with zero
active workflows and zero executable runtime steps. Negative cases prove STOP
for visibility, an active workflow, active/pending transfer runtime, and a
non-fail-closed authorization function.
role bypass, anonymous access, and academic-affiliation independence.
