# PORTAL-PR240-BROWSER-VERIFIED-FINAL-RC-01

## Mission

Merge browser-smoke PR `#248` into PR `#240` only, then freeze PR `#240` as the
browser-verified Final RC for dashboard truthfulness. Do **not** merge `#240`
to `main`.

## Preflight (live)

| Check | Expected | Observed |
| --- | --- | --- |
| PR `#248` HEAD | `bed2a34189189bec81da13f419af6cd21e31ad7a` | match |
| PR `#240` HEAD (pre-merge) | `373b7d2eafd2bda9a3646d82f25653575ae7feab` | match |
| PR `#248` base | `review/dashboards-ui-truthfulness-qa-01` | match |
| Review threads on `#248` | none unresolved | none |
| Working tree | clean | clean |
| Port `4177` | free | free |
| `.tmp/pr240-browser-smoke/` tracked | no | not tracked |

## Merge

1. PR `#248` was already Ready (`isDraft=false`).
2. Merged with **Merge Commit** matched to head `bed2a34…`:
   - merge commit: `822382359febbddb83fbbe9d04c32dcfd61408e7`
3. Post-merge:
   - PR `#248` = **MERGED** (`mergedAt=2026-07-25T19:02:57Z`)
   - PR `#240` = **OPEN** at merge tip `822382359febbddb83fbbe9d04c32dcfd61408e7`
   - Final RC docs tip published on the same branch after smoke re-verification
     (see PR `#240` `headRefOid` / branch tip; docs-only commits do not alter runtime)
   - `main` unchanged at `92d51faa9bcdc9fd99e89579f6a498b463264246`

## Browser harness (why Chrome, not Playwright)

Playwright Chromium/Chrome channel launch hung/timed out in this Windows
worktree. The shipped harness therefore uses **system Chrome headless**:

- `--dump-dom` for interaction / privacy / state assertions
- `--screenshot` for local visual artifacts under `.tmp/` (gitignored)

Synthetic fixtures only — no production identities, no Supabase, no real student data.

## Final Chrome smoke on PR `#240` tip

Re-run after merge on `8223823…`:

**Browser smoke = 26/26 PASS**

Covered:

- loading / empty / error / success (student, faculty, admin)
- retry + finite bound (no unbounded loop)
- keyboard Enter/Space on Retry
- focus on `role=alert`
- logout cache clear + second synthetic identity isolation
- RTL
- viewports **360×800**, **768×1024**, **1366×768** (no horizontal overflow)
- privacy DOM scan (no UUID / user_id / profile_id / SQL / PostgREST / raw errors)

Local artifacts remain in `.tmp/pr240-browser-smoke/` and are **not** committed.

## Post-smoke cleanup

- Local fixture server stopped
- Port `4177` confirmed free
- No harness screenshots/secrets tracked in Git

## Verification on final tip (pre-docs commit)

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/dashboards` | **34 pass / 0 fail** |
| Chrome smoke | **26/26** |
| `bun test tests` | **1576 pass / 0 fail** |
| `bunx tsc --noEmit` | PASS |
| ESLint (affected dashboard/test files, LF) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## GitHub Actions

Remote Web CI on `8223823…` reported `failure` in ~2–3s with empty job steps
([run 30170844622](https://github.com/msorori-mh/saba-uni-portal/actions/runs/30170844622)).
The same pattern appears on prior PR `#240` tips (`373b7d2`, `2211d5e`) — treated as an
external/infra gate, not a local source regression. Mandatory local verification above is green.

## Production impact

None. No Production/Staging access, migrations, deploy, publish, SQL/RPC, B1, or
`enrollment_certificate` changes. PR `#240` remains **OPEN** and was **not** merged to `main`.

## Decision

`PASS_PR240_BROWSER_VERIFIED_FINAL_RC`
