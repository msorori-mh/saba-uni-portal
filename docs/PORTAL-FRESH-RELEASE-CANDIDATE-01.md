# PORTAL-FRESH-RELEASE-CANDIDATE-01

| Field | Value |
|---|---|
| Status | `SOURCE_ONLY — NOT PUBLISHED` |
| Program | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| Repository | `msorori-mh/saba-uni-portal` |
| Prepared | 2026-07-21 |
| `SOURCE_SHA` / `expected_release_sha` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `DEPLOYED_SHA` | `UNKNOWN` |
| Proof gate | `NOT_RUN` until official Deploy/Publish + independent readback |
| Supersedes as *current* RC pin | `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`, `8f229d09d581d8128dc684f47ad989200312d210`, and older RC tips (`b50979a8…`, `5435a877…`, `7431601d…`, `6332095b…`) |

## Separation of concerns (binding)

| Dimension | Value for this candidate |
|---|---|
| `SOURCE_SHA` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` (`origin/main` tip at packaging) |
| `DEPLOYED_SHA` | **Not claimed.** Remains `UNKNOWN` until Publish readback |
| `PRODUCTION_DB_STATE` | **Unknown / not re-read in this package.** Use refreshed D-02 RO package under separate authorized channel |
| `MIGRATION_READINESS` | Source drafts + runbook present; **apply requires separate USER_APPROVAL** |
| `USER_APPROVAL_REQUIRED` | Deploy/Publish, D-01 execution, D-02 production execution, Migration apply, `student_visible`, account import live run |

## Why this SHA

`0e2d25c9…` is the post-merge tip that includes:

- PR #191 old-PRs disposition docs
- PR #194 CI hardening (`bun-tests` fail-closed + PG 17 verifiers 8/8) with green main Web CI on merge `e3dbd93…`
- PR #195 `student_accounts` importer **source** (no production accounts created)
- Docs verify PR #196 for the #194/#195 closure report

`427b7eb4…` is **invalid as a new release baseline** (stale relative to current `main`).

## Explicit non-claims

```text
Production published: NO
DEPLOYED_SHA proven: NO
D-01 executed: NO
D-02 executed on production: NO
Migration apply: NO
student_visible changed: NO
566 student accounts created: NO
```

## Next gates (ordered, each separately authorized)

1. Official Deploy/Publish of `expected_release_sha` → prove `DEPLOYED_SHA`.
2. Authorized D-02 read-only execution (`B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` refreshed).
3. Only then: migration / activation decisions under their own approvals.
