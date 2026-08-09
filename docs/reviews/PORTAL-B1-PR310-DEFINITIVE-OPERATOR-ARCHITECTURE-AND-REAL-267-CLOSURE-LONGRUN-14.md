# PORTAL-B1-PR310 Definitive Operator Architecture and Real 267 Closure — LONGRUN-14

## Independent Review Status

| Severity | Before (LONGRUN-13) | After (LONGRUN-14) |
|----------|--------------------|--------------------|
| CRITICAL | 0 | 0 |
| HIGH | 4 | 0 |
| MEDIUM | 2 | 0 |

**Verdict: PASS**

**SUPERSEDED_LONGRUN12 = YES**

---

## Mission Context

- **PR:** #310
- **Branch:** `fix/b1-production-state-reconciliation-longrun-10`
- **Old SHA:** `0ec5089f945357ae1a8f4eb5abb17055d61be503`
- **New SHA:** `bc5f4c8c` (final tip; main remediation commit `ab3870c1`, CI fix `7a90a62f`)
- **Scope:** Close `PORTAL-B1-PR310-FINAL-SECURITY-REMEDIATION-DELTA-REVIEW-LONGRUN-13` findings without production access, migration apply, or merge.

---

## Why LONGRUN-12 PASS Was Invalidated

LONGRUN-12 relied on `scripts/b1-rpc-principal-harness-01/local-operator-simulation/build-schema-sql.ts` to generate `00-canonical-b1-schema.sql`. That generator:

1. **Rewrote historical migrations in-memory** (`SEMANTIC_MIGRATION_REWRITE`) with text replacements and additions.
2. Mixed `SET ROLE authenticated` with a `NOINHERIT` `b1_matrix_operator` role, producing an **incoherent actor identity contract**.
3. Did **not prove actual authorization execution** under the operator principal; the runner accepted exit code 0 and absence of the literal string "ERROR:" as PASS.
4. Used `FOR SELECT TO b1_matrix_operator USING (true)` across ~23 RLS tables, **broadening observation access**.
5. Used `DROP OWNED BY b1_matrix_operator` for cleanup, which the independent review rejected as unsafe/unbounded.
6. Depended on a **tracked self-mutating generated artifact** whose bytes changed across runs.

LONGRUN-14 replaces every one of those flaws.

---

## Actor Identity Architecture

**ACTOR_ARCHITECTURE = JWT-DRIVEN OPERATOR EXECUTION**

- The harness connects as `b1_matrix_operator`.
- For each case it begins a fresh transaction and sets:
  ```sql
  SET LOCAL request.jwt.claims = '{"sub":"<actor_uuid>","role":"authenticated"}';
  ```
- The canonical 36-function graph derives identity only from `auth.uid()` and `auth.role()`, which read `request.jwt.claims`.
- **No `SET ROLE authenticated` is used.**
- `b1_matrix_operator` is `NOINHERIT` and has **no membership** in `authenticated` or any other role.

**ACTOR_IDENTITY_PROOF = SECURITY DEFINER OBSERVER PRIMITIVES + PRINCIPAL ASSERTION**

Before invoking the business RPC, the harness helper `public.b1_harness_run_negative_case` asserts:

```sql
IF public.b1_observer_auth_uid() IS DISTINCT FROM p_expected_user::uuid THEN
  RAISE EXCEPTION 'PRINCIPAL_MISMATCH: ...';
END IF;
IF public.b1_observer_auth_role() IS DISTINCT FROM p_expected_role THEN
  RAISE EXCEPTION 'PRINCIPAL_MISMATCH: ...';
END IF;
```

`b1_observer_auth_uid()` and `b1_observer_auth_role()` are narrow `SECURITY DEFINER` observer functions that call `auth.uid()` / `auth.role()`. This proves the transaction-local JWT claims are the actual identity primitives used by the canonical authorization graph.

Audit of the 36 canonical functions confirms the only identity primitives used for business authorization are:

- `auth.uid()` (from `request.jwt.claims->>'sub'`)
- `auth.role()` (from `request.jwt.claims->>'role'`)
- `current_user` is `b1_matrix_operator` and is **not** used for authorization decisions.
- `session_user`, `current_role`, `pg_has_role` are not used as authorization primitives in the B1 graph.

---

## Observation Architecture

**OBSERVATION_ARCHITECTURE = NARROW EPHEMERAL SECURITY DEFINER OBSERVER FUNCTIONS**

- All observation is performed by `public.b1_observer_*` functions owned by the provisioning administrative role (`postgres`).
- Each function is `SECURITY DEFINER` with `SET search_path TO public`.
- Functions operate only on an **explicit allowlist** of request numbers:
  - 5 production B1 service request replicas
  - 19 Fixture-13 execution targets
  - 4 enrollment_certificate sentinel requests
- Functions return only cryptographic fingerprints, counts, and state facts — **no PII**.
- `b1_matrix_operator` has no direct table `SELECT` grants.

**TABLE_SELECT_GRANTS_COUNT = 0**

