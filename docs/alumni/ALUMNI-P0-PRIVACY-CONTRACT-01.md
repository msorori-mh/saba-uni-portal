# ALUMNI-P0-PRIVACY-CONTRACT-01

**Mission:** ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01 — STREAM D  
**Status:** CONTRACT — DRAFTS_ONLY_NO_APPLY  
**Decision:** `PASS_PRIVACY_CONTACT_RETENTION_BASELINE_FROZEN`  
**Date:** 2026-08-07 (Asia/Riyadh)

## 0. Binding nature

This document freezes alumni privacy, contact, consent, and retention rules for
P0/P1 draft implementation. It is a source-only contract.

- No SQL apply, migration, RLS change, GRANT/REVOKE, runtime RPC, UI, account
  mutation, storage change, deploy, or publish is authorized by this document.
- It reuses and closes decision area 4 from
  `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`
  (`PASS_AUDIT_COMPLETE`). It does not redo inventory or audit.
- It aligns with the provisional conceptual model already present in
  graduates-affairs foundation/completion drafts, without promoting those
  drafts to apply status.
- Naming of tables below is contractual for the alumni domain. Physical schema
  drafts must preserve the semantics even if exact column names evolve under
  review.

## 1. Hard separation: academic fact vs graduate profile data

### 1.1 Permanent academic graduation facts (immutable self-service boundary)

Authoritative graduation evidence lives outside the mutable alumni profile
surface. It is owned by registrar / university system-of-record provenance and
materialized as the graduate fact (`graduate_records` / official decision
ledger — STREAM A).

**Rule:** Academic graduation facts are **never** graduate self-editable and
are **never** soft-deleted to satisfy a contact, consent, or career preference.

Includes at minimum:

- student identity linkage used by the award (`student_profile_id`, academic
  number snapshot)
- program / department / study-system / plan-version snapshot
- degree / award
- effective graduation date, academic year, term (when applicable)
- final GPA, classification / cumulative result, completed credits
- decision provenance (`source_kind`, `source_reference`, `approved_by`,
  `approved_at`, version, correction/revocation state)
- immutable `academic_snapshot`

### 1.2 Mutable graduate operational / personal / career data

Alumni operations use a separate data plane. A graduate record may exist with
zero, one, or evolving profile/contact/consent/employment/follow-up rows. Absence
of profile data does **not** revoke the academic fact.

Conceptual model (P1 operational plane):

| Concept | Role |
|---|---|
| `graduate_profiles` | Optional self-service career/display preferences; never the graduation fact |
| `graduate_contact_points` | Purpose-scoped channels with verification and lifecycle |
| `graduate_consents` | Append-only purpose/version consent ledger |
| `graduate_employment_events` | Append-only employment history; correct by supersession |
| `graduate_followups` | Staff casework under direct assignment; append-only identity |

**Rule:** Career/contact data and academic records have **separate retention and
authorization boundaries**. Graduates-affairs staff consume approved academic
read contracts; they cannot rewrite academic facts through profile RPCs.

## 2. Field classification taxonomy

Every alumni field MUST be classified into exactly one primary class. Secondary
sensitivity tags may apply (especially E).

| Class | Name | Meaning |
|---|---|---|
| **A** | Authoritative academic | Registrar/SoR graduation evidence; immutable except via official correction/revocation |
| **B** | Operational | Staff workflow, assignment, moderation, case state; not graduate self-editable unless explicitly listed |
| **C** | Personal contact | Channel endpoints and contact preferences for outreach |
| **D** | Career / employment | Employment status, occupation, employer references, specialization relationship |
| **E** | Sensitive / restricted | Raw contact values, restricted notes, verification secrets, national identifiers if ever stored, any field requiring elevated purpose + audit |
| **F** | Derived / reporting | Aggregates, summaries, suppressed metrics; never authoritative source of truth |

### 2.1 Class A — authoritative academic (non-exhaustive, binding examples)

| Field / fact | Class | Self-service | Correction path |
|---|---|---|---|
| `graduate_records.id` / award identity | A | READ (own, if authorized) | Official decision versioning only |
| `student_profile_id` (on record) | A | READ | Official correction only |
| `academic_number` (snapshot) | A | READ | Official correction only |
| `program_id`, `department_id` (snapshot) | A | READ | Official correction only |
| study system / plan version (snapshot) | A | READ | Official correction only |
| degree / award | A | READ | Official correction only |
| `effective_graduation_date`, year, term | A | READ | Official correction only |
| final GPA / classification / credits | A | READ | Official correction only |
| decision provenance & `academic_snapshot` | A (+E for payload detail) | READ minimized | Official correction/revocation only |
| `record_state` / version / corrected/revoked | A | READ | Official decision supersession |

