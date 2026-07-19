# B1 TanStack Register Stable Augmentation Remediation 01

## Decision

`PASS_B1_TANSTACK_REGISTER_DRIFT_REMEDIATED_READY_FOR_RELEASE_DEPLOY_AUTHORIZATION`

This is a source-only release-readiness result. It does not authorize deployment, SQL,
migrations, Supabase writes, workflow activation, or `student_visible` changes.

## Baseline and scope

- Baseline: `95c840a67c86a9bb1458435797a4060ca7819d58` (`origin/main` at task start).
- Branch: `codex/b1-tanstack-register-stable-augmentation-01`.
- Worktree: `C:\projects\saba-uni-portal-tanstack-register-fix`.
- Route semantics were not changed. The pinned route-model hash remains
  `7a1f5fd65a1716e5e5e09cb85ce240ba5ec7c1f6af0e04cf1d2c7d8bef6669b5`.

## Remediation

- The legal `@tanstack/react-start` `Register` declaration now lives in
  `src/types/tanstack-start-register.d.ts`, with types derived from `getRouter` and
  `startInstance`.
- `src/routeTree.gen.ts` contains generated routing data only.
- The installed TanStack Start route plugin unconditionally appends its generated
  Register footer and exposes no supported disable switch. The build therefore runs a
  narrowly scoped post-generation normalizer.
- The normalizer is fail-closed: it accepts a clean generated file or one exact,
  unique terminal footer. Altered, duplicate, non-terminal, or residual markers fail
  the build before a source write can conceal drift.
- Contract tests exercise clean, exact, altered, duplicate, and non-suffix inputs and
  verify the stable declaration contract plus route IDs, paths, parents, and full paths.

## Reproducible validation

The final committed candidate was validated twice from independent extracted Git
archives in fresh Linux containers using Bun 1.3.14 and
`bun install --frozen-lockfile`. Each cycle ran:

1. student-request tests;
2. `bunx tsc --noEmit`;
3. `bun run build`;
4. route/navigation and stable-augmentation contract tests;
5. `git diff --check` and a clean `git status --porcelain`.

Both cycles passed with:

- student requests: 560 pass, 0 fail, 0 errors;
- routes/navigation and contract: 14 pass, 0 fail;
- typecheck and build: PASS;
- diff check and post-build status: PASS / clean;
- `src/routeTree.gen.ts` SHA-256:
  `83b4569597988feedfd4e02e3d397a62d02cd634772fed0c68b8403dbd1395a2`;
- stable declaration SHA-256:
  `2c1a176a9bd818229b276ec31a4e0485b788bd79b6b411d2f0f32579096a4c03`.

## Independent review

The initial review found one HIGH fail-open condition in footer drift handling. The
normalizer and behavioral fixtures were strengthened. A fresh independent re-review is
required to confirm `CRITICAL=0 / HIGH=0 / MEDIUM=0` before merge.

## Production impact and remaining gate

There is no production impact. Web CI, applicable Android CI, and the independent
0/0/0 review must pass before source merge. Deployment remains a separate user-authorized
operation and was not performed.
