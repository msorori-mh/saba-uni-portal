# B1-D02-Chair-Sensor-Semantic-01

Disposable PG17 harness for the fixed D-02 department-chair sensor.

## Scope

- Prove a non-chair active assignment does **not** inflate the chair count.
- Prove an active `department_head` / `faculty_profile` assignment **is** counted.
- Prove duplicate active chairs are detectable.
- Prove missing chairs are detectable.
- Document the legacy `ilike '%chair%'` bug (returns 0 because no role code contains `chair`).

## Files

- `pg/10-minimal-schema.sql` — minimal schema mirroring the production tables used by the sensor.
- `pg/20-d02-sensor-tests.sql` — focused test cases.
- `run-harness.ps1` — PowerShell runner that creates a temp database, runs the tests, and cleans up.

## Run

Requires a local PostgreSQL 17 instance and `psql` on PATH.

```powershell
$env:PGHOST = 'localhost'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGPASSWORD = 'postgres'
./tests/b1-d02-chair-sensor-semantic-01/run-harness.ps1
```

## Safety

- Creates and drops a throwaway database only.
- Never connects to production.
- No writes outside the temporary database.