**DENY:** graduate self-update, graduates-affairs specialist/manager in-place
edit, “fix by overwriting profile,” destructive delete.

### 2.2 Class B — operational

| Field / concept | Class | Self-service | Notes |
|---|---|---|---|
| `graduate_followups` identity, assignee, purpose | B (+E for notes) | DENY write | Direct assignment required for staff |
| follow-up `state`, `outcome`, `next_action_at` | B | DENY write | Terminal states never reopen; new case for continued work |
| opportunity moderation state / audience / expiry | B | DENY (graduate browse of unpublished) | Employer/jobs governed elsewhere; applications OUT of MVP |
| account-continuity policy evaluation inputs | B | DENY write | STREAM B; fail-closed until approved |
| `graduate_domain_events` audit rows | B | DENY write/delete | Append-only |
| profile `row_version`, `updated_at` | B | system-managed | Concurrency only |

### 2.3 Class C — personal contact

| Field / concept | Class | Self-service | Notes |
|---|---|---|---|
| preferred contact channel (`email`/`phone`/`none`) | C | UPDATE (own) | Does not create a usable contact point by itself |
| contact point `channel_type` | C | CREATE/REPLACE (own) | email \| phone for MVP |
| contact point purpose binding | C | CREATE/REPLACE (own) | Must match registered purpose codes |
| contact point effective / revoked timestamps | C / B | revoke own; staff revoke under assignment | See §4 |
| protected contact value | **E** (stored under C lifecycle) | WRITE via protected path only | Never returned in ordinary DTOs |

### 2.4 Class D — career / employment

| Field / concept | Class | Self-service | Notes |
|---|---|---|---|
| `public_display_name` | D (visibility-gated) | UPDATE (own) | Subject to visibility + abuse moderation |
| `career_summary` | D | UPDATE (own) | Subject to visibility |
| `profile_visibility` | D / B | UPDATE (own) within enum | Default `private` |
| employment_status, occupation, dates | D | APPEND own event | Correct by supersession, not rewrite |
| employer reference / reported employer name | D | APPEND own event | Verified employer registry is staff/employer path |
| specialization_relationship | D | APPEND own (self-assessed) | Staff may later verify/reject event |
| employment `verification_state` | B / D | DENY self-set to `verified` | Graduate may report; staff/process verifies |

### 2.5 Class E — sensitive / restricted

| Field / concept | Class | Access rule |
|---|---|---|
| Raw email/phone (`protected_value`) | E | Purpose-bound RPC; never list/export by default; encrypt/protect before production promotion |
| Follow-up restricted notes | E | Direct assignee + purpose only; audit reads |
| Consent notice acceptance metadata beyond purpose/version/timestamps | E if free-text | Prefer structured codes |
| Academic snapshot detailed payload | A+E | Minimized projections to graduates-affairs |
| National ID / home address / health / family data | E | **OUT OF MVP STORAGE** unless a later approved purpose exists |
| Row-level export payloads | E | Approved scope + expiry + audit only |

### 2.6 Class F — derived / reporting

| Field / concept | Class | Rule |
|---|---|---|
| Cohort employment counts / rates | F | Aggregate; small-cell suppression (default 5, floor 3) |
| Survey aggregates | F | Answers-only aggregation; no re-identification |
| `summarizeGraduateFile`-style staff card metrics | F | Non-identifying; no raw contact values |
| “Current employment status” projection | F | Derived from non-superseded events; not separately stored as authority |

Derived values MUST NOT be written back as Class A facts.

## 3. Self-service mutability matrix (decisive)

### 3.1 Preconditions

Graduate self-service writes require **all** of:

1. Authenticated continuity of the **same** user identity (STREAM B) with
   capability `profile_self_service` allowed by an approved in-force policy.
2. An approved, current `graduate_records` row linked to that identity.
3. RPC/server authorization: self-only. UI visibility is not authority.
4. Field is listed as mutable below.

Fail closed on ambiguity.

### 3.2 Explicitly mutable by graduate (ALLOW)

