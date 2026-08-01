# PORTAL-B1-FUNCTION-GRAPH-ENTRYPOINT-READONLY-REATTESTATION-AND-SOURCE-REPIN-23

**MODE:** PRODUCTION READ-ONLY ATTESTATION + SOURCE-ONLY MANIFEST REPIN
**Repository:** msorori-mh/saba-uni-portal
**Authoritative main SHA (входной):** `993ce0ec5cb45524759831de488940a4f25d00b0`
**Production project:** `wpmicqriltrowwonknox`
**Production migration head:** `20260801021541`
**Read-only capture timestamp (UTC):** `2026-08-01T21:51:30Z`

**FINAL DECISION:** `PASS_B1_FUNCTION_GRAPH_ENTRYPOINT_REATTESTED_AND_REPINNED_READY_FOR_INDEPENDENT_REVIEW`

---

## G0 — SOURCE GATE — PASS

- Local HEAD at mission start = `993ce0ec5cb45524759831de488940a4f25d00b0` (matches authoritative main).
- `git diff --stat 8729f6d5..993ce0ec` = **1 file changed, 126 insertions**, exclusively
  `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05-REPORT.md`.
  No change to `scripts/b1-rpc-principal-harness-01/**`, `tests/b1-five-services-rpc-authorization-preflight-01/**`,
  Fixture SQL, Cleanup SQL, B1 migrations, TARGET-MANIFEST semantics, or MATRIX definitions.
- MATRIX counts: `negative_total = 267`, `executable_negative_total = 267`, `execution_blocked = 0` → **267 / 267 / 0**.
- `fixture_rebind.rebound_cases = 22` (`expected_rebound_cases = 22`).
- Fixture Migration applied exactly once (`20260801021541`); Cleanup package status `NOT_APPLIED`.
- Baseline `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json`:
  `status = PENDING`, `fingerprint = null`, `execution_authorized = false`,
  `operator_preflight_executed = false`, `negative_cases_executed = 0`. **Unchanged by this mission.**

## G1 — TRUSTED READ-ONLY CHANNEL — PASS

All production reads issued through the Lovable production read-only SQL channel against
`wpmicqriltrowwonknox`. Every statement returned `current_setting('transaction_read_only') = on`.
Zero DML, zero DDL, zero RPC invocation, zero role escalation, no credential material read or stored.

## G2 — PRODUCTION FUNCTION ATTESTATION — PASS

`public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)`

| Property | Production value |
|---|---|
| OID | `27775` |
| Identity arguments | `p_step_id uuid, p_action text, p_comment text, p_payload jsonb` |
| Return type | `jsonb` |
| Owner | `postgres` |
| SECURITY DEFINER | `true` |
| Volatility | `v` (VOLATILE) |
| Parallel safety | `u` (UNSAFE) |
| Strict | `false` |
| search_path | `{search_path=public}` |
| Effective EXECUTE grants (`proacl`) | `postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres` |
| `length(pg_get_functiondef)` | `7420` |
| Normalized SHA-256 | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |

Hash method used verbatim:
`sha256(btrim(regexp_replace(pg_get_functiondef(oid), '\s+', ' ', 'g')))`.

**Overload/shadow check:** `SELECT ... FROM pg_proc WHERE proname LIKE 'act_on_b1%'` across **all schemas**
returns exactly one row (`public`, oid `27775`). No second overload and no shadow function can satisfy the call.

Required production SHA matched exactly → `ENTRYPOINT_HASH_07D793B4`.

## G3 — SOURCE PROVENANCE — PASS (SOURCE_PRODUCTION_HASH_EQUAL)

Source path: `supabase/migrations/20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql`,
lines **26–122** = the final `CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(...)`
block (single definition of this function in the migration; migration commit `2c78a5ec`, 2026-07-30 17:55:33 +0000).

Local recomputation method (no production contact): a disposable PostgreSQL **17.9** instance
(`initdb` under an unprivileged temp uid, unix socket only, `listen_addresses=''`, port 55432),
`SET check_function_bodies = off`, then the extracted block applied verbatim, then the identical
normalization/hash expression executed against `pg_get_functiondef(oid)`.

