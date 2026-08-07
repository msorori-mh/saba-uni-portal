# PORTAL-GRADUATES-AFFAIRS-PRIVACY-AND-PII-AUDIT-04

Date: 2026-08-01
Scope: graduates-affairs domain drafts (foundation, completion, authorization-04)
plus the UI components. SOURCE-ONLY audit; no production data was read or touched.

## 1. PII / sensitive column inventory and protection status

| Column | Class | Protection after this bundle | Residual risk |
|---|---|---|---|
| `graduate_contact_points.protected_value` | Direct contact PII (email/phone) | No SELECT policy for any role. No RPC returns it (verified: string absent from every function result; SQL text contract test pins this). Writable only by self via RPC. | Value stored unencrypted at rest — encryption mechanism is owner decision D-3 (fail-closed until decided: value cannot be read back through the portal at all) |
| `graduate_followups.notes_protected` | Staff case notes (may contain PII) | No policy; omitted from `graduate_affairs_get_graduate_file` result; transition RPC does not return it | No staff read-path exists yet — deliberate; requires owner decision on notes visibility (D-11) |
| `graduate_communication_events.payload_meta` | Message metadata | No policies; insert guarded by consent + verified contact point triggers; RPC surface does not expose it | Template content governance pending (D-9) |
| `graduate_domain_events.payload` | Audit payload | Append-only (trigger), no client policy. Contract + tests: payloads carry codes/ids/filters only, never values | Relies on RPC authors honoring the contract; text-contract test asserts no `protected_value` reference |
| `graduate_records.academic_snapshot` / decisions snapshot | Academic fact PII | Immutable (triggers); no client policy; staff file RPC exposes identity fields (program/department/year/state), not the raw snapshot | Snapshot content definition is an academic-owner matter (existing gate) |
| `student_profiles` (national_id, phone, email, names) | Identity PII (existing domain) | Used only for `user_id` → record resolution. No graduates-affairs object selects or returns these columns | Owned by the students domain; out of this bundle's mutation surface |
| `graduate_profiles` (display name, career summary) | Self-published profile | Self RLS read; self RPC write with 4-field allowlist; `profile_visibility` defaults `private` | `public_opt_in` rendering surface does not exist yet — no public route can render it |
| `graduate_employment_events` | Employment status (sensitive per audit) | Self RLS read of own rows; self RPC insert forced to `graduate_reported`; staff see aggregates only (min-cell suppression ≥3, default 5) | None identified within bundle scope |
| `graduate_survey_responses.answers` | Survey PII potential | Self RLS read; insert requires active matching consent (trigger); aggregation is answers-only with suppression | Question-level PII policy is survey-owner decision (D-10) |

## 2. Data-flow audit

- Self-service writes: profile (allowlisted), consent grant/withdraw, contact
  point add/revoke, employment report, survey response, event registration.
  Every one is an audited RPC; none can touch another graduate's record
  (negative tests prove cross-record attempts fail with zero mutation).
- Staff reads: single audited file RPC (PII-minimized jsonb), audited
  non-PII search (id/program/department/year/state only), aggregate cohort
  report with small-cell suppression. No staff endpoint returns names, raw
  contact values, notes, or snapshot payloads.
- Exports: none exist. There is no export RPC, no export UI affordance (pinned
  by the visual QA regression tests), and row-level export remains prohibited
  by the foundation contract pending owner decision D-8.
- Public surface: `graduate_profiles.profile_visibility='public_opt_in'` has no
  rendering route; published opportunities/events are visible only to
  authenticated graduates whose approved record matches the audience scope
  (empty scope matches nothing).
- UI rendering: the visual QA suite (15 tests, cherry-picked from
  `review/graduates-affairs-ui-visual-qa-01`) pins: no raw ids/emails/phones/
  storage internals rendered, suppressed cells never render as zero, no
  Supabase imports in components.

## 3. Findings and dispositions

| # | Severity | Finding | Disposition |
|---|---|---|---|
| F-1 | HIGH (pre-existing) | UI rendered raw identifiers (programId, purpose codes, survey machine keys) | CLOSED by cherry-picked commit `9c036a78` (display-format helper + regression tests) |
| F-2 | MEDIUM | Contact values at rest unencrypted | OPEN — owner decision D-3; fail-closed (no read path) until decided |
| F-3 | MEDIUM | `graduate_affairs` unit labeled شؤون الدراسات العليا in seed migration but شؤون الخريجين in `staff-functional-roles.ts` | OPEN — owner decision D-1; bundle keys on the stable unit/role **codes**, not labels |
| F-4 | LOW | `payload_meta`/audit payloads are convention-protected, not schema-protected | Accepted with text-contract tests; schema-level PII lint is a follow-up |
| F-5 | LOW | Specialist with empty department scope silently sees zero rows in default search | Documented fail-closed behavior; explicit out-of-scope error when a forbidden department is requested |

## 4. Compliance posture against the audit contract

Default-deny RLS ✔; atomic RPC checks ✔; UI visibility not an authorization
boundary ✔ (no routes); employers cannot browse graduate identities ✔ (no
employer actor exists); consent purpose/version-specific and prospectively
withdrawable ✔; reports aggregate/de-identified with small-cell suppression ✔;
sensitive reads audited ✔; notifications carry no sensitive detail ✔
(communication log stores metadata only).