| Target | Allowed actions | Constraints |
|---|---|---|
| `graduate_profiles.public_display_name` | create/update/clear | Length/abuse limits; visibility rules |
| `graduate_profiles.preferred_contact_channel` | update | enum only |
| `graduate_profiles.career_summary` | create/update/clear | Length limits |
| `graduate_profiles.profile_visibility` | update | `private` \| `graduates_affairs` \| `public_opt_in` only |
| `graduate_contact_points` | add new; revoke own active; replace by revoke+add | See §4; value via protected write |
| `graduate_consents` | grant; withdraw (prospective) | See §5; append-only history |
| `graduate_employment_events` | append self-reported event; supersede own prior current event | Cannot self-verify; cannot delete history |

### 3.3 Explicitly immutable / non-self-editable (DENY)

- All Class A academic facts and snapshots
- Official decision / record state / version
- Another graduate’s any field
- Staff follow-up identity, assignee, notes, outcomes
- Employer verification registry fields
- Opportunity moderation fields
- Audit / domain events
- Consent history rewrite, backdated grant/withdraw without append semantics
- Setting employment `verification_state = verified`
- Destructive delete of academic or append-only operational evidence

### 3.4 Staff mutability (pointer only — STREAM C owns full matrix)

- Graduates-affairs staff: Class B/D operational updates only under
  functional role + processing unit + direct assignment / approved scope.
- Staff may assist contact verification workflows and follow-ups; they do **not**
  become owners of academic facts.
- Registrar remains sole authority for Class A corrections/revocations.

## 4. Contact points contract

### 4.1 Required attributes

Each `graduate_contact_points` row MUST support:

| Attribute | Requirement |
|---|---|
| `channel_type` | `email` or `phone` (MVP) |
| `protected_value` | Stored protected; Class E; never in ordinary list DTOs |
| `purpose_code` | Exact registered purpose; contact usable only for that purpose |
| verification | `verified_at` null = unverified; usable only when verified and not revoked |
| effective interval | `effective_from` (default = created) and optional `effective_to`; communication DENY outside interval |
| revoked / replaced | `revoked_at` set on revoke; replacement = revoke old + insert new (no silent overwrite of value on same row after verification) |
| ownership | `graduate_record_id` immutable after insert |

**Normative lifecycle:**

`created (unverified)` → `verified` → (`revoked` | `expired via effective_to`)  
Replacement never mutates a verified value in place; it creates a new row and
revokes the prior active row for the same `(graduate_record_id, channel_type, purpose_code)`
active slot (at most one active usable point per that triple).

### 4.2 Usability gate (communications / surveys / events)

A contact point is usable for outbound processing iff **all** hold:

1. Same graduate record as the action target
2. Matching `purpose_code`
3. Matching `channel_type`
4. `verified_at` present
5. `revoked_at` null
6. Now ∈ `[effective_from, effective_to)` (if `effective_to` null, open-ended)
7. Matching active purpose consent when the legal basis is consent (§5)

Otherwise: DENY with zero send side effects
(`GRADUATE_CONTACT_POINT_NOT_USABLE` semantics).

### 4.3 University email handling

University mailbox lifecycle is an account-continuity concern (STREAM B). For
privacy:

- Do not treat unverified university email reuse as a verified personal contact
  point.
- Personal recovery/contact channels used for alumni outreach MUST be explicit
  contact points with purpose + verification.
- Notifications must not embed full contact values in bodies (STREAM E).

## 5. Consent contract

### 5.1 Consent properties (mandatory)

Consent records are:

1. **Explicit** — affirmative action timestamped; no silence/opt-out-as-grant
2. **Purpose-specific** — `purpose_code` from the registry only
3. **Versioned** — bound to `notice_version` of the privacy notice / instrument
4. **Timestamped** — `affirmative_action_at` / grant time required
5. **Prospectively withdrawable** — withdrawal stops future processing for that
   purpose/version; it does not erase academic evidence or rewrite history

Consent history is **append-only**. Identity fields
(`graduate_record_id`, `purpose_code`, `notice_version`) are immutable on a row.
Withdrawal is a new state transition / new event, never an in-place silent clear
of grant provenance.

### 5.2 MVP purpose registry (closed set)

Aligned with existing source registry; new purposes require contract amendment:

| `purpose_code` | Typical use | Default legal basis |
|---|---|---|
| `career_followup` | Staff follow-up / career guidance outreach | Consent |
| `communications` | General alumni operational messages for listed templates | Consent |
| `surveys` | Survey invitation + response processing | Consent |
| `events` | Event registration / event communications | Consent |
| `employment_quality` | Employment/quality follow-up contributing to quality metrics | Consent (row-level); aggregate reporting may use §5.3 |

