# B1 safe RPC matrix harness 01

This source-only harness starts a uniquely named disposable `postgres:17`
container, applies the existing synthetic compatibility schema and the reviewed
authorization draft, then exercises the five B1 services through the SQL
authorization function. It contains synthetic UUIDs only and has no Supabase
URL, production credential, deployment command, migration history mutation, or
`student_visible` write.

Run from the repository root:

```powershell
.\scripts\b1-safe-rpc-matrix-harness-01\02-run.ps1
```

Exit `0` means every expected ALLOW/DENY result passed. Exit `2` means the
harness ran successfully and found at least one behavioral authorization gap.
Any other non-zero exit is an environment/compile blocker. The container is
removed in `finally` in every case.
