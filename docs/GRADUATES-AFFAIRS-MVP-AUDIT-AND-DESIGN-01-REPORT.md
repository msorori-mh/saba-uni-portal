# GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01

## Decision and boundary

**Audit artifact: PASS_AUDIT_COMPLETE.**

**Implementation: HOLD_PENDING_GRADUATE_DOMAIN_DECISIONS.** This is a source-only
audit/design contract. It creates no SQL, migration, runtime, UI, account,
document, production record, deployment or publication. It does not approve an
academic mapping.

Graduates-affairs implementation is sequenced **after graduation-projects
implementation**, not merely after its audit report. It also remains behind all
graduate-definition, final-results, documents/transcript, account-continuity,
staff-authorization, privacy and release gates below.

## Inventory and evidence limits

No graduate profile, alumni/career follow-up, employer, job-posting, survey or
graduates-affairs reporting domain exists in the generated types or runtime.
Adjacent assets are inputs or patterns only:

| Area | Existing evidence | Limit / safe conclusion |
|---|---|---|
| Graduate definition candidates | `student_profiles.status='graduated'`; `student_academic_status`; `student_grades`; transcript views; `getGraduationCandidates` | None is approved as the sole graduate source. The candidate function includes near-completion students and is not a graduation decision ledger |
| Final academic results | `student_grades` has score/status/approval metadata and exact enrollment provenance; transcript views aggregate results | Define which approved/final statuses, plan requirements, GPA and council/registrar decision form the authoritative graduation fact |
| Identity/context | `student_profiles`, programs and departments | Reuse stable identity, but do not infer graduation year, cohort or consent from current profile fields |
| Documents/transcript | `official_documents`, official transcript request details, transcript views and graduation-certificate service drafts | Integrate by stable issued/archived document identity only. Graduates affairs must not issue, regenerate, mutate or expose documents and must not treat a draft service contract as readiness |
| Staff titles | `graduate_affairs_manager` and `graduate_affairs_specialist` appear in staff/processing-role material | Labels conflict in places between graduates and postgraduate affairs; no title grants access until canonical unit/role semantics and direct assignments are approved |
| Notifications/audit | Generic `notifications`; `audit_logs`/`log_audit` patterns | Event vocabulary, recipients, idempotency and privacy-safe payloads require a domain contract; every sensitive read/export and mutation must be audited |
| Account audience | Request audiences include `graduate`; student status supports `graduated` | This does not prove post-graduation authentication, recovery, email/phone ownership, retention or allowed portal capabilities |

## Graduate definition candidates — decision required

The academic owner must choose and version an authoritative graduation fact.
Candidates for evaluation (not mappings) are: an explicit registrar-approved
graduation decision/ledger; a final academic-status event backed by approved
results and completed program-plan requirements; or a controlled import from
the university system of record. A profile status alone, candidate-list result,
completion percentage, last level, certificate request or issued document must
not silently create a graduate.

The decision must define effective graduation date/year/term, program and
department snapshot, degree/award, final-result freeze, correction/revocation,
transfer/equivalency treatment, incomplete/appeal handling, duplicate identity,
and provenance/audit ownership. It must distinguish `candidate`, `eligible`,
`approved_graduate`, and any corrected/revoked state.

## Proposed data contracts (design only)

All names are provisional:

- `graduate_records`: one versioned graduate fact per approved award, linked to
  `student_profile_id`, authoritative decision provenance and immutable academic
  snapshots; never derived dynamically from mutable profile status.
- `graduate_profiles`: optional career/contact attributes separated from the
  academic fact, with visibility and field-level consent metadata.
- `graduate_contact_points`: verified channel, purpose, verification/effective
  interval and revocation; sensitive values require approved protection.
- `graduate_consents`: purpose/version/scope, affirmative action, timestamp,
  withdrawal and legal basis; consent history is append-only.
- `graduate_employment_events`: graduate-reported or verified employment status,
  employer reference, occupation, dates, evidence/provenance and visibility.
- `graduate_employers` and `employer_contacts`: reviewed organization identity;
  external access is separate, least-privilege and never implied by a job post.
- `graduate_job_opportunities`: owner, eligibility/audience, publication window,
  status and moderation provenance; applications remain out of scope unless
  separately approved.
- `graduate_surveys`, `graduate_survey_versions`, `graduate_survey_responses`:
  immutable question versions, purpose/consent, response ownership and
  anonymization/export policy.
- `graduate_followups`: direct staff assignment, purpose, outcome, next action
  and restricted notes; no global staff browsing.
- `graduate_domain_events`: append-only audit for definition changes, consent,
  profile/contact access, follow-up, job moderation, employer access, survey and
  report/export events.

Use deliberate `RESTRICT`/soft archive, optimistic versioning, unique active
assignments and purpose limitation. Academic records and career data have
separate retention and authorization boundaries.

## Authorization, privacy and security contract

- Default deny via RLS and atomic RPC/server checks. UI visibility is not an
  authorization boundary.
- A graduate may access only their own allowed profile, consent, opportunities
  and responses. Employers access only explicitly published data or their own
  directly assigned moderation object; they never browse graduate identities.
