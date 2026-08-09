# PORTAL-RC313-PWA315-ADMIN317-FINAL-NONB1-CLOSURE-LONGRUN-04

## Decision

**PASS** — FINAL NON-B1 candidate for Draft PR #313.

This mission integrates PR #315 (portal-wide PWA) and PR #317 (Admin nav/dashboard UX)
into the existing Draft RC. After this closure, **no new UI feature streams** should
enter RC #313 unless an actual release blocker requires it. B1 (#310) remains the
only planned insertion slot (`B1_PR310_SHA=PENDING`).

## Scope

| Stream | PR | Head (resolved) | Migrations |
|---|---|---|---|
| PWA install experience | #315 | `42a9586fe7b20ca883c2f45a6f683a1e2f2e909c` | 0 |
| Admin nav + dashboard UX | #317 | `636e26f1d221f784d18bae00c9a4e7254e1be819` | 0 |

Integration method: sequential `--no-ff` merges onto
`rc/portal-final-v4-prebuild-non-b1-01` (same Draft PR #313). No new RC PR.

## Heads at mission start

```
OLD_RC_SHA=aff53654d23c5c2bb041e4770d8fe4cba6d8fb9c
PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c
PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819
origin/main=0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f
```

Pre-merge CI: #315 Web CI SUCCESS; #317 Web CI SUCCESS. Heads matched PASS reports
(no post-PASS delta).

## Text / semantic conflicts

```
TEXT_CONFLICTS=0
SEMANTIC_CONFLICTS=0
```

#317 auto-merged one test file
(`tests/graduation-projects/graduation-projects-student-level4-eligibility-guard.test.ts`)
with no manual conflict markers.

## Combined interaction check

| Check | Result |
|---|---|
| PWA root mount vs Admin auth/nav | PASS — `registerPortalPWA` / `PortalInstallPrompt` in `__root`; AdminShell/auth unchanged |
| Admin search exposes hidden routes | PASS — search runs only on `visibleGroups` after `filterNavGroups` + finance gate |
| PWA caches Admin private data | PASS — `/admin` in protected deny; allowlist shell-only |
| PWA caches Faculty private data | PASS — `/faculty-portal` protected |
| PWA caches student requests/documents | PASS — student-requests / official-documents patterns protected |
| #314 Councils reports discovery | PASS — route + link intact |
| #311 server-function consumers | PASS — remediation surface retained |
| #312 Faculty Dashboard | PASS — untouched by #315/#317 |
| B1 insertion slot | PASS — untouched; `B1_PR310_SHA=PENDING` |

## Route semantic pin

`src/routeTree.gen.ts` **unchanged** vs `OLD_RC_SHA`.

```
ROUTE_SEMANTIC_SHA256=0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef
ROUTE_LOSS_COUNT=0
```

Recomputed and matched. Present: Faculty portal, Faculty councils, Councils reports,
Admin, Student Requests, GP, GA.

## Migration graph

```
PWA_NEW_MIGRATIONS=0
ADMIN_NEW_MIGRATIONS=0
DUPLICATE_MIGRATION_VERSIONS=0
DUPLICATE_MIGRATION_FILENAMES=0
HISTORICAL_MIGRATION_REWRITES=0
```

15-file authoritative runbook graph not modified for UI-only streams.

## PWA security preserved

```
STATIC_CACHE_POLICY=POSITIVE_ALLOWLIST_ONLY
PWA_STATIC_SHELL_ONLY=PASS
SENSITIVE_CACHE_DENY=PASS
AUTH_SESSION_SAFETY=PASS
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
PWA_SECURITY_PRESERVED=YES
PWA_PRIVATE_CACHE_DENY=PASS
```

No regression to extension-based runtime caching.

## Admin UX / security preserved

```
NAV_GROUPS_REORGANIZED=YES
NAV_SEARCH=YES
ROLE_FILTERING_PRESERVED=YES
FONT_READABILITY=YES
DASHBOARD_KPI_PRIORITY=YES
ACTION_REQUIRED_SECTION=YES
SYSTEM_HEALTH_DEPRIORITIZED=YES
CARD_DENSITY=YES
RTL=YES
MOBILE=YES
MISSING_NAV_ROUTES=0
DUPLICATE_NAV_ROUTES=0
INVENTED_NAV_ROUTES=0
SEARCH_AUTHORIZATION_ISOLATION=PASS
ROLE_FILTER_CONTRACT=PASS
FINANCE_GATE=PASS
FINANCE_GATE_PRESERVED=YES
DASHBOARD_DATA_TRUTH=PASS
ATTENTION_AUTH_SCOPE=PASS
TERMINOLOGY_UI_ONLY=PASS
ADMIN_RBAC=PASS
ADMIN_RBAC_PRESERVED=YES
```

No Graduates Affairs Admin route invented.

## Security regression matrix

```
ADMIN_RBAC=PASS
FINANCE_GATE=PASS
PWA_PRIVATE_CACHE_DENY=PASS
FACULTY_AUTH=PASS
COUNCILS_AUTH=PASS
COUNCILS_CONTRACTS_PRESERVED=YES
FACULTY_DASHBOARD_PRESERVED=YES
GP_L4_GUARD=PASS
GA_AUTH=PASS
STUDENT_REQUEST_AUTH=PASS
ENROLLMENT_CERTIFICATE_PROTECTION=PASS
```

No admin/dean/registrar universal bypass introduced.

## Integrated streams

```
INTEGRATED_PRS=#293,#291,#299,#311,#312,#314,#315,#317
PWA_PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c
ADMIN_UX_PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819
B1_PR310_SHA=PENDING
B1_FINAL_SHA=PENDING
```

## Local verification

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/pwa tests/mobile` | PASS (53 pass / 0 fail) |
| `bun test tests/admin` | PASS (272 pass / 0 fail) |
| `bun test tests/faculty-portal` | PASS (79 pass / 0 fail) |
| `bun test tests/academic-councils` | PASS (79 pass / 0 fail; includes PG17 PostgREST matrix) |
| `bun test tests/graduates-affairs` | PASS (175 pass / 0 fail) |
| `bun test tests/graduation-projects` | PASS (119 pass / 0 fail; includes PG17 L4) |
| `bun test tests/student-requests` | PASS (1066 pass / 0 fail) |
| `bun test tests/runbook` | PASS (21 pass / 0 fail) |
| Full `bun test tests/` | PASS product (2890 pass); 1 environmental local timeout on unrelated Wrangler Arabic PDF spike (`tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts`) — **not remediated** per mission rule |
| PG17 | PASS via councils + GP local verifiers; remaining matrix deferred to Web CI |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Route semantic hash | `0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef` unchanged |

## CI gate (Draft PR #313)

```
WEB_CI=(awaiting after docs push)
MIGRATION_REVIEW=(awaiting after docs push)
```

## Guardrails

```
PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
PUBLISH=NO
MERGE=NO
```

## Final token

```
PASS_PORTAL_RC313_PWA315_ADMIN317_FINAL_NONB1_CLOSURE_LONGRUN_04
```
