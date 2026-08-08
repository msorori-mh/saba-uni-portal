# GP Level-4 Production TEST_ONLY Fixture Package — E2E Runbook

- **Mission:** `GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURE-PACKAGE-01`
- **Marker:** `TEST_ONLY_GP_LEVEL4_RECLOSURE_01`
- **Mode:** SOURCE package for **post-apply** operator testing only
- **This document does not authorize production writes.** Each gate must PASS before the next begins. Failure → **STOP**.

## Package files

| Artifact | Path |
|---|---|
| Provisioning | `docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql` |
| Cleanup | `docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-CLEANUP-01.sql` |
| Fingerprint | `docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql` |
| Local Bun proof | `tests/graduation-projects/gp-level4-production-fixture-package.test.ts` |

## Actor roster (15)

| Code | Role |
|---|---|
| `GP_L4_TEST_LEADER` | Current Level 4 leader (P1) |
| `GP_L4_TEST_MEMBER` | Current Level 4 member (P1) |
| `GP_L1_NEGATIVE` | Level 1 deny |
| `GP_L2_NEGATIVE` | Level 2 deny |
| `GP_L3_NEGATIVE` | Level 3 deny |
| `GP_LEVEL_UNKNOWN_NEGATIVE` | No academic-status row |
| `GP_LEVEL_AMBIGUOUS_NEGATIVE` | Tied top academic-status rows |
| `GP_DUAL_ROLE` | Student on P2 (non-L4 DENY) + coordinator on P3 (ALLOW) |
| `GP_TEST_COORDINATOR` | Coordinator |
| `GP_TEST_SUPERVISOR` | Supervisor (accepted on P1) |
| `GP_TEST_UNRELATED_SUPERVISOR` | Unrelated supervisor (no rights) |
| `GP_TEST_PANEL_1` / `GP_TEST_PANEL_2` | Panel members |
| `GP_TEST_UNAUTHORIZED_STAFF` | Unauthorized staff |
| `GP_TEST_ADMIN_VIEWER` | Department-coordinator overview capability (no separate enum role) |

UUID band: `a4e40100-0000-4000-*` (synthetic; do not reuse real identities).

## Projects (4)

| ID | Purpose |
|---|---|
| P1 | Positive Level-4 lifecycle + storage/download probes |
| P2 | Dual-role student-path DENY |
| P3 | Dual-role staff-path ALLOW |
| P4 | Archive immutability evidence |

## Storage plan (no fake bytes in source)

Object-key prefix embeds the marker:

```text
graduation-projects/<project_id>/<category>/TEST_ONLY_GP_LEVEL4_RECLOSURE_01-<file_id>-<purpose>.pdf
```

| Intent | File purpose |
|---|---|
| Positive L4 upload | Operator creates new intent as L4 leader/member at E2E time |
| Pending → demotion deny | Pre-seeded pending proposal on P1 owned by member; demote member academic status then probe upload/finalize |
| Signed-download positive | Pre-seeded active clean proposal on P1 |
| Replay cross-actor deny | Same file + correlation; second actor must fail with actor mismatch |

Cleanup identifies objects by marker substring **and** package project UUID prefixes only.

---

## Gates (stop on first failure)

### GATE 1 — Production L4 migration applied + post-verifier PASS

- Apply path is **out of scope** for this package.
- Require prior PASS of:
  - `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-POST-VERIFIER.sql`
- Expect notice: `GP_L4_PRODUCTION_POST_VERIFIER_PASS`
- **STOP** if predicate `student_is_current_fourth_academic_level` is missing.

### GATE 2 — Schema hash / GP object contract

- Confirm SET U + L4 objects present (foundation/storage/lifecycle + L4 helpers).
- Confirm private bucket `graduation-projects` (`public=false`).
- **STOP** on drift.

### GATE 3 — Fixture dry-run PASS

```sql
-- default: do NOT set execute
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql
```

