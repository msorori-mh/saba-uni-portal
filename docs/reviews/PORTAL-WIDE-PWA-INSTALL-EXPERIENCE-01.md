# PORTAL-WIDE-PWA-INSTALL-EXPERIENCE-01

## Identity

| Field | Value |
| --- | --- |
| Mission | PORTAL-WIDE-PWA-INSTALL-EXPERIENCE-01 |
| Branch | `feat/portal-pwa-install-experience-01` |
| BASE_SHA | `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f` |
| IMPLEMENTATION_SHA | `f2e712da60831eccce27894454c36888f768c397` |
| Production writes | 0 |
| Migration applied | NO |
| Deploy | NO |
| Merge | NO |

## Summary

Upgraded the student-only PWA foundation into a portal-wide installable PWA for **بوابة الكلية**.

- Manifest identity is college-portal-wide; `start_url` is `/portal-login`.
- Service worker remains a static app-shell only; sensitive paths stay network-only.
- `registerPortalPWA()` registers globally from the root layout (preview/iframe skipped).
- `usePwaInstall()` + `PortalInstallPrompt` provide Arabic RTL install UX via `beforeinstallprompt`.
- iOS gets Share → Add to Home Screen instructions (no fake Android install button).
- Dismissal uses a harmless localStorage timestamp only (`portal_pwa_install_dismissed_at`).

## Manifest status — PASS

- `name`: بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب
- `short_name`: بوابة الكلية
- `start_url`: `/portal-login`
- `display`: `standalone`
- `dir`/`lang`: `rtl` / `ar`
- `theme_color` / `background_color`: `#061F33` / `#F8FAFC`
- icons: 192, 512, maskable 512 (files present)
- `id`, `categories` added
- screenshots: skipped (none safely available; not fabricated)

## Service worker status — PASS

- File: `public/sw.js` (`portal-pwa-v1`)
- Scope: `/`
- Precache: offline shell + manifest + icons only
- Never caches: mobile sensitive routes, portal sensitive areas, `/api/`, `/_serverFn/`, Supabase, `/auth/`
- Navigate: network-first, offline fallback only; no HTML put into Cache Storage
- `SKIP_WAITING` preserved; no forced reload loop

## Install-prompt status — PASS

- Component: `src/components/pwa/PortalInstallPrompt.tsx`
- Hook: `src/lib/pwa/use-pwa-install.ts`
- Title: ثبّت بوابة الكلية على جهازك
- Actions: تثبيت التطبيق / لاحقاً
- Deferred `beforeinstallprompt` kept in memory only
- Cooldown key: `portal_pwa_install_dismissed_at` (7 days)
- Mounted from root layout; does not permanently block auth

## Android Chrome status — PASS (code-path)

- Implementation uses browser-authoritative `beforeinstallprompt` → `prompt()` → `userChoice`
- Live Chrome-on-Android + Lighthouse installability not executed in this agent environment
- Expected on eligible Chrome Android HTTPS/localhost after engagement heuristics

## iOS fallback — PASS

- Detects iOS browser mode
- Shows Share → «إضافة إلى الشاشة الرئيسية» instructions
- Hidden in standalone / installed modes
- No Android install button when unsupported

## Standalone mode — PASS

- Manifest `display: standalone`
- Hook detects `(display-mode: standalone)` and `navigator.standalone`
- Prompt hidden when standalone

## Security / cache verification — PASS

- Sensitive path deny-list retained and extended
- Cross-origin (Supabase) bypassed
- No auth/session/JWT stored by install preference helpers
- Offline page is a safe static shell only

## Head metadata — PASS

Root + portal-login + mobile student surfaces include:

- `rel=manifest`
- `theme-color`
- `mobile-web-app-capable`
- `apple-mobile-web-app-capable`
- `apple-mobile-web-app-title` = بوابة الكلية
- `apple-touch-icon` → `/icon-192.png`

## Tests

```
bun test tests/pwa tests/mobile
→ 33 pass / 0 fail
```

## Verification

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/pwa tests/mobile` | PASS (33/0) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| CI | SUCCESS (Web CI run on draft PR #315) |

## Files modified / added

### Modified
- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `src/lib/pwa/register-student-sw.ts` (compat alias)
- `src/routes/__root.tsx`
- `src/routes/portal-login.tsx`
- `src/routes/mobile.student.tsx`
- `src/routes/mobile.student-login.tsx`

### Added
- `src/lib/pwa/register-portal-pwa.ts`
- `src/lib/pwa/install-prompt-state.ts`
- `src/lib/pwa/use-pwa-install.ts`
- `src/components/pwa/PortalInstallPrompt.tsx`
- `tests/pwa/portal-wide-pwa-install.test.ts`
- `tests/mobile/mobile-student-pwa-compat.test.ts`
- `docs/reviews/PORTAL-WIDE-PWA-INSTALL-EXPERIENCE-01.md`

## Assumptions

- `/portal-login` is the canonical shared portal gateway.
- Browser installability heuristics remain authoritative; in-app UI cannot force install.
- 7-day dismissal cooldown is acceptable UX policy.
- Admin surfaces may still register the SW via root; install drawer is global but non-blocking.

## Risks

- Chrome may withhold `beforeinstallprompt` until engagement criteria are met.
- iOS instructions depend on Safari Share UI wording/locale.
- Global prompt mount could briefly appear on desktop browsers that expose installability.

## Blockers

- None for source delivery.
- Physical Android Chrome device verification not available in this run.

## Production impact

- SOURCE-ONLY. No production writes, migrations, or deploy.
- After merge+deploy (out of scope), users on eligible Chrome Android can install the portal PWA starting at `/portal-login`.

## Decision

**PASS** — ready for draft PR review.

`PASS_PORTAL_WIDE_PWA_INSTALL_EXPERIENCE_01`
