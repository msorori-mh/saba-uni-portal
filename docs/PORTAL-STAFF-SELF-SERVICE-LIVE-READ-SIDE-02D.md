# PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D

MODE: SOURCE_ONLY on the managed edit branch `edit/edt-6c250e9e-…`
BASELINE: `cdf1ad52a115fd6c873c37a39ce1ddd80f099a55`
PRODUCTION_WRITES = 0 | MIGRATION_APPLY = 0 | DEPLOY = 0 | PUBLISH = 0 | MAIN_TOUCHED = 0

## 1. Scope delivered

The read side of staff self-service is now live-bound end to end: employees see
their real leave balances, payroll statements, career history, correspondence,
custody and notifications; administrators see exactly the rows their database
privileges return — no more, no less.

### Database (`supabase/migrations/20260822030000_staff_self_service_live_read_side_02d.sql`)

| Change | Rationale |
| --- | --- |
| `revoke update` + drop of `staff_correspondence_recipients_owner_ack` | The client could previously stamp its own receipt timestamps. The direct write path is gone. |
| New `staff_service_read_audit_events` | `staff_service_events.request_id` is `NOT NULL`, so read-side actions that are not bound to a service request needed their own ledger. Append-only via `staff_service_reject_event_mutation` on UPDATE and DELETE; RLS restricts reads to the actor or an administrator. |
| `staff_service_record_correspondence_read(uuid)` | Idempotent, monotonic (`coalesce(read_at, now())`), requires a published correspondence and an actual recipient row. |
| `staff_service_acknowledge_correspondence(uuid)` | Same guarantees; never overwrites an earlier `read_at`. |
| `staff_service_authorize_payroll_statement_download(uuid)` | Owner / finance / administrator only, published statements only, returns the exact statement projection the PDF needs plus a 300s validity. |

All three RPCs are `security definer` with `set search_path = public, pg_temp`,
revoked from `public`/`anon`, and granted to `authenticated` only.

### Read adapter (`src/lib/staff-self-service-read.ts`)

Single typed seam for every read. Strict explicit column projections (never
`select *`), Zod validation of each row before it reaches React, and an
explicit forbidden-column list (`payload`, `last_error`, `idempotency_key`,
`sha256`, `object_path`, `pdf_object_path`, `source_reference`, `body`).
RLS denials are converted into a safe Arabic message rather than leaking the
underlying database error.

### Payroll PDF

- `src/lib/staff/staff-payroll-pdf.server.ts` — server-only builder on `pdf-lib`
  reusing the project's existing BiDi drawing utilities, so Arabic shaping and
  right-to-left layout match the rest of the portal's official documents.
- `src/lib/staff/staff-payroll-pdf.functions.ts` — `createServerFn` behind
  `requireSupabaseAuth`; it **re-authorizes through the RPC** before generating
  anything, so the endpoint is not a bypass of the row-level rules.

### UI

- `StaffSelfServiceLiveDashboard.tsx` — employee surface, RTL, mobile-first,
  per-panel loading / error / empty states, correspondence search plus an
  inbox/archive split, and a payroll download that only enables for published
  statements.
- `StaffSelfServiceLiveWorkbench.tsx` — administrative surface. Authority is
  proven by returned data, not guessed on the client: the payroll section only
  renders when the query actually returned a statement belonging to someone
  other than the signed-in employee, which only Finance or an Administrator can
  ever read. Otherwise it renders an explicit denial notice.
- Both are mounted behind the existing fail-closed
  `portalFeatures.staffSelfServiceLive` flag in `src/routes/staff.index.tsx` and
  `src/routes/admin/staff-management.tsx`, and the tender showcase stays intact.

## 2. Verification

`tests/staff-self-service/staff-self-service-live-read-side-02d.test.ts` — 8/8 pass.

Seven source-contract tests pin the migration, the RPC security attributes, the
read projections, the server-only PDF boundary, the RTL/fail-closed UI rules and
the feature flag.

The eighth is a real runtime gate. The sandbox has no Docker, so instead of
skipping the gate the harness provisions a disposable PostgreSQL 17.9 cluster
with `initdb` (driven through an unprivileged uid via `setpriv`, since Postgres
refuses to run as root), applies 02A → 02B → 02D, and runs
`tests/staff-self-service/pg17/20-verifier-02d.sql` inside a transaction that
always rolls back. Proven there:

| Case | Result |
| --- | --- |
| No client `UPDATE` grant or policy left on correspondence receipts | PASS |
| Read then re-read keeps the first timestamp (monotonic, idempotent) | PASS |
| Acknowledge never overwrites `read_at` | PASS |
| Unpublished correspondence unreachable by a real recipient | PASS |
| Outsider acknowledge denied (42501) | PASS |
| Payroll: owner / finance / administrator allowed with correct access mode | PASS |
| Payroll: direct manager denied | PASS |
| Payroll: peer employee denied | PASS |
| Payroll: unpublished statement denied even to its owner | PASS |
| Audit ledger records events, hides other actors, rejects UPDATE and DELETE | PASS |
| No broad `INSERT/UPDATE/DELETE` grants to `anon`/`authenticated` on read-side tables | PASS |
| No `anon` execute grant on the three RPCs | PASS |

Other checks: `tsgo --noEmit` clean, `bun run build` succeeded,
`git diff --check` clean, and the rest of `tests/staff-self-service` passes.

## 3. Assumptions

- 02A and 02B remain the owners of the underlying tables and the private storage
  bucket; 02D only adds the read-side contract and hard-guards on both.
- Finance authority for payroll is the existing `finance` role assignment in
  `staff_service_role_assignments`; no new authorization system was introduced.
- `currency_code` stays `YER`; no monetary gateway or payment surface was added.

## 4. Risks

- 02D revokes a grant that live client code may still rely on. Any remaining
  direct `UPDATE` on `staff_correspondence_recipients` outside this branch would
  start failing after apply; the migration replaces it with the two RPCs.
- The payroll PDF renders through the shared BiDi utilities. Font or logo asset
  changes elsewhere would affect its output.

## 5. Obstacles

- Docker is unavailable in this sandbox, so the pre-existing Docker-based 02B
  runtime test still fails here for environmental reasons only (unchanged by this
  work). The 02D gate was written against a local `initdb` cluster instead, so it
  runs for real rather than being skipped.

## 6. Production impact

None. Nothing was applied, deployed, published or written to any database. The
migration is forward-only source awaiting a separate authorized apply stage, and
both UI surfaces remain behind a flag that ships `false`.

## 7. Decision

**PASS** — `PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D` is complete on the
managed edit branch and ready to be moved to
`feat/staff-self-service-live-read-side-02d`.
