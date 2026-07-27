# PORTAL-FIRST-DELIVERY-FIVE-SERVICES-INTEGRATED-SOURCE-RC-01

## Decision

**PASS_FIRST_DELIVERY_FIVE_SERVICES_INTEGRATED_SOURCE_RC**

```
NO_PRODUCTION_WRITE
TEST_ONLY_FIRST_DELIVERY_5_SERVICES
SYNTHETIC_DATA_ONLY
```

## Services

1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

Protected live: `enrollment_certificate` (regression required; no mutation from this track).

## Student surface (source/UI contracts)

- Service list gated by adapter availability flags
- Open form / save draft / edit draft
- Secure attachments (intent coords; no public URL)
- Submit with stale-safe expectedUpdatedAt
- Authoritative re-read after actions
- Arabic validation errors
- Offline/network/error states without UUID/SQL/raw backend leakage
- RTL
- Viewports: 360px / 768px / 1366px

Proof channels: `tests/student-requests/b1-ui/*`, mock adapter lifecycle, this RC test.

## Staff surface

- Assigned inbox only
- Details + timeline
- Attachments via authorize download RPC path
- Step action approve/reject/return through adapter
- Finance confirmation simplified: received only, optional note, `confirmed_by=auth.uid()`, `confirmed_at=DB`
- No amount / currency / invoice / gateway transaction

## Negative direct access

- student A cannot access student B
- staff A cannot access staff B assignment
- department A cannot access B
- wrong role rejected
- wrong step rejected
- completed/cancelled restrictions
- no mutation after rejection
- no admin bypass
- no registrar bypass
- no dean bypass

Direct RPC proof harness: `tests/b1-five-services-authorization/run-full-matrix.ps1` (24 positive / 528 negative / 528 zero-mutation target).

## Harnesses

| Harness | Role |
|---|---|
| `tests/b1-first-delivery-sequential-chain/run-chain.ps1` | SEQ07-B→24 local sequential |
| `tests/b1-seq08-preflight/run-harness.ps1` | stop after SEQ08 |
| `tests/b1-secure-read/pg/run-harness.ps1` | secure read 25/25 |
| `tests/b1-secure-draft/pg/run-harness.ps1` | secure draft 35/35 + concurrency |
| `tests/b1-integrated-runtime/pg/run-harness.ps1` | integrated 5/5 |
| `tests/b1-five-services-authorization/run-full-matrix.ps1` | auth matrix |

## Explicit non-goals

Production accounts, real user data, SMS/email, Deploy/Publish, Gate 25 Production activation.
