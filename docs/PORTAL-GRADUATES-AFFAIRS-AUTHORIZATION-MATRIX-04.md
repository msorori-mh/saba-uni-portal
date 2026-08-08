# PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-MATRIX-04

Date: 2026-08-01
Base: `origin/main` @ `8729f6d5` (branch `feat/graduates-affairs-authorization-closure-overnight-20260801`)
Status: SOURCE-ONLY. Every SQL object named here lives in NOT_APPLIED drafts under
`docs/migration-drafts/`. Nothing in this document authorizes applying SQL,
activating a feature, or granting production access.

Audit sources: current `origin/main`; `codex/graduates-affairs-mvp-audit-design-01`;
`codex/graduates-affairs-mvp-foundation-01`; `feat/graduates-affairs-completion-01`;
`review/graduates-affairs-ui-visual-qa-01` (privacy/visual fix commit `9c036a78`
cherry-picked into this branch); PR #271 (comparison only — it is the
graduation-projects overnight branch, out of this scope).

## 1. Actors

| # | Actor | Repository-evidenced identity resolution |
|---|---|---|
| A1 | Graduate self | `auth.uid()` → `student_profiles.user_id` → `graduate_records.student_profile_id` (record exists only via an approved `graduate_official_decisions` row) |
| A2 | Graduates-affairs manager | Active `request_processing_assignments` row, unit `graduate_affairs`, role `graduate_affairs_manager` (unit/role seeded by applied migration `20260716172804`), college scope |
| A3 | Graduates-affairs specialist | Same unit, role `graduate_affairs_specialist`, department scope from `staff_profile_departments` of the resolved `staff_profiles` row; empty scope ⇒ no access |
| A4 | Direct case assignee | `graduate_followups.assignee_user_id = auth.uid()` with state `open`/`in_progress` for that specific record, **and** the assignee still holds an active Graduate Affairs staff capability (inactive/suspended staff profile or revoked/expired assignment immediately loses read/transition authority; the follow-up row is retained for audit) |
| A5 | Department-scoped staff (other) | Any staff whose scope/department matches but who lacks a `graduate_affairs` assignment — DENY (no cross-domain inference) |
| A6 | College administration (dean/admin/registrar/system_admin) | `app_role` holders without a `graduate_affairs` assignment — DENY (no bypass, per audit contract) |
| A7 | Unrelated staff | Active assignment in any other unit — DENY |
| A8 | Unrelated authenticated user | Authenticated, no graduate record, no assignment — DENY |
| A9 | Anonymous | No JWT / role `anon` — DENY |

Assignment activity requires `is_active AND (starts_at IS NULL OR starts_at <= now())
AND (ends_at IS NULL OR ends_at > now())` on the assignment, plus `is_active` on
both the unit and the role. Actor resolution accepts assignment types `user` and
`staff_profile` only; every other type is ignored (fail-closed).

**Frozen direct-user assignment identity rule (CODEX-FINAL-HIGH-1):** every GA
operational staff capability requires an ACTIVE staff identity.

| Assignment type | Identity rule |
|---|---|
| `staff_profile` | `assignment.staff_profile_id` must exist, belong to the target/caller user, and `status = 'active'` |
| `user` | `assignment.user_id` must match the target/caller, and that user must resolve fail-closed to **exactly one** `staff_profiles` row with `status = 'active'` (zero ⇒ DENY; more than one ⇒ DENY; inactive/suspended do not qualify) |

Canonical resolver: `graduate_affairs_resolve_authorized_staff_profile_id(user, role)`
(+ caller variant). Multiple distinct authorizing profiles for the same role ⇒ DENY.

**Specialist scope binding (CODEX-FINAL-HIGH-2):** department scope comes only from
the authorizing profile returned by the resolver — never the union of other active
profiles owned by the same user.

## 2. Capability matrix

ALLOW = explicit mechanism exists in the drafts. DENY = default-deny (no policy /
no grant / RPC raises). "RPC" = SECURITY DEFINER function with an internal
capability re-check and an audit event.

| Capability | A1 self | A2 manager | A3 specialist | A4 assignee | A5–A9 |
|---|---|---|---|---|---|
| Read own graduate profile | ALLOW while record `approved` (RLS current-self SELECT) | ALLOW (RPC `graduate_affairs_get_graduate_file`) | ALLOW in-scope only (same RPC) | ALLOW (same RPC, case-scoped, while GA capability remains) | DENY |
| Update own profile | ALLOW — RPC `graduate_update_own_profile` only; mutable-field allowlist: `public_display_name`, `preferred_contact_channel`, `career_summary`, `profile_visibility`; optimistic `row_version` | DENY (no staff profile-edit path) | DENY | DENY | DENY |
| Read/write academic fact (`graduate_records`, decisions, snapshot) | DENY (no policy; RPC reads expose identity fields only) | read via RPC summary; write DENY | same | DENY | DENY |
| Manage own consents (grant/withdraw) | ALLOW (RPC, audited) | read via file RPC | in-scope read | DENY | DENY |
| Add/revoke own contact points | ALLOW (RPC; value never returned by any function) | metadata only (verified/revoked flags) | metadata only, in-scope | DENY | DENY |
| Read raw contact value (`protected_value`) | DENY | DENY | DENY | DENY | DENY |
| Report own employment event | ALLOW (RPC, `graduate_reported`) | read aggregated | read aggregated | DENY | DENY |
| Submit/withdraw own survey response | ALLOW (RPC + consent trigger) | aggregates only | aggregates only | DENY | DENY |
| Register/cancel own event registration | ALLOW (RPC + consent trigger) | DENY | DENY | DENY | DENY |
| List visible opportunities/events | ALLOW (self RLS/RPC: published + in-window + audience match) | ALLOW (staff moderation RPCs) | ALLOW | DENY | DENY (unpublished invisible to all) |
| Moderate opportunities | DENY | ALLOW (RPC transition guard; manager-only MVP) | DENY (manager-only until object scope exists) | DENY | DENY |
| Verify employers | DENY | ALLOW (manager-only MVP) | DENY (manager-only until object scope exists) | DENY | DENY |
| Create follow-up case | DENY | ALLOW (assignee must be active GA staff; college-wide) | ALLOW in-scope; assignee must independently cover record department | DENY | DENY |
| Transition follow-up state | DENY | ALLOW | assignee only while GA staff capability remains active | ALLOW only while GA staff capability remains active | DENY |
| Read follow-up protected notes (`notes_protected`) | DENY | DENY in this bundle (file RPC omits the column) | DENY | DENY in this bundle | DENY |
| Search records | DENY | ALLOW (audited, non-PII columns) | ALLOW, forced to scope | DENY | DENY |
| Cohort employment report | DENY | ALLOW (aggregate, min-cell suppression) | ALLOW in-scope program only | DENY | DENY |
| Row-level export of any kind | DENY | DENY | DENY | DENY | DENY |
| Direct table INSERT/UPDATE/DELETE as `authenticated` | DENY (RLS, no policies except self SELECTs) | DENY | DENY | DENY | DENY |

