# PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-DECISION-PACKAGE-04

Date: 2026-08-01
Purpose: every graduates-affairs item that genuinely requires a product/owner
decision. Until a decision is recorded, each item stays FAIL-CLOSED exactly as
implemented. Selecting an option later must not require redesign — only a new
versioned decision row or a follow-on draft.

Format per item: access model options · security consequences · schema impact ·
UI impact · recommended option · what stays fail-closed before selection.

---

## D-1 — Canonical meaning of the `graduate_affairs` unit/role codes

**Evidence conflict.** Applied migration `20260716172804` seeds unit
`graduate_affairs` as «شؤون الدراسات العليا» (postgraduate affairs) with roles
`graduate_affairs_manager`/`graduate_affairs_specialist`.
`src/lib/staff-functional-roles.ts` and the graduation-certificate workflow
preview use the same codes for «شؤون الخريجين» (graduates affairs). The
authorization bundle keys exclusively on the stable **codes**, never labels.

- Option A: confirm codes mean graduates-affairs; fix the Arabic label in a new migration. Access model: unchanged. Security: none. Schema: label-only update migration. UI: none.
- Option B: codes mean postgraduate affairs; create new graduates-affairs unit/roles. Access model: new codes, new seed, re-point the bundle. Security: risk of two look-alike units; requires care. Schema: new seed rows. UI: staff-admin labels.
- Option C: split both units explicitly (graduates + postgraduate) with distinct codes. Schema: two new units; migration of the seeded assignments.
- **Recommended: A** — cheapest, matches the dominant source usage, zero semantic change.
- **Fail-closed before selection:** the bundle authorizes only holders of active assignments under the literal codes; whoever those assignments are granted to in production is itself a governed admin action. No graduate data becomes reachable by deciding nothing.

## D-2 — Post-graduation account continuity (existing D-13)

- Option A: graduates keep portal sign-in, scoped capability list, expiry date. Access model: approved `graduate_account_continuity_policies` row listing capabilities. Security: account takeover surface extends beyond study period; requires recovery-channel policy. Schema: none (surface exists). UI: graduate self-service routes become wireable.
- Option B: university email reuse allowed. Security: address reuse collides with identity proofing — high risk without verification. Schema: same flags.
- Option C: reject continuity; alumni handled outside the portal. Security: minimal. UI: none.
- **Recommended: A with explicit capability list and expiry; B only after a verification design; never bundle consent with continuity.**
- **Fail-closed before selection:** policy default `undecided` denies every capability; `evaluate_graduate_account_continuity` returns false on any ambiguity (proven by pg-verify).

## D-3 — Contact-point value protection and verification flow

- Option A: application-level encryption (pgcrypto) with keys outside the DB; verified-value reads only via a dedicated audited RPC. Security: strongest; key management burden. Schema: column type stays text; add key-version column.
- Option B: keep plaintext, add a narrowly-scoped staff read RPC with per-read audit + purpose. Security: weakest; any future SQL injection / broad grant exposes values.
- Option C: never store raw values; store hashes + masked display (contact via relayed templates only). Security: strongest privacy; communication requires a relay service that doesn't exist.
- **Recommended: A; interim C-style behavior is already the de-facto state (no read path at all).** Verification flow (how `verified_at` is set — OTP, staff attestation) must be decided together with this.
- **Fail-closed before selection:** no actor, including the graduate and managers, can read `protected_value` through the portal; self can only write/revoke.

## D-4 — Audience semantics for opportunities/events

The bundle implements: `audience_scope->>'all_graduates' = true`, or membership
in `program_ids`/`department_ids` arrays; `{}` matches nothing.
- Option A: confirm exactly this contract. Schema/UI: none.
- Option B: add cohort/year filters. Schema: jsonb keys only; UI: moderator form.
- Option C: external/public audience (non-authenticated). Security: publishes employer data publicly; needs separate review.
- **Recommended: A now, B later if quality reporting asks for it; reject C for this domain.**
- **Fail-closed before selection:** unmatched audiences are invisible; nothing is public.

## D-5 — Employer actors and external access

- Option A: no employer accounts (current). Employers exist only as reviewed reference rows.
- Option B: employer self-service portal with direct assignment moderation. Security: new external actor class, full isolation proof needed; large.
- **Recommended: A for the MVP horizon.**
- **Fail-closed before selection:** employers cannot authenticate or browse anything; applications do not exist.

## D-6 — Job applications

- Option A: excluded (current). Option B: applications domain with its own consent/retention contract. Schema: new tables; UI: significant.
- **Recommended: A until a dedicated audit.**
- **Fail-closed:** no application table, RPC, or UI exists.

## D-7 — Staff notes visibility (`notes_protected`)

- Option A: assignee + manager read via audited RPC. Option B: assignee only. Option C: keep unreadable until a notes policy (retention, sensitivity tiers) exists.
- **Recommended: C now; B when follow-up workflows need history.**
- **Fail-closed:** no RPC returns `notes_protected`.

