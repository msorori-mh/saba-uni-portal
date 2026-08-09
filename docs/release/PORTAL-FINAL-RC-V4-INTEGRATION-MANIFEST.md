# PORTAL FINAL RC V4 — Integration Manifest

Mission: `PORTAL-FINAL-RC313-B1-INSERTION-AND-SOURCE-CLOSURE-LONGRUN-05`
(prior: `PORTAL-RC313-PWA315-ADMIN317-FINAL-NONB1-CLOSURE-LONGRUN-04`
 → `PORTAL-RC313-PR314-SEMANTIC-INTEGRATION-REMEDIATION-LONGRUN-03`
 → `PORTAL-RC313-INTEGRATE-PR314-FACULTY-COUNCILS-UX-LONGRUN-02`
 → `PORTAL-FINAL-RC-V4-PREBUILD-NON-B1-INTEGRATION-LONGRUN-01`)

**Status:** FINAL SOURCE RC candidate for Draft PR #313.

This tip is the FINAL SOURCE RC composition. No additional feature streams
enter after this point. B1 (#310) is integrated.

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
B1_PR310_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
B1_IMPLEMENTATION_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
```

### RC tip SHA vocabulary (unambiguous)

Do **not** use a bare `RC_SHA` label when multiple tips exist across commits.

```
OLD_RC_HEAD_SHA=fc103581b71f26213e0b1dbab69166810047501f
B1_IMPLEMENTATION_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
FINAL_RC_PRODUCT_SHA=393626a81ba5b6200b56326ffb72c7604b1cdf8d
FINAL_RC_HEAD_SHA=e775b4dd00881d06d2881d480bdffbd7ff8368f1
RC_PREVIOUS_NONB1_HEAD_SHA=fc103581b71f26213e0b1dbab69166810047501f
RC_B1_MERGE_SHA=393626a81ba5b6200b56326ffb72c7604b1cdf8d
```

Notes:

- `OLD_RC_HEAD_SHA` — Draft PR #313 tip at LONGRUN-05 start (green Web CI + Migration Review).
- `B1_IMPLEMENTATION_SHA` — LONGRUN-18 product closure on #310 (`cd78a6b4…`).
- `B1_FINAL_HEAD_SHA` / `B1_PR310_SHA` — reviewed green #310 head including LONGRUN-18 docs (`1bdd2faf…`).
- `FINAL_RC_PRODUCT_SHA` / `RC_B1_MERGE_SHA` — `--no-ff` merge of #310 into RC with `.gitattributes` STRICT UNION.
- `FINAL_RC_HEAD_SHA` — tip after LONGRUN-05 docs pin (updated in the docs commit).
- `MAIN_TIP_ABSORBED_SHA=0ba4ee53…` remains current absorbed main tip.

## Exact integration order

1. Branch from `MAIN_BASE_SHA` → `rc/portal-final-v4-prebuild-non-b1-01`
2. `integrate(pr-293)` — Graduation Projects Level-4 TEST_ONLY fixture package
3. `integrate(pr-291)` — Graduates Affairs multimodel authorization remediation
4. `integrate(pr-299)` — Graduates Affairs stacked promotion/authorization path
   (ancestor of `#291` tip; no duplicate commits applied)
5. `integrate(pr-311)` — Academic Councils C0–C9 legacy production reconciliation
   (mechanical conflict resolution only: CI trigger union + route semantic hash pin)
6. `integrate(pr-312)` — Faculty Dashboard operational-priority redesign
7. `merge(origin/main)` — absorb `MAIN_TIP_ABSORBED_SHA`
8. Add LONGRUN-01 manifest + mission report (docs-only)
9. `integrate(pr-314)` — Faculty Academic Councils operational dashboard UX
   (LONGRUN-02 mechanical merge; conflict on `faculty-portal.academic-councils.tsx`)
10. LONGRUN-03 semantic remediation — restore #311/#313 consumers inside #314 UX
11. `integrate(pr-315)` — Portal-wide PWA install experience (LONGRUN-04; `--no-ff`)
12. `integrate(pr-317)` — Admin navigation IA + dashboard UX (LONGRUN-04; `--no-ff`)
13. LONGRUN-04 docs — final non-B1 closure report
14. `integrate(pr-310)` — B1 production-state reconciliation + definitive operator
    architecture (LONGRUN-05; `--no-ff`; `.gitattributes` STRICT UNION)
15. LONGRUN-05 docs — this manifest + B1 insertion / source-closure report

## Integrated PR list (FINAL SOURCE RC)

```
#293
#291
#299
#311
#312
#314
#315
#317
#310
```

## Dependency graph (runtime)

```
main (1b14201e) … tip absorbed 0ba4ee53
├── #293 GP fixtures (independent)
├── #291 GA remediation ──► #299 GA promotion (stacked on #291)
├── #311 Councils tip (stacked on councils C9 readiness; merge-base e71d9aa8)
├── #312 Faculty dashboard (independent)
├── #314 Faculty councils operational UX (independent UI on main tip;
│        LONGRUN-03 adapts presentation while retaining #311 contracts)
├── #315 Portal-wide PWA install (UI/SW; zero migrations)
├── #317 Admin nav + dashboard UX (UI-only; zero migrations)
└── #310 B1 definitive operator architecture + Fixture-15 / 267 matrix
         (LONGRUN-18 product @ cd78a6b4; final head @ 1bdd2faf)
```

## B1 insertion result (LONGRUN-05)

```
B1_PR310_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
B1_IMPLEMENTATION_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
TEXT_CONFLICTS=1
SEMANTIC_CONFLICTS=0
GITATTRIBUTES_SEMANTIC_LOSS=0
B1_NEW_EXECUTABLE_MIGRATIONS=0
DUPLICATE_MIGRATION_VERSIONS=0
DUPLICATE_MIGRATION_FILENAMES=0
HISTORICAL_MIGRATION_REWRITES=0
ROUTE_LOSS_COUNT=0
B1_LONGRUN18_PRESERVED=YES
```

`.gitattributes` resolved as STRICT UNION of RC/GA LF policies and B1 harness LF
normalization. No side taken wholesale. Route semantic pin retained (tree unchanged).

## Migration ordering (executable)

New promoted migrations on this RC (lexicographic apply order):

| Version | Stream | File |
|---|---|---|
| 20260808120000…20260808180000 | Councils #311 | `councils_c0` … `councils_c9` (10 files) |
| 20260808210000 | GA #299 | `ga_mvp_foundation_01.sql` |
| 20260808210100 | GA #299 | `ga_mvp_completion_01.sql` |
| 20260808210200 | GA #299 | `ga_authorization_04.sql` |
| 20260809183940 | main tip | Lovable security-scan follow-up |

#314 / #315 / #317 / #310 / LONGRUN-03 / LONGRUN-04 / LONGRUN-05 add **zero**
executable migrations under `supabase/migrations/`.

```
B1_NEW_EXECUTABLE_MIGRATIONS=0
PWA_NEW_MIGRATIONS=0
ADMIN_NEW_MIGRATIONS=0
DUPLICATE_MIGRATION_VERSIONS=0
DUPLICATE_MIGRATION_FILENAMES=0
HISTORICAL_MIGRATION_REWRITES=0
```

## Route semantic pin

`ROUTE_SEMANTIC_SHA256=0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef`

#310 / LONGRUN-05 do not modify `src/routeTree.gen.ts` or route semantics;
pin retained after verified identity with `OLD_RC_HEAD_SHA`.
`ROUTE_LOSS_COUNT=0`.

## Cross-system security preservation (post-B1)

```
GP_SECURITY_PRESERVED=YES
GA_SECURITY_PRESERVED=YES
COUNCILS_SECURITY_PRESERVED=YES
FACULTY_SECURITY_PRESERVED=YES
PWA_SECURITY_PRESERVED=YES
ADMIN_SECURITY_PRESERVED=YES
STUDENT_REQUEST_SECURITY_PRESERVED=YES
ENROLLMENT_CERTIFICATE_PRESERVED=YES
```

No universal admin/dean/registrar bypass introduced by B1 insertion.

## Guardrails

- `PRODUCTION_READS=0` / `PRODUCTION_WRITES=0`
- `MIGRATIONS_APPLIED_TO_PRODUCTION=0`
- `DEPLOY=NO` / `MERGE_TO_MAIN=NO`
- Draft PR only
