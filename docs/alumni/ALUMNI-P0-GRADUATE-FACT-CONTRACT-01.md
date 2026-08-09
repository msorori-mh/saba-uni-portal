# ALUMNI-P0-GRADUATE-FACT-CONTRACT-01

**Document kind:** CONTRACT  
**Status:** DRAFTS_ONLY_NO_APPLY  
**Bundle:** ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01 / STREAM A  
**Effective decision:** `GRADUATE_FACT_AUTHORITY_CLOSED`  
**Date (Asia/Riyadh):** 2026-08-07  

**Reuses (do not re-audit):**
- `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` (`PASS_AUDIT_COMPLETE`)
- `src/lib/academic-status.functions.ts` (Phase 11F academic status & graduation engine)
- `src/routes/admin/graduation-candidates.tsx` (candidate read-model UI)
- Official document / transcript contracts (`official_documents`, `official_transcript` path; `graduation_certificate` service draft)
- Graduation-projects dependency: **satisfied** as `CLOSED_GRADUATION_PROJECTS_MVP_PRODUCTION`

**Non-goals of this contract:** SQL apply, migration, runtime/UI activation, account creation, document issuance, profile mutation, deploy, publish, production write.

---

## 1. Decision freeze (authoritative)

### 1.1 Sole graduate fact

A person is a **graduate** in this portal if and only if a current `graduate_records` row exists for the approved degree/award, created exclusively from an explicit registrar-controlled **graduation approval** decision.

No other signal creates, implies, or backfills graduate status.

### 1.2 Closed lifecycle (exact order)

```text
candidate → eligible → graduation_approved → graduate
```

| Stage | Kind | Authoritative? | Creates `graduate_records`? |
|---|---|---|---|
| `candidate` | Computed / read model only | No | No |
| `eligible` | Deterministic academic evaluation result | No (evidence only) | No |
| `graduation_approved` | Explicit registrar decision event/ledger | Yes (decision authority) | No (decision exists; record not yet materialized until create path runs) |
| `graduate` | Versioned `graduate_records` fact | Yes (graduate identity) | Yes — only from approved decision |

Transitions are one-way in the happy path. Correction and revocation are separate controlled transitions (see §5), never silent recomputation.

### 1.3 Explicit non-facts (never alone = graduate)

The following **MUST NOT** be treated as graduate fact, alone or in any combination short of a registrar-approved graduation decision:

1. `student_profiles.status = 'graduated'`
2. `getGraduationCandidates()` results (including UI at `/admin/graduation-candidates`)
3. Completion percentage / near-completion threshold (`NEAR_COMPLETION_PCT` / ≥80%)
4. Final / last academic level on `student_academic_status`
5. Existence, submission, approval, or completion of a `graduation_certificate` request
6. Graduation-project (GP) completion or any GP lifecycle state
7. Any `official_documents` row (`issued` / `archived` / otherwise), including graduation certificate or transcript documents
8. Unofficial transcript views / GPA dashboards / standing labels that use the word «متخرج»
9. Request audience `graduate` or staff title labels (`graduate_affairs_*`)

These may appear as **inputs, warnings, or operational evidence** only.

---

## 2. Architecture (four layers)

### 2.1 Graduation candidate = computed / read model only

**Definition.** A student appears as a **candidate** when the academic progress engine’s bulk candidate list includes them for operational review.

**Current evidence (reuse, not authority):**
- `getGraduationCandidates` in `src/lib/academic-status.functions.ts`
- Admin page `src/routes/admin/graduation-candidates.tsx`

**Frozen semantics:**
- Candidate is a **working list**, not a ledger.
- The list intentionally includes **near-completion** students (eligible **or** near-completion rule). Near-completion ≠ eligible ≠ approved ≠ graduate.
- Candidate membership may change whenever underlying grades/plans/enrollments change.
- Candidate UI/export is operational convenience only; export must never be treated as an approval batch.
- Excluding `student_profiles.status = 'graduated'` from the candidate query is a UI filter convenience, **not** proof of graduate fact.

**Forbidden:**
- Triggers, jobs, or adapters that insert `graduate_records` / decisions from candidate lists
- Using “مرشحو التخرج” as alumni/graduates-affairs membership

### 2.2 Graduation eligibility = deterministic academic evaluation

**Definition.** A student is **eligible** when the deterministic academic evaluation returns `eligibility.eligible = true` for a specific `student_profile_id` + active program plan context.

**Frozen evaluation baseline (from current engine — evidence contract):**

