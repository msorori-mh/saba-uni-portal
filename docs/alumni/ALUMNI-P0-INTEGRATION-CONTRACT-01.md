# ALUMNI-P0-INTEGRATION-CONTRACT-01

**Mission:** ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01 — STREAM E  
**Artifact:** `docs/alumni/ALUMNI-P0-INTEGRATION-CONTRACT-01.md`  
**Mode:** CONTRACT / DRAFTS_ONLY_NO_APPLY  
**Decision:** `PASS_ALUMNI_P0_INTEGRATION_CONTRACT_FROZEN`  
**Authority reused (not re-audited):**
- `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` (`PASS_AUDIT_COMPLETE`)
- `docs/GRADUATES-AFFAIRS-MVP-FOUNDATION-01-REPORT.md` / `docs/GRADUATES-AFFAIRS-COMPLETION-01-REPORT.md`
- `docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md` + B1 staff/workflow contracts
- `docs/ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01-REPORT.md` + official_documents patterns
- `docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md` + GP admin-viewer archived closure
- `src/lib/reports/catalog/entries.ts` (ALU-* / GP-* catalog)
- `src/lib/notifications/notification-link.ts`, `log_audit` / `logReportEvent` / `logDocumentAction` patterns
- `src/lib/graduates-affairs/*` source contracts (foundation, communications, surveys, reports, employment)

**Non-goals of this artifact:** SQL, migrations, RLS, RPC implementation, UI, accounts, deploy, publish, production apply.

---

## 0. Integration principle (binding)

Alumni / graduates-affairs **consumes** existing portal systems through stable contracts. It **must not** recreate parallel issuers, workflows, storage, evaluation engines, or authorization bypasses.

| System | Alumni posture | Forbidden |
|---|---|---|
| Student requests (B1) | Reuse request/workflow for graduate-fitting services | Second workflow engine, soft-auth via UI |
| Official documents | Consume **issued/archived** stable refs only | Issue, regenerate, mutate, store PDF, invent verification |
| Graduation projects | Read-only association to **terminal** evidence | Duplicate files, evals, archive mutation, GP bypass |
| Notifications | Generic infra + alumni event vocabulary | Sensitive academic/contact/employment payload bodies |
| Audit | Sensitive reads / exports / writes | Silent profile browse, silent export |
| Reporting | Aggregate / de-identified default + small-cell | Unscoped row dumps; catalog duplication of ALU-* semantics |
| Jobs / opportunities | Moderated publish + audience + expiry | Applications / ATS (MVP OUT) |
| Surveys | Immutable version + response provenance | Mutable live questionnaires; identity in aggregates |

**Cross-system invariants (alumni may not change semantics of):**  
`student_profiles` identity · academic results · transcript calculation · graduation projects · B1 student requests · `official_documents` · `enrollment_certificate` · existing request workflows · existing production authorization guarantees.  
**No graduate-affairs role gets global bypass** (admin / registrar / dean / student_affairs title alone = DENY for alumni domain).

---

## 1. Student requests — reuse B1

### 1.1 Decision

**Graduate service requests that naturally fit student-request infrastructure MUST use B1** (`student_requests` + configured workflow steps + `processing_unit` / `processing_role` + direct assignment + `act_on_*` atomic RPCs).

Alumni domain does **not** invent a second case engine for document/service tickets.

### 1.2 Fit criteria (service may use B1 when all true)

1. The outcome is a **portal service ticket** (review / approve / clear / fee / sign / issue / archive), not career CRM.
2. Authority remains on **configured workflow assignees**, not graduates-affairs global browse.
3. Any produced document remains under **document_issuance** ownership (see §2).
4. Audience is expressible via existing `request_audience` / eligibility gates (`graduate` vs `active_student`) without inventing a third identity.

### 1.3 Binding audience rule

Reuse canonical audience semantics from student-request workflow docs:

| Actor state | Allowed request audiences |
|---|---|
| Active non-graduate | `active_student` services (per eligibility); graduate-only services **disabled/denied** |
| Authoritative graduate (per graduate-fact contract) | `graduate` services; active-student services **hidden/denied** as already specified |