Expect:

- notice `GP_L4_FIXTURE_PROVISION_BUILT`
- exception `GP_L4_FIXTURE_DRY_RUN` (transaction rolls back)

If Auth cannot accept `INSERT INTO auth.users(id)`:

1. Pre-create the 15 deterministic auth user UUIDs via Auth Admin API
2. `SET gp.l4_fixture.auth_users_preprovisioned = 'true';`
3. Re-run dry-run

**STOP** on any other exception.

### GATE 4 — Fixture provisioning (explicit approval)

```sql
SET gp.l4_fixture.execute = 'true';
-- optional after Auth Admin pre-create:
-- SET gp.l4_fixture.auth_users_preprovisioned = 'true';
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql
```

Expect notice `GP_L4_FIXTURE_PROVISION_COMMIT`.

Then:

```sql
SET gp.l4_fixture.fingerprint_phase = 'PRE_E2E';
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql
```

Expect `GP_L4_FINGERPRINT_PASS phase=PRE_E2E`.

### GATE 5 — Negative matrix (ZERO side effects)

For each actor, capture fingerprint counts (projects/assignments/events/files) **before** and **after**. Must be equal on denial.

| Actor | Probe | Expected |
|---|---|---|
| L1 / L2 / L3 | `create_graduation_project_team` / `list_my_graduation_projects` | `fourth-level student eligibility required` |
| UNKNOWN | same | deny |
| AMBIGUOUS | same | deny (tied top rows) |
| DUAL on P2 | `get_graduation_project_detail(P2)` | student-path deny |

**STOP** if any deny creates rows.

### GATE 6 — Positive lifecycle

| Actor | Probe | Expected |
|---|---|---|
| L4 leader | list/detail/proposal mutators on P1 | ALLOW |
| L4 member | list/detail on P1 | ALLOW |

### GATE 7 — Storage / download

| Probe | Expected |
|---|---|
| Current L4 upload intent (leader) | ALLOW |
| Demote member → pending upload / `can_upload` | DENY + zero side effects |
| Signed download as authorized P1 actor | ALLOW |
| Cross-actor correlation replay | DENY (`idempotent replay actor mismatch` or authz deny) |

### GATE 8 — Archive verification

| Probe | Expected |
|---|---|
| Mutate P4 archived project | `archived project is immutable` |
| Archive row + final file remain readable to authorized staff | evidence preserved |

### GATE 9 — Cleanup dry-run

```sql
-- default: cleanup_execute unset/false
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-CLEANUP-01.sql
```

Expect `GP_L4_CLEANUP_INVENTORY` + exception `GP_L4_CLEANUP_DRY_RUN`.

### GATE 10 — Cleanup execute

```sql
SET gp.l4_fixture.cleanup_execute = 'true';
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-CLEANUP-01.sql
```

Expect `GP_L4_CLEANUP_SUCCESS`.

Auth user disable/delete in production Auth remains an **operator Admin API** follow-up (SQL cleanup does not delete `auth.users` by default).

### GATE 11 — Zero-residue verifier

```sql
SET gp.l4_fixture.fingerprint_phase = 'POST_CLEANUP';
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql
```

Expect `POST_CLEANUP_ZERO_RESIDUE_PASS`.

Optional mid/post E2E fingerprint:

```sql
SET gp.l4_fixture.fingerprint_phase = 'POST_E2E';
\i docs/production-test-fixtures/GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql
```

---

## Dual-role verdict contract

- **P2 student path:** DENY (non-L4 academic status; student-only assignment)
- **P3 staff path:** ALLOW (active coordinator assignment; L4 not required)
- Staff capability on P3 must **never** unlock student detail/list for P2

## Explicit non-goals

- No production connection from CI/agents for this package
- No migration apply / deploy / publish / merge via this runbook
- No reuse of real student/faculty/staff identities
- No fake PDF bytes committed to git; storage objects are operator-time only
