# B1 Lovable Generated Register Compatibility Remediation 01

## Decision

`PASS_B1_LOVABLE_REGISTER_GENERATOR_COMPATIBILITY_READY_FOR_DEPLOY_AUTHORIZATION`

This is a source-only release-readiness decision. It does not authorize deployment,
SQL, migrations, Supabase writes, workflow activation, or `student_visible` changes.

## Baseline and verified Lovable delta

- Task baseline: `875f0444501959656c0d59b209537ac90f8f2260`.
- Previous merged baseline: `a7d73d4247a6ef8cf254d84888571d1ccdd34d46`.
- The complete delta between those commits is ten added lines in
  `src/routeTree.gen.ts`: one exact legal TanStack Start Register footer at EOF.
- No route ID, path, full path, parent relationship, auth rule, server function, or
  feature flag changed in that delta.

## Compatibility remediation

- `src/types/tanstack-start-register.d.ts` remains the stable declaration source.
- The build no longer invokes a normalizer and never deletes or rewrites the generated
  footer.
- `scripts/validate-tanstack-route-tree-register.ts` is read-only and accepts exactly:
  1. no generated Register footer; or
  2. one byte-exact legal footer at the end of the generated file.
- The validator fails closed for changed imports or types, altered formatting, a
  duplicate or non-terminal footer, residual markers, or more than one augmentation.
- Contract tests pin route IDs, paths, full paths, and parent relationships and include
  explicit fixtures for both legal generated states and all required denial states.

## Clean-room validation

The final committed candidate was validated twice from independent extracted Git
archives in fresh Linux containers using Bun 1.3.14 and
`bun install --frozen-lockfile`. Each cycle ran student-request tests, typecheck,
build, route/navigation and contract tests, `git diff --check`, and a clean post-build
`git status --porcelain` assertion.

Both cycles passed with:

- student requests: 561 pass, 0 fail, 0 errors;
- routes/navigation and Register contract: 15 pass, 0 fail;
- footer-present fixture: PASS;
- footer-absent fixture: PASS;
- illegal footer fixtures: DENY/PASS;
- TypeScript with stable plus generated declarations: PASS;
- build and SSR bundle generation: PASS;
- post-build diff/status: PASS / clean;
- generated route tree SHA-256:
  `6d8456cc43d349694221565d48c321ca8d365fe10f95654400f4b872a2cd9b68`;
- stable declaration SHA-256:
  `2c1a176a9bd818229b276ec31a4e0485b788bd79b6b411d2f0f32579096a4c03`.

## Review and production impact

A fresh independent `CRITICAL=0 / HIGH=0 / MEDIUM=0` review is required before
merge. Web CI and applicable Android CI must pass. No production action is included,
and deployment remains a separate authorization gate.