**Clarify:** UI/profile `status='graduated'` alone is **not** the alumni authority gate for new alumni APIs. For **B1 submit eligibility**, continue to use the request runtime’s approved eligibility helpers; alumni **domain** capabilities additionally require an approved `graduate_records` fact (STREAM A). Implementation packages must not silently equate the two without the account-continuity / graduate-fact contracts.

### 1.4 Services in scope for B1 reuse (MVP posture)

| Class | Examples (illustrative codes) | Alumni role |
|---|---|---|
| Document / transcript services already (or future) on B1 | `official_transcript`, graduation-certificate-class services when activated under document contracts | **Consumer of request status + issued/archived document ref**; not issuer |
| Graduate-audience administrative tickets that fit workflow | Future graduate-only request types added via request-type config | Staff act via B1 steps; graduates-affairs may be a **configured processing unit/role**, never a bypass |

| Class | Must NOT use B1 as primary engine |
|---|---|
| Career profile / employment events | Alumni domain tables + RPCs |
| Consent grant/withdraw | Alumni consents |
| Follow-ups / communications eligibility | Alumni followups / communication contracts |
| Job moderation | Alumni opportunities |
| Surveys | Alumni surveys |
| Aggregate reports | Reports catalog + alumni report RPCs |

### 1.5 Authorization bridge

- B1 steps keep **exact** `processing_unit` + `processing_role` + **direct assignment** (or approved configured parallel rules). Hiding a button is not authz.
- Graduates-affairs functional roles (`graduate_affairs_manager` / `graduate_affairs_specialist`) participate in B1 **only when configured on a step** and assigned. Role alone ≠ actionable.
- Alumni staff **cannot** approve graduation, mutate grades, or issue documents through “alumni shortcuts.”

### 1.6 Integration surface (read)

Alumni graduate-file / staff views MAY display, for the graduate’s own `student_profile_id` / linked graduate record:

- request id, type code, status, current step summary, updated_at  
- linked `official_documents.id` when status ∈ {`issued`,`archived`}  

They MUST NOT embed workflow mutation controls outside B1 UI/RPC paths.

### 1.7 Package placement

- **P1-E** — student-request service integration (after P0 graduate fact + staff auth freeze).  
- No B1 schema rewrite in alumni packages.

---

## 2. Documents — consume issued/archived refs only

### 2.1 Decision

Graduates affairs is **NOT a document issuer**.

Creation of PDF, Storage objects, verification codes, document numbers, signatures, and archive transitions remain exclusively in **document_issuance** / existing official-document contracts (`official_documents`, enrollment-certificate / transcript issuance RPCs, `/document-view`, `/verify-document`).

### 2.2 Allowed consume contract

Alumni MAY store/read a **stable document association**:

| Field (conceptual) | Rule |
|---|---|
| `official_document_id` | UUID FK to `official_documents.id` |
| Allowed source statuses | **`issued` OR `archived` only** |
| Denied statuses | `draft`, `cancelled`, pending generation, any non-terminal issuance state |
| Display | document_number, document_type, issued_at, status — via approved read RPC |
| Download | Existing authorized signed short-lived download path only; alumni does not mint Storage policies |
| Verify | Public verify remains the existing verify contract; alumni must not expand PII in QR/verify |

### 2.3 Forbidden

- Insert/update/delete on `official_documents` from alumni RPCs  
- Regenerating PDF / copying bytes into alumni storage  
- Treating certificate **request** or candidate list as proof of graduation  
- Using document existence to **create** `graduate_records`  
- Second verification token system  
- Public URLs

### 2.4 Audit

Any staff read of document metadata from an alumni surface and any download/export that includes document identifiers MUST emit audit (reuse `log_audit` / document action patterns; also append `graduate_domain_events` where the actor is alumni-scoped). See §5.

### 2.5 Package placement

- **P2** — document references on graduate file / staff views (depends on P0 identity + existing document read readiness).  
- Foundation already correctly issues **zero** documents; this contract keeps that boundary.

