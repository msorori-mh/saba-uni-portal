# PORTAL-FRESH-RELEASE-CANDIDATE-01

| Field | Value |
|---|---|
| Status | `SOURCE_ONLY — NOT PUBLISHED` |
| Program | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| Repository | `msorori-mh/saba-uni-portal` |
| Prepared | 2026-08-10 |
| `SOURCE_SHA` / `expected_release_sha` | `9833269998a68f4ff1b86a57faf897f9b825f654` (current branch tip `fix/b1-go-live-final-drift-d02-closure-01`; **not deployed proof**) |
| `DEPLOYED_SHA` | `UNKNOWN` |
| Proof gate | `NOT_RUN` until official Deploy/Publish + independent readback |
| Supersedes as *current* RC pin | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6`, `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`, `8f229d09d581d8128dc684f47ad989200312d210`, and older RC tips |

## Separation of concerns (binding)

| Dimension | Value for this candidate |
|---|---|
| `SOURCE_SHA` | `9833269998a68f4ff1b86a57faf897f9b825f654` (branch tip at packaging; **not deployed proof**) |
| `DEPLOYED_SHA` | **Not claimed.** Remains `UNKNOWN` until Publish readback |
| `PRODUCTION_DB_STATE` | **Unknown / not re-read in this package.** Use refreshed D-02 RO package under separate authorized channel |
| `MIGRATION_READINESS` | Source drafts + runbook present; **apply requires separate USER_APPROVAL** |
| `USER_APPROVAL_REQUIRED` | Deploy/Publish, D-01 execution, D-02 production execution, Migration apply, `student_visible`, account import live run |

## Why this SHA

`9833269998a68f4ff1b86a57faf897f9b825f654` is the current branch tip for this final closure package. It includes the B1 migration-source drift, TEST_ONLY exclusion, and D-02 chair-sensor fixes. Source SHA is recorded for traceability only; it is **not** evidence that this SHA is published or deployed.

Older pins (`0e2d25c9…`, `427b7eb4…`, `8f229d09…`) are **invalid as a new release baseline**.

## Explicit non-claims

```text
Production published: NO
DEPLOYED_SHA proven: NO
D-01 executed: NO
D-02 executed on production: NO
Migration apply: NO
student_visible changed: NO
TEST_ONLY migration applied: NO
566 student accounts created: NO
```

## Next gates (ordered, each separately authorized)

1. Official Deploy/Publish of `expected_release_sha` → prove `DEPLOYED_SHA` by independent read-back.
2. Authorized D-02 read-only execution (`B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` refreshed).
3. Only then: migration / activation decisions under their own approvals.

`SOURCE_SHA` must never be used as a substitute for `DEPLOYED_SHA`.
