# PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D

MODE: SOURCE_ONLY on the managed edit branch `edit/edt-6c250e9e-…`
BASELINE: `cdf1ad52a115fd6c873c37a39ce1ddd80f099a55`
SECURITY REVIEW: applied on top of `0a541c885e1d8cbdc7f785289f4039b0d08f111d`
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
| **Review fix:** `staff_payroll_statements_owner_or_finance_read` and `staff_payroll_components_owner_or_finance_read` rebuilt | The owner could previously `SELECT` an *unpublished* statement (and its components) directly, even though the download RPC refused it. The owner branch now requires `published_at is not null`; Finance/Administrator keep the administrative scope of the current contract. |
| **Review fix:** audit uniqueness narrowed to a partial unique index on `subject_kind = 'correspondence'` | Every payroll download must be appended as its own audit event. Only receipt facts (received/read/acknowledged) stay idempotent. |
| **Review fix:** `staff_service_get_current_capabilities()` | Boolean-only capability probe (`is_employee/is_direct_manager/is_hr/is_finance/is_administrator` + payroll/HR/audit scope flags). No names, rows or identifiers. `security definer`, fixed `search_path`, revoked from `public`/`anon`. |

All three RPCs are `security definer` with `set search_path = public, pg_temp`,
revoked from `public`/`anon`, and granted to `authenticated` only.

### Read adapter (`src/lib/staff-self-service-read.ts`)

Single typed seam for every read. Strict explicit column projections (never
`select *`), Zod validation of each row before it reaches React, and an
explicit forbidden-column list (`payload`, `last_error`, `idempotency_key`,
`sha256`, `object_path`, `pdf_object_path`, `source_reference`).
`body` was removed from that list in the review: the circular text is the whole
point of the staff inbox and is already governed by the correspondence RLS
policy. The adapter also gained `fetchStaffCorrespondenceReceiptSummary()`
(per-circular recipients/read/acknowledged totals within RLS, no recipient
identity projected), `fetchStaffServiceCapabilities()`, and an explicit
`recipient_user_id = auth.uid()` filter so the employee dashboard can never bind
to an arbitrary other recipient's receipt row.
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

The eighth is a real runtime gate and is now **dual-backend**: it uses a local
PostgreSQL 17 toolchain when one exists, otherwise a disposable `postgres:17`
Docker container (the 02B pattern), and fails loudly when neither is available —
it never skips silently. The unprivileged uid used for the local path is
discovered from the environment (`SUDO_UID` / `PG_TEST_UID`, falling back to a
verified uid) instead of being hard-coded, and the Docker path needs no uid
handling at all. In this sandbox it ran on a local PostgreSQL 17.9 cluster,
applying 02A → 02B → 02D and running
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
| Payroll: unpublished statement denied even to its owner (RPC) | PASS |
| Payroll: unpublished statement + components invisible to their owner via **direct SELECT** | PASS |
| Payroll: published statement + components still readable by the owner | PASS |
| Two payroll download calls produce two separate audit events | PASS |
| Correspondence receipt audit events stay exactly one per fact | PASS |
| Capabilities: employee has no payroll/HR scope; manager has no payroll scope | PASS |
| Capabilities: Finance is capability-allowed with zero rows in scope (empty ≠ denial) | PASS |
| Capabilities: outsider gets all-false; payload carries no names or identifiers | PASS |
| Audit ledger records events, hides other actors, rejects UPDATE and DELETE | PASS |
| No broad `INSERT/UPDATE/DELETE` grants to `anon`/`authenticated` on read-side tables | PASS |
| No `anon` execute grant on the RPCs, capability probe included | PASS |

### UI authority

`StaffSelfServiceLiveWorkbench` no longer infers Finance from "a statement that
belongs to someone else". It calls the boolean-only capability probe and uses it
to show/hide the payroll, HR and audit sections, with a distinct empty state
(`staff-02d-wb-payroll-empty`) so an authorised Finance user with zero rows is
never shown a denial. Correspondence rows now display real per-circular
recipients/read/acknowledged totals instead of a single arbitrary receipt.
`StaffSelfServiceLiveDashboard` renders the circular body on demand
(`staff-02d-correspondence-body`), followed by mark-read and acknowledge.
RLS remains the real defence line in every case.

### Environment results (actual)

| Check | Result |
| --- | --- |
| `bun test tests/staff-self-service/staff-self-service-live-read-side-02d.test.ts` | 8/8 pass (PG17 runtime gate included) |
| `bun test tests/staff-self-service` | 34 pass, 1 fail — the pre-existing Docker-only 02B gate (`docker is required…`), unchanged by this review |
| `bunx vitest run` | pass |
| `bunx tsgo --noEmit` | clean |
| `bun run build` | success |
| `git diff --check` | clean |

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

- Docker is unavailable in this sandbox, so the pre-existing Docker-only 02B
  runtime test still fails here for environmental reasons only. It is reported as
  a real failure rather than claimed as PASS. The 02D gate is dual-backend and
  ran for real on the local PostgreSQL 17.9 toolchain; back-porting the same
  dual-backend harness to 02B is outside this review's scope.

## 6. Production impact

None. Nothing was applied, deployed, published or written to any database. The
migration is forward-only source awaiting a separate authorized apply stage, and
both UI surfaces remain behind a flag that ships `false`.

## 7. Decision

**PASS** — `PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D` is complete on the
managed edit branch and ready to be moved to
`feat/staff-self-service-live-read-side-02d`.
