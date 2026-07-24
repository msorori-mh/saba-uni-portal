# PORTAL-PROVENANCE-DEPLOY-GATE-01

## Purpose

Trigger a clean Web CI run on the exact current `main` lineage before publishing the build-provenance endpoint required by the B1 release-evidence stamp.

## Source state

- Source SHA under review: `50e0da3276056cc834b0154daa23472efd0e4060`.
- `src/routes/version[.]json.ts` is present and registered in `src/routeTree.gen.ts`.
- `<meta name="build-sha">` is emitted from `src/routes/__root.tsx`.
- `vite.config.ts` injects `import.meta.env.VITE_BUILD_SHA` from a validated build-time SHA source.
- The currently published site predates this provenance surface; publishing remains a separate explicit gate.

## Safety

- No database write.
- No migration.
- No service activation or visibility change.
- The five B1 services remain fail-closed.
