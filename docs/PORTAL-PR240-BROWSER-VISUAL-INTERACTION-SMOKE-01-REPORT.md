# PORTAL-PR240-BROWSER-VISUAL-INTERACTION-SMOKE-01

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- Target PR: `#240`
- Pinned HEAD: `373b7d2eafd2bda9a3646d82f25653575ae7feab`
- Review branch: `review/pr240-browser-visual-smoke-cursor-01`
- Base: `review/dashboards-ui-truthfulness-qa-01`

Preflight confirmed PR `#240` OPEN, HEAD match, clean tree.

## Harness

No Playwright/Cypress suite existed in the repo. A minimal local harness was added under
`tests/dashboards/browser-smoke/`:

| Piece | Role |
| --- | --- |
| `generate-pages.ts` | Builds synthetic RTL HTML fixtures using real `DashboardMetricValue` / `DashboardQueryError` SSR markup |
| `pages/*.html` | Student / faculty / admin loading·empty·error·success fixtures (synthetic identities only) |
| `server.ts` | Local `Bun.serve` on `127.0.0.1:4177` — no external network, no Supabase |
| `run-smoke.ts` | System Chrome `--headless=new` screenshots + `--dump-dom` interaction assertions |
| `browser-visual-interaction-smoke-01.test.ts` | Fixture contracts + live Chrome smoke launcher |

Playwright launch timed out in this environment; Chrome headless dump-dom/screenshot is the reliable runner.
Cursor browser MCP was also used for a live visual/interaction spot-check of the student error page.

## Scenarios covered

### Student
- Loading skeletons (`aria-busy`) without fabricated zeros
- Error alerts with safe Arabic copy + Retry (no empty-success copy)
- Genuine empty states
- Success data
- Keyboard Enter/Space retry, finite retry (disables after bound)
- Focus moves to `role=alert`
- Logout clears synthetic cache; second identity sees no stale courses

### Faculty
- Error / success for profile, teaching schedule, section students
- RTL root
- Explicit “no cross-department data” marker on success

### Admin
- Loading metrics render `—` + accessible “القيمة غير متاحة”
- Error/partial-error banner; metrics stay `—`
- Real zero renders `0`/`٠`
- Readiness pending/error = WARNING (never false FAIL)

## Viewports

| Size | Result |
| --- | --- |
| 360×800 | no horizontal overflow (constrained frame measure) |
| 768×1024 | no horizontal overflow |
| 1366×768 | no horizontal overflow |

## RTL / Accessibility

- `dir=rtl` on fixture roots
- Error blocks: `role=alert`, `aria-live=assertive`, `tabindex=-1`, focus on load
- Retry controls: min-height 44px, accessible name, keyboard activatable
- Unavailable metrics expose `aria-label` (not color-only)

## Cache isolation

Synthetic in-page cache mirrors `queryClient.clear()` after logout.
After logout → login as `student-b`, prior `student-a` course payload is absent.

## Screenshots (local artifacts)

Written under `.tmp/pr240-browser-smoke/` (gitignored via `.tmp/`):

- `student-loading.png`
- `student-error.png`
- `student-empty.png`
- `student-success.png`
- `faculty-error.png`
- `faculty-success.png`
- `admin-loading-metrics.png`
- `admin-partial-error.png`
- `admin-real-zero-metrics.png`
- `mobile-rtl.png`
- `smoke-results.json` — **26/26** Chrome checks passed

No production or real student data appears in screenshots.

## Privacy

DOM/text scanned for UUID, `user_id`, `profile_id`, SQL/PostgREST/RLS/RPC leaks,
raw `error.message`, stack traces, and storage URLs — none found in fixtures or smoke DOM dumps.

## Verification

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS (root; harness needs no extra root deps) |
| `bun test tests/dashboards` | **34 pass / 0 fail** (≥25 required) |
| Chrome browser smoke | **26/26 PASS** |
| `bun test tests` | **1576 pass / 0 fail** (≥1567 required) |
| `bunx tsc --noEmit` | PASS |
| ESLint on modified test/harness files (LF) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Defects / fixes in this pass

1. No browser harness existed → added Chrome-headless synthetic fixture harness.
2. Playwright Chromium/Chrome channel launch hung → switched to system Chrome CLI (`--dump-dom` / `--screenshot`).
3. Headless minimum window width hid 360px overflow measurement → measure inside a constrained viewport frame.

No production runtime dashboard source files were changed in this review branch.

## Remaining risks

- Fixtures are synthetic stand-ins for the real authenticated dashboard routes; they prove the
  truthfulness/interaction contracts visually, not end-to-end against Supabase.
- Chrome headless window-size quirks require framed overflow measurement at 360px.
- Screenshots stay local under `.tmp/` and are not committed.

## Decision

`PASS_PR240_BROWSER_VISUAL_INTERACTION_SMOKE`