- Graduates-affairs staff require an active canonical role **and direct object,
  cohort/report-scope or case assignment**. Same role unassigned, wrong unit,
  wrong department/program scope, inactive assignment, other graduate, other
  employer, anonymous, admin, registrar and dean bypass are DENY.
- Registrar/document staff retain their own academic/document authority;
  graduates affairs consumes approved read contracts and cannot change results,
  graduation facts, transcripts or issued documents.
- Authorization failure causes zero profile, consent, follow-up, notification,
  survey, report/export or audit-target mutation.
- Consent is purpose/version specific, withdrawable prospectively and not
  bundled with account continuity. Required legal-basis processing must be
  identified separately and minimized.
- Reports default to aggregate/de-identified output with small-cell suppression.
  Row-level exports require direct approved purpose/scope, expiry and audit.
- Audit sensitive reads, searches, downloads and exports as well as writes;
  notifications contain no sensitive academic, contact or employment detail.

## Decisions required before implementation

1. Authoritative graduate definition and final-results/freeze/correction source.
2. Post-graduation account continuity: identity lifecycle, recovery channels,
   allowed capabilities, expiry/closure and handling of reused university email.
3. Canonical graduates-affairs unit, staff roles, direct assignment model,
   department/program/report scope and separation of duties.
4. Profile/contact fields, verification, privacy notices, consent purposes,
   legal bases, retention/deletion and data-subject rights.
5. Career taxonomy, employer verification, job moderation/audience/expiry and
   whether applications are explicitly excluded or separately governed.
6. Follow-up cadence, case ownership, notes sensitivity and escalation.
7. Survey ownership, anonymity/pseudonymity, question versions, incentives,
   response withdrawal and research/reporting rules.
8. Reports, KPIs, minimum-cell threshold, export approvers and recipients.
9. Documents/transcript read integration, downloadable statuses, signed access,
   verification-code exposure and prohibition on graduates-affairs issuance.
10. Notification events, recipients, templates, idempotency and channel consent.

## Source-only P0/P1/P2 bundle sequence

Every bundle is **DRAFTS_ONLY_NO_APPLY**. PASS means eligible for the next
source-only bundle, never permission to apply a migration.

| Bundle | Dependencies and draft scope | Current decision |
|---|---|---|
| **P0 — graduate fact and authority foundation** | Graduation-projects implementation PASS; approved graduate/final-results source; account continuity and staff authorization. Draft graduate fact/provenance, academic snapshot, staff scope/direct assignment, append-only audit, default-deny RLS and atomic RPC foundations. Test exact self/direct assignee ALLOW and all wrong-scope/unassigned/bypass/anonymous/revoked DENY with zero side effects | **HOLD_DEPENDS_ON_GRADUATION_PROJECTS_AND_CORE_DECISIONS** |
| **P1 — graduate profile, consent and career follow-up** | P0 PASS plus privacy/retention/taxonomy decisions. Draft profile/contact verification, purpose-versioned consent/withdrawal, employment events and directly assigned follow-up cases; test field-level access, purpose limitation and correction/retention behavior | **HOLD_DEPENDS_ON_P0_PRIVACY_AND_CAREER_POLICY** |
| **P1 — employers and jobs** | P0 authority PASS and P1 taxonomy/consent boundaries. Draft verified employer/contact, moderated opportunity lifecycle and audience/expiry; keep applications excluded unless separately approved; test employer isolation and no graduate browsing | **HOLD_DEPENDS_ON_P0_P1_EMPLOYER_POLICY** |
| **P2 — surveys and privacy-safe reports** | P1 profile/consent PASS and approved survey/report rules. Draft immutable survey versions/responses, anonymization, small-cell suppression, scoped exports and audited report RPCs | **HOLD_DEPENDS_ON_P1_SURVEY_REPORT_POLICY** |
| **P2 — documents, notifications and integration** | P0 graduate identity PASS; separately ready transcript/document read contract; notification policy PASS. Draft read-only stable document references, signed issued/archived access, event vocabulary and idempotency; no document issuance or result mutation | **HOLD_DEPENDS_ON_DOCUMENTS_AND_NOTIFICATION_GATES** |
| **Later — runtime/UI/staging/release** | All bundles PASS, independent security/privacy review and complete CI. Then server adapters, feature flag OFF UI, synthetic staging and exact migration preflight/partial-apply stop/post-verification plan | **HOLD_NO_RELEASE_AUTHORIZATION** |

Mandatory order: graduation-projects implementation and user gates, then P0;
P1 profile/consent before employers/jobs; P2 only after its P1 and external
document/notification dependencies; runtime/UI/staging/release last. No bundle
may borrow a later bundle to complete its authorization.

## Acceptance and production impact

Implementation remains HOLD until all decisions are approved and the full
positive/negative authorization, privacy, consent, idempotency, concurrency,
retention and export tests pass with independent review and zero CRITICAL/HIGH.

Production impact is zero. No SQL/migration/runtime/UI/schema, `student_visible`,
account, document, production record, deploy or publish action occurred.
