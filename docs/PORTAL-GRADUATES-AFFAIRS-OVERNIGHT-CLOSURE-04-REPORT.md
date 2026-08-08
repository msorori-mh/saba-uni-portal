# PORTAL-GRADUATES-AFFAIRS-OVERNIGHT-CLOSURE-04-REPORT

Date: 2026-08-01
Mission: PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-AND-PRIVACY-CLOSURE-OVERNIGHT-04
Branch: `feat/graduates-affairs-authorization-closure-overnight-20260801` (from `origin/main` @ `8729f6d5`)
Mode: LONG AUTONOMOUS SOURCE-ONLY. No production connection, no migration apply,
no deploy/publish, no `student_visible` change, no new role enum, no B1 or
graduation-projects file touched. All SQL is NOT_APPLIED under
`docs/migration-drafts/`.

## Final decision

**PASS_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PRIVACY_SOURCE_PACKAGE_READY_FOR_OWNER_DECISION_AND_REVIEW**

PASS means the source package is complete, verified, and ready for owner
decisions (DECISION-PACKAGE-04) and review. It is not approval to apply SQL,
activate a feature, create accounts, or deploy.

## What was delivered (workstreams 1–8)

1. **Authoritative actor/capability matrix** — `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-MATRIX-04.md`:
   9 actors (graduate self, GA manager, GA specialist, direct case assignee,
   department-scoped staff, college administration, unrelated staff, unrelated
   authenticated, anonymous) × full capability matrix with ALLOW mechanism or
   DENY per cell.
2. **Inventory** — same document, §3: routes (none — domain is unwired, verified
   by grep), server functions (none), RPC surface, 17 domain tables, RLS
   policies, sensitive columns, reused authorization infrastructure.
3. **Narrowest capability adapter** — `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`
   + `src/lib/graduates-affairs/authorization.ts`. Reuses only
   repository-evidenced infrastructure: unit `graduate_affairs`, roles
   `graduate_affairs_manager`/`graduate_affairs_specialist` (seeded by applied
   migration `20260716172804`), `request_processing_assignments`,
   `staff_profile_departments`, `student_profiles.user_id`. No new enum, no
   `app_role` dependency, no admin/registrar/dean bypass.
4. **Enforcement** — self-owned profile updates only via RPC with an explicit
   4-field mutable allowlist and optimistic `row_version`; PII columns
   (`protected_value`, `notes_protected`) unreachable by any actor; specialist
   department scope enforced in SQL (out-of-scope raises, default search
   restricted); dashboards aggregate-only with min-cell suppression
   (`GREATEST(minimum,3)`, default 5); no export path exists; audit events on
   every staff read/mutation and every self mutation; lifecycle transitions
   database-guarded; direct-URL access impossible (no routes exist).
5. **Safe foundations completed** — alumni profile, graduation record,
   employment status, surveys, opportunities, events, follow-ups, dashboards,
   search/filtering (staff, audited, non-PII), import validation
   (`src/lib/graduates-affairs/import-validation.ts`, fail-closed batch
   contract), graduate self-service (13 RPCs). Privacy/visual UI findings from
   `review/graduates-affairs-ui-visual-qa-01` (commit `9c036a78`) cherry-picked:
   no raw identifiers rendered, suppression labels, no export affordance,
   15 regression tests.
6. **Tests** — 110 graduates-affairs bun tests (foundation 6, completion 23,
   visual/privacy 15, TS authorization 40, SQL text-contract 26) covering the
   full positive and negative matrix.
7. **Disposable PostgreSQL verification** — new CI leg
   `graduates-affairs-authorization`; executed locally on disposable
   `postgres:17` (Docker): pg-setup → foundation → completion →
   authorization-04 → pg-verify ⇒ **PASS**. The executable verifier proves:
   anon cannot EXECUTE any RPC; unrelated user/staff, inactive/expired
   assignment, wrong-department specialist, other graduate are DENY with zero
   mutation; self RLS reads work; direct table writes are RLS-denied;
   `protected_value`/`notes_protected` never leave the database; audience
   `{}` matches nothing; invalid transitions raise; audit rows are written.
