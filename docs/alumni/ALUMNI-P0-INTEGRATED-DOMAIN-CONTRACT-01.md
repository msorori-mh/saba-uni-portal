# ALUMNI-P0-INTEGRATED-DOMAIN-CONTRACT-01

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01` |
| Artifact | Integrated alumni / graduates-affairs domain contract |
| Mode | **CONTRACT / DRAFTS_ONLY_NO_APPLY** |
| Inputs | Streams A–E under `docs/alumni/` |
| Prior audit | `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` → `PASS_AUDIT_COMPLETE` |
| GP dependency | `CLOSED_GRADUATION_PROJECTS_MVP_PRODUCTION` — **satisfied** |
| Decision | `PASS_ALUMNI_P0_INTEGRATED_DOMAIN_CONTRACT_FROZEN` |
| Date | 2026-08-07 |

---

## 1. Purpose

This document integrates Streams A–E into one binding baseline so P0 draft
implementation packages can proceed in parallel **without inventing conflicting
domain rules**.

It closes the ten decision areas from the graduates-affairs audit.
It does **not** authorize SQL apply, runtime, UI, accounts, deploy, or publish.

---

## 2. Stream verdicts (must all remain PASS)

| Stream | Artifact | Verdict |
|---|---|---|
| A Graduate fact | `ALUMNI-P0-GRADUATE-FACT-CONTRACT-01.md` | `GRADUATE_FACT_AUTHORITY_CLOSED` |
| B Account continuity | `ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01.md` | D-AUTH-01..10 **APPROVED** |
| C Staff authorization | `ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01.md` | `PASS_ALUMNI_P0_STAFF_AUTHORIZATION_CONTRACT_FROZEN` |
| D Privacy / retention | `ALUMNI-P0-PRIVACY-CONTRACT-01.md` | `PASS_PRIVACY_CONTACT_RETENTION_BASELINE_FROZEN` |
| E Integration | `ALUMNI-P0-INTEGRATION-CONTRACT-01.md` | `PASS_ALUMNI_P0_INTEGRATION_CONTRACT_FROZEN` |

If any stream is amended, this integrated contract must be re-validated.

---

## 3. Closure of the ten audit decision areas

| # | Audit decision area | Closure |
|---|---|---|
| 1 | Authoritative graduate definition / final-results freeze | **A:** `candidate → eligible → graduation_approved → graduate`. Sole fact = registrar-approved decision → versioned `graduate_records` (one per award). Snapshots immutable; correction/revocation by supersession. Non-facts: profile status, candidates list, completion %, level, certificate request, GP completion, issued document. |
| 2 | Post-graduation account continuity | **B:** Same `auth.users` + `student_profiles.user_id`. No second identity. Separate auth / student / graduate capabilities. University email reuse **denied**. Personal verified recovery required. |
| 3 | Canonical unit, roles, direct assignment, SoD | **C:** Unit `graduate_affairs`; roles manager/specialist; ROLE ALONE NEVER SUFFICIENT; `appRoleFallback=student_affairs` compatibility only. Registrar retains graduation approval. GA staff cannot approve grades/results/graduation, issue docs, regenerate transcripts, or override archived GPs. |
| 4 | Profile/contact, consent, retention, DSR | **D:** Class A academic vs mutable plane. Contact points purpose/verify/effective/revoke. Consent purpose-versioned and prospectively withdrawable. Non-destructive Class A retention. |
| 5 | Career taxonomy, employer, jobs, applications | **E + D:** Employment events append/supersede. Jobs: moderation + audience + expiry. **Applications OUT of MVP.** |
| 6 | Follow-up cadence / case ownership | **C + D:** Direct-assignment cases; restricted notes Class E; terminal cases do not reopen. |
| 7 | Surveys | **E:** Immutable survey versions; response provenance + consent; aggregates only. |
| 8 | Reports / KPIs / small-cell / exports | **E:** Aggregate default; cell floor ≥3 (default 5); row-level needs approved scope + audit. |
| 9 | Documents / transcript integration | **E:** Consume `issued`/`archived` refs only; never issuer. |
| 10 | Notifications | **E:** Generic infra + alumni vocabulary; no sensitive bodies; idempotent. |

---

## 4. Binding domain model (conceptual)

```text
graduate_official_decisions  -- registrar ledger (pending|approved|corrected|revoked)
        │
        ▼ (only when approved)
graduate_records             -- versioned award fact + immutable academic_snapshot
        │
        ├─ graduate_profiles              (mutable, optional)
        ├─ graduate_contact_points        (purpose / verify / revoke)
        ├─ graduate_consents              (append-only purpose/version)
        ├─ graduate_employment_events     (append / supersede)
        ├─ graduate_followups             (direct staff assignment)
        ├─ graduate_opportunities         (moderated; apps OUT)
        ├─ graduate_surveys / versions / responses
        └─ graduate_domain_events         (append-only audit)