---

## 3. Graduation projects — read-only terminal association

### 3.1 Decision

GP MVP production is **CLOSED**. Alumni integrates by **read-only association** to terminal project evidence. No duplicate files, evaluations, committee notes, or archive engines.

### 3.2 Association rule

| Rule | Binding |
|---|---|
| Link key | `graduation_project_id` (+ optional archive snapshot id if exposed by GP read contracts) |
| Allowed project states for alumni association | Lifecycle **`archived`** with `final_decision ∈ {passed, failed}` (terminal evidence). Non-archived projects are **not** alumni evidence. |
| Read path | Existing GP read RPCs / admin overview contracts only (e.g. detail for exact assignees; administration overview only with explicit admin-viewer grant — coordinator mutation ≠ viewer) |
| What alumni may show | Project identity, title, department/program scope, final_decision, archived flag, average score if already exposed by GP aggregate rules |
| What alumni must not show/copy | Private file bytes, committee notes beyond actor-filtered GP rules, Storage keys, re-hosted files |

### 3.3 Forbidden

- Alumni upload/replace of proposal/progress/final  
- Alumni conclude / archive / unarchive  
- Alumni rewrite evaluations  
- Treating GP `passed` alone as graduate fact (STREAM A remains sole authority)  
- Using `official-documents` bucket or GP bucket interchangeably  

### 3.4 Authorization

Alumni staff access to GP-linked summary still requires **alumni scope** (direct assignment / approved department-program scope) **and** must not widen GP’s own deny matrix. If the actor lacks GP read capability for that project, alumni shows **no GP payload** (fail-closed), not a partial leak.

### 3.5 Package placement

- Optional association metadata: **P1** graduate file enrichment.  
- Any alumni UI that surfaces GP fields: only after GP read contracts remain authoritative; no GP SQL edits in alumni packages unless a separately approved GP regression fix.

---

## 4. Notifications — generic infra + alumni vocabulary

### 4.1 Decision

Reuse the existing `notifications` table / insertion patterns. Add an **alumni event vocabulary** (`notification_type` values). Do **not** create a parallel messaging product.

Deep-links follow the existing pattern in `getNotificationLink`: map `(notification_type, reference_type, reference_id)` → in-app route; extend that mapper later without a new link column.

### 4.2 Frozen alumni notification types (MVP vocabulary)

| `notification_type` | When | `reference_type` | Recipient |
|---|---|---|---|
| `alumni_consent_required` | New purpose/notice needs action | `graduate_consent_purpose` | graduate user |
| `alumni_survey_available` | Survey version published & eligible | `graduate_survey_version` | graduate user |
| `alumni_survey_closed` | Survey closed | `graduate_survey` | graduate user (optional) |
| `alumni_opportunity_published` | Opportunity → `published` in audience | `graduate_opportunity` | eligible graduates |
| `alumni_opportunity_expiring` | Within configured window of `closes_at` | `graduate_opportunity` | eligible graduates |
| `alumni_followup_assigned` | Follow-up assigned to staff | `graduate_followup` | assignee staff |
| `alumni_followup_updated` | Follow-up state change relevant to graduate | `graduate_followup` | graduate user (non-sensitive) |
| `alumni_account_capability_changed` | Continuity policy capability change | `graduate_record` | graduate user |
| `alumni_graduate_service_update` | Optional mirror when a **B1** graduate-audience request changes materially | `student_request` | graduate user |

B1 already emits request notifications (e.g. `student_request_completed`). Alumni MUST prefer those for workflow events and only add `alumni_graduate_service_update` if a gap remains after reuse review — **no double-spam** of identical events.

### 4.3 Payload / body privacy (binding)

Notification **title/body MUST NOT** include:

- grades, GPA, transcript lines  
- contact values (email/phone)  
- employer names or employment status detail  
- document verification codes  
- national IDs / academic secrets  
- free-text follow-up notes  

Allowed: generic Arabic/English template text + non-sensitive identifiers (e.g. “فرصة جديدة متاحة”, “استبيان متاح”, request/opportunity opaque id for linking).

