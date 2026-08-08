# ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01-REPORT

## MISSION

`ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01`

## DECISION

**PASS_ALUMNI_P0_DECISION_BASELINE_READY_FOR_PARALLEL_DRAFT_IMPLEMENTATION**

## STARTING_SHA

`4b27ab47093c5736dc962ef72cac97c7b4c7e738`

## ENDING_SHA

`4b27ab47093c5736dc962ef72cac97c7b4c7e738` (no commit in this mission; docs-only working tree additions)

## BRANCH

`fix/gp-admin-viewer-archived-20260807`

## WORKTREE_STATUS

Unrelated prior GP admin-viewer source changes were present and **left untouched**.
This mission added only alumni decision artifacts under `docs/alumni/` and this report.

---

## REUSED_EXISTING_AUDIT

**YES** — `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` (`PASS_AUDIT_COMPLETE`)

## REDUNDANT_AUDIT_PERFORMED

**NO** — no generic schema/route/RPC re-inventory; no GP re-audit; no B1 re-audit.

GP dependency treated as satisfied:
`CLOSED_GRADUATION_PROJECTS_MVP_PRODUCTION`.

---

## GRADUATE_FACT_DECISION

Lifecycle frozen: `candidate → eligible → graduation_approved → graduate`.

- Candidate = computed read model only (`getGraduationCandidates` / admin page).
- Eligible = deterministic academic evaluation (engine evidence).
- Graduation approval = explicit registrar-controlled decision ledger.
- Graduate = versioned `graduate_records` created **only** from approved decision (one record per award).

Non-facts (alone never graduate): `student_profiles.status='graduated'`, candidates list, completion %, final level, certificate request, GP completion, issued document.

Snapshots immutable after approval; correction/revocation via supersession only.

**Code:** `GRADUATE_FACT_AUTHORITY_CLOSED`

## ACCOUNT_CONTINUITY_DECISION

- **No second authentication identity.**
- Preserve `auth.users` + `student_profiles.user_id`.
- Separate authentication vs student capabilities vs graduate capabilities.
- Transition: active student → graduated user → graduate portal capabilities.
- University email reuse capability **denied**; personal verified recovery required.
- Active-student academic actions forbidden after graduation.
- Suspend/close retain identity for audit; merge/duplicate registrar-controlled.
- Consent not bundled with continuity.

**Codes:** D-AUTH-01..10 **APPROVED**

## STAFF_AUTHORIZATION_DECISION

- Unit `graduate_affairs`; roles `graduate_affairs_manager` / `graduate_affairs_specialist`.
- **ROLE ALONE IS NEVER SUFFICIENT** — requires functional role + unit + direct assignment / approved scope.
- `appRoleFallback=student_affairs` = compatibility only, not alumni authority.
- Manager: college-level **operational** scope where explicitly allowed.
- Specialist: department / program / direct-case only.
- Registrar retains graduation approval.
- GA staff MUST NOT: approve grades, modify final results, approve graduation, regenerate transcripts, issue academic documents, override archived GPs.
- Normative deny matrix + provisional positive/negative RPC matrix (not implemented).

**Code:** `PASS_ALUMNI_P0_STAFF_AUTHORIZATION_CONTRACT_FROZEN`

## PRIVACY_RETENTION_DECISION

- Separate Class A academic facts from mutable alumni plane
  (`graduate_profiles`, `graduate_contact_points`, `graduate_consents`,
  `graduate_employment_events`, `graduate_followups`).
- Field classes A–F; explicit self-service allow-list; academic facts not self-editable.
- Contact: channel, purpose, verification, effective dates, revoke/replace.
- Consent: explicit, purpose-specific, versioned, timestamped, prospectively withdrawable.
- Consent **not** required for Class A record-keeping, security/audit, or privacy-safe aggregates.
- Retention: non-destructive for Class A; operational data revoke/supersede/archive.

