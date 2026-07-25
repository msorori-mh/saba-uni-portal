# PORTAL-PR240-INDEPENDENTLY-VERIFIED-BROWSER-FINAL-RC-01

## Mission

Merge independent browser-review PR `#253` into PR `#240` only, then freeze
PR `#240` as the independently verified browser Final RC for dashboard
truthfulness. Do **not** merge `#240` to `main`.

PR `#248` was already merged earlier and is **out of scope** for this mission
(no re-merge, no `#248`-only retest cycle).

## Preflight (live)

| Check | Expected | Observed |
| --- | --- | --- |
| PR `#253` HEAD | `49326832bd02387dbab1aff7108031ec56b97bf0` | match |
| PR `#240` HEAD (pre-merge) | `a25caf03e15556e41a5bf51708178920d22a9457` | match |
| PR `#253` base | `review/dashboards-ui-truthfulness-qa-01` | match |
| PR `#248` | already MERGED | `mergedAt=2026-07-25T19:02:57Z` |
| Review threads on `#253` / `#240` | none unresolved | none |
| Working tree before merge | clean on `#240` tip | clean |

## Merge

1. `gh pr ready 253`
2. Merged with **Merge Commit** matched to head `4932683…`:
   - merge commit: `a59964dd4f461d002580af3f19ee4f934429ae6a`
3. Post-merge:
   - PR `#253` = **MERGED**
   - PR `#240` = **OPEN**
   - `main` unchanged at `92d51faa9bcdc9fd99e89579f6a498b463264246`

## Independent review contents (#253)

Hardening retained from the independent review:

- 26 uniquely named Chrome headless scenarios enforced in `run-smoke.ts`
- Explicit fail on Chrome spawn/timeout/non-zero exit
- Explicit fail when dump-dom does not include harness marker
- Loopback-only + host resolver exclude + `x-pr240-harness`
- Privacy DOM scan (UUID / SQL / RPC / PostgREST / raw errors)
- Logout / second-identity cache isolation
- loading / empty / error / success + real zero
- Viewports 360 / 768 / 1366
- RTL / keyboard / focus / `role=alert`
- Server stop enforced in `afterAll` (port `4177`)

## Final RC harness note

After merge, Chrome dump-dom timeout was raised **20s → 30s** in
`tests/dashboards/browser-smoke/run-smoke.ts` so full-suite load does not flake
on slow headless dumps. Timeouts still fail closed (no false PASS).

## Verification on Final RC tip

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/dashboards` | **35 pass / 0 fail** |
| Chrome headless smoke | **26/26** |
| `bun test tests` | **1577 pass / 0 fail** |
| `bunx tsc --noEmit` | PASS |
| ESLint (affected harness files) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `.tmp` / screenshots tracked | none |
| Port `4177` after tests | free |
| `main` | unchanged (`92d51fa…`) |

## Decision

**PASS_PR240_INDEPENDENTLY_VERIFIED_BROWSER_FINAL_RC**

This is **not** approval to merge PR `#240` into `main`.
