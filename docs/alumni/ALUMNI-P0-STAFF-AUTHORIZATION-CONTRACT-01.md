# ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01

**Mission:** `ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01`  
**Stream:** `C — STAFF AUTHORIZATION`  
**Artifact path (target):** `docs/alumni/ALUMNI-P0-STAFF-AUTHORIZATION-CONTRACT-01.md`  
**Mode:** `CONTRACT` · `DRAFTS_ONLY_NO_APPLY` · SOURCE-ONLY · NO IMPLEMENTATION  
**Status:** `DECISION_CLOSED_FOR_P0_PARALLEL_DRAFTS`  
**Date:** 2026-08-07

---

## 0. Decision summary

| Item | Decision |
|---|---|
| Contract class | Binding P0 staff-authorization baseline for alumni / graduates-affairs |
| Apply / migrate / implement | **Forbidden in this artifact** |
| Authority model | **Functional role + processing unit + direct assignment / approved scope** |
| Core principle | **ROLE ALONE IS NEVER SUFFICIENT** |
| Canonical unit | `graduate_affairs` |
| Canonical functional roles | `graduate_affairs_manager`, `graduate_affairs_specialist` |
| `appRoleFallback = student_affairs` | **COMPATIBILITY ONLY** — not final alumni authority |
| Manager scope | College-level **graduate-affairs operational** scope where an RPC/action explicitly allows it |
| Specialist scope | Department / program / direct-case scope **only** |
| Graduation approval authority | **Registrar retains** (`registrar_general` / registrar academic authority) |
| Bypass (admin / registrar / dean / same-role unassigned) | **DENY** for graduates-affairs operational RPCs |
| UI hide/show | Not an authorization boundary |

**Decision code for this stream:**  
`PASS_ALUMNI_P0_STAFF_AUTHORIZATION_CONTRACT_FROZEN`

This PASS freezes authorization rules for later source drafts and test matrices.  
It does **not** authorize SQL, RLS, GRANT/REVOKE, RPC implementation, UI, accounts, deploy, or publish.

---

## 1. Purpose and non-goals

### 1.1 Purpose

Close the P0 staff-authorization decision so later alumni packages can draft schema/RPC/tests without inventing conflicting authority rules.

This contract defines:

1. Canonical graduates-affairs unit and functional roles.
2. Required authorization tuple for every staff read/mutation.
3. Manager vs specialist scope boundaries.
4. Hard separation of duties from academic, document, transcript, and graduation-project authorities.
5. Exact DENY cases.
6. Future positive/negative RPC matrix (names provisional; not implemented here).

### 1.2 Non-goals (explicitly out of this stream)

- Implementing RPCs, RLS, migrations, grants, enums, or runtime adapters.
- Creating or modifying staff accounts, assignments, or `user_roles`.
- Re-auditing student-request workflows, graduation-projects, or staff-role catalogs.
- Defining graduate fact, account continuity, privacy/consent, or integration packages (Streams A/B/D/E).
- Granting graduates-affairs any academic-document issuance path.
- Treating label conflicts in older drafts (“دراسات عليا” vs “شؤون الخريجين”) as authority.

---

## 2. Reused evidence (do not re-inventory)

| Source | Reuse |
|---|---|
| `src/lib/staff-functional-roles.ts` | Canonical keys: `graduate_affairs_manager`, `graduate_affairs_specialist`; `unitKey = graduate_affairs`; `scopeType` college vs departments; `appRoleFallback = student_affairs` marked compatibility only |
| B1 authorization patterns | `processing_unit` + `processing_role` + **active direct assignment**; no role-pool fallback; zero mutation on DENY; UI is not authority |
| `docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` | Audit PASS; staff titles exist but grant nothing until unit/role/assignment semantics approved; default deny; no admin/registrar/dean bypass |
| Adjacent B1 / actor-RPC design | Same-role unassigned DENY; wrong unit/role DENY; direct assignment identity resolution patterns |
| Graduation-projects closure | Dependency satisfied elsewhere; graduates-affairs **must not** override archived GPs |

Label note (compatibility only): some request-processing expansion drafts historically labeled `graduate_affairs` as “شؤون الدراسات العليا”. For **alumni / graduates-affairs P0**, the functional-role source of truth is:

- Arabic labels from `staff-functional-roles.ts`: **مدير شؤون الخريجين** / **مختص شؤون الخريجين**
- Unit key remains **`graduate_affairs`**

No title, label, or `app_role` fallback alone grants alumni access.

---

## 3. Canonical actors and unit

### 3.1 Processing unit

| Field | Value |
|---|---|
| `unitKey` / unit code | `graduate_affairs` |
| Unit label (canonical) | شؤون الخريجين |
| Portal audience | Staff (graduates-affairs operational surface) |
| Academic authority | **None** |

### 3.2 Functional roles

| Functional role key | Label (AR) | `scopeType` (from source) | Operational scope under this contract |
|---|---|---|---|
| `graduate_affairs_manager` | مدير شؤون الخريجين | `college` | College-level **graduate-affairs operational** actions only where the specific RPC/action explicitly allows manager college scope |
| `graduate_affairs_specialist` | مختص شؤون الخريجين | `departments` | Department / program / **direct-case** scope only |

### 3.3 Compatibility mapping (not authority)

| Field | Value | Meaning |
|---|---|---|
| `appRoleFallback` | `student_affairs` | Temporary login/`user_roles` compatibility until a dedicated alumni/`graduate_affairs` app role (if ever approved) exists |
| Effect on alumni RPCs | **None** | Presence of `user_roles.role = student_affairs` does **not** authorize alumni staff RPCs |
| Unrelated `student_affairs_*` functional roles | Distinct | `student_affairs_manager` / `student_affairs_specialist` are **DENY** for alumni operational RPCs unless a separately approved cross-domain contract says otherwise (default: none) |

**Rule:** Final alumni staff authority is never derived from `appRoleFallback`.

---

## 4. Authorization principle

### 4.1 Required authorization tuple

Every graduates-affairs staff RPC (read or write) MUST authorize at request time using **all** of:

1. **Authenticated principal** with active login / non-revoked staff identity.
2. **Canonical functional role** ∈ {`graduate_affairs_manager`, `graduate_affairs_specialist`} as bound by the assignment (not inferred from UI or generic `app_role`).
3. **Processing unit** = `graduate_affairs` (exact match).
4. **Active direct assignment** and/or **approved scope binding** required by the action:
   - college operational scope (manager-only, when action permits), **or**
   - department scope, **or**
   - program scope, **or**
   - cohort/report scope (when explicitly granted), **or**
   - direct case/object assignment (follow-up, moderation object, export grant, etc.).
5. **Action-specific separation-of-duties checks** (see §6).

### 4.2 ROLE ALONE IS NEVER SUFFICIENT

The following are individually **insufficient** for ALLOW:

- Holding `graduate_affairs_manager` or `graduate_affairs_specialist` as `staff_profiles.role_type`
- Holding `user_roles.role = student_affairs` (fallback)
- Belonging to unit `graduate_affairs` without an active assignment for the target object/scope
- Seeing a button, menu, route, or report in the UI
- Being admin, registrar, or dean

### 4.3 B1 pattern reuse (alumni adaptation)

Reuse the B1 mental model:

| B1 concept | Alumni P0 adaptation |
|---|---|
| `processing_unit_id` / unit code | Must resolve to `graduate_affairs` |
| `processing_role_id` / role code | Must resolve to `graduate_affairs_manager` or `graduate_affairs_specialist` |
| Active `request_processing_assignments` / direct assignee | Active alumni staff assignment / direct case assignment / approved scope grant |
| Exact binding | Exact unit + role + identity path + scope object |
| Fail closed | Authorization failure → **zero mutation** and no sensitive payload leak |
| No bypass | No admin / registrar / dean broad bypass for alumni operational RPCs |

Alumni domain objects (graduate records visibility for ops, profiles, follow-ups, consents staff-view, exports, etc.) use the same fail-closed pattern even when not literally a student-request workflow step.

---

## 5. Scope model

### 5.1 Manager — `graduate_affairs_manager`

**Allowed scope class:** college-level **graduate-affairs operational** scope **where the action explicitly allows it**.

Examples of operational class (conceptual; gated by future RPCs):

