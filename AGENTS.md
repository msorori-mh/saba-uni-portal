# AGENTS.md

## Cursor Cloud specific instructions

### What this is
A single-repo full-stack **University Portal** (TanStack Start SSR + React 19 + Vite 7 + Tailwind v4 + shadcn/ui) backed by a **hosted Supabase** project (Postgres + Auth + Storage + RLS + RPCs). A Capacitor Android wrapper (`capacitor.config.ts`) just loads the deployed web URL; it is optional for web development.

### Toolchain
- Package manager is **Bun** (`bun.lock`, `bunfig.toml`) — do **not** use npm/yarn/pnpm. Bun installs to `~/.bun/bin`; ensure it is on `PATH` (the startup update script installs it if missing).
- `bunfig.toml` sets `minimumReleaseAge = 86400` (24h supply-chain guard). Installing a brand-new package version may be blocked; existing locked versions are unaffected.

### Run / build / lint (see `package.json` scripts)
- Dev server: `bun run dev` → Vite SSR on **http://localhost:8080** (fixed port/host are injected by `@lovable.dev/vite-tanstack-config`).
- Build: `bun run build` (Vite + Nitro). Preview: `bun run preview`.
- Lint: `bun run lint`. NOTE: lint currently reports thousands of pre-existing `prettier/prettier` formatting errors. CI (`.github/workflows/ci.yml`) intentionally treats lint as **advisory / non-blocking** — do not mass-reformat unrelated files to "fix" it.
- There is **no `typecheck` script** despite CI referencing one; that CI step is skipped by design.
- No automated test suite exists in this repo.

### Backend / env vars (non-obvious)
- The Supabase **anon URL + key are hard-coded as fallbacks in `vite.config.ts`**, so the app boots and talks to the **live hosted Supabase** project with no `.env`. Local read/auth/RPC flows therefore touch a shared remote database.
- Server functions / admin features (`src/integrations/supabase/client.server.ts`) require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` with **no fallback** and will throw if unset. Email (Resend via `LOVABLE_API_KEY` + `RESEND_API_KEY`) is optional and degrades gracefully when unset.

### Quick smoke test (no login required)
The public route `/verify-document` calls the `verify_document` Supabase RPC. Submitting document number `USR-2026-000001` returns a valid, issued "official transcript" — a good end-to-end check of the UI → Supabase → DB path.
