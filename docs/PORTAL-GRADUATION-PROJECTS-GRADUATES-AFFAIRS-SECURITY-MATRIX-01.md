# PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-SECURITY-MATRIX-01

Mission: PORTAL-GRADUATION-PROJECTS-AND-GRADUATES-AFFAIRS-OVERNIGHT-MASTER-01
Scope: positive and negative authorization audit for both modules on this branch.
Evidence classes: (A) executable direct-RPC matrices in disposable PostgreSQL 17,
(B) bun test suites, (C) source audit of the ported code, (D) historical k3 reports (secondary).

---

## 1. Authorization architecture under audit

- All module tables: RLS enabled, zero permissive policies, table grants revoked from
  `anon`/`authenticated` (default deny) [DRAFT SQL, class A verified].
- All access via `security definer` RPCs, `set search_path = public, pg_temp`, EXECUTE granted
  only to `authenticated` for user-facing RPCs; service-only RPCs revoked from clients.
- Actor identity: `auth.uid()` inside RPCs. Server functions
  (`src/lib/graduation-projects/portal.functions.ts`) never accept actor ids from the client
  (class C, portal.functions.ts:181 comment + wrapper signatures).
- Authority rows: `graduation_project_assignments` — must be active, directly assigned, exact
  project + department match (`require_graduation_project_assignment`).
- Client action matrix (`availableProjectActions`) is a UX mirror only.
- Graduates-affairs: all objects default-deny; both security-definer functions revoked from all
  client roles pending the G4 authorization package (documented product decision).

## 2. Graduation Projects — executable matrix (class A, re-run this mission)

Artifact: `tests/graduation-projects/postgres-authorization-matrix-verifier.sql`
(68 rows: positive + negative direct-RPC cases against the final M1–M8 schema).

Local re-verification 2026-08-01 (disposable postgres:17 Docker container, ON_ERROR_STOP,
verifiers end in ROLLBACK, container destroyed): **AUTHORIZATION MATRIX PASS: 68 rows,
fail_rows=0** — observed twice (post-M7 and post-M8 stages of
`tests/graduation-projects/run-pg17-migration-package.sh`, final line
"MIGRATION PACKAGE PG17 VERIFICATION PASS").

Actor coverage vs the mission-required list:

| Mission actor | Covered by | Result |
|---|---|---|
| anonymous | anon has zero EXECUTE on every module RPC (security-audit invariant) | DENY ✔ |
| authenticated unrelated user | negative rows: no assignment → every write/read RPC denied | DENY ✔ |
| student owner (team member) | positive rows: read own project, submit/resubmit proposal, submit deliverable, manage team within draft rules | ALLOW ✔ |
| student non-owner | negative rows: cannot read detail of other project, cannot write | DENY ✔ |
| member of same project team | positive rows for team-scoped reads/writes per role | ALLOW ✔ |
| student from another department | composite FK `(id, department_id)` + assignment checks; cross-department writes denied | DENY ✔ |
| assigned supervisor | positive: notes, milestone review, submission review, evaluation flow | ALLOW ✔ |
| unrelated faculty member | negative rows across write RPCs | DENY ✔ |
| department head (correct dept) | positive: proposal review, activation, assignments, panel, reports | ALLOW ✔ |
| department head (other dept) | negative: department mismatch denied on all scoped RPCs | DENY ✔ |
| co-supervisor | dedicated rows incl. "co_supervisor cannot write supervisor notes", staff-visibility reads | ALLOW/DENY per contract ✔ |
| panel member | evaluation save (own draft), read finalized; GP-07-HIGH-1/M7 guard: result conclusion requires panel completeness; M8: held outcome requires complete panel | ALLOW ✔ |
| dean | read/report level only per assignment; no blanket bypass | per contract ✔ |
| coordinator | full lifecycle management within own department | ALLOW ✔ |
| admin (portal) | admin workspace via capabilities; roster candidate listing manager-gated (GP-09-MED-1) | per contract ✔ |

