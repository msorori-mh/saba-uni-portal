# PORTAL-PR246-ENROLLMENT-CERTIFICATE-BANNER-FINAL-RC-01

## Mission

Merge Codex independent review PR `#247` into PR `#246` only, then freeze a
browser-verified Final RC for enrollment-certificate violation/warning
truthfulness. Do **not** merge `#246` to `main`.

## Preflight (live)

| Check | Expected | Observed |
| --- | --- | --- |
| PR `#247` HEAD | `c37d44d270fc2da8e592123018af56420ffa36cb` | match |
| PR `#246` HEAD (pre-merge) | `e8958b64efecf3ac4f65f06f4cfeac559cea3d67` | match |
| PR `#247` base | `review/enrollment-certificate-violation-banner-ux-01` | match |
| Review threads | none unresolved | none |
| Working tree | clean | clean |

## Merge

1. Converted PR `#247` to Ready.
2. Merged with **Merge Commit** matched to `c37d44d…`:
   - merge commit: `a901057e29c231e0b7da5ecf44399ac2d1f885a0`
3. Post-merge:
   - PR `#247` = **MERGED**
   - PR `#246` = **OPEN** (Final RC tip published on the same branch after smoke harness)
   - `main` unchanged at `92d51faa9bcdc9fd99e89579f6a498b463264246`
   - See PR `#246` `headRefOid` for the published Final RC tip

## Closed defects (from Codex `#247`)

1. **Permission/network type-load failure → misleading empty state**  
   `student.requests.new.tsx` now surfaces a safe Arabic status when `typesError`
   is set, and that branch precedes the genuine empty list.

2. **Lifecycle overlay**  
   Creation eligibility is hidden for `cancelled` / `rejected` /
   `returned` / `returned_for_completion` (in addition to submitted/processing/
   completed/archived), so detail-page status banners remain authoritative.

## Functional matrix (verified)

| Case | Result |
| --- | --- |
| Normal open | no red violation; info/neutral only |
| Loading / null / undefined | amber needs-verification or loader; no rose |
| violation=true | rose `role=alert` + documented reason |
| violation=false | no rose |
| Types load failure | safe Arabic; not empty-list lie; retry |
| Network failure | safe Arabic alert; no raw PostgREST/RLS |
| Genuine empty | empty copy only when not an error |
| draft | creation eligibility may show |
| submitted/processing/completed/archived | creation eligibility hidden |
| cancelled/rejected/returned | creation eligibility hidden |

## Browser/DOM smoke

Harness: `tests/student-requests/banner-browser-smoke/`  
Runner: system Chrome `--headless=new` (`--dump-dom` / `--screenshot`)  
Local artifacts: `.tmp/pr246-banner-smoke/` (gitignored; not committed)

**Banner browser smoke = 32/32 PASS** covering normal/loading/violation true|false|
undefined, types-load failure, network failure, genuine empty, lifecycle states,
360px overflow frame, RTL, keyboard retry, focus/`role=alert`, privacy DOM scan.

Server on port `4178` stopped after the run; port confirmed free.

## Privacy

No raw `error.message`, UUID, `user_id`/`profile_id`, SQL/RPC/table names,
PostgREST/RLS, or stack traces in student-facing banner/error surfaces or smoke DOM
(excluding harness script source).

## Scope confirmation

PR `#247` file set was UI + tests + docs only:

- `StudentRequestEligibilityNotice.tsx`
- `student.requests.new.tsx`
- banner regression tests + independent review report

No Backend/SQL/migrations/RPC/workflow/authorization/B1/`student_visible`/
dashboard edits.

## Verification (Final RC tip before docs-only tip pin)

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS |
| Banner SSR guards | 9/9 |
| Chrome banner smoke | **32/32** |
| `bun test tests/student-requests` | **616 pass** (≥614) |
| `bun test tests` | **1553 pass** (≥1551) |
| `bunx tsc --noEmit` | PASS |
| ESLint on affected files | 0 errors (1 inherited Fast Refresh warning) |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Production impact

None. SOURCE-ONLY. No Production/Staging, deploy, publish, data mutation, or
`main` merge in this mission.

## Decision

`PASS_PR246_ENROLLMENT_CERTIFICATE_BANNER_FINAL_RC`
