# TEST_ONLY_ASSURANCE_03

Source-only authorization toolkit for the staging backend `ldjhuutywqhjxabdotmn`
(public origin `https://uniportaltest.com`). It creates **no accounts**, resets
**no passwords**, grants **no roles**, and touches **no production** system.

## Scope

Targets exactly the three existing `TEST_ONLY_ASSURANCE_02` identities pinned in
`fixtures-03.ts` (two students, one registrar). Maximum new rows for the whole
phase:

| Table | Max new rows | Actor |
| --- | --- | --- |
| `student_enrollments` | 2 | registrar session (RLS `se_priv_insert`) |
| `student_grades` | 4 | registrar session (RLS `sg_insert`) |
| `student_requests` | 2 | each student's own session, via `create_student_request` + `submit_student_request` |

No documents, no attachments, no fee rows, no workflow/type/assignment changes,
no `request_types.student_visible` change.

## Auth mechanism

**Admin-generated synthetic test session**: `auth.admin.generateLink` (generates,
never sends mail) followed by `verifyOtp`. It is not a password login and not a
browser session, so it cannot prove browser/session behaviour. `generateLink`
runs only after a full live preflight proves each pinned user has the exact id,
fixture email, confirmed email, all four namespace metadata fields and exactly
the canonical `user_roles` row; the link's user id is checked *before* the token
is verified. Sessions are signed out (`scope: "local"`) in `finally`.

## Commands

```bash
bun test tests/security/assurance-03/assurance-03.test.ts        # offline, no network
bunx tsc --noEmit --noCheck false -p tests/security/assurance-03/tsconfig.json

bun tests/security/assurance-03/run-assurance-03.ts              # dry run (default): preflight only
bun tests/security/assurance-03/run-assurance-03.ts --apply      # ONE-TIME fixture write + controls
bun tests/security/assurance-03/run-assurance-03.ts --controls-only \
  --request-a=<uuid> --request-b=<uuid>                          # read controls; no fixture writes
```

`--apply` is not idempotent by design: the preallocated ids are collision-checked
first and the run fails closed if any of them already exists. Re-measuring after
a successful apply uses `--controls-only`, which requires the fixture rows to be
present and re-verifies each supplied request id against its owning student and
namespace title before scoring anything.

Live commands require `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and the retained IDs-only
`tests/security/assurance-02/manifest.public.json`. That manifest is deliberately
excluded from Git. A clean checkout can run the offline tests without it.
Do not recreate accounts or reset passwords to recover a missing manifest.
Synthetic session creation/verification/logout can update Auth bookkeeping;
`--controls-only` means no application fixture writes, not zero system writes.

The 28 read controls cover two students: owner reads for enrollment, one grade,
transcript view and request; paired cross-student denials for those four;
anonymous denials for enrollment, grade and request; and registrar reads for
enrollment, grade and request. Anonymous transcript access, every grade component,
browser reports and server-function authorization are separate coverage gaps.

## Transport limits

Every SDK client shares one paced adapter (`../assurance-02/assurance-fetch`):
exact-origin only, `redirect: "error"`, concurrency 1, >= 1 request/second,
bounded body and deadline, budget 120 requests, and a permanent global abort on
429, 5xx, HTML, an API challenge or two transport errors. Uncertain writes are
never retried; a partial failure leaves the residue exactly as it is.

## Evidence semantics

Denials are scored by `../assurance-02/strict-evidence`. A denial only passes
when the paired owner positive control read the same id successfully in the same
run. Empty/absent rows, expired JWTs, malformed payloads, wrong endpoints, 404,
405 and 5xx never pass. Checkpoints are printed to stdout as sanitized ID-only
JSON lines so an ignored/wiped workspace cannot destroy the evidence. No tokens,
passwords or personal data are printed or written.

## Known coverage gaps (this phase reports HOLD)

- **Official document issuance** — the generator contract hard-requires
  `requestType === "enrollment_certificate"` and step key `document_issuance`;
  this backend has no such type/workflow, so no legitimate issuance path exists.
- **Staff workflow authorization** — the free TEST_ONLY request type has no
  active workflow, so submission creates no staff step to authorize.
- **Generic unprivileged staff principal** — no such fixture exists.
- **Password login / real browser session** — out of scope for this mechanism.
