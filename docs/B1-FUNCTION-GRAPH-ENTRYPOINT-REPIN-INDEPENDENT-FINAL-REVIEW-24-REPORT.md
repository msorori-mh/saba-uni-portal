# B1-FUNCTION-GRAPH-ENTRYPOINT-REPIN-INDEPENDENT-FINAL-REVIEW-24

Date: 2026-08-02  
Mode: INDEPENDENT OFFLINE SOURCE AND CONTRACT REVIEW  
Repository: `msorori-mh/saba-uni-portal`  
Review branch: `review/b1-function-graph-repin-independent-final-24`  
Worktree: `C:\projects\saba-uni-portal-review-b1-repin-24`

## Final decision

`PASS_B1_FUNCTION_GRAPH_ENTRYPOINT_REPIN_INDEPENDENT_FINAL_REVIEW_READY_TO_RERUN_BASELINE_22`

This decision authorizes **rerunning** the post-Fixture authoritative Baseline
Capture-22 mission against the repinned graph. It does **not** authorize
Operator Preflight, negative/positive RPC execution, baseline pinning inside
this review, production SQL, migration/cleanup apply, deploy/publish, or merge.

---

## G0 — Exact source gate

| Check | Result |
|---|---|
| Local HEAD | `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` — **PASS** |
| `origin/main` | `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` — **PASS** |
| Working tree clean at review start | **PASS** |
| Based on prior main `993ce0ec…` | First parent of reviewed commit = `993ce0ec5cb45524759831de488940a4f25d00b0` — **PASS** |
| No later source commit on `origin/main` | `git rev-list --count 0bc2e27f..origin/main` = **0** — **PASS** |

| SHA role | Value |
|---|---|
| Exact reviewed SHA | `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` |
| Previous main SHA | `993ce0ec5cb45524759831de488940a4f25d00b0` |
| Production migration head (reattestation) | `20260801021541` |
| Prior author decision | `PASS_B1_FUNCTION_GRAPH_ENTRYPOINT_REATTESTED_AND_REPINNED_READY_FOR_INDEPENDENT_REVIEW` |

### Changed-file inventory (`993ce0ec..0bc2e27f`)

| Path | Change |
|---|---|
| `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` | Modified (+13 / −2 net on graph metadata + one hash) |
| `docs/B1-FUNCTION-GRAPH-ENTRYPOINT-READONLY-REATTESTATION-AND-SOURCE-REPIN-23-REPORT.md` | Added (189 lines) |

**Exactly two files. No unexpected semantic source change.** — **PASS**  
(Not `HOLD_B1_FUNCTION_GRAPH_REPIN_REVIEW_UNEXPECTED_DIFF`.)

Note: the reviewed tip is a merge commit (second parent `c5367fc0`); the
**net** tree delta versus `993ce0ec` remains the two files above.

---

## G1 — Manifest delta review

### Functional pin change (only)

| Field | Old | New |
|---|---|---|
| Signature | `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` | unchanged |
| `definition_sha256` | `109033a026b765266eb33ae5bd993118c9c6a69a3250520304b0c6ab9fedf791` | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |

### Structural invariants

| Check | Result |
|---|---|
| Exactly one function-graph entry changed | **PASS** (1 of 28) |
| Functions added / removed | **0 / 0** |
| `closure_size` | **28 → 28** |
| Signature changed | **No** |
| Owner expectation changed | **No** (`postgres`) |
| SECURITY DEFINER expectation changed | **No** (`DEFINER`) |
| `search_path` expectation changed | **No** (`search_path=public`) |
| Grant expectation changed | **No** (no grant fields altered; non-`function_graph` manifest equal) |
| MATRIX case / counts changed | **No** (`267 / 267 / 0`, rebound 22) |
| Fixture / Cleanup contract changed | **No** |
| Execution flags changed | **No** (`execution_authorized=false`, preflight/cases still zero) |
| Graph topology (excluding hash + provenance) | **Equal** |

### Provenance-only additions (non-runtime)

Added / updated metadata (not consumed by renderer execution semantics beyond
the pin hash itself):

