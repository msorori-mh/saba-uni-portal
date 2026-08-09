# PORTAL FINAL RC V4 — Integration Manifest

Mission: `PORTAL-FINAL-RC-V4-PREBUILD-NON-B1-INTEGRATION-LONGRUN-01`

**Status:** non-B1 synthetic RC candidate ready for B1 insertion slot.

## Pinned SHAs (resolved at runtime via `gh`)

```
MAIN_BASE_SHA=1b14201e5939cdbf17e7b5e5d79be7ad5b6b2149
MAIN_TIP_ABSORBED_SHA=0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f
GP_PR293_SHA=301f71c1c09e52c4098712d5d2a1299344a28bb8
GA_PR291_SHA=b97ec3100c830c7e82a0bf75a11318b73ae44d8d
GA_PR299_SHA=b5d4e08e7ab9a7f56942a0e021958d903174bad1
COUNCILS_PR311_SHA=45924a5972afe93368018f53e741c10761561191
FACULTY_PR312_SHA=3f20eee9c9c12846757ea7d122f0a41b5c44698a
B1_PR310_SHA=PENDING
```

Notes:

- `MAIN_BASE_SHA` is `origin/main` HEAD at inventory start.
- During integration, main advanced by two commits (Lovable security-scan migration
  `20260809183940_e3eff340-…`). That tip was absorbed as a final merge so the RC
  stays current with main without rewriting history.
- `B1_PR310_SHA=PENDING` — PR #310 is intentionally excluded.

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
8. Add this manifest + mission report (docs-only commit)

## Dependency graph (runtime)

```
main (1b14201e)
├── #293 GP fixtures (independent)
├── #291 GA remediation ──► #299 GA promotion (stacked on #291)
├── #311 Councils tip (stacked on councils C9 readiness; merge-base e71d9aa8)
└── #312 Faculty dashboard (independent)

#310 B1 → NOT INTEGRATED (PENDING slot)
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

Do **not** alter GA/Councils/GP security semantics to force B1 in.

## Migration ordering (executable)

New promoted migrations on this RC (lexicographic apply order):

| Version | Stream | File |
|---|---|---|
| 20260808120000…20260808180000 | Councils #311 | `councils_c0` … `councils_c9` (10 files) |
| 20260808210000 | GA #299 | `ga_mvp_foundation_01.sql` |
| 20260808210100 | GA #299 | `ga_mvp_completion_01.sql` |
| 20260808210200 | GA #299 | `ga_authorization_04.sql` |
| 20260809183940 | main tip | Lovable security-scan follow-up |

Collision proof (candidate tip): unique versions = file count; no duplicate
filenames; drafts remain under `docs/migration-drafts/` only.

## Guardrails

- `PRODUCTION_READS=0` / `PRODUCTION_WRITES=0`
- `MIGRATIONS_APPLIED_TO_PRODUCTION=0`
- `DEPLOY=NO` / `MERGE_TO_MAIN=NO`
- Draft PR only
