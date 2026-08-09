# PORTAL-PWA315 Security Hardening and RC Readiness Closure 02

## Scope and result

- Mission: `PORTAL-PWA315-SECURITY-HARDENING-AND-RC-READINESS-CLOSURE-02`
- PR: #315 (existing draft; no new PR)
- Branch: `feat/portal-pwa-install-experience-01`
- Starting SHA: `c2c089003d58578de3b59228198e320775f81cef`
- Security implementation SHA: `06e2fdd161fcc829f3806786c54c41f167e3b882`
- Decision: **PASS**

## Reproduction before remediation

`HIGH_REPRODUCED=YES`

The v1 worker admitted any same-origin non-navigation URL whose pathname ended in a generic CSS, JavaScript, font, or image extension, unless a denylist expression happened to match it. The runtime path used stale-while-revalidate and wrote every `ok` response. It checked GET and same-origin, but did not inspect request credentials, Authorization, Cookie, response Cache-Control, Set-Cookie, Vary, or Content-Type. Consequently, an authenticated/private response at an asset-looking URL could enter Cache Storage.

`MEDIUM_REPRODUCED=YES`

The v1 activation deleted every cache name other than its current cache, without an ownership namespace. Installation invoked `skipWaiting()` automatically, and activation invoked `clients.claim()` automatically, allowing immediate takeover of existing authenticated pages.

## Remediation

- The authoritative cache policy is a closed exact-path allowlist containing only `/offline.html`, `/manifest.webmanifest`, and the three portal-owned PWA icons.
- Runtime caching is disabled. Unknown URLs and all non-navigation resources are network-only. Navigation responses are never written; a failed non-protected navigation may receive only the harmless precached offline page.
- Every precache write requires GET, same-origin, `credentials: omit`, no Authorization/Cookie header, an exact allowlisted path without query/hash, a successful 200 response, an allowlisted Content-Type, and no private/no-store/no-cache, Set-Cookie, or unsafe Vary signal.
- A secondary protected-surface guard covers auth, portal login, API, server functions, admin, faculty, student/mobile student, requests, documents/downloads/attachments, academic data/grades, payment confirmation, councils, graduation projects, and graduates affairs. Cross-origin and Supabase traffic bypass the worker.
- Cache ownership uses `portal-pwa-`. Activation deletes only old prefix-owned caches plus the exact known v1 legacy cache `static-portal-pwa-v1`; foreign cache names survive.
- Installation no longer forces activation. `SKIP_WAITING` remains an explicit message-only action. Activation does not claim existing clients, and no reload behavior exists.
- The logout privacy invariant is structural: no private request or response is eligible for any write, runtime writes do not exist, and the exact vulnerable legacy cache is removed during upgrade.

## Behavioral coverage

Executable policy tests cover public icons, manifest, offline shell, protected asset-looking paths, server functions, API, authenticated and credentialled requests, no-store/private/no-cache responses, Set-Cookie, unsafe Vary, wrong Content-Type, failed responses, cross-origin Supabase, signed official-document URLs, unknown `.js` paths, logout invariants, old owned-cache cleanup, foreign-cache survival, and the non-looping update lifecycle.

## RC313 compatibility

The current PR #313 head was fetched and compared. There is no changed-file overlap with this remediation. No authorization logic, unrelated routes, B1, GA, GP, Councils, Faculty/Admin permission logic, migrations, `request_types.student_visible`, or `enrollment_certificate` was changed. `RC_INTEGRATION_RISK=LOW_OR_NONE`.

## Verification

- `bun install --frozen-lockfile`: PASS (no changes)
- `bun test tests/pwa tests/mobile`: PASS — 53 tests
- `bun test tests/student-requests`: PASS — 1066 tests
- `bun test tests/faculty-portal`: PASS — 61 tests
- `bunx tsc --noEmit`: PASS
- `bun run build`: PASS
- `git diff --check`: PASS
- GitHub Actions run `31332427842` on security implementation SHA: PASS — all 13 jobs
- `bun run security:test`: not run; no explicitly safe non-production runtime environment was provided, and production access was forbidden. All requested source-only suites ran.

## Closure matrix

```text
STATIC_CACHE_POLICY=POSITIVE_ALLOWLIST_ONLY
PWA_STATIC_SHELL_ONLY=PASS
SENSITIVE_CACHE_DENY=PASS
AUTH_SESSION_SAFETY=PASS
AUTH_REQUEST_CACHE_DENY=PASS
CREDENTIALLED_RUNTIME_CACHE_DENY=PASS
PRIVATE_RESPONSE_CACHE_DENY=PASS
NO_STORE_RESPONSE_CACHE_DENY=PASS
SERVER_FN_CACHE_DENY=PASS
CROSS_ORIGIN_BYPASS=PASS
OFFLINE_PRIVACY=PASS
PRIVATE_CACHE_AFTER_LOGOUT=0
OWNED_CACHE_PREFIX_ENFORCED=YES
FOREIGN_CACHE_DELETE_COUNT=0
UPDATE_LIFECYCLE=PASS
RC_INTEGRATION_RISK=LOW_OR_NONE
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
MERGE=NO
```

## Agent report

- Modified files: `public/sw.js`, `public/sw-cache-policy.js`, `tests/pwa/service-worker-cache-policy.test.ts`, `tests/pwa/portal-wide-pwa-install.test.ts`, `tests/mobile/mobile-student-pwa-compat.test.ts`, and this report.
- Assumptions: the five exact public assets are harmless portal-owned shell resources; server responses provide their declared MIME types; explicit `SKIP_WAITING` is sent only by a future deliberate client update UI.
- Risks: a server that sends an incorrect/unsafe header for a shell asset will make that service-worker install fail closed; users then retain the prior worker until a valid install.
- Blockers: none.
- Production impact: source and tests only. No production access, data mutation, migration, deployment, publication, or merge occurred.
- Decision: **PASS**.