* `function_graph.attested_at_utc`: `2026-07-29T22:45:00Z` → `2026-08-01T21:51:30Z`
* `function_graph.reattestation` object (`mission_id`, `production_migration_head=20260801021541`, `repinned_entries=1`, `graph_verdict`)
* On the entrypoint only: `definition_sha256_superseded`, `definition_source_migration=20260730175527`, `source_production_hash_equal=true`

`render-negative-cases.ts` reads `definition_sha256`, `security`, `owner`,
`search_path`, and graph scan/trigger contracts. It does **not** branch on
`reattestation`, `definition_sha256_superseded`, `definition_source_migration`,
or `source_production_hash_equal`. Non-graph manifest deep-equal to prior main:
**true**.

---

## G2 — Source hash reproduction (disposable PostgreSQL 17)

Source: `supabase/migrations/20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql`  
Final `CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(...)`  
(dollar-quote `$function$`; extracted body length **7420** chars).

Method (local Docker `postgres:17`, `check_function_bodies=off`, minimal stubs,
`pgcrypto`):

```text
encode(
  sha256(
    convert_to(
      btrim(regexp_replace(pg_get_functiondef(oid), '\s+', ' ', 'g')),
      'UTF8'
    )
  ),
  'hex'
)
```

| Property | Local result |
|---|---|
| Normalized SHA-256 | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |
| Required hash | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |
| Match | **YES** |
| Identity arguments | `p_step_id uuid, p_action text, p_comment text, p_payload jsonb` |
| Return type | `jsonb` |
| Owner | `postgres` |
| SECURITY DEFINER | `true` |
| `proconfig` / search_path | `search_path=public` |

### Source function security review

| Requirement | Verdict |
|---|---|
| Configured-action literal check (`B1_ACTION_TYPE_MISMATCH`) | **PASS** |
| Authorization before action-mismatch disclosure (`can_current_user_act_on_step` with configured `action_type` before literal compare) | **PASS** |
| Actor from `auth.uid()` | **PASS** |
| Direct-assignee enforcement (`B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`) | **PASS** |
| No general admin bypass | **PASS** (no admin/has_role bypass path) |
| No general registrar bypass | **PASS** (comment-only “registrar apply” wording; no role bypass) |
| No general dean bypass | **PASS** |
| No external/nontransactional side effect | **PASS** (no http/net/dblink/pg_notify/FDW; in-transaction SQL + `apply_b1_academic_effect_for_request` only) |

---

## G3 — Stale hash provenance

| Fact | Evidence | Verdict |
|---|---|---|
| Stale hash entered | Commit `ee03ab53213bdd9ac78e1c61564a69028b1905e1` (2026-07-29 04:57:04 +0000) — TARGET-MANIFEST pin `109033a0…` | **PASS** |
| Function redefinition entered | Commit `2c78a5ecd22d24fd6572f8b8f4a7c4537d946b99` (2026-07-30 17:55:33 +0000) — adds `supabase/migrations/20260730175527_…sql` | **PASS** |
| Stale-pin commit ancestor of redefinition | `git merge-base --is-ancestor ee03ab53 2c78a5ec` → success | **PASS** |
| Migration timestamp postdates stale attestation | `20260730175527` after 2026-07-29 pin | **PASS** |
| No later function redefinition | Latest `CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic` in `supabase/migrations` is `20260730175527_…` | **PASS** |
| Fixture migration `20260801021541` has no function DDL | 0× create/alter/drop function; 0× create trigger; 0× `act_on_b1` | **PASS** |

**Provenance verdict:** `EXPECTED_REVIEWED_EVOLUTION_NOT_UNEXPLAINED_PRODUCTION_DRIFT`

---

## G4 — Complete graph offline review (28 entries)

| Check | Result |
|---|---|
| Entries | **28** |
| Unique signatures | **28** |
| Null hashes | **0** |
| Duplicate signatures | **0** |
| Malformed hashes (non-`^[0-9a-f]{64}$`) | **0** |
| Entrypoint hash | `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` |
| Owners populated | **28/28** |
| SECURITY DEFINER expectations populated | **28/28** |
| search_path pins populated | **28/28** |
| Trigger closure retained | **PASS** (`trigger_aware_closure` unchanged; Migration-29 lock/guard helpers + student-profile trigger helpers remain) |
| Topology unmodified by repin | **PASS** |