Eligible **only if all** hold:
1. Profile not suspended (`student_profiles.status ≠ 'suspended'`)
2. Enrollment not suspended (`student_academic_status.enrollment_status ≠ 'suspended'`)
3. Active study plan exists with `total_plan_hours > 0`
4. `completed_hours ≥ total_plan_hours`
5. Zero missing required plan courses
6. `cumulative_gpa ≥ WARNING_GPA` (currently `2.0`)

Eligible is **false** when any required course remains, hours remain, GPA is below threshold, or suspension applies. Warnings (e.g. already labeled graduated on profile, missing program) do not create eligibility.

**Frozen semantics:**
- Eligibility is recomputable evidence for registrar review.
- Eligibility **does not** freeze results, set profile status, issue documents, or create graduate records.
- Engine thresholds (`PASS_PERCENT`, `WARNING_GPA`, plan binding, grade-selection rules) remain owned by the academic engine; alumni/graduates-affairs **consume** a versioned eligibility snapshot at approval time and do not redefine pass/fail mid-flight.
- Near-completion (`completion_percentage ≥ 80` with ≤2 missing required and GPA ≥ threshold) is **candidate evidence only**, never eligibility and never graduate fact.

### 2.3 Graduation approval = explicit registrar-controlled authoritative event

**Definition.** `graduation_approved` is an explicit decision row in the official graduation decision ledger (canonical name: `graduate_official_decisions`, aligned with foundation draft).

**Authority:**
- Only the registrar-controlled approval path (or a controlled `university_system_of_record_import` provenance with the same required fields) may mark a decision `approved`.
- No admin / dean / graduates-affairs / faculty / student / anonymous bypass creates approval.
- UI visibility is not authorization.

**Required fields at `approved` (fail-closed):**
| Field | Rule |
|---|---|
| `student_profile_id` | Required, stable FK |
| `source_kind` | `registrar_approved_decision` **or** `university_system_of_record_import` |
| `source_reference` | Non-empty stable external/internal reference |
| `source_payload_sha256` | SHA-256 of approving payload |
| `approved_at` | Timestamp set at approval |
| `approved_by` | Registrar actor user id |
| `effective_graduation_date` | Explicit date (not inferred from level/year/document) |
| `program_id` | Snapshot FK at approval |
| `department_id` | Snapshot FK at approval |
| `academic_snapshot` | Non-empty JSON snapshot (see §4) |
| `decision_state` | `approved` |

**Optional / supporting evidence attached to decision payload (not substitutes):**
- Eligibility evaluation version + boolean + missing-requirements summary
- Candidate list context id / export hash (if used in session)
- GP completion evidence reference (if program requires GP) — evidence only
- Linked issued/archived document ids — read references only; never create graduate fact

**Forbidden auto-approval sources:** profile status flips, candidate KPIs, certificate request workflows, GP completion events, document issuance events, transcript generation.

**Decision states (ledger):**
- `pending` → draft/review; not graduate
- `approved` → authoritative approval; enables graduate record creation
- `corrected` → prior approved decision superseded; not current graduate fact for that award
- `revoked` → approval withdrawn; graduate fact must not remain current

Approved decision academic facts are immutable after approval; only state transitions to `corrected` / `revoked` (and supersession linkage) are allowed.

### 2.4 Graduate record = created only from approved graduation decision

**Definition.** `graduate` means a current `graduate_records` row for one approved degree/award.

**Creation rule (fail-closed):**
- Create path: `create_graduate_record_from_official_decision(decision_id)` (or equivalent atomic RPC).
- Insert permitted only when decision `decision_state = 'approved'` and all required snapshot fields are present.
- Record fields **must exactly match** the decision: student, effective date, program, department, academic snapshot, and creator = approver.
- Direct inserts that forge or diverge from the decision are rejected (`GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION` / equivalent).
- No create path from candidates, eligibility, documents, GP, or profile status.

**Cardinality:**
- One **current** graduate record per `(student_profile_id, program_id)` while `record_state = 'approved'`.
- Multiple awards across distinct programs are allowed as separate records, each from its own approved decision.
- One decision → at most one graduate record (`official_decision_id` unique).

---

## 3. Canonical stage vocabulary

Use these codes in contracts, events, and tests:

| Code | Meaning |
|---|---|
| `candidate` | In computed candidate read model |
| `eligible` | Deterministic eligibility true at evaluation time |
| `graduation_approved` | Official decision approved (ledger) |
| `graduate` | Current `graduate_records` exists for award |
| `graduate_corrected` | Prior graduate fact superseded by correction |
| `graduate_revoked` | Graduate fact revoked |

Do **not** overload `student_profiles.status`, request audience `graduate`, or standing label `graduated` as synonyms of these codes.