Write-path invariants proven per RPC (class A + B): actor identity (auth.uid), ownership,
department scope, lifecycle transition validity, role/capability, input validation, audit event
append (33 event types, append-only trigger), idempotency via `p_correlation_id`
(24 idempotent-retry pairs, k3 evidence, re-executed in the lifecycle verifier chain).

## 3. Graduation Projects — portal/presentation layer (class B + C)

- `portal-privacy.ts`: student-only viewers are withheld committee evaluations until result
  states; object keys and actor user ids redacted from student surfaces.
- `availability.ts`: fail-closed probe; no mock outside non-production opt-in.
- bun suites (155 tests, all green 2026-08-01): authorization-closure (10 tests),
  security-audit (5), hardening, lifecycle (incl. MEDIUM-1 viewer-scoped own-evaluation
  regressions), files-notifications, admin-settings, e2e-portal-journeys,
  portal-integration, visual-ux-qa.
- No service-role key usage anywhere in the module; no client-side direct table writes
  (rpc.ts never calls `.from(`).

## 4. Graduates Affairs — privacy and authorization (class A + B + C)

- Executable verifiers re-run this mission in disposable postgres:17 (fresh database per chain,
  2026-08-01): foundation chain PASS (forged/pending decision inserts fail, record↔decision
  identity trigger, RLS/ACL default-deny) and completion chain PASS (consent binding,
  immutability, suppression math, revocation propagation).
- PII boundaries: raw contact values only in `graduate_contact_points.protected_value`; all
  views carry channel/purpose/verification state only; staff summary is non-identifying;
  aggregate reports enforce minimum cell size 5 with per-cell suppression and
  `assertAggregateReportSafe` key allowlist.
- Consent: purpose+notice-version scoped, append-only, withdrawal prospective-only;
  communications and surveys hard-gated on active consent + verified unrevoked contact point.
- D-13 account continuity: default-deny (undecided ⇒ no capability).
- bun suites (44 tests green) incl. the ported visual-UX/privacy guard: fails on any UUID,
  recordId, studentProfileId, user_id, storage key, email or phone in rendered output, on any
  export affordance, on Supabase imports or network calls in components, on non-logical CSS.
- Staff authorization matrix (ALLOW/DENY per role): **BLOCKED on G4 product decision** —
  not invented by this mission; all ALU report entries remain
  `required_role: ["pending:g4_authorization_package"]`.

## 5. Negative findings and dispositions

- No branch audited (11 branches) weakens authorization, RLS or PII protection; none adds
  broad admin/dean/registrar bypasses; none accepts client-supplied actor ids.
- GP-07-HIGH-1 (result conclusion bypass), GP-08-CONTRACT-1 (empty-committee defense),
  GP-09-MED-1 (roster exposure) — all fixed within the k3 track (M7/M8/server-fn gating) with
  regression tests; fixes included in this port and re-verified locally.
- k3's migration-review CI allowlist (exact-fingerprint DELETE FROM exception) was NOT ported
  because the SQL no longer lives in supabase/migrations; it is deferred with the promotion
  package (see SCOPE-01 §6). This keeps the current stricter gate intact.
- Pre-existing main failures unrelated to this mission:
  ~~`tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`
  (B1 isolation boundary — untouched)~~ **RESOLVED on main c17a866f (2026-08-01); after merge
  e6cdba5f the package is 183/183 green** — and environmental
  `tests/imports/import-templates.test.ts` timeouts. Documented in TEST-RESULTS-01.

## 6. Residual risks

- SQL remains NOT_APPLIED: runtime RPC availability in any real environment is unproven here;
  the portal fails closed (service-updating state) until promotion.
- Storage/signed-URL contracts are documented but unexercised (binary upload disabled by design).
- Graduates-affairs runtime authorization awaits the G4 package; until then the module is
  default-deny with zero data exposure paths.