- Unit inbox / operational dashboards limited to graduates-affairs functions
- Oversight of specialist caseloads within graduates-affairs
- Approving graduates-affairs **operational** transitions that are not academic authority
- College-scoped aggregate operational views that remain privacy-safe (row-level still needs approved export scope)

**Not implied by manager title:**

- Global browse of all graduate PII without purpose/scope
- Academic approval powers
- Document issuance / transcript regeneration
- Graduation approval
- Archived graduation-project override

Manager college scope is **operational**, not academic supremacy.

### 5.2 Specialist — `graduate_affairs_specialist`

**Allowed scope class:** **department / program / direct-case only**.

A specialist ALLOW requires at least one of:

| Scope binding | Requirement |
|---|---|
| Department | Active assignment scoped to the graduate’s snapshot `department_id` (or approved department grant) |
| Program | Active assignment scoped to the graduate’s snapshot `program_id` |
| Direct case | Active direct assignment to the exact case/object (`graduate_followups` case, moderation object, export grant, etc.) |

**Forbidden for specialist by default:**

- College-wide unscoped graduate browsing
- Acting outside assigned department/program/case
- Escalating self to manager college scope without a separate manager assignment

### 5.3 Scope objects (conceptual)

Future assignment/scope rows (names provisional) must be able to express:

- `scope_type ∈ {college_operational, department, program, cohort, report, direct_case, export_grant}`
- `unit_code = graduate_affairs`
- `role_code ∈ {graduate_affairs_manager, graduate_affairs_specialist}`
- `is_active`, effective interval, revoke timestamp
- Exact foreign keys for department/program/cohort/case/export grant
- Singular identity resolution path (staff_profile / user binding), fail on ambiguity

### 5.4 Graduate self vs staff

| Actor | Scope |
|---|---|
| Graduate (self) | Own allowed graduate profile/consent/opportunities/responses only (Stream B/D); not a staff role |
| Staff | Never “other graduate” by role; only via approved scope/direct assignment |
| Employer (future) | Never browse graduate identities; separate least-privilege contracts |

---

## 6. Separation of duties (hard prohibitions)

### 6.1 Registrar retains graduation approval

| Authority | Owner |
|---|---|
| Graduation approval / authoritative graduate-fact decision | **Registrar** (`registrar_general` / registrar academic authority path defined in Stream A) |
| Corrections/revocations of graduation decision | Registrar / approved academic correction path — **not** graduates-affairs staff |
| Graduates-affairs staff | May **consume** approved graduate facts for operational follow-up; may **not** create/approve the graduation decision |

### 6.2 Graduates-affairs staff MUST NOT

Regardless of manager/specialist title, unit match, or assignment:

1. **Approve academic grades**
2. **Modify final academic results**
3. **Approve graduation** / write authoritative graduate-fact approval
4. **Regenerate transcripts**
5. **Issue academic documents** (including graduation certificate / academic record issuance authority)
6. **Override archived graduation projects** (or mutate GP evaluations/files/lifecycle)

These remain with their existing domain owners (academic results, registrar, document issuance, graduation-projects). Alumni integrates by stable references and read contracts only where separately approved.

### 6.3 What graduates-affairs staff MAY do (operational class only)

Subject to §4–§5 and future RPC allow-lists:

- Operate alumni/graduates-affairs follow-up cases within scope
- View graduate operational fields permitted by privacy/consent contracts
- Moderate alumni operational objects that are graduates-affairs-owned (e.g., future job posts moderation — P1, when approved)
- Request/perform privacy-safe aggregate reports within approved report scope
- Perform row-level exports **only** with explicit approved export grant + expiry + audit (never by role alone)

---

## 7. Deny cases (normative)

Every case below is **DENY** with **zero mutation** and no sensitive row payload.