**Projection rule (downstream):**
- Alumni / graduates-affairs membership, consent, employment, surveys, and career follow-up attach only to `graduate` (current `graduate_records`), never to `candidate` / `eligible` / bare profile status.
- `student_profiles.status = 'graduated'` may later be **projected** from a current graduate record by a separately approved sync bundle; projection is optional and never the source of truth.

---

## 4. Versioned `graduate_records` contract

### 4.1 Record identity

| Attribute | Rule |
|---|---|
| Grain | One versioned graduate fact per approved degree/award |
| Link | `official_decision_id` (unique, required) |
| Person link | `student_profile_id` (RESTRICT) |
| Current uniqueness | Unique `(student_profile_id, program_id)` where `record_state = 'approved'` |
| Version | Integer ≥ 1; increments on correction/revocation state changes |
| Initial `record_state` | `approved` |

### 4.2 Snapshot fields frozen at approval

Captured on the decision and copied immutably onto the graduate record:

**Identity / award context**
- `student_profile_id`
- `academic_number` (denormalized into snapshot)
- `full_name_ar` (denormalized into snapshot)
- `program_id`, program name_ar
- `department_id`, department name_ar
- Degree/award code and title (explicit in snapshot; not inferred later)
- `effective_graduation_date`
- Graduation academic year/term as explicit snapshot fields when supplied by registrar/SoR (never inferred solely from mutable level)

**Academic freeze**
- Eligibility evaluation version + result (`eligible: true` expected for normal registrar path; SoR import may carry equivalent attestation)
- Cumulative GPA at approval
- Completed hours / plan hours
- Plan identity (study plan id / version if available)
- Course-audit digest or structured passed-required summary sufficient for audit
- Engine constants version note (`PASS_PERCENT`, `WARNING_GPA`, etc.) as metadata
- Provenance: `source_kind`, `source_reference`, `source_payload_sha256`

**Immutability rule:** Academic snapshot fields on an approved decision/record **MUST NOT** silently change when mutable profile, department, program rename, level, grades, or contact fields change afterward. Display of live profile data is separate from the frozen academic fact.

### 4.3 Correction semantics

1. Create a new official decision with `supersedes_decision_id` pointing at the current approved decision for the same student + program/award.
2. New decision must itself become `approved` with a full new snapshot and provenance.
3. Superseded decision transitions to `corrected`; linked graduate record state follows to `corrected` and version increments.
4. New graduate record is created from the correcting approved decision (new record version lineage via supersession, not in-place academic mutation).
5. Career/consent rows remain bound to graduate record ids per privacy bundle rules; corrected academic facts must not rewrite historical consent identity fields.

### 4.4 Revocation semantics

1. Registrar (or SoR import with revocation provenance) sets decision `decision_state = 'revoked'`.
2. Linked current graduate record becomes `revoked` (version++).
3. Student is **not** a graduate for that award while no current `approved` record exists.
4. Revocation does not delete documents, audit events, or storage objects.
5. Re-graduation after revocation requires a **new** approved decision + new graduate record, not undelete.

### 4.5 Incomplete / appeal / transfer / equivalency

| Case | Frozen rule |
|---|---|
| Incomplete requirements | Remain `candidate` or non-eligible; no approval |
| Open grade appeal affecting required course/GPA | Block approval until appeal closed and eligibility recomputed |
| Transfer / equivalency | Count only through academic engine’s passed/equivalency rules **before** approval; snapshot freezes post-resolution state |
| Duplicate identity | One person → one `student_profile_id`; duplicate approvals for same award rejected by current uniqueness |
| SoR import | Allowed as `source_kind = university_system_of_record_import` with same required snapshot completeness; still creates decision then record — never direct profile flip |

---

## 5. Academic engine — safe reuse vs evidence-only

### 5.1 Safe to reuse (inputs to eligibility / snapshot)

From `src/lib/academic-status.functions.ts` / underlying tables:

| Asset | Safe reuse |
|---|---|
| Study plan + plan courses | Requirement set for eligibility |
| `student_grades` / enrollments / components | Pass/fail and GPA inputs under engine rules |
| Equivalency-aware passed course set | As computed by engine |
| Cumulative GPA / completed hours / missing required | Eligibility predicates and snapshot values |
| Suspension flags (profile + academic status) | Eligibility blockers |
| Progress DTO structure | Registrar review + snapshot payload shape |
| Audit of progress/candidate views | Operational audit only |

### 5.2 Evidence-only (never graduate authority)

