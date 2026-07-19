# B1 Reproducible Release Build Remediation 01

## Decision

`PASS_B1_REPRODUCIBLE_RELEASE_CANDIDATE_READY_FOR_DEPLOY_AUTHORIZATION`

This is a source-only release-candidate result. It does not authorize SQL,
migrations, Supabase access, `student_visible`, workflow activation, deploy, or
publish. `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL` remains in
force.

## Scope and baseline

- Base candidate: `0caf990869eec4bbbdc5696b4c11639d3a2bb38f`.
- Branch: `codex/b1-reproducible-release-build-remediation-01`.
- Isolated worktree: `C:\projects\saba-uni-portal-reproducible-release-fix`.
- Clean-room runtime: `oven/bun:1.3.14`, using a container-internal filesystem
  and a fresh `git archive` in each cycle.
- No dependency version or lockfile entry was changed.

## Root-cause findings

### `lucide-react`

The registry artifact and lock entry are valid. `package.json` and `bun.lock`
resolve `lucide-react@0.575.0`; the lock integrity is:

`sha512-VuXgKZrk0uiDlWjGGXmKV6MSk9Yy4l10qgVvzGn2AWBx1Ylt0iBexKOAoA6I7JO3m+M9oeovJd3yYENfkUbOeg==`

An independently downloaded npm tarball produced the same integrity and
`90feaa4c140e9693e4ee9426d9927a6b833267ac` SHA-1. The tarball contains two CJS
files and 3,894 ESM files. Both clean Docker installations contained
`dist/cjs` and `dist/esm`, and both builds passed.

The evidence therefore confines the earlier missing-directory failure to a
Windows/Bun extraction environmental failure on the long host path, not a
malformed tarball, bad lock resolution, or invalid package version. A Windows
bind-mounted installation also stalled while extracting; moving installation to
the Linux container filesystem eliminated the failure. The evidence does not
distinguish the remaining sub-cause (Bun, path length, NTFS/bind I/O, or local
cache), so no narrower claim is made. The minimum safe remediation is
environmental isolation. No dependency update is justified.

### Queue contract

The failing queue check required the existing source-closure statement in the
worker registry. That documentation invariant is present. The P0 task was
recorded in the queue and its independent worktree recorded in the worker
history; after source work completed, the worker slot was released. The original
queue tests are unchanged from `origin/main`, priorities are unchanged, and no
production gate was opened.

### Generated route tree

The current TanStack generator lawfully emits the `Register` module augmentation.
That generated block is committed. `.gitattributes` now canonically stores
`src/routeTree.gen.ts` with LF endings, eliminating host-dependent CRLF/LF blob
changes.

Semantic comparison against `0caf990` is exact for all generated routing data:

- IDs: 200/200 identical.
- paths: 200/200 identical.
- full paths: 100/100 identical.
- parent relationships: 100/100 identical.
- no route was added, removed, or re-parented.

Both clean builds left every archived source file byte-identical, including
`src/routeTree.gen.ts`. Its SHA-256 in both cycles was
`6d8456cc43d349694221565d48c321ca8d365fe10f95654400f4b872a2cd9b68`.

## Independent clean-room cycles

| Check | Cycle 1 | Cycle 2 |
|---|---:|---:|
| `bun install --frozen-lockfile` | PASS, 602 packages | PASS, 602 packages |
| `bun test tests/student-requests` | 552 pass / 0 fail / 0 errors | 552 pass / 0 fail / 0 errors |
| `bunx tsc --noEmit` | PASS | PASS |
| `bun run build` | PASS | PASS |
| route/navigation tests | 6 pass / 0 fail | 6 pass / 0 fail |
| archived tracked-source comparison after build | clean | clean |
| `git diff --check` in isolated repository after build | PASS | PASS |
| `git status --porcelain` in isolated repository after build | empty | empty |
| generated output files | 687 | 687 |
| generated output bytes | 15,597,357 | 15,597,357 |
| route-tree SHA-256 | `6d8456cc...b68` | `6d8456cc...b68` |

The complete `.output` manifests had different aggregate hashes
(`bd9fdaba...53a2` and `ef0eec7d...3835`) because Nitro/Vite generated
per-process chunk identifiers. File count and total bytes were identical. This
does not mutate tracked source and is not used as a release identity; the Git
commit is the release identity.

Each archive was initialized as an independent Git repository with its source
baseline committed locally after the byte-for-byte source check. In both
containers, the already-completed install, tests, typecheck, and build were
followed by `git diff --check` PASS and an empty `git status --porcelain`. The
owning worktree was also clean before this report was added.

## Files changed

- `.gitattributes`: canonical LF for the generated route tree.
- `src/routeTree.gen.ts`: lawful TanStack `Register` augmentation.
- `docs/autopilot/TASK-QUEUE.md`: P0 task record.
- `docs/autopilot/ACTIVE-WORKERS.md`: isolated worker history and released slot.
- `docs/autopilot/DEPENDENCY-GRAPH.md`: release-remediation gate; production
  remains separately authorized.
- this report.

## Risk, assumptions, and production impact

- Remaining operational requirement: release builders should install on a
  container/Linux filesystem rather than a long Windows bind path.
- Nitro/Vite output chunk hashes are not deterministic across processes, so
  release verification must use the Git SHA and the successful clean-room
  checks, not an aggregate `.output` hash.
- No SQL, migration, production data, protected request, staff assignment,
  visibility, workflow, deploy, or publish action occurred.

## Review gate

Independent source review completed with `CRITICAL=0`, `HIGH=0`, and `MEDIUM=0`.
The reviewer confirmed the bounded Windows/Bun diagnosis, the two Git-clean
cycles, unchanged queue tests and dependencies, semantic route equivalence, and
closed production gates. Web CI and applicable Android CI must still pass before
merge. No deployment is authorized by a source merge.
