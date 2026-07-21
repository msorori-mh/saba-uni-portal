# B1-PREFLIGHT-FRESH-BASELINE-01

| Field | Value |
|---|---|
| Program | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| Date | 2026-07-21 |
| Status | `SOURCE_PACKAGED — PRODUCTION PREFLIGHT NOT_RUN` |
| Supersedes as *current* B1 preflight pin | `docs/B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02-REPORT.md` (@ `427b7eb4…`) and command-cycle pin on the same SHA |

## Binding pins

| Field | Value |
|---|---|
| `expected_release_sha` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `SOURCE_SHA` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `DEPLOYED_SHA` | `UNKNOWN` |
| Proof gate | `NOT_RUN` |
| Production DB gates | `NOT_RUN` |
| D-02 execution | `NOT_RUN` (package refreshed; execution separate) |
| D-01 execution | `NOT_RUN` |

## Cancelled baseline

`427b7eb48f8771f31bd08a46fc4590cf883ab7e2` is **not** a valid fresh release / preflight baseline against current `origin/main`. Historical reports that used that SHA remain archival evidence of prior cycles only.

## Explicit non-claims

```text
This document does NOT claim production publication of 0e2d25c9…
DEPLOYED_SHA is UNKNOWN
Proof gate remains NOT_RUN until official Deploy/Publish + independent readback
No production SQL was executed in the packaging program
```

## Ordered resume (when authorized)

1. Deploy/Publish `expected_release_sha` → prove `DEPLOYED_SHA`.
2. Execute refreshed D-02 RO package (`B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md`).
3. Re-run five-services visibility / workflow / protected-record checks from prior preflight-02 checklist against live DB.
4. Only then consider migration/activation approvals.

## Companion artifacts

- Fresh RC: `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md`
- D-02 package (refreshed): `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md`
- Program report: `docs/PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01-REPORT.md`