### 4.4 Delivery gates

- Channel delivery for email/SMS-style outreach reuses **communications eligibility**: active purpose consent + verified non-revoked contact point (`evaluateCommunicationEligibility` / SQL guards).  
- In-app notification rows still require an authenticated user link; no anonymous fan-out.  
- Idempotency: `(notification_type, reference_type, reference_id, user_id)` uniqueness (or equivalent dedupe window) required in implementation drafts.

### 4.5 Package placement

- Vocabulary + link-map extension: **P2** (may stub types earlier but no production activation).  
- Template content registry remains a content decision; codes are frozen here.

---

## 5. Audit — sensitive reads, exports, writes

### 5.1 Dual-channel model (binding)

| Channel | Use |
|---|---|
| `log_audit` (existing RPC) | Portal-wide sensitive actions; reports (`report_viewed` / `report_exported`); document download/print patterns |
| `graduate_domain_events` (alumni append-only) | Domain-specific alumni aggregates: consent, contact access, follow-up, opportunity moderation, survey submit/withdraw, report/export, profile/employment writes |

Both are required where the actor operates inside alumni domain. Failure to audit a sensitive read/export is a **contract defect**, not a UI omission.

### 5.2 Must-audit event classes

| Class | Examples | Side effects on authz failure |
|---|---|---|
| Writes | consent grant/withdraw; contact verify/revoke; employment event append; follow-up transitions; opportunity moderation; survey response | zero mutation |
| Sensitive reads | staff open graduate file; contact point reveal; follow-up notes; document-ref reveal | zero payload |
| Searches | staff graduate search / cohort browse | audited query purpose + scope |
| Exports | any row-level or file export | approved scope token + audit before bytes |

### 5.3 Payload minimization

Audit payloads store ids, purpose codes, scope keys, counts — **not** full contact values or survey free text by default. If investigation requires content, use restricted forensic access under separate approval (out of MVP self-service).

### 5.4 Package placement

- **P0-D** — audit/events foundation (append-only `graduate_domain_events` + wiring conventions).  
- Report/document audit reuse existing helpers; do not fork.

---

## 6. Reporting — aggregate default, small-cell, scoped row-level

### 6.1 Decision

Alumni reporting **defaults to aggregate / de-identified** outputs. Reuse:

- Source contracts: `privacySafeCount`, `buildEmploymentQualitySummary`, `buildCohortEmploymentReports`, `aggregateSurveyResponses`, `graduate_aggregate_employment_report`
- Catalog entries: `ALU-COHORT-EMPLOYMENT`, `ALU-SURVEY-AGGREGATES`, `ALU-QUALITY-INDICATORS`, etc. in `src/lib/reports/catalog/entries.ts`
- View/export audit: `logReportEvent` → `log_audit`

Do **not** invent a second reports catalog family for the same §5 alumni items.

### 6.2 Small-cell suppression (frozen)

| Parameter | Binding value |
|---|---|
| Absolute floor | **≥ 3** (reject configuration below 3) |
| Source default | **5** |
| Cell behavior | metric `< threshold` → `NULL` + treat as suppressed |
| Cohort behavior | if cohort population `< threshold` → cohort suppressed (`suppressed=true`, metrics null) |
| Structural rule | Aggregators accept **answers-only / aggregate-only** inputs — never respondent identity in aggregate builders |
| Defense | `assertAggregateReportSafe` (or SQL equivalent) before return |

### 6.3 Row-level / registry exports

| Rule | Binding |
|---|---|
| Default | **DENY** row-level graduate registry export |
| Allow only when | Explicit approved purpose + scope (department/program/cohort) + time-bounded grant + named approver provenance |
| Audit | Mandatory `report_exported` / domain export event with filters, row_count, actor, scope id |
| Catalog | Personal-sensitivity codes (`ALU-GRADUATE-REGISTRY`, `ALU-CONSENT-COMPLIANCE`) remain **NOT_ACTIVATED** until G4 authz + export grant exist |
| Candidates pipeline | `ALU-CANDIDATES-PIPELINE` stays operational/read-model reporting — **must not** be treated as graduate fact |

