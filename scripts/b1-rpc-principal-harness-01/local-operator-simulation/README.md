# Local disposable PG17 operator simulation (LONGRUN-08 G13)

Source-only package. Never points at production.

## Run

```powershell
pwsh -File scripts/b1-rpc-principal-harness-01/local-operator-simulation/run-local-simulation.ps1
```

Requires Docker with `postgres:17`. Host `psql` is not required.

## What it proves

1. Fresh wipe + render of all 267 cases, twice — identical MANIFEST/case hashes
2. SELECT-only operator (no SUPERUSER / BYPASSRLS / table writes)
3. Focused live denials on stub RPCs matching the live contract:
   - unauthorized act_on → `42501` / `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` PASS
   - illegal action by exact assignee → `42501` / `B1_ACTION_TYPE_MISMATCH` PASS
   - payment with **step** UUID → `42501` / `DIRECT_PAYMENT_ASSIGNEE_REQUIRED` PASS
   - payment with **request** UUID → infrastructure `P0002` shape (why step UUID is mandatory)
   - unknown `42501` → HOLD
4. One `BEGIN ISOLATION LEVEL SERIALIZABLE` + one `ROLLBACK` + zero `COMMIT` per case
5. Outside fingerprint equality / zero mutation after rollback

Artifacts land in `local-operator-simulation/out/` (gitignored).