Unknown purpose codes → DENY.

### 5.3 When consent is NOT required

Do **not** incorrectly demand graduate consent for processing that has another
approved institutional / legal basis. Decisive baselines:

| Processing | Basis (MVP freeze) | Consent required? |
|---|---|---|
| Maintain Class A graduate fact / official decision ledger | Institutional academic record-keeping | **No** |
| Registrar correction/revocation of graduation fact | Institutional academic authority | **No** |
| Authorization, security, fraud prevention, audit of access | Institutional security / accountability | **No** |
| Aggregate, de-identified employment/quality reporting with small-cell suppression | Institutional quality/accreditation reporting using minimized derived data | **No** (must not re-identify; no row-level contact disclosure) |
| Staff handling of an already-assigned follow-up case metadata (state machine) | Institutional operations on existing case | **No** for case state itself; **Yes** for new outreach via contact channels |
| Outbound email/SMS/phone using personal contact points | Consent (purpose/version) | **Yes** |
| Survey response collection | Consent bound to survey purpose + notice version | **Yes** |
| Publishing profile beyond `private` / `graduates_affairs` (`public_opt_in`) | Consent via visibility choice + notice | **Yes** (visibility change is affirmative) |
| Employer browsing of graduate identities | Forbidden | N/A — DENY |

If a future legal opinion expands legitimate-interest / statutory bases, amend
this contract explicitly; do not infer expansion in code.

### 5.4 Withdrawal effects (prospective)

On active withdrawal for `(purpose_code, notice_version)`:

- Future communications / survey invites / event registrations for that pair DENY
- Existing historical consent rows remain for audit
- Class A academic facts unchanged
- Employment event history retained under §6 (may be excluded from optional
  outreach uses)
- Follow-up cases do not auto-delete; new outreach on withdrawn purpose DENY
- Aggregate historical metrics already produced are not retro-rewritten; new
  aggregates must exclude data whose retention class requires exclusion after
  erasure requests (§6)

Bundling: account continuity MUST NOT silently grant alumni marketing/survey
consents.

## 6. Retention, correction, and data-subject rights

### 6.1 Non-destructive academic evidence

**Hard rule:** Erasure, anonymization, or graduate “delete my data” requests
MUST NOT destroy authoritative academic graduation evidence (Class A), official
decision provenance, or append-only audit required for institutional
accountability.

Allowed academic outcomes:

- official correction via superseding decision
- official revocation of graduate status via versioned decision
- restricted **projection** / masking in alumni UIs

Forbidden:

- DELETE of approved decision / graduate record to satisfy privacy preference
- “right to be forgotten” cascading into transcripts, grades, or issued document
  registries
- graduates-affairs soft-delete that orphans audit integrity

### 6.2 Retention classes

| Data class | Retention baseline (MVP freeze) | Disposition |
|---|---|---|
| Class A academic fact | Permanent institutional retention (or university SoR policy, whichever is longer) | Correct/revoke by versioning; no destructive delete |
| Audit / `graduate_domain_events` | Permanent for security/accountability MVP baseline | Append-only; no update/delete |
| Consents ledger | Retain grant/withdraw history for the life of the graduate record + applicable limitation period | Append-only |
| Contact points | Retain revoked rows for audit; active usability ends on revoke/expiry | Revoke/replace; protected values may be cryptographically shredded **only** if audit retains purpose/channel/verification metadata and shredding is an approved later control |
| Employment events | Retain history; correct by supersession | No in-place history rewrite |
| Follow-ups | Retain case history | Terminal; no delete |
| Survey responses | Retain under survey policy; withdrawal flags future use | Immutable version linkage; `withdrawn_at` stops secondary use |
| Class F aggregates | Regenerable; cache disposable | Must remain de-identified |

Exact calendar durations for contact/employment operational data may be set by
institutional records policy without weakening Class A permanence. Until a
numeric schedule is approved, drafts MUST implement lifecycle states
(active / revoked / archived) rather than hard DELETE.

### 6.3 Correction behavior

| Subject | Correction mechanism |
|---|---|
| Academic fact error | Registrar/SoR official decision supersession (STREAM A) |
| Profile display/career text | Graduate self-update or staff assist under assignment |
| Contact value wrong | Revoke + new verified point |
| Consent mistake | Withdraw and/or grant correct purpose/version; history preserved |
| Employment fact wrong | Append superseding event |
| Follow-up outcome wrong | Do not reopen terminal case; open new follow-up if needed; notes append policy per STREAM C |