| Asset | Limit |
|---|---|
| `getGraduationCandidates` / candidates page | Candidate read model; includes near-completion |
| Completion % / near-completion KPI | Ranking/ops only |
| Final level | Progress context only |
| Standing label `graduated` when driven by profile status | Misleading synonym; not ledger |
| `student_profiles.status` | Mutable operational label; not source |
| GP completion | Program evidence if required by policy; not graduate fact |
| `graduation_certificate` request/workflow | Downstream service; depends on graduate fact, must not create it |
| `official_documents` issued/archived | Document artifacts; graduates-affairs may later **read** by stable id only |
| Unofficial transcript UI | Student/admin display; not approval |

### 5.3 Documents / transcript boundary (frozen for this contract)

- Document issuance remains in `document_issuance` / official transcript paths only.
- Graduates-affairs / alumni **must not** issue, regenerate, mutate, or treat certificate/transcript presence as graduate creation.
- Future read integration (P2) may bind `graduate_records.id` → stable `official_documents.id` where `status ∈ {issued, archived}` — reference only.
- Service draft `docs/request-services/graduation_certificate.md` currently assumes `student_profiles.status='graduated'`; that assumption is **superseded for authority purposes**: certificate eligibility must eventually require current `graduate_records`, not bare profile status. Changing that service is out of scope for this STREAM A file but the graduate-fact decision is closed here.

---

## 6. Event / audit expectations (foundation-facing)

Append-only domain events (names normative for later bundles):

| Event | When |
|---|---|
| `graduation_candidate_viewed` / export | Candidate read model access |
| `graduation_eligibility_evaluated` | Deterministic evaluation captured for review |
| `graduation_decision_pending_created` | Ledger draft |
| `graduation_decision_approved` | `graduation_approved` reached |
| `graduate_record_created` | `graduate` materialized |
| `graduation_decision_corrected` | Supersession |
| `graduation_decision_revoked` | Revocation |
| `graduate_record_state_changed` | Record follows decision |

Sensitive reads/exports of graduate facts require audit in authorization bundles. This contract does not grant RLS policies or RPC execute rights.

---

## 7. Authorization boundary (decision only)

- Creating/approving decisions and creating graduate records are registrar-controlled atomic server paths; default deny elsewhere.
- Graduates-affairs staff consume approved graduate records for career/privacy domains; they **cannot** mint graduate facts.
- Dean/admin bypass is DENY for graduate-fact mutation.
- Hiding UI buttons is not security.

Detailed role matrices, direct assignment, and RLS policies belong to the P0 authorization foundation stream — they must assume this fact model.

---

## 8. Acceptance criteria (contract closure)

This STREAM A decision is **CLOSED** when all are true conceptually (source-only):

1. Lifecycle is exactly `candidate → eligible → graduation_approved → graduate`.
2. Sole create path for graduate identity is approved official decision → `graduate_records`.
3. All §1.3 non-facts are excluded as authority.
4. Candidate = read model; eligible = deterministic evaluation; approval = registrar ledger; graduate = versioned record.
5. Snapshots are immutable after approval; corrections/revocations are explicit.
6. Academic engine reuse vs evidence-only split is as §5.
7. GP dependency is satisfied and does not supply graduate authority.
8. Artifact remains `CONTRACT` / `DRAFTS_ONLY_NO_APPLY` — no apply/deploy.

---

## 9. Relationship to prior artifacts

| Artifact | Relationship |
|---|---|
| `GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01` | Audit PASS; this contract **closes** decision #1 (authoritative graduate definition) |
| `GRADUATES-AFFAIRS-MVP-FOUNDATION-01` SQL draft | Structural alignment retained (`graduate_official_decisions` → `graduate_records`); this document is the normative decision text those drafts must obey |
| Academic status engine / candidates UI | Reclassified as candidate + eligibility evidence only |
| Graduation-projects MVP | Dependency satisfied; GP completion ≠ graduate |

**Still open elsewhere (explicitly out of this file):** account continuity, staff assignment model, privacy/consent field lists, employer/jobs, surveys/reports, document read RPC details, notification templates. Those must not reopen the graduate-fact authority closed here.

---

## 10. Production impact

**Zero.** This is a source contract draft only. No migration apply, no production write, no publish, no account/document/profile mutation.

---

## 11. Decision record

| Field | Value |
|---|---|
| Decision code | `GRADUATE_FACT_AUTHORITY_CLOSED` |
| Authoritative fact | Registrar-approved official graduation decision → versioned `graduate_records` |
| Lifecycle | `candidate → eligible → graduation_approved → graduate` |
| Contract class | `CONTRACT` |
| Apply permission | `DRAFTS_ONLY_NO_APPLY` |
| STREAM | A — ALUMNI-P0-GRADUATE-FACT-CONTRACT-01 |
| Verdict | **PASS_DECISION_CLOSED** (source contract only; not implementation authorization) |

---

END OF CONTRACT