| Property | Source (local PG17) | Production | Equal |
|---|---|---|---|
| Normalized SHA-256 | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` | `07d793b4…beaab9b` | ✅ |
| Identity arguments | `p_step_id uuid, p_action text, p_comment text, p_payload jsonb` | identical | ✅ |
| Return type | `jsonb` | `jsonb` | ✅ |
| Owner | `postgres` | `postgres` | ✅ |
| SECURITY DEFINER | `t` | `t` | ✅ |
| search_path | `{search_path=public}` | `{search_path=public}` | ✅ |
| Volatility / strict / parallel | `v` / `f` / `u` | `v` / `f` / `u` | ✅ |

Raw `pg_get_functiondef` lengths differ trivially (7424 local vs 7420 production) purely from whitespace
that the agreed normalization collapses; the normalized digests are byte-identical, so **no semantic SQL
difference exists**.

Semantic re-read of the reviewed definition (source text, lines 31–48):

- **Configured-action literal validation present:** authorization is probed with the *configured*
  `v_config.action_type` via `can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,''))`,
  then `IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN RAISE
  EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE='42501'`.
- **Assignment/role authorization present and fail-closed:** unauthenticated → `AUTHENTICATION_REQUIRED`
  (`28000`); unauthorized → `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` (`42501`) evaluated **before** the
  action-mismatch branch, so the configured action is not leaked to unauthorized principals.
- **No broad admin / registrar / dean bypass:** grep of the definition finds no `has_role`/`has_any_role`
  admin shortcut, no `system_admin`, `registrar` or `dean` role predicate in the authorization path; the
  only gate is the direct-assignee/binding function.
- **No external side effect added:** no `http`, `pg_net`, `dblink`, `COPY`, `nextval`/`setval`, or any
  non-transactional call in the definition; specialized actions are refused
  (`B1_SPECIALIZED_ACTION_RPC_REQUIRED`), client payloads are refused
  (`B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN`), predecessor completeness and single-transition resolution are
  enforced (`B1_PREDECESSOR_INCOMPLETE`, `B1_TRANSITION_MUST_RESOLVE_ONCE`,
  `B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE`).

## G4 — STALE PIN PROVENANCE — PASS

Reproducible evidence:

- `git log -S"109033a026b765266eb33ae5bd993118c9c6a69a3250520304b0c6ab9fedf791" -- scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`
  → single introducing commit **`ee03ab53213bdd9ac78e1c61564a69028b1905e1`**, `2026-07-29 04:57:04 +0000`.
- Manifest self-declared attestation time was `2026-07-29T22:45:00Z`.
- Migration `20260730175527` was committed in **`2c78a5ecd22d24fd6572f8b8f4a7c4537d946b99`**, `2026-07-30 17:55:33 +0000`.
- `git merge-base --is-ancestor ee03ab53 2c78a5ec` → true: **the stale pin strictly predates the migration
  that redefined the function.**
- Why it was not refreshed: mission `…PACKAGE66-REMEDIATION-68` applied the reviewed redefinition
  (literal configured-action enforcement, auth-before-action ordering, `system_admin` coverage) but its
  scope did not include re-attesting `TARGET-MANIFEST.json`; no later mission touched the function graph.
- Therefore the delta is **expected reviewed evolution**, not unexplained production drift: the current
  production digest is reproduced exactly from reviewed repository source (G3), and the fixture migration
  `20260801021541` defined/altered no functions.

## G5 — SOURCE-ONLY REPIN — DONE

Changed file (single): `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`

- `function_graph.functions[0].definition_sha256`:
  `109033a0…fedf791` → **`07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b`**
- Added provenance fields on that entry: `definition_sha256_superseded`, `definition_source_migration: "20260730175527"`, `source_production_hash_equal: true`.
- `function_graph.attested_at_utc`: `2026-07-29T22:45:00Z` → `2026-08-01T21:51:30Z`; added
  `function_graph.reattestation` block (mission id, head `20260801021541`, `repinned_entries: 1`, verdict).

No other pin existed anywhere in `scripts/**`, `tests/**`, or `src/**` (`rg 109033a0` → only the manifest and
the historical Capture-22 report, which is left intact as a record).

Untouched, as required: MATRIX cases, Fixture SQL, Cleanup SQL, migrations, function source, runtime
application code, baseline status/fingerprint/`execution_authorized`, Operator Preflight flags.
Baseline remains `PENDING` / `fingerprint = null` / `execution_authorized = false` /
`operator_preflight_executed = false` / `negative_cases_executed = 0`.

## G6 — FULL FUNCTION GRAPH VALIDATION — PASS (28/28)

Single production read-only comparison of all 28 manifest entries against
`to_regprocedure(signature)` + the same normalized digest:

| Metric | Value |
|---|---|
| closure size / total | 28 |
| resolved | 28 |
| matching | 28 |
| mismatched | **0** |
| null hashes | 0 |
| SECURITY DEFINER mismatches | 0 |
| owner mismatches | 0 |
| search_path mismatches | 0 |

Signatures resolved exactly (including the trigger closure: `b1_lock_assignment_identity_stmt()`,
`b1_lock_assignment_identity_boundary()`, `guard_b1_runtime_step_activation()`,
`protect_student_sensitive_fields()`, `update_updated_at_column()`). No new reachable function beyond the
28-entry closure was discovered for the entry point, and no prohibited external effect exists in it.
**No baseline was captured or pinned.**

## G7 — OFFLINE TESTING — PASS

| Command | Result |
|---|---|
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | `rendered 267 negative cases + master` → **267 / 267 / 0** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** (5 files) |
| `bun test tests/student-requests` | **1060 pass / 0 fail** (97 files) |
| `bunx tsgo --noEmit` (TS-only typecheck) | clean, exit 0 |
| `bun run build` | success (nitro build complete, Register footer present) |
| `git diff --check` | clean |
| Working tree after commit | clean; no generated `routeTree` noise committed |
| Manifest JSON validity | `MANIFEST_JSON_VALID` |

## G8 — DELIVERY

- Changed files this mission: `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`,
  `docs/B1-FUNCTION-GRAPH-ENTRYPOINT-READONLY-REATTESTATION-AND-SOURCE-REPIN-23-REPORT.md`.
- Local/remote equality: workspace tree clean and synchronized with the project remote after commit.

### FLAGS

`PRODUCTION_READ_ONLY` · `SOURCE_PRODUCTION_HASH_EQUAL` · `ENTRYPOINT_HASH_07D793B4` ·
`FUNCTION_GRAPH_28_OF_28` · `MATRIX_267_267_0` · `REBOUND_CASES_22` · `BASELINE_PENDING` ·
`FINGERPRINT_NULL` · `EXECUTION_AUTHORIZED_FALSE` · `OPERATOR_PREFLIGHT_NOT_RUN` ·
`NEGATIVE_CASES_EXECUTED_0` · `ZERO_RPC_CALLS` · `ZERO_PRODUCTION_WRITES` · `NO_MIGRATION` ·
`NO_ROLE_CHANGE` · `NO_DEPLOY` · `NO_PUBLISH`

**FINAL:** `PASS_B1_FUNCTION_GRAPH_ENTRYPOINT_REATTESTED_AND_REPINNED_READY_FOR_INDEPENDENT_REVIEW`
