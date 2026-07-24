# PG17 authorization harness

Run against an ephemeral PostgreSQL 17 database only:

`powershell -File scripts/department-administrative-positions-separation-01-pg17/02-run.ps1`

The harness is source-only and refuses any non-local database URL. It covers
cross-affiliation ALLOW/DENY, expired/duplicate assignments, malformed runtime,
role bypass, anonymous access, and academic-affiliation independence.