Lifecycle transition checks are database-enforced: follow-ups
(`open→in_progress→completed/cancelled`, outcome required, append-only),
opportunities (`draft→in_review→published→closed→archived`, publish requires
`published_at`+`moderated_by`), employer verification
(`unverified→in_review→verified/rejected`), graduate record state follows the
official decision only.

Every staff RPC and every self mutation writes a `graduate_domain_events` audit
row (append-only; payload documented to exclude PII values).

## 3. Inventory

### 3.1 Routes / server functions / UI wiring
- No route, server function (`createServerFn`), or API endpoint references the
  graduates-affairs domain. `src/routes/`, `src/router.tsx`, `src/server.ts`
  contain zero references (verified by grep).
- Four presentational components exist (`src/components/graduates-affairs/`),
  deliberately unwired (routeTree is out of scope per the completion report).
  They perform no network calls; the visual/privacy QA regression suite pins
  "no raw ids/emails/phones rendered, no export affordance, no Supabase imports".
- Direct-URL access is therefore default-deny in the strongest form: no URL
  exists. When routes are later added they must call the audited RPCs only.

### 3.2 Tables (foundation + completion drafts; all RLS-enabled)
`graduate_official_decisions`, `graduate_records`, `graduate_profiles`,
`graduate_contact_points`, `graduate_consents`, `graduate_employers`,
`graduate_employment_events`, `graduate_opportunities`, `graduate_surveys`,
`graduate_survey_versions`, `graduate_survey_responses`, `graduate_events`,
`graduate_event_registrations`, `graduate_domain_events`, `graduate_followups`,
`graduate_communication_events`, `graduate_account_continuity_policies`.

### 3.3 RPC surface after this bundle
Foundation: `create_graduate_record_from_official_decision` (revoked from all
clients). Completion: `evaluate_graduate_account_continuity`,
`graduate_aggregate_employment_report` (revoked; reached only through the
staff-checked wrapper). Authorization-04 adds 13 graduate self-service RPCs and
7 staff RPCs (see §2), plus internal helpers. All SECURITY DEFINER with pinned
`search_path`; EXECUTE granted to `authenticated` only on the RPCs, each of
which re-checks capability internally; helpers revoked from `PUBLIC/anon/authenticated`.

### 3.4 RLS policies added by this bundle (everything else stays policy-less)
Self SELECT: `graduate_profiles`, `graduate_consents`, `graduate_survey_responses`,
`graduate_event_registrations`, `graduate_employment_events`.
Audience-gated SELECT (`authenticated`): `graduate_opportunities`,
`graduate_events` (published + in-window + `graduate_audience_matches` against an
approved self record). No INSERT/UPDATE/DELETE policies anywhere in the domain —
all writes go through audited RPCs.

### 3.5 Authorization infrastructure reused (no new enums, no new role values)
`request_processing_units`/`request_processing_roles`/`request_processing_assignments`
(unit `graduate_affairs`, roles `graduate_affairs_manager`/`graduate_affairs_specialist`
— seeded by applied migration `20260716172804`), `staff_profiles`,
`staff_profile_departments`, `student_profiles.user_id`, `auth.uid()`.
No `app_role` value is consulted: admin/registrar/dean/system_admin hold no
graduates-affairs capability.

### 3.6 Sensitive columns (detail in PRIVACY-AND-PII-AUDIT-04)
`graduate_contact_points.protected_value` (contact PII — unreadable by anyone in
this bundle), `graduate_followups.notes_protected` (staff notes — omitted from
every RPC result), `graduate_communication_events.payload_meta` (metadata only),
`graduate_domain_events.payload` (contract: never PII), `academic_snapshot`
(academic fact — immutable, RPC summary exposure only), `student_profiles`
contact columns (referenced for identity resolution only, never exposed by this
domain).

## 4. Negative matrix proven by executable verification

`tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql`
executes on a disposable PostgreSQL 17 cluster (CI leg
`graduates-affairs-authorization`) and proves, with zero-mutation assertions:
anonymous, unrelated authenticated user, other graduate, unrelated-unit staff,
inactive assignment, expired assignment, out-of-scope specialist, and
admin-without-assignment are all DENY for every sensitive capability; direct
table writes are RLS-denied; `protected_value`/`notes_protected` never appear in
any function result; audience `{}` matches nothing; invalid lifecycle
transitions raise; and every DENY leaves the database byte-identical.
