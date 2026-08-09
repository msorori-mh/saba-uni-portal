# PORTAL FINAL RC V4 â€” Integration Manifest

Mission: `PORTAL-RC313-INTEGRATE-PWA315-ADMIN317-FINAL-NONB1-CLOSURE-LONGRUN-04`
(prior: `PORTAL-RC313-PR314-SEMANTIC-INTEGRATION-REMEDIATION-LONGRUN-03`
 â†’ `PORTAL-RC313-INTEGRATE-PR314-FACULTY-COUNCILS-UX-LONGRUN-02`
 â†’ `PORTAL-FINAL-RC-V4-PREBUILD-NON-B1-INTEGRATION-LONGRUN-01`)

**Status:** FINAL NON-B1 candidate for Draft PR #313.
Includes portal-wide PWA install (#315) and Admin navigation/dashboard UX (#317)
on top of Faculty Academic Councils operational UX (#314) with semantic
remediation preserving #311/#313 server consumers.

After LONGRUN-04, no new UI feature streams should enter this RC unless an
actual release blocker requires it. B1 (#310) remains the only planned
insertion slot.

## Pinned SHAs (resolved at runtime via `gh`)

```
MAIN_BASE_SHA=1b14201e5939cdbf17e7b5e5d79be7ad5b6b2149
MAIN_TIP_ABSORBED_SHA=0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f
GP_PR293_SHA=301f71c1c09e52c4098712d5d2a1299344a28bb8
GA_PR291_SHA=b97ec3100c830c7e82a0bf75a11318b73ae44d8d
GA_PR299_SHA=b5d4e08e7ab9a7f56942a0e021958d903174bad1
COUNCILS_PR311_SHA=45924a5972afe93368018f53e741c10761561191
FACULTY_PR312_SHA=3f20eee9c9c12846757ea7d122f0a41b5c44698a
FACULTY_COUNCILS_UX_PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f
PWA_PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c
ADMIN_UX_PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819
B1_PR310_SHA=PENDING
```

### RC tip SHA vocabulary (unambiguous)

Do **not** use a bare `RC_SHA` label when multiple tips exist across commits.

```
RC_IMPLEMENTATION_SHA=0fc1d7b9384be7d0b00fd8d2feb41a00d2a12938
RC_PREVIOUS_HEAD_SHA=aff53654d23c5c2bb041e4770d8fe4cba6d8fb9c
RC_MECHANICAL_MERGE_SHA=954ba6655c3dd48c5e5a8baa6289a5037752e737
RC_LONGRUN03_DOCS_HEAD_SHA=aff53654d23c5c2bb041e4770d8fe4cba6d8fb9c
RC_PWA315_MERGE_SHA=04ee5a2c
RC_ADMIN317_MERGE_SHA=05ba4920
RC_CURRENT_HEAD_SHA=5a000089633b0b66956e2de96dc68a30f4bcfc23
```

Notes:

- `RC_PREVIOUS_HEAD_SHA` / `RC_LONGRUN03_DOCS_HEAD_SHA` â€” Draft PR #313 tip at
  LONGRUN-04 start (`aff53654â€¦`), OLD_RC_SHA for this mission.
- `RC_PWA315_MERGE_SHA` â€” `--no-ff` merge of #315 into RC.
- `RC_ADMIN317_MERGE_SHA` â€” `--no-ff` merge of #317 into RC (after #315).
- `RC_CURRENT_HEAD_SHA` â€” tip after LONGRUN-04 manifest + mission report commit.
- `MAIN_BASE_SHA` is `origin/main` HEAD at LONGRUN-01 inventory start.
- `MAIN_TIP_ABSORBED_SHA=0ba4ee53â€¦` remains current absorbed main tip.
- `B1_PR310_SHA=PENDING` â€” PR #310 is intentionally excluded.
- `PWA_PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c`
- `ADMIN_UX_PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819`

## Exact integration order

1. Branch from `MAIN_BASE_SHA` â†’ `rc/portal-final-v4-prebuild-non-b1-01`
2. `integrate(pr-293)` â€” Graduation Projects Level-4 TEST_ONLY fixture package
3. `integrate(pr-291)` â€” Graduates Affairs multimodel authorization remediation
4. `integrate(pr-299)` â€” Graduates Affairs stacked promotion/authorization path
   (ancestor of `#291` tip; no duplicate commits applied)
5. `integrate(pr-311)` â€” Academic Councils C0â€“C9 legacy production reconciliation
   (mechanical conflict resolution only: CI trigger union + route semantic hash pin)
6. `integrate(pr-312)` â€” Faculty Dashboard operational-priority redesign
7. `merge(origin/main)` â€” absorb `MAIN_TIP_ABSORBED_SHA`
8. Add LONGRUN-01 manifest + mission report (docs-only)
9. `integrate(pr-314)` â€” Faculty Academic Councils operational dashboard UX
   (LONGRUN-02 mechanical merge; conflict on `faculty-portal.academic-councils.tsx`)
10. LONGRUN-03 semantic remediation â€” restore #311/#313 consumers inside #314 UX:
    reports discovery, topic review queue, edit/resubmit, open-intake submit
    (`meeting_id`), C9 governance/role dashboards/notification bell; single
    composition (no duplicated operational sections)
11. `integrate(pr-315)` â€” Portal-wide PWA install experience (LONGRUN-04; `--no-ff`)
12. `integrate(pr-317)` â€” Admin navigation IA + dashboard UX (LONGRUN-04; `--no-ff`)
13. LONGRUN-04 docs â€” update this manifest + final non-B1 closure report

## Integrated PR list (current)

```
#293
#291
#299
#311
#312
#314
#315
#317
```

`B1_PR310_SHA=PENDING`

## Dependency graph (runtime)

```
main (1b14201e) â€¦ tip absorbed 0ba4ee53
â”œâ”€â”€ #293 GP fixtures (independent)
â”œâ”€â”€ #291 GA remediation â”€â”€â–؛ #299 GA promotion (stacked on #291)
â”œâ”€â”€ #311 Councils tip (stacked on councils C9 readiness; merge-base e71d9aa8)
â”œâ”€â”€ #312 Faculty dashboard (independent)
â”œâ”€â”€ #314 Faculty councils operational UX (independent UI on main tip;
â”‚        LONGRUN-03 adapts presentation while retaining #311 contracts)
â”œâ”€â”€ #315 Portal-wide PWA install (UI/SW; zero migrations)
â””â”€â”€ #317 Admin nav + dashboard UX (UI-only; zero migrations)

#310 B1 â†’ NOT INTEGRATED (PENDING slot)
```

## B1 insertion slot (minimum work)

When `#310` is green:

1. Fetch `pull/310/head` and pin `B1_PR310_SHA=<headOid>`.
2. Merge onto this RC tip (prefer `--no-ff`).
3. Re-run collision check on `supabase/migrations/` versions/filenames.
4. Re-pin `ROUTE_SEMANTIC_SHA256` only if `src/routeTree.gen.ts` changes.
5. Re-run: `bun test tests/student-requests`, domain suites touched by B1,
   `bunx tsc --noEmit`, `bun run build`, `git diff --check`.
6. Update this manifest: replace `B1_PR310_SHA=PENDING` with the real SHA.

Do **not** alter GA/Councils/GP/PWA/Admin security semantics to force B1 in.

## Migration ordering (executable)

New promoted migrations on this RC (lexicographic apply order):

| Version | Stream | File |
|---|---|---|
| 20260808120000â€¦20260808180000 | Councils #311 | `councils_c0` â€¦ `councils_c9` (10 files) |
| 20260808210000 | GA #299 | `ga_mvp_foundation_01.sql` |
| 20260808210100 | GA #299 | `ga_mvp_completion_01.sql` |
| 20260808210200 | GA #299 | `ga_authorization_04.sql` |
| 20260809183940 | main tip | Lovable security-scan follow-up |

#314 / #315 / #317 / LONGRUN-03 / LONGRUN-04 add **zero** migrations.

```
PWA_NEW_MIGRATIONS=0
ADMIN_NEW_MIGRATIONS=0
DUPLICATE_MIGRATION_VERSIONS=0
DUPLICATE_MIGRATION_FILENAMES=0
HISTORICAL_MIGRATION_REWRITES=0
```

Collision proof (candidate tip): unique versions = file count; no duplicate
filenames; drafts remain under `docs/migration-drafts/` only.
Do not modify the 15-file authoritative runbook graph for UI-only streams.

## Route semantic pin

`ROUTE_SEMANTIC_SHA256=0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef`

#315 / #317 / LONGRUN-04 do not modify `src/routeTree.gen.ts` or route semantics;
pin retained after verified recomputation. Reports discovery path
`/faculty-portal/academic-councils/reports` remains registered and linked.
`ROUTE_LOSS_COUNT=0`.

## PWA security closure preserved (#315)

```
STATIC_CACHE_POLICY=POSITIVE_ALLOWLIST_ONLY
PWA_STATIC_SHELL_ONLY=PASS
SENSITIVE_CACHE_DENY=PASS
AUTH_SESSION_SAFETY=PASS
CREDENTIALLED_RUNTIME_CACHE_DENY=PASS
PRIVATE_RESPONSE_CACHE_DENY=PASS
NO_STORE_RESPONSE_CACHE_DENY=PASS
SERVER_FN_CACHE_DENY=PASS
CROSS_ORIGIN_BYPASS=PASS
OFFLINE_PRIVACY=PASS
PRIVATE_CACHE_AFTER_LOGOUT=0
OWNED_CACHE_PREFIX_ENFORCED=YES
FOREIGN_CACHE_DELETE_COUNT=0
UPDATE_LIFECYCLE=PASS
```

Protected path deny includes `/admin`, `/faculty-portal`, student requests/documents,
councils, graduation-projects, graduates-affairs. No extension-based runtime caching.

## Admin UX invariants preserved (#317)

```
NAV_GROUPS_REORGANIZED=YES
NAV_SEARCH=YES
ROLE_FILTERING_PRESERVED=YES
SEARCH_AUTHORIZATION_ISOLATION=PASS
ROLE_FILTER_CONTRACT=PASS
FINANCE_GATE=PASS
MISSING_NAV_ROUTES=0
DUPLICATE_NAV_ROUTES=0
INVENTED_NAV_ROUTES=0
```

No Graduates Affairs Admin route invented.

## Guardrails

- `PRODUCTION_READS=0` / `PRODUCTION_WRITES=0`
- `MIGRATIONS_APPLIED_TO_PRODUCTION=0`
- `DEPLOY=NO` / `MERGE_TO_MAIN=NO`
- Draft PR only
