# B1-PREFLIGHT-FRESH-BASELINE-01

| Field | Value |
|---|---|
| Program | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| Date | 2026-08-10 |
| Status | `SOURCE_PACKAGED — PRODUCTION PREFLIGHT NOT_RUN` |
| Supersedes as *current* B1 preflight pin | `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` @ `0e2d25c9…`, `docs/B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02-REPORT.md` (@ `427b7eb4…`), and command-cycle pin on the same SHA |

## Binding pins

| Field | Value |
|---|---|
| `expected_release_sha` | `9833269998a68f4ff1b86a57faf897f9b825f654` (current branch tip; **not deployed proof**) |
| `SOURCE_SHA` | `9833269998a68f4ff1b86a57faf897f9b825f654` (traceability only) |
| `DEPLOYED_SHA` | `UNKNOWN` |
| Proof gate | `NOT_RUN` |
| Production DB gates | `NOT_RUN` |
| D-02 execution | `NOT_RUN` (package refreshed; execution separate) |
| D-01 execution | `NOT_RUN` |

## Cancelled baseline

`0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` and `427b7eb48f8771f31bd08a46fc4590cf883ab7e2` are **not** valid fresh release / preflight baselines against the current closure branch. Historical reports that used those SHAs remain archival evidence of prior cycles only.

## Explicit non-claims

```text
This document does NOT claim production publication of 9833269998a68f4ff1b86a57faf897f9b825f654
DEPLOYED_SHA is UNKNOWN
SOURCE_SHA is traceability only and must not be treated as deployed proof
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