### 6.4 GP reports boundary

GP catalog reports (`GP-*`) remain GP-owned. Alumni quality beneficiaries may appear as catalog beneficiaries, but alumni packages **do not** reimplement GP evaluation/archive reports. Cross-link only.

### 6.5 Package placement

- Aggregate employment/survey reports: **P2** (contracts already exist in graduates-affairs completion source).  
- Row-level export grant machinery: **P2** after P0 authz + privacy contracts.

---

## 7. Jobs / opportunities — moderation, audience, expiry; applications OUT

### 7.1 Decision

Reuse `graduate_opportunities` lifecycle from foundation:

`draft → in_review → published → closed → archived`  
(with `draft|in_review → archived`; **no** direct `draft → published`).

Applications / ATS / applicant tracking are **OUT OF SCOPE for MVP** (no `graduate_job_applications` table, no apply RPC, no employer inbox of applicants). External apply URLs may be informational text only and MUST NOT collect applications inside the portal.

### 7.2 Moderation ownership

| Concern | Owner |
|---|---|
| Create/edit draft | Employer contact with explicit employer assignment **or** graduates-affairs specialist/manager under scope |
| Submit to review | Owner |
| Publish / reject-to-draft / archive from review | **Moderation actor** = graduates-affairs staff with direct opportunity assignment or approved college moderation scope (`moderated_by` required at publish) |
| Close after publish | Moderator or system expiry job |
| Employer browsing graduates | **DENY** always |

### 7.3 Audience

`audience_scope` (json) is binding at publish time. Supported MVP keys (closed set):

- `program_ids[]` (optional)  
- `department_ids[]` (optional)  
- `graduation_year_from` / `graduation_year_to` (optional)  
- `opportunity_type` already on row: `job` \| `internship` \| `training`  

Empty scope means **all authoritative graduates with opportunity-consent purpose** — still consent-gated for outreach notifications; listing in portal still requires graduate capability + consent purpose for job visibility as defined in privacy contract.

### 7.4 Expiry

| Field | Rule |
|---|---|
| `closes_at` | Required before publish for MVP (decisive: no open-ended published jobs) |
| Enforce | `closes_at > published_at` |
| At/after `closes_at` | Auto-transition `published → closed` (job/RPC); listing DENY for new views; idempotent |
| `archived` | Terminal cold storage; no republish in place — clone to new draft if needed |

### 7.5 Package placement

- **P1** employers/jobs package (after P0 authority + P1 taxonomy/consent).  
- Applications remain excluded unless a future mission explicitly opens them.

---

## 8. Surveys — immutable versions + response provenance

### 8.1 Decision

Reuse:

- `graduate_surveys` + `graduate_survey_versions` + `graduate_survey_responses`  
- `resolveActiveSurveyVersion` / `evaluateSurveyResponseEligibility` / `validateSurveyAnswers` / `aggregateSurveyResponses`

### 8.2 Immutability

| Object | Rule |
|---|---|
| Survey scope (`purpose_code`, identity) | Immutable after leaving `draft` |
| Published version (`questions`, `notice_version`, `version`) | **Immutable** after `published_at` set |
| New questions | New `version` only |
| Response | One per `(survey_version_id, graduate_record_id)`; answers jsonb; `consent_id` required; `submitted_at` set |
| Withdrawal | `withdrawn_at` prospective; does not rewrite history; aggregates exclude withdrawn |

### 8.3 Provenance (required on every response)

- `graduate_record_id`  
- `survey_version_id`  
- `consent_id` matching survey `purpose_code` + version `notice_version`  
- `submitted_at`  
- actor = graduate self only for submit (staff cannot forge responses)

### 8.4 Reporting

Survey results exit only through aggregate builders with small-cell rules (§6). Free-text answers are **not** row-exported in MVP.

### 8.5 Package placement

- **P2** surveys + privacy-safe reports.

---

## 9. MVP package freeze (integration slice)