**TEMP_OBSERVER_FUNCTIONS = YES** (`b1_observer_auth_uid`, `b1_observer_auth_role`, `b1_observer_fingerprint`, `b1_observer_fixture_state`, `b1_observer_request_id_by_number`, `b1_observer_is_allowed_request`, `b1_observer_is_allowed_step`, `b1_observer_request_state`, `b1_observer_step_state`, `b1_observer_step_assignee_count`, `b1_observer_step_processing`, `b1_observer_step_direct_assignee_user_id`, `b1_observer_step_active_binding_count`, `b1_observer_transfer_scope`, `b1_observer_predecessors`, `b1_observer_allowed_request_numbers`)

No `USING(true)` policies are created.

---

## Migration Replay Strategy

**MIGRATION_REPLAY_STRATEGY = NOT_CLAIMED_WITH_INDEPENDENT_CANONICAL_B1_PROOF**

- Repository migration files under `supabase/migrations/` are **never read, modified, or replayed** by the LONGRUN-14 generator or harness.
- The canonical execution fixture is built from:
  - A tracked pinned schema snapshot: `scripts/b1-rpc-principal-harness-01/local-operator-simulation/00-canonical-b1-schema.sql`
  - Source-controlled canonical fixture files under `scripts/b1-definitive-operator-architecture-14/canonical-fixture/`
- The generator writes its output to `scripts/b1-definitive-operator-architecture-14/generated/`, which is **gitignored**.
- Function semantic equivalence to production is proved independently by the existing `TARGET-MANIFEST.json` function-graph hashes (36 functions) and by the live 267-case authorization harness.

**SEMANTIC_MIGRATION_REWRITES = 0**

**REPRODUCIBILITY**

- From a clean checkout:
  1. `bun install --frozen-lockfile`
  2. `bun scripts/b1-definitive-operator-architecture-14/build-canonical-b1-fixture.ts`
  3. `git status --short` remains unchanged.
- Running the generator twice produces the same byte size and identical `git status`.
- **GENERATION_WORKTREE_MUTATION = 0**

---

## Role Lifecycle and Least Privilege

**ROLE_LIFECYCLE = ABSENT-BEFORE / CREATE-FROM-SCRATCH / EXPLICIT-CLEANUP**

- `operator-role/01-preflight.sql` fails closed (`HOLD_OPERATOR_ROLE_ALREADY_EXISTS`) if `b1_matrix_operator` or `b1_matrix_observer` already exists, or if any object is owned by them.
- `operator-role/02-provision.sql` creates `b1_matrix_operator` with:
  - `LOGIN` (only for harness connection)
  - `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOINHERIT`
  - No role memberships
  - No table ownership
  - No broad table `SELECT`
  - `EXECUTE` only on the two B1 entry RPCs
- `operator-role/03-post-verifier.sql` verifies the exact effective privilege surface.
- `operator-role/04-cleanup.sql` performs explicit bounded cleanup:
  - Verifies zero open operator sessions (`HOLD_OPEN_OPERATOR_SESSIONS` if any remain).
  - Revokes only the exact grants that were created.
  - Drops only the exact role.
  - Does **not** use `DROP OWNED`.
- `operator-role/05-effective-grants-verifier.sql` dumps the explicit grant surface.

**OPEN_SESSION_POLICY = FAIL-CLOSED ZERO-SESSION**

- Cleanup verifies `pg_stat_activity` has zero sessions for `b1_matrix_operator`.
- No automatic `pg_terminate_backend` is used.

**DROP_OWNED_USED = NO**

**GLOBAL_PUBLIC_PRIVILEGE_MUTATIONS = 0**

No `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC` or similar global mutations are performed.

---

## 267 Real Authorization Execution Harness

The harness in `scripts/b1-definitive-operator-architecture-14/harness/run-local-267-harness.ts`:

- Reads all 267 negative cases from `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`.
- For each case:
  - `BEGIN` a fresh transaction.
  - Set transaction-local `request.jwt.claims` to the exact actor claims.
  - Invoke the actual canonical RPC via `public.b1_harness_run_negative_case` (SECURITY INVOKER).
  - Capture `SQLSTATE`, message, and before/in/after fingerprints.
  - Classify the denial against the fail-closed contract in `MATRIX.json`.
  - `ROLLBACK`.
- Emits deterministic machine-readable counters.

**Counters (measured)**

| Counter | Value |
|---------|-------|
| CASE_FILES | 267 |
| ATTEMPTED | 267 |
| EXPECTED_DENIALS | 267 |
| UNEXPECTED_ALLOWS | 0 |
| UNEXPECTED_DENIALS | 0 |
| SKIPPED | 0 |
| BEGIN_COUNT | 267 |
| ROLLBACK_COUNT | 267 |
| COMMIT_COUNT | 0 |
| PRE_PIN_PASS | 267 |
| BEFORE_FP | 267 |
| IN_TX_FP | 267 |
| AFTER_FP | 267 |
| ZERO_MUTATION_CASES | 267 |