### 6.4 Access / export rights (MVP)

- Graduate may read own allowed profile, consents, contact metadata (not
  necessarily raw protected value in UI), and own employment events.
- Staff row-level views require STREAM C scope.
- Row-level exports: DENY by default; require explicit approved purpose, scope,
  expiry, and audit (STREAM E). Aggregates use small-cell suppression.

## 7. Visibility and purpose limitation

### 7.1 Profile visibility enum (binding)

| Value | Meaning |
|---|---|
| `private` | Visible to graduate self + authorized staff under assignment/scope only |
| `graduates_affairs` | Visible to authorized graduates-affairs actors under STREAM C rules |
| `public_opt_in` | Limited public fields only (display name / career summary as allowed); **never** contact values, academic snapshot internals, follow-up notes, or identifiers |

Default for new profiles: `private`.

### 7.2 Purpose limitation

- Contact points and consents are purpose-bound; reuse across purposes DENY
  without a matching point/consent.
- Employment quality aggregates must not leak contact or case notes.
- Notifications contain no sensitive academic, contact, or employment detail.

## 8. Audit requirements (privacy-relevant)

Append audit domain events (at minimum) for:

- consent grant / withdraw
- contact create / verify / revoke
- profile visibility changes to `public_opt_in`
- sensitive reads of protected contact values
- employment event append / staff verify/reject
- follow-up create / complete / cancel
- any row-level export

Audit payloads MUST be privacy-safe (ids, purpose codes, outcomes — not raw
phone/email bodies).

## 9. Decisions closed (mapping audit § “Decisions required” item 4)

| Open item from audit | Closure in this contract |
|---|---|
| Profile/contact fields | Classified A–F; self-service allow-list in §3 |
| Verification | Contact usable only when verified, unrevoked, in-force, purpose-matched |
| Privacy notices | Bound via `notice_version` on consents and instruments |
| Consent purposes | Closed registry §5.2; unknown DENY |
| Legal bases | Consent for outreach/surveys/events/public opt-in; institutional basis for Class A, security/audit, and privacy-safe aggregates §5.3 |
| Retention/deletion | Non-destructive for Class A; revoke/supersede/archive for operational data §6 |
| Data-subject rights | Read/correct via proper paths; no academic destruction §6 |

## 10. MVP package placement

| Package | Privacy scope |
|---|---|
| **P0** | Freeze this contract; academic fact immutability; audit event model; default-deny; no production contact encryption deferral beyond documenting E protection gate |
| **P1** | Implement profile/contact/consent/employment/follow-up drafts + field-level auth tests + retention/correction behaviors |
| **P2** | Surveys, privacy-safe reports/exports, notification vocabulary enforcement |

P1 profile/consent remains dependent on this privacy freeze (replaces prior
`HOLD_DEPENDS_ON_P0_PRIVACY_AND_CAREER_POLICY` for the privacy half).

## 11. Cross-system invariants

Alumni privacy implementation MUST NOT change semantics of:

- `student_profiles` identity authority
- academic results / transcript calculation
- graduation projects archival evidence
- B1 student-request authorization
- `official_documents` / enrollment certificate issuance rules

Graduates affairs is not a second document issuer and not a parallel grade
authority.

## 12. Implementation constraints for later draft agents

1. Preserve fail-closed default deny (RLS with no ambient permissive access).
2. Do not store MVP national ID/address blocks in alumni tables.
3. Do not return `protected_value` from list/summary DTOs.
4. Do not implement destructive DELETE APIs for Class A or append-only ledgers.
5. Extend contact points with effective dates if foundation draft lacks them —
   semantics in §4 are normative even if column names differ.
6. Shared-file conflict zones for later waves: `src/lib/graduates-affairs/*`,
   graduates-affairs migration drafts, consent purpose registry — one owner per
   wave.

## 13. Explicit non-goals

- CRM / social network / chat
- Employer application tracking (OUT of MVP)
- Public graduate directory by default
- Consent bundling with login
- Inferring consent from `student_profiles.status` or graduation alone

## 14. Acceptance for parallel drafts

This STREAM D contract is sufficient to start P1 privacy-aligned drafts when
combined with STREAM A (fact), B (continuity capability gate), and C (staff
scope), under DRAFTS_ONLY_NO_APPLY.

**STREAM D decision:** `PASS_PRIVACY_CONTACT_RETENTION_BASELINE_FROZEN`

**Production impact:** zero.

---

**CONTRACT / DRAFTS_ONLY_NO_APPLY**
