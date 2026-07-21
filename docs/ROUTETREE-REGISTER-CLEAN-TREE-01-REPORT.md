# ROUTETREE-REGISTER-CLEAN-TREE-01-REPORT

- **Task ID**: Q-13 / blocker B-4 (post-build `git status` dirty on `src/routeTree.gen.ts`).
- **Branch**: `fix/routetree-register-clean-tree` (from `main` @ `8f229d09d581d8128dc684f47ad989200312d210`).
- **Scope (per `docs/PORTAL-SWARM-FILE-OWNERSHIP.md`)**: `src/routeTree.gen.ts`, Register scripts/tests — exclusive to this task. No other source file touched.

## 1. Problem

After `bun run build` on `main`, the TanStack Start generator rewrites `src/routeTree.gen.ts` and appends its legal generated `Register` augmentation footer. The version committed on `main` did **not** contain that footer, so every build left the working tree dirty (`git status` shows a modified `src/routeTree.gen.ts`). Latest `main` was therefore not a reproducible clean-tree release candidate.

## 2. Evidence from reference reports

- **PR #171** (`docs/B1-TANSTACK-REGISTER-STABLE-AUGMENTATION-REMEDIATION-01-REPORT.md`, merged `a7d73d4`): stabilized the `Register` contract by moving the legal declaration into `src/types/tanstack-start-register.d.ts` and normalizing the generated file at build time.
- **PR #172** (`docs/B1-LOVABLE-GENERATED-REGISTER-COMPATIBILITY-REMEDIATION-01-REPORT.md`, merged `427b7eb`): replaced the normalizer with the read-only validator `scripts/validate-tanstack-route-tree-register.ts`, and **accepted the Lovable/TanStack generated footer** — a delta of exactly **10 added lines** in `src/routeTree.gen.ts` (one blank line + 9 footer lines). Documented generated-file SHA-256: `6d8456cc43d349694221565d48c321ca8d365fe10f95654400f4b872a2cd9b68`.
- **PR #180** (`docs/PORTAL-PARALLEL-ACTIVATION-AND-EXPANSION-CYCLE-01-REPORT.md`): documented the HOLD — "the TanStack generator added the legal Register footer to `src/routeTree.gen.ts`. Post-build Git status was therefore dirty. The validator accepted the footer, but latest main is not a reproducible clean-tree release candidate until the generator/source-state contract is reconciled in a separate source fix." This report is that separate source fix.

## 3. Exact change

`src/routeTree.gen.ts`: append, byte-exact, the one legal generated `Register` footer defined as `generatedRegisterFooter` in `scripts/validate-tanstack-route-tree-register.ts` — 10 lines at end of file:

```ts

import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
```

No other byte of the file changed. The route body is untouched; the committed file is now byte-identical to the generator output documented in #172 and re-observed in #180.

## 4. Verification (no local build executed — documented evidence + byte-level replication)

The sandbox could not run `bun run build`; verification relied on the documented generated output plus exact local replication of the repo's own checks:

- **Byte-exact baseline**: reconstructed committed `src/routeTree.gen.ts` from `main`; git blob SHA-1 `8595276a8e18d3f24d0cb5b9aa09e49b5903fdfd` — identical to the committed blob on `main` (85,465 bytes).
- **Route contract intact**: route semantic SHA-256 (per `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts`) of the committed file = pinned `7a1f5fd65a1716e5e5e09cb85ce240ba5ec7c1f6af0e04cf1d2c7d8bef6669b5` — unchanged after appending the footer (the footer contains no `id|path|fullPath|parentRoute|getParentRoute` semantic lines).
- **Validator simulation** (exact port of `validateGeneratedRegister`): committed file → `"absent"` (legal but not generator-equal); new file → `"present"` — exactly one byte-exact terminal footer, accepted by the build-time validator wired into `bun run build` (`vite build && bun run scripts/validate-tanstack-route-tree-register.ts`).
- **Generator-output identity**: SHA-256 of the new committed file = `6d8456cc43d349694221565d48c321ca8d365fe10f95654400f4b872a2cd9b68`, byte-for-byte the same value PR #172 recorded for the generated route tree with footer. New git blob SHA-1: `3fee5d3c1fb9f743f771e7a27c6fbae945ced7c8` (85,759 bytes = 85,465 + 294 footer bytes).
- **No route drift since #180**: the last commit touching `src/routeTree.gen.ts` (`6feedfb`, 2026-07-20) predates #180's clean-room validation; commits after `ff570f3` (#180) only merged coordination docs (#181). The validated generated output therefore still equals committed-body + footer.

## 5. Clean-tree verification step (documentation)

Reproduce after merge on a clean checkout of `main`:

```bash
bun install --frozen-lockfile
bun run build          # regenerates routeTree.gen.ts, then runs the read-only validator (must exit 0)
git status --porcelain # expected: empty output — src/routeTree.gen.ts committed == generated
```

Expected result: validator reports the legal `present` state and `git status --porcelain` prints nothing, i.e. post-build tree is clean (closes B-4). A stricter "footer must be present" assertion was deliberately **not** added to the contract test: the validator/contract intentionally accept both `absent` and `present` so a future generator that stops emitting the footer stays legal; clean-tree equality is guaranteed by committing the generator output itself.

## 6. Constraints honored

- Only `src/routeTree.gen.ts` (generated file, committed = generated) and this report were added/changed. No manual edits to the generated body; no migration; no merge performed.
