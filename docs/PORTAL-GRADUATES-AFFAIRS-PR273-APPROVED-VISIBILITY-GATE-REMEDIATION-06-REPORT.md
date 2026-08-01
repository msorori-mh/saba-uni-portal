# PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-VISIBILITY-GATE-REMEDIATION-06-REPORT

Date: 2026-08-01
Mission: PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-VISIBILITY-GATE-REMEDIATION-06
PR: #273 (kept Draft; not merged)
Mode: LONG AUTONOMOUS SOURCE-ONLY SECURITY REMEDIATION. No production access,
no migration apply, no deploy/publish, no new role/enum, no RLS weakening, no
privacy-control removal, no owner-decision implementation, no force push.

## Final decision

**PASS_PORTAL_GRADUATES_AFFAIRS_PR273_APPROVED_VISIBILITY_GATE_REMEDIATED_READY_FOR_INDEPENDENT_REVIEW**

## SHAs

| Item | Value |
|---|---|
| PR head before remediation | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` |
| origin/main merged | `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` |
| Merge commit (normal merge, no rebase, no conflicts) | `e971411087915145a5ab31e4d49932e221281bbf` |
| PR head after remediation | recorded below after push (local = remote) |

Main-merge contents: two review docs + the B1 `TARGET-MANIFEST.json`
read-only re-attestation repin — preserved byte-identical (no GA runtime
semantics touched). No Graduation Projects files changed at any point.

## Affected RPC inventory (Phase B)

Every SECURITY DEFINER list/discovery RPC was compared against its RLS
visibility policy:

| RPC | RLS counterpart | Missing predicate (before) | Disposition |
|---|---|---|---|
| `graduate_list_visible_opportunities` | `graduate_opportunities_select_audience` → `graduate_self_matches_audience` (requires `record_state='approved'`) | approved-lifecycle gate on the self record | **FIXED** |
| `graduate_list_visible_events` | `graduate_events_select_audience` → same helper | same | **FIXED** |
| `graduate_my_contact_points` | self RLS on own rows only; no published-content dimension | none — own-metadata read | unaffected |
| `graduate_affairs_search_records` | none (staff-only; table policy-less) | n/a — returns `record_state` explicitly to scoped staff; staff inventory requires lifecycle visibility | by design, unchanged |
| `graduate_affairs_get_graduate_file` | none (staff-only) | n/a — returns `record_state`; staff must see corrected/revoked cases | by design, unchanged |
| `graduate_affairs_cohort_employment_report` | none (staff-only) | none — underlying aggregate already filters `record_state='approved'` | unaffected |

Root cause: the two graduate-facing list RPCs checked `graduate_is_self`
(any lifecycle state) and joined `graduate_records` without the
`record_state='approved'` gate, while the RLS policies resolve through
`graduate_self_matches_audience`, which requires it. A published engagement
stayed visible through the RPC after the record became corrected/revoked.

## Failing reproduction (Phase B, before the fix)

Expanded verifier section J run against the unremediated draft:

```
psql:<stdin>:789: ERROR:  VISIBILITY BYPASS: opportunity list RPC still serves a corrected record
```

The corrected record's list RPC still returned the published all-graduates
opportunity while the direct RLS path already returned zero rows.

## Fixed predicates (Phase C)

- New canonical fail-closed helper `graduate_is_current_self(uuid)`:
  self **AND** `record_state='approved'` — the exact predicate the RLS
  policies use. STABLE, SECURITY DEFINER, pinned `search_path`, revoked from
  `PUBLIC, anon, authenticated` (internal helper; not client-executable).
- Both list RPCs now raise `GRADUATE_RECORD_NOT_CURRENT` when the gate fails,
  after the existing `GRADUATE_AFFAIRS_ACCESS_DENIED` non-self check. One
  helper, one predicate — no duplicated divergent conditions.
- Publication/active gates (`state='published'`, close-window), audience
  filters (`graduate_audience_matches`), department/program scope, minimum-cell
  suppression and PII protections are unchanged. Empty/malformed audience
  remains fail-closed. Manager/specialist scope untouched. No RLS is relied
  upon inside SECURITY DEFINER (all predicates explicit).

## RLS/RPC parity evidence + transition matrix (Phases D/F)

Executable in `graduates-affairs-authorization-04.pg-verify.sql` section J:

| Scenario | RPC result | Direct RLS result | Verdict |
|---|---|---|---|
| approved + published + in-audience | exactly 1 row, once | exactly 1 row | parity ✔ |
| approved→corrected (record A) | `GRADUATE_RECORD_NOT_CURRENT` | 0 rows | parity ✔ |
| approved→revoked (record B) | `GRADUATE_RECORD_NOT_CURRENT` | 0 rows | parity ✔ |
| approved→unpublished (close/cancel) | row gone immediately | row gone immediately | parity ✔ |
| corrected→approved | `INVALID_OFFICIAL_GRADUATION_DECISION_TRANSITION`, zero mutation | — | denied ✔ |
| revoked→approved | same, zero mutation | — | denied ✔ |
| draft engagement | invisible | invisible | ✔ |
| malformed audience (`"not-an-object"`, `42`) | invisible, no error | invisible | ✔ |
| empty audience (`{}`, empty arrays) | invisible | invisible | ✔ |
| wrong department/program | invisible | invisible | ✔ |
| anonymous | `GRADUATE_AFFAIRS_NOT_AUTHENTICATED` / denied | 0 rows | ✔ |
| pending/unapproved decision | no graduate record can exist (foundation guard) | — | ✔ |

## Actor matrix (Phase E)

Verified across sections C–J7: anonymous, graduate self, another graduate,
unlinked authenticated user, manager, specialist in-scope, specialist
out-of-scope, direct follow-up assignee, unrelated staff, inactive assignment,
expired assignment, and registrar/dean/admin analogues (J7 — the domain never
consults `app_role`, pinned by the text contract `no app_role / has_any_role
based authorization`, so a privileged-role holder is exactly an unassigned
authenticated user; all staff and list RPCs deny them with zero mutation).
No admin/registrar/dean universal bypass exists.

## PostgreSQL 17 results (Phase F)

Disposable `postgres:17` Docker cluster, full chain
`setup → foundation → completion → authorization-04 → verifier`:

- Before fix: FAIL at J4 (`VISIBILITY BYPASS`, reproduced above).
- After fix: **PASS** (`graduates-affairs-authorization-04 pg-verify: PASS`).
- corrected/revoked visible rows = 0 on both paths; approved intended rows
  visible exactly once; rejected calls mutate zero rows (decision state and
  `graduate_domain_events` counts asserted); PII columns never returned;
  PUBLIC/anon EXECUTE denied on all RPCs and helpers (privilege matrix,
  including the new helper); SECURITY DEFINER + pinned `search_path` on all
  29 functions; exactly 7 graduate_* policies.

## Application results (Phase G)

| Check | Result |
|---|---|
| `bun test tests/graduates-affairs` | **113/113** (was 110; +3 parity contract tests) |
| `bun test tests/student-requests` | **1060/1060** (one non-reproducible flake under heavy concurrent load; 6 consecutive clean re-runs — same pre-existing timing sensitivity recorded in CLOSURE-04) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183/183** |
| `bun test` (full) | **2468/2468** |
| `bunx tsc --noEmit` | clean |
| `bun run build` | client + SSR pass |
| `git diff --check` | clean |

## Changed files

- `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` — canonical
  `graduate_is_current_self` helper, approved gate in both list RPCs, helper
  REVOKE. (Name preserved per the accepted GA-family naming exception —
  Phase H.)
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql` —
  regression section J1–J7 (parity, transitions, negatives, privileged-role
  analogues), helper privilege pin.
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql` —
  three privileged-role-analogue fixture users.
- `tests/graduates-affairs/graduates-affairs-authorization-04-sql.test.ts` —
  helper inventory, 29-function count, approved-gate parity contract tests.
- `docs/PORTAL-GRADUATES-AFFAIRS-PR273-APPROVED-VISIBILITY-GATE-REMEDIATION-06-REPORT.md` — this report.
- Merge metadata only: `e971411` (main docs + B1 manifest repin, unmodified).

## CI result

The `graduates-affairs-authorization` pg-verifiers leg (added in this PR) runs
exactly the chain executed locally above; local disposable-PG17 execution of
that exact chain PASSes. Foundation/completion legs are untouched and their
files unmodified. (GitHub Actions status is visible on PR #273 checks.)

## Final PR head / local-remote equality

Recorded in the closing summary: after push, `git rev-parse HEAD` equals the
remote branch tip (verified via `git ls-remote`).

## Production impact

Zero. No production connection, no SQL apply, no migration, no deploy, no
publish, no account/data/document change. The draft remains NOT_APPLIED; the
domain remains default-deny.