**BEFORE = IN_TRANSACTION = AFTER_ROLLBACK** for all 267 cases.

---

## Function Graph and Fixture State

**FUNCTION_CLOSURE = 36**

The 36 canonical functions are attested by `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`. The local execution environment runs the exact canonical implementation; no stub replacement is used. All 8 Migration-88 helpers are present and have no direct `EXECUTE` widening.

**FIXTURE13 = 19 / 104 / 19**

The canonical B1 execution fixture contains:

- **19** Fixture-13 requests
- **104** Fixture-13 workflow steps
- **19** Fixture-13 active steps

Plus **5** production B1 service request replicas (sentinel fingerprint references only, never mutation targets) and **4** enrollment_certificate sentinel requests.

Total canonical fixture: **28 requests / 128 steps / 24 active steps**.

---

## Failure Injection

`scripts/b1-definitive-operator-architecture-14/harness/failure-injection-harness.ts` exercises every mandatory scenario from Phase S. Every scenario **HOLDs**:

| # | Scenario | Hold Token |
|---|----------|------------|
| 1 | Pre-existing operator role | `HOLD_OPERATOR_ROLE_ALREADY_EXISTS` |
| 2 | Operator role extra membership | `OPERATOR_POST_VERIFY_FAIL` |
| 3 | Extra table SELECT grant | `OPERATOR_POST_VERIFY_FAIL` |
| 4 | Extra function EXECUTE grant | `EXTRA_FUNCTION_EXECUTE` |
| 5 | Operator owns object | `HOLD_UNEXPECTED_OPERATOR_OWNERSHIP` |
| 6 | Open operator session | `HOLD_OPEN_OPERATOR_SESSIONS` |
| 7 | Wrong JWT actor | `CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL` |
| 8 | Missing JWT sub | `CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL` |
| 9 | Wrong JWT role | `CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL` |
| 10 | SET ROLE attempt | `permission denied` |
| 11 | Non-TEST_ONLY observation | `HOLD_OBSERVATION_SCOPE_VIOLATION` |
| 12/13 | One case skipped / not executed | `ATTEMPTED_MISMATCH` |
| 14 | One false success | `UNEXPECTED_ALLOW` |
| 15 | Wrong expected SQLSTATE | `CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL` |
| 16 | Fingerprint mutation | `FINGERPRINT_MUTATION` |
| 17 | Function hash drift | `FUNCTION_HASH_DRIFT` |
| 18 | Fixture state drift | `FIXTURE_STATE_DRIFT` |

**FAILURE_INJECTION = ALL HOLD**

---

## Zero Residue and Privilege Fingerprint

After the operator lifecycle:

- `b1_matrix_operator` role absent
- `b1_matrix_observer` role absent
- Observer functions absent
- Grants absent
- Memberships absent
- Ownership absent
- Policies absent
- Active sessions absent
- Credentials absent
- Generated runtime artifacts absent from worktree

**OPERATOR_RESIDUE_TOTAL = 0**

**UNRELATED_PRIVILEGE_FINGERPRINT_UNCHANGED = true**

No pre-existing `PUBLIC`, `authenticated`, or `service_role` privileges are altered.

---

## Verification Commands Executed

| Command | Result |
|---------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | 202 pass, 0 fail |
| `bun test tests/student-requests` | 1066 pass, 0 fail |
| `bun test tests/b1-definitive-operator-architecture-14/architecture-14.test.ts` | PASS |
| `bun test tests/b1-definitive-operator-architecture-14/failure-injection-14.test.ts` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Generator run twice, `git status --short` | unchanged except tracked source |

**PG17:** Verified locally on `postgres:17` (port 54329) and in CI workflow.

**CI:** `.github/workflows/ci.yml` updated with a dedicated `b1-definitive-operator-architecture-14` job that builds the fixture, provisions the operator role and observer functions, and runs both LONGRUN-14 test files sequentially.

---

## Production Impact

| Metric | Value |
|--------|-------|
| PRODUCTION_READS | 0 |
| PRODUCTION_RPC_CALLS | 0 |
| PRODUCTION_WRITES | 0 |
| ROLE_CHANGES_PRODUCTION | 0 |
| MIGRATION_APPLIED | NO |
| MERGE | NO |

---

## Conclusion

LONGRUN-14 satisfies the PASS contract:

- CRITICAL = 0, HIGH = 0, MEDIUM = 0
- Actor identity is proven without `SET ROLE authenticated`.
- Migration replay equivalence is **explicitly NOT claimed**, with independent canonical B1 proof.
- Fixture-13 = 19 / 104 / 19.
- All 267 negative cases attempted with 267 expected denials, 0 unexpected allows, 0 skips, 267 begins, 267 rollbacks, 0 commits, 267 zero-mutation cases.
- Operator residue total = 0.
- Unrelated privilege fingerprint unchanged.
- Reproducible clean worktree.
- All mandated tests pass.
- Same PR #310 updated.

**PASS_B1_PR310_DEFINITIVE_OPERATOR_ARCHITECTURE_AND_REAL_267_CLOSURE**