## D-8 — Row-level exports

- Option A: prohibited (current). Option B: purpose-scoped, expiring export grants with approval provenance and per-export audit.
- **Recommended: A until an approver model is named; then B as a new bundle with its own matrix.**
- **Fail-closed:** no export path exists; UI has no export affordance (regression-pinned).

## D-9 — Communication templates and channels

- Option A: `template_code` stays an opaque code logged after external send (current). Option B: in-portal template registry with approved content and channel consent. Schema: template table; UI: template admin.
- **Recommended: A until notification policy (audit decision #10) is approved.**
- **Fail-closed:** a communication event cannot be recorded without active matching consent and a verified, non-revoked contact point (database-enforced).

## D-10 — Survey anonymity / pseudonymity

- Option A: identified responses owned by the graduate, withdrawable, aggregates suppressed (current). Option B: pseudonymous collection with token separation. Schema: significant.
- **Recommended: A; revisit B only for quality-agency requirements.**
- **Fail-closed:** responses require purpose/version consent; reporting is answers-only with min-cell suppression.

## D-11 — Retention and deletion

- Option A: no automated retention; append-only history (current). Option B: retention schedule per data class with anonymization jobs. Schema: jobs + flags; legal input required.
- **Recommended: A until the legal/records owner sets periods.**
- **Fail-closed:** nothing is auto-deleted; nothing is auto-retained beyond source contracts.

## D-12 — Documents/transcript integration for graduates

- Option A: no integration (current). Option B: read-only references to issued/archived documents via the documents domain's approved read contract.
- **Recommended: A until the documents read contract exists (audit gate #9).**
- **Fail-closed:** graduates-affairs cannot issue, regenerate, mutate, or expose documents.

---

Decision record: each selection should be appended as a dated owner entry in
this file (or its successor), after which a follow-on source-only bundle
implements exactly that option with its own positive/negative tests.

---

## OWNER DECISION RECORD — 2026-08-07

Mission: `PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01`
Status: **AUTHORITATIVE / FROZEN** for subsequent wiring and promotion.
This section is the single owner-decision artifact update for this gate. It does
not duplicate the option analysis above; it records the selected outcomes.

### OWNER_D1 — Canonical unit and roles

- **Canonical unit code:** `graduate_affairs` (graduates affairs).
- **Canonical roles:** `graduate_affairs_manager`, `graduate_affairs_specialist`.
- **Authorization requires all of:** functional role **and** canonical
  `graduate_affairs` unit assignment **and** explicit allowed scope or direct
  case assignment (as already enforced by AUTH-04).
- **`student_affairs` `appRoleFallback`:** compatibility label only. It **MUST
  NEVER** independently grant graduates-affairs authority. Graduates-affairs
  SQL/RPC must not consult `app_role` / `has_any_role` for access.
- **No bypass:** admin, dean, and registrar hold no graduates-affairs
  operational capability unless they also hold an active `graduate_affairs`
  assignment with the required role/scope.
- **Manager scope:** college-level graduates-affairs scope only where the
  AUTH-04 manager capability explicitly allows it.
- **Specialist scope:** department / program / direct-case scope only (empty
  department scope = no access).
- **Label remediation:** Arabic seed label «شؤون الدراسات العليا» may be
  corrected to «شؤون الخريجين» in a later label-only migration; codes stay
  unchanged (option A semantics).

### OWNER_D2 — Account continuity

- **Preserve the same auth identity** after graduation. Do **not** create a
  second graduate auth account.
- **Separate layers:** authentication · student capabilities · graduate
  capabilities. Graduate capabilities require an approved continuity policy
  and an approved authoritative graduate fact; student status alone is
  insufficient.
- **University email** is not permanent recovery authority. Support a verified
  personal recovery/contact channel (contact-point surface; D-3 read path
  remains fail-closed until separately decided).
- **Policy surface:** approved `graduate_account_continuity_policies` rows with
  explicit capability lists and validity windows remain the gate. Until an
  approved policy is in force for a capability, that capability stays denied.

### OFFICIAL_DECISION_INTAKE

- **Owner:** registrar / academic authority owns intake, validation, approval,
  correction, and revocation of official graduation decisions.
- **Graduate Affairs** consumes only an **approved authoritative graduate
  fact** (ledger → `create_graduate_record_from_official_decision` / equivalent
  governed operator path).
- **Graduate Affairs MUST NOT:** approve graduation; modify grades; modify GPA;
  modify academic snapshot; issue or reissue official academic documents.

### D-3 through D-12

- **Retain current fail-closed defaults** exactly as documented in the option
  sections above (no contact-value read path; current audience contract; no
  employer accounts; no applications; notes unread; no row-level exports;
  opaque `template_code`; identified survey responses; no auto retention; no
  documents integration from this domain).