| # | Deny case | Rule |
|---|---|---|
| D1 | Unassigned same role | Functional role matches but **no** active direct assignment / approved scope for the target → DENY |
| D2 | Wrong processing unit | Assignment or actor bound to unit ≠ `graduate_affairs` → DENY |
| D3 | Wrong department | Specialist (or scoped manager action) outside assigned department → DENY |
| D4 | Wrong program | Outside assigned program → DENY |
| D5 | Wrong cohort / report scope | Outside granted cohort/report scope → DENY |
| D6 | Inactive assignment | `is_active = false` or outside effective interval → DENY |
| D7 | Other graduate | Target graduate/case not in actor’s approved scope/assignment → DENY |
| D8 | Admin bypass | `system_admin` / broad admin role does **not** bypass alumni staff RPCs → DENY |
| D9 | Registrar bypass | Registrar may retain **academic** graduation-approval RPCs, but **not** broad bypass into graduates-affairs operational RPCs → DENY for alumni ops RPCs |
| D10 | Dean bypass | Dean role/position does **not** grant alumni staff RPCs → DENY |
| D11 | Unrelated `student_affairs` | `student_affairs_manager` / `student_affairs_specialist` / generic `student_affairs` app role without alumni assignment → DENY |
| D12 | Anonymous / unauthenticated | No JWT / anon → DENY |
| D13 | Revoked / inactive user | Revoked login, disabled staff profile, or revoked assignment → DENY |

Additional fail-closed denials (mandatory):

| # | Case | Rule |
|---|---|---|
| D14 | Wrong processing role | Unit correct but role ≠ required role for action → DENY |
| D15 | Ambiguous identity resolution | Multiple active identities/assignments for the required binding → DENY |
| D16 | Separation-of-duties action | Any §6.2 forbidden action via alumni staff path → DENY |
| D17 | UI-only exposure | Route/menu visible without server allow → still DENY at RPC |
| D18 | Expired export/report grant | Former grant expired → DENY |

---

## 8. Future RPC matrix (provisional names — DO NOT IMPLEMENT)

> Names are provisional design targets for later `DRAFTS_ONLY_NO_APPLY` SQL/source packages.  
> This section designs the matrix only. **No RPC bodies, grants, or migrations are authorized here.**

### 8.1 Shared enforcement helpers (provisional)

| Provisional helper | Purpose |
|---|---|
| `alumni_resolve_staff_actor()` | Resolve auth.uid → staff_profile + active bindings; fail closed on ambiguity |
| `alumni_staff_has_unit_role(unit, role)` | Exact `graduate_affairs` + role check (**still insufficient alone**) |
| `alumni_staff_has_scope(...)` | Department/program/cohort/report/college_operational scope check |
| `alumni_staff_has_direct_case(case_id)` | Direct case/object assignment check |
| `alumni_deny_forbidden_academic_actions()` | Hard block for §6.2 |
| `alumni_audit_staff_access(...)` | Append-only audit for sensitive reads/exports/writes |

**Invariant:** helpers return allow only when §4 tuple is complete.

### 8.2 Provisional staff RPCs — positive matrix

| Provisional RPC | Intended actor | Required binding | Expectation |
|---|---|---|---|
| `alumni_staff_list_graduates_operational` | manager (college_operational) **or** specialist (dept/program scope) | unit+role+active scope | ALLOW only in-scope rows; privacy field minimization applies |
| `alumni_staff_get_graduate_operational_detail` | manager/specialist | unit+role+scope or direct case | ALLOW exact in-scope graduate operational view |
| `alumni_staff_list_my_followups` | manager/specialist | unit+role+direct case/scope | ALLOW assigned cases only |
| `alumni_staff_get_followup` | manager/specialist | direct case assignment | ALLOW assigned case |
| `alumni_staff_act_on_followup` | manager/specialist | direct case + action allow-list | ALLOW operational transition only |
| `alumni_staff_assign_followup` | manager (preferred) / specialist if explicitly allowed | college_operational or scoped supervisor rule | ALLOW create/rebind case assignment with audit |
| `alumni_staff_search_graduates_limited` | manager/specialist | unit+role+approved search scope | ALLOW limited fields; audited |
| `alumni_staff_request_row_export` | manager (or explicitly granted exporter) | export_grant purpose/scope/expiry | ALLOW create pending export grant request only |
| `alumni_staff_run_approved_row_export` | exact export grantee | unexpired export_grant + audit | ALLOW once; audited |
| `alumni_staff_run_aggregate_report` | manager/specialist with report scope | report scope + small-cell rules | ALLOW aggregate/de-identified only |
| `alumni_staff_moderate_job_opportunity` | manager/specialist per P1 contract | direct moderation assignment/scope | ALLOW moderation only (P1; listed for matrix completeness) |
| `alumni_staff_view_issued_document_reference` | manager/specialist | scope + **read-only** issued/archived reference contract | ALLOW metadata/reference only; no issuance |