| Package | Integration items included | Explicitly deferred |
|---|---|---|
| **P0 — Core authority** | `graduate_domain_events` / audit conventions; no external issuers | Docs refs UI, notifications activation, surveys, jobs |
| **P1 — Graduate operations** | B1 graduate-service integration; opportunities moderation/audience/expiry; follow-up/comms eligibility hooks; optional GP association ids | Applications; aggregate analytics activation |
| **P2 — Engagement & analytics** | Surveys; ALU aggregate reports; document issued/archived refs; alumni notification vocabulary + link map; scoped export grants | CRM, chat, marketplace, recommendations, employer applicant tracking |

Unrelated features remain forbidden: social network, chat, marketplace, recommendation engine, employer application tracking.

---

## 10. Dependency graph (post-contract parallel wave)

```
[Contracts A–E frozen]
        │
        ├─► P0-A graduate fact schema/RPC drafts
        ├─► P0-B staff authorization foundation
        ├─► P0-C account/portal audience foundation
        └─► P0-D audit/events foundation
                 │
                 ▼
        ┌────────┴────────┐
        ▼                 ▼
   P1-A profile/consent   P1-B employment/follow-up
        │                 │
        ├────────┬────────┤
        ▼        ▼        ▼
   P1-C admin  P1-D grad  P1-E B1 service integration
        UI      portal         │
        │        │             │
        └────────┴──────┬──────┘
                        ▼
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   P2 surveys     P2 reports/export   P2 docs refs + notifications
```

### Shared-file conflict zones (do not edit concurrently)

| Zone | Owners must serialize |
|---|---|
| `src/lib/graduates-affairs/*` | Single package owner per wave |
| `docs/migration-drafts/GRADUATES-AFFAIRS-*.sql` / future alumni drafts | One agent |
| `src/lib/reports/catalog/entries.ts` | Reports catalog owner only |
| `src/lib/notifications/notification-link.ts` | Notifications owner (P2) |
| B1 workflow / `student_requests` runtime | Student-requests agents only; alumni P1-E coordinates via contract, not drive-by edits |
| GP RPC / admin viewer SQL | GP owners only |
| `official_documents` / issuance RPCs | Document-issuance owners only |
| `routeTree.gen.ts` | Dedicated route owner |

---

## 11. Acceptance matrix (integration)

| # | Requirement | Result |
|---|---|---|
| I-1 | Graduate-fitting services reuse B1; no second workflow | **FROZEN** |
| I-2 | Alumni consumes issued/archived document refs only; never issuer | **FROZEN** |
| I-3 | GP association read-only to archived terminal evidence; no file/eval duplication | **FROZEN** |
| I-4 | Notifications = generic infra + vocabulary; no sensitive bodies | **FROZEN** |
| I-5 | Sensitive reads/exports/writes audited (`log_audit` + domain events) | **FROZEN** |
| I-6 | Reports aggregate/de-identified; cell floor ≥3 default 5; row-level needs scope+audit | **FROZEN** |
| I-7 | Jobs: moderation + audience + expiry; applications OUT | **FROZEN** |
| I-8 | Surveys: immutable versions + response provenance | **FROZEN** |
| I-9 | No semantic change to B1 / documents / GP / profiles / results | **FROZEN** |
| I-10 | DRAFTS_ONLY_NO_APPLY; zero production impact from this artifact | **PASS** |

---

## 12. Production impact

**Zero.** This document closes integration decisions only. No SQL apply, migration, RPC, UI, Storage, account, `student_visible`, deploy, or publish.

---

## 13. Final stream decision

**`PASS_ALUMNI_P0_INTEGRATION_CONTRACT_FROZEN`**

Eligible to merge into `docs/alumni/ALUMNI-P0-INTEGRATED-DOMAIN-CONTRACT-01.md` and to unblock parallel **draft** implementation packages under DRAFTS_ONLY_NO_APPLY — provided STREAMS A–D likewise freeze without contradiction.

**Next step (exact):** After A–E + integrated contract PASS → start parallel P0-A/B/C/D draft implementation wave only; do not activate runtime.