---

## G5 — Fail-closed state

| Artifact field | Value | Required |
|---|---|---|
| `authoritative_baseline.status` | `PENDING` | PASS |
| `authoritative_baseline.fingerprint` | `null` | PASS |
| `execution_authorized` | `false` | PASS |
| `operator_preflight_executed` | `false` | PASS |
| `negative_cases_executed` | `0` | PASS |
| Fixture migration (production head recorded) | `20260801021541` (reattestation / Capture-22 record: applied once) | PASS |
| Cleanup migration | `docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-CLEANUP-13.NOT_APPLIED.sql` — **NOT_APPLIED** | PASS |
| `matrix.negative_total` | `267` | PASS |
| `executable_negative_total` | `267` | PASS |
| `blocked_negative_total` | `0` | PASS |
| `fixture_rebind.rebound_cases` | `22` | PASS |
| In-repo launcher readiness | still `FIXTURE_PACKAGE_NOT_APPLIED` + hold token (blocks auto preflight/RPC) | PASS |

`baseline/AUTHORITATIVE-BASELINE.json` remains `PENDING` /
`execution_authorized=false` / `fingerprint=null` /
`operator_preflight_executed=false` / `negative_cases_executed=0`.

**No source state grants automatic Operator Preflight or RPC execution.**

---

## G6 — Testing

| Command | Result |
|---|---|
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | **267 / 267 / 0** (`generated/MANIFEST.json`: negative_total=267, executable=267, blocked=0) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bun test tests/student-requests` | **1060 pass / 0 fail** (after one cold-cache timeout flake; clean re-run) |
| `bun test` | **2384 pass / 0 fail** (same SHA; initial 5s-timeout flakes on unrelated tests cleared on re-run with `--timeout 15000`) |
| `bunx tsc --noEmit` | **exit 0** |
| `bun run build` | **exit 0** |
| `git diff --check` | **clean** |
| `routeTree.gen.ts` noise | **none** |
| Final tree | **clean** (renderer output gitignored under `generated/`) |

Flake note: first-pass timeouts on
`b1-atomic-caller-integration-05a` and `import-templates` HIGH-3 were
**unrelated** to the repin (exact main tip); both pass on retry and the full
suite is green on the same SHA.

---

## Recommendation for Baseline Capture-22

**Safe to rerun** post-Fixture authoritative Baseline Capture-22 against
`origin/main` @ `0bc2e27f…` with the repinned entrypoint hash
`07d793b4…`, production migration head expectation `20260801021541`, and the
existing fail-closed gates (`execution_authorized` remains false until the
separate capture/review/authorization sequence completes).

Do **not** treat this review as baseline capture, Operator Preflight, or
execution authorization.

---

## Risks

1. Capture-22 must still prove live production fingerprint/graph match under
   read-only attestation; this review only validates the **source repin**.
2. In-repo `matrix.readiness.status` remains `FIXTURE_PACKAGE_NOT_APPLIED` by
   design — launcher stays blocked until the separate readiness flip after a
   valid baseline gate.
3. `expected_migration_head` inside the PENDING baseline artifact still reads
   `20260731203030` (stale relative to fixture head `20260801021541`); Capture-22
   must refresh that artifact — not altered by this repin mission.

---

## Assumptions

* Production was not contacted; production values are taken only from the
  committed reattestation report/manifest provenance fields.
* “Fixture Migration = APPLIED” refers to the recorded production migration
  head `20260801021541`, not the in-repo launcher readiness enum.

## Production impact

**None from this review.** Report-only commit on the review branch. No RPC,
no preflight, no baseline pin, no apply, no deploy, no merge to main.

## Obstacles

* Fresh `bun install` required in the new worktree.
* Initial full-suite 5s timeouts under cold cache; cleared on re-run.

---

## Final decision (token)

`PASS_B1_FUNCTION_GRAPH_ENTRYPOINT_REPIN_INDEPENDENT_FINAL_REVIEW_READY_TO_RERUN_BASELINE_22`