Registrar-owned (not graduates-affairs), shown for boundary clarity:

| Provisional RPC | Actor | Expectation |
|---|---|---|
| `registrar_approve_graduation_decision` | registrar authority only | ALLOW registrar path; **DENY** all graduates-affairs staff |
| `registrar_correct_or_revoke_graduation_decision` | registrar authority only | ALLOW registrar path; **DENY** graduates-affairs staff |

### 8.3 Provisional staff RPCs — negative matrix (must all DENY + zero mutation)

For **each** alumni staff RPC in §8.2, the following cells are mandatory:

| Cell | Actor / condition | Result |
|---|---|---|
| N1 | Anonymous / no JWT | DENY |
| N2 | Authenticated student / graduate self on staff RPC | DENY |
| N3 | Same functional role, **unassigned** | DENY |
| N4 | Wrong unit (`student_affairs`, `registrar`, `archive`, …) | DENY |
| N5 | Wrong role (manager RPC with specialist-only binding or vice versa when required) | DENY |
| N6 | Wrong department | DENY |
| N7 | Wrong program | DENY |
| N8 | Wrong cohort/report scope | DENY |
| N9 | Inactive assignment | DENY |
| N10 | Other graduate / other case | DENY |
| N11 | Admin broad bypass attempt | DENY |
| N12 | Registrar broad bypass into alumni ops RPC | DENY |
| N13 | Dean bypass | DENY |
| N14 | Unrelated `student_affairs_*` actor | DENY |
| N15 | Revoked / inactive user or revoked grant | DENY |
| N16 | Forbidden academic action disguised as alumni RPC | DENY |
| N17 | Expired export/report grant | DENY |
| N18 | Ambiguous multi-assignment identity | DENY |

### 8.4 Explicit forever-DENY RPC intents (no alumni staff path)

These must never be exposed as graduates-affairs staff capabilities:

| Forbidden intent | Reason |
|---|---|
| Approve grade / mutate `student_grades` finality | Academic authority |
| Modify final cumulative results used for graduation | Academic authority |
| Approve graduation / write graduate fact approval | Registrar authority |
| Regenerate transcript artifacts | Document/transcript authority |
| Issue official academic documents | `document_issuance` only |
| Unarchive / mutate archived graduation projects | GP authority closed; read-only association only |

---

## 9. Assignment lifecycle rules

| Event | Rule |
|---|---|
| Create assignment | Requires authorized admin/config path outside this alumni ops surface; must set unit, role, identity path, scope, active flag |
| Activate | Only one unambiguous active binding per required action scope (fail closed if ambiguous) |
| Suspend / revoke | Immediate DENY on next RPC; no grace bypass |
| Expiry | Effective-to reached → DENY |
| Reassign case | Prior assignee loses ALLOW; new assignee gains only after active row exists |
| Audit | Assignment create/revoke/reassign is auditable |

Direct assignment has **absolute priority** over role-pool or unit membership notions.  
There is **no** “any graduate_affairs staff may act” pool for alumni P0.

---

## 10. Default-deny platform rules

1. RLS on alumni tables: enabled, no permissive “staff can read all” policy.
2. Access via SECURITY DEFINER RPCs (or equivalent server atomic checks) that re-check the §4 tuple at call time.
3. Authorization failure: zero writes, zero side-effect notifications, zero audit-target corruption; sensitive deny responses do not leak other graduates’ fields.
4. UI visibility is never authorization.
5. Service-role credentials must never be shipped to clients as an auth boundary.
6. Every sensitive staff read, search, download, export, and write is audited.

---

## 11. Cross-system invariants (staff authority)

Alumni staff authorization **must not** change semantics or authority of:

- `student_profiles` identity
- Academic results / transcript calculation
- Graduation approval ledger (Stream A)
- Graduation projects (including archived)
- B1 student-request processing guarantees
- `official_documents` / document issuance
- `enrollment_certificate`
- Existing production authorization guarantees

No graduates-affairs role receives global bypass.