```

Cardinality: one **current** approved `graduate_records` row per
`(student_profile_id, program_id)` award; multiple awards allowed across programs.

---

## 5. Cross-system invariants (absolute)

Alumni / graduates-affairs implementation **MUST NOT** change the semantics or
authority of:

1. `student_profiles` identity
2. Academic results / grade finality
3. Transcript calculation
4. Graduation projects (including archived immutability)
5. B1 student requests / workflow guarantees
6. `official_documents` / document issuance
7. `enrollment_certificate`
8. Existing request workflows
9. Existing production authorization guarantees

**No graduate-affairs role receives global bypass** (admin / registrar / dean /
unrelated student_affairs / unassigned same role → DENY for alumni ops).

---

## 6. MVP scope freeze (three packages only)

### P0 — CORE AUTHORITY
- Graduate fact + official decision ledger
- Graduation transition contract
- Account continuity
- Staff authority / direct scope
- Base audit / domain events

### P1 — GRADUATE OPERATIONS
- Self-service profile / contact
- Consent
- Career / employment
- Follow-up
- Employers / jobs (no applications)
- Graduate B1 service integration
- Admin UI + graduate portal (feature-flagged later)

### P2 — ENGAGEMENT AND ANALYTICS
- Surveys
- Aggregate reports + privacy-safe exports
- Document issued/archived references
- Notifications vocabulary
- Advanced analytics (still de-identified)

**Forbidden additions:** CRM, social network, chat, marketplace, recommendation
engine, employer applicant tracking.

---

## 7. Parallel implementation dependency graph

```text
[A–E + Integrated contract FROZEN]
        │
        ├─► P0-A  graduate fact schema/RPC drafts
        ├─► P0-B  staff authorization foundation
        ├─► P0-C  account / portal audience foundation
        └─► P0-D  audit / domain-events foundation
                 │  (A/B/C/D parallel after this freeze)
                 ▼
        ┌────────┴────────┐
        ▼                 ▼
   P1-A profile/consent   P1-B employment/follow-up
        │                 │
        ├────────┬────────┤
        ▼        ▼        ▼
   P1-C admin  P1-D grad  P1-E B1 service integration
        UI      portal
                        │
                        ▼
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   P2 surveys     P2 reports/export   P2 docs refs + notifications
```

### Shared-file conflict zones (serialize owners)

| Zone | Rule |
|---|---|
| `docs/alumni/*` / this integrated contract | Integrator / mission owner only |
| `src/lib/graduates-affairs/*` | One package owner per wave |
| Future `docs/migration-drafts/*ALUMNI*` / `*GRADUATES-AFFAIRS*` | One agent |
| `src/lib/staff-functional-roles.ts` | Read-only unless dedicated role mission |
| `src/lib/reports/catalog/entries.ts` | Reports owner only |
| `src/lib/notifications/notification-link.ts` | P2 notifications owner |
| B1 / `student_requests` runtime | Student-requests agents only |
| GP RPCs / admin-viewer SQL | GP owners only |
| `official_documents` / issuance | Document-issuance owners only |
| `routeTree.gen.ts` | Dedicated route owner |

All P0/P1/P2 packages remain **DRAFTS_ONLY_NO_APPLY** until separately approved.

---

## 8. Provisional authorization posture (summary)

| Actor | Alumni domain |
|---|---|
| Anonymous | DENY |
| Active student (no graduate record) | DENY graduate-domain; student rules unchanged |
| Graduated user (same auth id) | ALLOW §B capability allow-list + own Class C/D/consent; DENY Class A writes |
| `graduate_affairs_specialist` | ALLOW only with unit + role + dept/program/direct-case |
| `graduate_affairs_manager` | ALLOW college **operational** actions only where RPC permits + assignment |
| Registrar | ALLOW graduation decision RPCs; DENY broad alumni ops bypass |
| Admin / dean / unrelated student_affairs | DENY alumni ops RPCs |

---

## 9. Acceptance for parallel drafts

This integrated contract is **PASS** when:

1. Streams A–E exist and freeze the ten audit decisions without contradiction.
2. MVP is limited to P0/P1/P2 as above.
3. Cross-system invariants are absolute.
4. Parallel graph + conflict zones are explicit.
5. Artifact remains DRAFTS_ONLY_NO_APPLY with zero production impact.

**Integrated verdict:** `PASS_ALUMNI_P0_INTEGRATED_DOMAIN_CONTRACT_FROZEN`

**Next exact step:** Start parallel **P0-A / P0-B / P0-C / P0-D** draft
implementation wave only (still DRAFTS_ONLY_NO_APPLY).

---

## 10. Production impact

**Zero.** Contracts only. No SQL, migration, RPC, UI, account, Storage, deploy, or publish.