8. **Decision package** — `docs/PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04.md`:
   12 owner decisions (D-1 unit-label conflict … D-12 documents integration),
   each with access model, security consequences, schema impact, UI impact,
   recommended option, and the fail-closed state before selection.
   Plus `docs/PORTAL-GRADUATES-AFFAIRS-PRIVACY-AND-PII-AUDIT-04.md`.

## Files changed

**New SQL draft (NOT_APPLIED):**
- `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql`

**New source:**
- `src/lib/graduates-affairs/authorization.ts`
- `src/lib/graduates-affairs/import-validation.ts`
- `src/components/graduates-affairs/display-format.ts` (cherry-pick)

**Modified source (cherry-picked privacy fixes, commit `9c036a78`):**
- `src/components/graduates-affairs/GraduateCommunicationPanel.tsx`
- `src/components/graduates-affairs/GraduateFileCard.tsx`
- `src/components/graduates-affairs/GraduateReportsPanel.tsx`
- `src/components/graduates-affairs/GraduateSurveyCard.tsx`

**New tests:**
- `tests/graduates-affairs/graduates-affairs-authorization-04.test.ts` (40)
- `tests/graduates-affairs/graduates-affairs-authorization-04-sql.test.ts` (26)
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql`
- `tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql`
- `tests/graduates-affairs/graduates-affairs-visual-ux-qa-01.test.ts` (cherry-pick, 15)

**CI:** `.github/workflows/ci.yml` — one pg-verifiers matrix leg added.

**Docs:** the four PORTAL-GRADUATES-AFFAIRS-*-04 documents plus the
cherry-picked VISUAL-UX-ACCESSIBILITY-QA-01 report.

## Verification results

| Check | Result |
|---|---|
| `bun test tests/graduates-affairs` | **110 pass / 0 fail** (543 assertions) |
| `bun test tests/student-requests` | **1060 pass / 0 fail** (7799 assertions; one intermediate run showed 2 flake failures under concurrent load, 3 clean re-runs followed — pre-existing timing sensitivity, unrelated to this change) |
| `bunx tsc --noEmit` | **clean** |
| `bun run build` | **client + SSR build pass** |
| `git diff --check` | **clean** |
| Disposable PG 17 chain (setup→foundation→completion→authorization-04→verify) | **PASS** (`graduates-affairs-authorization-04 pg-verify: PASS`) |

Findings fixed during this mission's own verification loop:
- RPCs initially kept the default PUBLIC EXECUTE grant (anon could EXECUTE);
  caught by the executable verifier, fixed by explicit REVOKE FROM PUBLIC, anon
  before every authenticated GRANT, plus a new text-contract test.
- Verifier probe used non-existent `information_schema.parameters.ordinality`
  and assumed `parameter_mode='TABLE'` for RETURNS TABLE (PostgreSQL reports
  OUT); fixed.

## Assumptions

- The unit/role **codes** `graduate_affairs` / `graduate_affairs_manager` /
  `graduate_affairs_specialist` are the graduates-affairs authority anchor
  (label conflict deferred to owner decision D-1; codes are the stable key).
- Specialist department scope comes only from `staff_profile_departments`;
  empty scope = no access (fail-closed).
- Audience-scope semantics (`all_graduates` / `program_ids` / `department_ids`,
  `{}` = nothing) are a proposed contract pending owner confirmation (D-4).
- The TS adapter is a planning/UI helper, never a security boundary; SQL is
  the boundary.
- PR #271 was used for comparison only (it is the graduation-projects
  overnight branch; no content was taken from it).

## Risks

- The drafts are NOT_APPLIED; production behavior is unchanged and the domain
  remains inaccessible until a governed apply + assignment seeding occurs.
- `protected_value` is stored unencrypted at rest (D-3) — mitigated by having
  no read path at all.
- Audit-payload PII exclusion is convention + text-contract enforced, not
  schema-enforced (F-4, LOW).
- The two student-requests flake failures observed once under load could not be
  reproduced in 4 subsequent runs; flagged for CI observation.

## Blockers

None for source review. Production activation is blocked by the 12 owner
decisions in DECISION-PACKAGE-04 (chiefly D-1 unit semantics, D-2 account
continuity, D-3 contact protection).

## Production impact

Zero. No production connection or data access, no SQL apply, no migration, no
seed, no account/profile/document change, no `student_visible` change, no
Storage operation, no deploy, no publish, no E2E.