When a graduate-facing **student request** service uses unit `graduate_affairs` in B1 workflows, that remains governed by B1 step binding (`processing_unit` + `processing_role` + direct assignment). This alumni contract does not weaken B1 and does not convert B1 step authority into alumni academic powers.

---

## 12. Relationship to MVP packages

| Package | Staff-authorization relevance |
|---|---|
| **P0 — Core authority** | This contract is a required freeze input for staff-assignment foundation, default-deny RLS/RPC drafts, and positive/negative tests |
| **P1 — Graduate operations** | Follow-up, profile staff views, employment ops, job moderation must reuse §4–§8 without widening scope |
| **P2 — Engagement/analytics** | Report/export RPCs must reuse export_grant + small-cell + audit rules |

Parallel draft wave after integrated mission PASS (expected):

- `P0-B` staff authorization foundation drafts/tests may proceed in parallel with `P0-A` graduate fact, `P0-C` account continuity, `P0-D` audit/events — **without editing shared files concurrently**.

Shared-file conflict zones to avoid parallel edits:

- `src/lib/staff-functional-roles.ts` (read-only reuse unless a dedicated role-enum expansion mission is opened)
- B1 assignment tables/RPCs owned by student-requests agents
- Alumni integrated contract / final mission report (integrator only)

---

## 13. Acceptance criteria for later implementation packages

A future staff-authorization implementation package may claim PASS only if:

1. Source drafts encode §4 tuple checks on every staff RPC.
2. Executable positive tests: exact manager college_operational ALLOW (where permitted); exact specialist dept/program/direct-case ALLOW.
3. Executable negative tests: full §8.3 matrix, including unassigned same role, wrong unit, wrong dept/program/cohort, inactive, other graduate, admin/registrar/dean bypass, unrelated student_affairs, anonymous, revoked.
4. Zero mutation proven on every DENY.
5. §6.2 forbidden actions have explicit DENY tests.
6. `appRoleFallback=student_affairs` alone cannot ALLOW.
7. No production apply/deploy/publish performed by the draft package.

Until those tests exist, alumni staff access remains **default deny**.

---

## 14. Production impact

| Dimension | Value |
|---|---|
| SQL created by this artifact | NO |
| Migration created | NO |
| RPC implemented | NO |
| RLS/GRANT changes | NO |
| Role/account changes | NO |
| Production writes | 0 |
| Deploy / publish | NO |
| Production impact | **Zero** |

---

## 15. Assumptions

1. Stream A freezes registrar-owned graduation approval; this stream only consumes that boundary.
2. A later draft may introduce dedicated alumni assignment tables **or** reuse/extend processing-assignment patterns; either way must preserve the §4 tuple and DENY matrix.
3. Future dedicated `app_role` for graduates-affairs (if approved) still does **not** remove the direct-assignment/scope requirement.
4. Privacy field minimization and consent limits (Stream D) further restrict payloads even after an ALLOW.

---

## 16. Risks

| Risk | Mitigation in contract |
|---|---|
| Treating `student_affairs` fallback as alumni authority | Explicit compatibility-only rule; negative tests N14 |
| Manager college scope becomes global PII browse | College scope limited to **operational** allow-listed RPCs; row export needs grant |
| Label drift (postgraduate vs graduates) | Functional-role source labels + unit key frozen here |
| B1 workflow step authority confused with academic powers | §6 + §11 invariants |
| UI-only “security” | RPC matrix mandatory; UI non-authoritative |

---

## 17. Final stream decision

**PASS_ALUMNI_P0_STAFF_AUTHORIZATION_CONTRACT_FROZEN**

Frozen rules:

- ROLE ALONE IS NEVER SUFFICIENT.
- Authority = functional role + `graduate_affairs` unit + active direct assignment / approved scope.
- Manager = college-level graduate-affairs **operational** scope where explicitly allowed.
- Specialist = department/program/direct-case only.
- Registrar retains graduation approval.
- Graduates-affairs must not approve grades, modify final results, approve graduation, regenerate transcripts, issue academic documents, or override archived GPs.
- Deny matrix in §7/§8.3 is normative for future drafts.
- RPC names in §8 are provisional; **DO NOT IMPLEMENT** in this mission.

**Contract class:** `CONTRACT`  
**Apply class:** `DRAFTS_ONLY_NO_APPLY`