**Code:** `PASS_PRIVACY_CONTACT_RETENTION_BASELINE_FROZEN`

## INTEGRATION_DECISION

- Student requests: reuse B1 for graduate-fitting services.
- Documents: consume issued/archived refs only; never issuer.
- Graduation projects: read-only terminal/archived association; no file/eval duplication.
- Notifications: generic infra + alumni vocabulary; no sensitive bodies.
- Audit: sensitive reads/exports/writes (`log_audit` + `graduate_domain_events`).
- Reporting: aggregate/de-identified default; small-cell floor ≥3 (default 5); row-level needs scope+audit.
- Jobs: moderation + audience + expiry; **applications OUT of MVP**.
- Surveys: immutable versions + response provenance.

**Code:** `PASS_ALUMNI_P0_INTEGRATION_CONTRACT_FROZEN`

## MVP_SCOPE

| Package | Scope |
|---|---|
| **P0** | Graduate fact, transition, account continuity, staff authority, audit/events |
| **P1** | Profile/contact/consent, employment/follow-up, employers/jobs (no apps), B1 service integration, admin/graduate UI (later) |
| **P2** | Surveys, aggregate reports/exports, document refs, notifications, analytics |

No CRM / social / chat / marketplace / recommendation / applicant-tracking.

## CROSS_SYSTEM_INVARIANTS

Alumni must not change semantics/authority of: `student_profiles`, academic results,
transcript calculation, graduation projects, B1 requests, `official_documents`,
`enrollment_certificate`, existing workflows, existing production authorization.
No GA global bypass.

## PARALLEL_IMPLEMENTATION_GRAPH

After this PASS:

1. **Parallel now:** P0-A graduate fact drafts · P0-B staff auth foundation · P0-C account/audience foundation · P0-D audit/events foundation  
2. **Then parallel where deps allow:** P1-A profile/consent · P1-B employment/follow-up · P1-C admin UI · P1-D graduate portal · P1-E B1 integration  
3. **Then:** P2 surveys · reports/exports · docs refs + notifications  

Conflict zones serialized: `src/lib/graduates-affairs/*`, alumni migration drafts,
reports catalog, notification-link, B1 runtime, GP SQL, document issuance, routeTree.

All waves remain **DRAFTS_ONLY_NO_APPLY**.

---

## FILES_CREATED

- `docs/alumni/ALUMNI-P0-GRADUATE-FACT-CONTRACT-01.md`
- `docs/alumni/ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01.md`
- `docs/alumni/ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01.md`
- `docs/alumni/ALUMNI-P0-PRIVACY-CONTRACT-01.md`
- `docs/alumni/ALUMNI-P0-INTEGRATION-CONTRACT-01.md`
- `docs/alumni/ALUMNI-P0-INTEGRATED-DOMAIN-CONTRACT-01.md`
- `docs/ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01-REPORT.md`

## FILES_MODIFIED

None for this mission (unrelated GP admin-viewer working-tree files untouched).

---

## SQL_CREATED

**NO**

## MIGRATION_CREATED

**NO**

## PRODUCTION_RPC_CALLS

**0**

## PRODUCTION_WRITES

**0**

## ROLE_CHANGES

**0**

## ACCOUNT_CHANGES

**0**

## DEPLOY

**NO**

## PUBLISH

**NO**

---

## Quality checks

| Check | Result |
|---|---|
| Five stream artifacts exist | YES |
| Integrated contract resolves ten audit decisions | YES |
| No duplicated generic audit | YES |
| No SQL/migration/runtime/UI files changed by this mission | YES |
| No secrets | YES |
| No generated files authored by this mission | YES |

---

## FINAL_NEXT_STEP

Start the parallel **P0-A / P0-B / P0-C / P0-D** draft implementation wave only
(`DRAFTS_ONLY_NO_APPLY`), respecting shared-file conflict zones. Do not apply
migrations, do not implement production RPCs, do not activate UI, do not deploy.
