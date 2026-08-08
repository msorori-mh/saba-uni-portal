# ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-DECISION-CLOSURE-AND-FOUNDATION-CONTRACT-01` / STREAM B |
| Artifact | Account continuity contract |
| Mode | **CONTRACT / DRAFTS_ONLY_NO_APPLY** |
| Account mutation | **FORBIDDEN in this mission** — no create, merge, disable, email change, password reset, or profile write |
| Decision status | **DECIDED** (closes D-13 `NEEDS_USER_INPUT`) |
| Production impact | **Zero** |

---

## 1. Purpose and non-goals

### 1.1 Purpose

Define post-graduation **account continuity** for the college portal so that:

1. A person who was an active student can keep **the same authentication identity** after graduation.
2. **Student capabilities** and **graduate capabilities** are evaluated separately.
3. Login, recovery, university-email lifecycle, suspension/closure, and duplicate-identity handling are explicit and fail-closed.

This contract answers decision gate **#2** from
`docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`
(“Post-graduation account continuity…”) and supersedes the undecided D-13
surface in `src/lib/graduates-affairs/account-continuity.ts` /
`docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`.

### 1.2 Non-goals

- No authoritative graduate-fact definition (separate academic decision).
- No graduates-affairs staff authorization model (separate stream).
- No consent, career, survey, employer, or report product behavior beyond capability names.
- No document issuance, PDF, Storage, or `student_visible` change.
- No SQL apply, runtime enablement, seed, deploy, or publish.
- No invention of a second login product or parallel alumni IdP.

---

## 2. Evidence reused (source-bound)

| Evidence | Source | Safe conclusion for this contract |
|---|---|---|
| Reuse stable identity; do not invent graduation from profile fields | `GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md` §Inventory | Continuity attaches to existing `student_profiles` / `auth.users`, not a new person record invented at graduation |
| Request audiences include `graduate`; status supports `graduated`; that alone does **not** prove recovery/email ownership/capabilities | Same audit §Account audience | Continuity must be an explicit policy, not inferred from audience alone |
| Consent must not be bundled with account continuity | Same audit §Authorization/privacy | Signing in or recovering a password ≠ consent to career/survey processing |
| Graduate fact links `student_profile_id` with `ON DELETE RESTRICT`; does not edit auth users | Foundation draft/report | Graduate domain consumes the existing profile link; it does not create auth users |
| Auth actor is `auth.uid()`; student ownership is `student_profiles.user_id` | Student profile RLS hardening; request RPCs (`current_student_profile_for_auth`) | One portal principal: authenticated user ↔ student profile |
| Login is university-email + password via Supabase Auth | `portal-login.tsx`, `university-email-auth.ts` | Continuity preserves that auth user; login identifier policy may evolve after graduation |
| Password recovery today is university-email reset for student context | `forgot-password.tsx` | Post-grad recovery must add a verified personal channel; university mailbox alone is unsafe after expiry/reuse |
| Eligibility: `active` → `active_student`/`both`; `graduated` → `graduate`/`both`; other statuses deny | `assert_student_can_use_request_type`, request-type migrations/specs | Capability gating already separates audiences on one profile/status axis |
| `app_role` value `graduate` exists | migration adding enum value | Role enum ≠ second authentication identity; do not treat it as a second login account |
| D-13 surface was fail-closed `undecided` | `account-continuity.ts`, completion draft | This contract **approves** continuity policy content; implementation remains drafts-only until a later apply mission |

**No source evidence shows an existing second alumni auth identity.** Inventing one would break request ownership, document ownership, audit actor continuity, and graduate-record linkage. Therefore second-identity creation is **rejected**.

---

## 3. Binding decision (D-13 CLOSED)

### 3.1 Authentication identity

**DECISION: DO NOT create a second authentication identity.**

| Layer | Canonical object | Rule |
|---|---|---|
| Authentication identity | `auth.users.id` (Supabase Auth principal) | Survives graduation unchanged |
| Student capability context | `student_profiles` row linked by `user_id = auth.uid()` | Same row before and after graduation |
| Graduate capability context | Approved `graduate_records` (and later graduate domain objects) linked by `student_profile_id` | Capabilities are **additive/gated**, not a new login |
| Audience for requests | `request_types.request_audience` ∈ {`active_student`,`graduate`,`both`} evaluated against `student_profiles.status` | Existing model retained |

**Separation triad (mandatory):**

1. **Authentication identity** — who can sign in (`auth.users`).
2. **Student capabilities** — active-enrollment academic actions (registration-like services, active-only requests, materials/enrollment surfaces that require `status='active'`).
3. **Graduate capabilities** — graduate-audience requests, graduate self-service, survey/profile/career surfaces that require an approved graduate fact **and** continuity policy allow-list.

Graduation never clones, splits, or replaces the auth user.

### 3.2 Continuity policy code

Canonical policy code (for later implementation of the existing D-13 evaluator):

- `policy_code = "graduate-account-continuity"`
- `policy_state = approved` (product decision)
- `allow_portal_sign_in = true` (subject to §8 suspension/closure)
- `allow_university_email_reuse = false` (see §7)
- Allowed capability vocabulary is defined in §6 (replaces the incomplete draft list as the contract of record)

Until a later implementation mission writes an approved policy row / runtime flag, evaluators remain fail-closed in code. **This document is the product decision**, not an apply order.

---

## 4. Lifecycle transition model

```text
[active student]
    │  official graduation fact approved (separate academic gate)
    │  + student_profiles.status → 'graduated' (admin/registrar-controlled; not self-serve)
    ▼
[graduated user]          ← same auth.users.id, same student_profiles.id/user_id
    │  continuity policy allows portal_sign_in
    │  + graduate capability gates (audience / graduate_record / consent as applicable)
    ▼
[graduate portal capabilities]
```

| State | Auth identity | Profile status (capability axis) | Student capabilities | Graduate capabilities |
|---|---|---|---|---|
| Active student | existing `auth.users` | `active` | ALLOW per existing student rules | DENY graduate-only surfaces |
| Transition in progress | unchanged | must remain non-self-serve; only registrar/official process may flip status | Active rules until status flips | Not granted by candidate lists, % completion, certificate request, or issued document alone |
| Graduated user | **same** `auth.users` | `graduated` | DENY active-student-only actions | ALLOW only §6 allow-list, still subject to graduate-fact / consent gates |
| Suspended / closed | same identity retained for audit | status or account flags per §8 | DENY | DENY |
| Non-eligible academic statuses (`suspended`,`withdrawn`,`transferred`, …) without approved graduate continuity | same identity | not `active` and not `graduated` | DENY (existing request rule) | DENY |

**Hard rule:** `student_profiles.status='graduated'` alone does **not** create a graduate record (audit/foundation). Continuity login may proceed for a graduated profile under §5, but graduate-domain features that depend on `graduate_records` remain DENY until that fact exists.

---

## 5. Login continuity

### 5.1 Sign-in

| Rule | Decision |
|---|---|
| Principal | Same `auth.users` row used while the person was a student |
| Portal entry | Existing student portal login path (`/portal-login` student context) remains the continuity entry; no separate alumni IdP |
| Session actor | `auth.uid()` remains the only authoritative actor id |
| Password | Existing password continues to work; no forced re-provision at graduation solely because of graduation |
| `must_change_password` | Remains an auth hygiene flag on the profile/account; graduation does not clear or invent it |
| Demo/seed accounts | Out of scope; production continuity never relies on demo credentials |

### 5.2 Identifier after graduation

| Identifier class | Continuity rule |
|---|---|
| University student email (`@students.usr.edu.ye` pattern family) | **Primary login while still under university mailbox control** |
| After university mailbox expiry / deprovision | University email **must not** be the sole recovery channel; personal verified recovery channel (§6.2 / §7) becomes mandatory for recovery |
| Academic number / national id as username | **Forbidden** as login name (existing university-email-only login rule preserved) |
| New alumni-only email account in Auth | **Forbidden** (would be a second identity) |

### 5.3 Fail-closed login outcomes

DENY portal sign-in when any of the following hold:

- Account suspended or closed per §8.
- Continuity policy not approved / not in force (implementation fail-closed until wired).
- Auth user unbound from `student_profiles.user_id` (orphan session has no student context).
- Anonymous / wrong-portal misuse (faculty/staff login contexts are not graduate continuity).

UI hiding is never authorization.

---

## 6. Capability contract

### 6.1 Allowed former-student (graduated) capabilities

Allow-list for `status='graduated'` **when** continuity sign-in is permitted. Each item still requires its own domain gates (RPC/RLS, graduate fact, consent, document status, etc.).

| Capability code | Meaning | Notes |
|---|---|---|
| `portal_sign_in` | Authenticate and hold a session | Requires continuity + not suspended/closed |
| `password_recovery` | Complete password recovery per §6.2 | Channel rules in §7 |
| `profile_self_service_non_academic` | Update non-protected contact fields only | Must not mutate `status`, `user_id`, academic numbers, program/department, suspension counters, `must_change_password` |
| `request_audience_graduate` | Create/submit request types with audience `graduate` or `both` | Existing `assert_student_can_use_request_type` semantics |
| `request_audience_both_as_graduate` | Same as above for `both` | Active-only types remain DENY |
| `official_document_download_issued_archived` | Download own documents in `issued`/`archived` only | Graduates affairs must not issue/regenerate; document domain remains owner |
| `graduate_profile_self_service` | Graduate career/contact self-service when that domain is enabled | Requires approved graduate record + purpose consent where applicable |
| `graduate_survey_participation` | Participate in graduate surveys when enabled | Consent/purpose/version required; not granted by login alone |
| `graduate_opportunity_view_eligible` | View moderated published opportunities aimed at graduates | No employer browsing of identities (audit rule) |
| `notification_receive_non_sensitive` | Receive non-sensitive portal notices | Payloads must not leak academic/contact/employment detail beyond policy |

### 6.2 Personal verified recovery channel

| Rule | Decision |
|---|---|
| Requirement | Every graduated user who retains portal access **must** be able to register **one verified personal recovery channel** (personal email and/or mobile phone) distinct from the university mailbox |
| Verification | Affirmative verify challenge; unverified channel is **not** usable for recovery |
| Purpose separation | Recovery-channel verification ≠ marketing/career consent |
| Storage | Treated as sensitive contact; protection/encryption follows the graduates contact-point rules when implemented |
| Staff | Graduates-affairs staff cannot browse recovery channels without direct assignment + purpose; default deny |
| Timing | Strongly required before or at graduation transition; if missing after university email expiry, recovery is blocked until an out-of-band registrar-assisted identity proof completes (§7.3) |

Password recovery for graduated users:

1. Prefer verified personal recovery channel.
2. University email may be used **only while** it still uniquely resolves to this auth user and is not marked expired/reassigned.
3. Never send a reset to a university address that has been released for reuse.

### 6.3 Forbidden academic actions after graduation

DENY for `status='graduated'` (non-exhaustive; server must enforce):

| Forbidden action | Rationale |
|---|---|
| Any `request_audience='active_student'` create/submit | Existing RPC message: active-only |
| Enrollment certificate / excuse absence / suspension / transfer / October entry / grade appeal / file withdrawal and other active-student services | Active enrollment lifecycle ended |
| Course registration, section materials as an enrolled student, attendance as current student | Student capability layer |
| Self-mutation of `student_profiles.status`, program/department, academic_number, study system, suspension counters, `user_id` | Protected academic/admin fields |
| Creating a graduate record from portal self-service | Official decision ledger only |
| Treating candidate lists, completion %, certificate requests, or issued docs as graduation authority | Audit/foundation fail-closed rule |
| Document issuance / PDF generation / Storage upload outside `document_issuance` staff path | Global document rules |
| Admin/registrar/dean bypass to re-enable active-student actions “because alumni” | No general bypass |
| Second Auth user provisioning “for alumni portal” | Forbidden by §3 |

`status NOT IN ('active','graduated')` remains globally ineligible for student-request create/submit (existing rule), unless a future separately approved continuity exception is written — **none is granted here**.

---

## 7. University-email lifecycle and reuse

### 7.1 Lifecycle states (logical)

| Email state | Meaning | Login | Recovery to that address |
|---|---|---|---|
| `active_university` | Mailbox controlled by university for this person | ALLOW (if account not suspended/closed) | ALLOW |
| `expired_university` | University deprovisioned mailbox; Auth email may still hold the string | ALLOW only if Auth credential still matches **and** no reuse assignment exists; recovery to that address **DENY** | DENY |
| `reassigned_university` | Address allocated to a different person/cohort | **DENY** for former holder; must not authenticate the former holder via that address | DENY |
| `personal_verified` | Verified personal recovery/login-assist channel | Not a replacement Auth identity by default; used for recovery (and optionally future alternate login **without** creating a second user) | ALLOW |

### 7.2 Reuse policy

**DECISION: `allow_university_email_reuse = false` by default for graduated continuity.**

Operational meaning:

1. The portal **must not** silently keep a graduated user’s Auth email equal to a university address that the university has reassigned.
2. Before any university address can be used as Auth email for a **new** student import/account, the former Auth binding must be cleared/replaced through a controlled registrar/IT procedure that:
   - proves the former holder is detached,
   - moves the former holder to a verified personal login/recovery channel **on the same `auth.users.id`**, or suspends/closes per §8,
   - writes an append-only audit event,
   - never creates a duplicate person with a second Auth user “to free the email” without merge rules in §9.
3. Product capability `university_email_reuse` remains **denied** in continuity evaluation. Any future exception is a new versioned policy row with provenance — not a silent import side effect.

### 7.3 Expired / reused university email — recovery path

| Scenario | Required behavior |
|---|---|
| University email expired; personal channel verified | Recover via personal channel; session remains same `auth.users.id` |
| University email expired; no personal channel | Block self-serve recovery; registrar-assisted identity proof (academic number + national id / approved KYC package) may bind a personal channel to the **existing** user — still no second identity |
| University email reused by another person | Former holder: DENY login/recovery on that address. New holder: only after §7.2 detachment. Conflict → §9 duplicate handling |
| Import attempts to create Auth user with an email still bound | Fail closed; do not overwrite |

---

## 8. Account suspension and closure

| Action | Who | Effect on auth identity | Effect on capabilities | Data |
|---|---|---|---|---|
| **Suspend** | Registrar / system admin with documented cause | Identity retained; sign-in DENY | All student + graduate capabilities DENY | No cascade delete; graduate facts retained |
| **Reinstate** | Same authority | Sign-in ALLOW if continuity still approved | Capabilities re-evaluated from status + gates | Audit required |
| **Close** (logical) | Registrar / system admin | Identity retained for audit referential integrity (`ON DELETE RESTRICT` patterns); sign-in DENY permanently unless formal reopen | All capabilities DENY | No silent purge of graduate_records / documents |
| **Hard delete Auth user** | **Out of scope / forbidden** in alumni P0 | Would break RESTRICT linkages and audit | — | Not authorized by this contract |

Suspension/closure is **not** expressed by creating a new alumni account. Consent withdrawal does **not** equal account closure (audit: consent separate from continuity), though communication capabilities become DENY on withdrawal.

---

## 9. Identity merge and duplicate handling

### 9.1 Principles

1. One natural person ⇒ **one** `auth.users` principal for student/graduate portal continuity.
2. One student capability row ⇒ one `student_profiles` row linked to that user when portal-enabled.
3. Graduate facts key off `student_profile_id`, not a parallel alumni user id.
4. Duplicate detection is a **registrar-controlled** procedure; self-serve merge is forbidden.

### 9.2 Duplicate classes and decisions

| Case | Decision |
|---|---|
| Two Auth users, one academic_number | **Merge forbidden in automation.** Quarantine; registrar picks survivor `auth.users.id`, rebinds `student_profiles.user_id`, disables loser sign-in, audits. No data invent |
| Two profiles, one national_id / one person | Same: manual merge plan; graduate_records remain on surviving `student_profile_id` or are corrected via official decision versioning — not by agent rewrite |
| Graduated profile without `user_id` | Continuity login unavailable until bind-to-existing or controlled account attach; **do not** auto-create second user if a match exists |
| Candidate/near-complete student mistaken for graduate | Not a continuity event; no status flip; no graduate capabilities |
| Staff/faculty Auth user who is also a former student | Out of scope for silent merge; separate role assignments must not collapse portals without an explicit cross-principal decision (not granted here) |

### 9.3 What merge must never do

- Create a third “alumni” Auth user as a merge workspace.
- Delete production requests, documents, or graduate ledger rows to “simplify” identity.
- Transfer ownership by client-side `user_id` update (protected field).
- Bypass RLS with admin global read during merge without audited RPC.

---

## 10. Password recovery (end-to-end contract)

| Step | Active student | Graduated user |
|---|---|---|
| Entry | `/forgot-password?type=student` | Same entry (no second product) unless a later UX label changes copy only |
| Identifier accepted | University email bound to Auth user | University email **if** still uniquely bound and not expired/reassigned; else verified personal channel |
| Rate limit | Existing rate-limit policies apply | Same |
| Success | Supabase reset to bound mailbox | Reset only to an allowed channel per §7 |
| Post-reset session | Same user | Same user |
| Failure messaging | Non-enumerating generic success/failure posture should be preserved | Same; do not reveal whether an email belongs to a graduate |

Graduation does not invalidate an outstanding reset token solely by status change; token expiry remains the auth provider’s rule. Reuse/expiry of the **mailbox** does invalidate using that mailbox as delivery target.

---

## 11. Relationship to graduate domain objects

| Object | Continuity relationship |
|---|---|
| `graduate_official_decisions` / `graduate_records` | Consume `student_profile_id`; never mint Auth users |
| `graduate_profiles` / `graduate_contact_points` | Optional career/contact layer on the same person; personal recovery channel may later align with a verified contact point of purpose `account_recovery` |
| `graduate_consents` | Independent; login continuity must not imply consent grant |
| `graduate_account_continuity_policies` | Implementation surface for this decision; approved content defined here |
| `evaluate_graduate_account_continuity` / `evaluateAccountContinuityAccess` | Must fail closed until implementation encodes this approved policy; pure evaluation only |

---

## 12. Authorization and audit requirements (for later implementation)

When implemented (not in this mission):

1. Default deny; atomic RPC/server checks; UI is not a security boundary.
2. Exact ALLOW: self (`auth.uid()` owns profile) for self-service continuity actions.
3. Exact DENY: anonymous; other student; staff without direct assignment; admin/registrar/dean **global bypass** for graduate self-data; wrong purpose.
4. Zero side effects on DENY (no profile/contact/consent/audit-target mutation except a denied-attempt security log if separately specified).
5. Audit events (append-only) at minimum: continuity policy decision, sign-in denials for suspended/closed, recovery-channel verify/revoke, university-email detach/reassign, suspend/close/reinstate, registrar-assisted bind, duplicate quarantine.

---

## 13. Acceptance criteria (contract-level)

This STREAM B artifact is **PASS_CONTRACT_READY** when all are true:

- [x] Second authentication identity explicitly **rejected**
- [x] Auth / student capabilities / graduate capabilities separated
- [x] Transition `active student → graduated user → graduate portal capabilities` defined
- [x] Login continuity, password recovery, university-email lifecycle, personal verified recovery, expired/reused email handling specified
- [x] Allowed former-student capabilities and forbidden post-graduation academic actions listed
- [x] Suspension/closure and merge/duplicate rules specified
- [x] No account mutation performed by this mission
- [x] D-13 product decision closed as **approved continuity without email reuse**
- [x] Marked **CONTRACT / DRAFTS_ONLY_NO_APPLY**

Implementation, SQL apply, and runtime wiring remain **HOLD** pending the wider alumni/graduates P0 foundation sequence and independent security review.

---

## 14. Assumptions

1. Supabase Auth remains the sole portal IdP for students/graduates in P0.
2. `student_profiles.user_id` remains the ownership join for self-service.
3. Official graduation fact and status flip to `graduated` are controlled outside this contract but are prerequisites for graduate-domain capabilities.
4. University IT can signal mailbox expiry/reassignment through a future controlled integration or registrar procedure; until then, fail closed on suspected reuse conflicts.
5. `app_role = graduate` if used later is an authorization label, not an Auth user type.

## 15. Risks

| Risk | Mitigation in contract |
|---|---|
| University email reused while Auth email unchanged | §7 deny recovery/login on reassigned address; detach procedure required |
| Operators create “alumni accounts” by habit | §3 absolute ban; imports must fail closed on email collision |
| Consent bundled into login UX | §1.2 / §3 / audit rule — forbidden |
| Status `graduated` without graduate_record enabling career features | §4 hard rule — domain features stay DENY |
| Merge automation destroying history | §9 manual registrar procedure only |

## 16. Blockers / dependencies

- Authoritative graduate definition / official decision ledger (audit decision #1) for graduate-domain capabilities.
- Staff authorization model (audit decision #3) for registrar-assisted recovery/merge.
- Contact protection/encryption approval before storing personal recovery channels at rest.
- Later implementation mission to encode approved D-13 policy + recovery UX — **not authorized here**.

## 17. Production impact

**None.** This file is a contract draft only. No accounts, emails, passwords, profiles, migrations, or `student_visible` flags are changed by publishing this markdown.

---

## 18. Final decision record

| ID | Decision | Status |
|---|---|---|
| D-AUTH-01 | No second authentication identity | **APPROVED** |
| D-AUTH-02 | Preserve `auth.users` + `student_profiles.user_id` across graduation | **APPROVED** |
| D-AUTH-03 | Separate authentication vs student capabilities vs graduate capabilities | **APPROVED** |
| D-AUTH-04 | Portal sign-in continuity allowed for graduated users subject to suspension/closure | **APPROVED** |
| D-AUTH-05 | University email reuse capability denied; detach-before-reassign required | **APPROVED** |
| D-AUTH-06 | Personal verified recovery channel mandatory for safe post-grad recovery | **APPROVED** |
| D-AUTH-07 | Active-student academic actions forbidden after graduation | **APPROVED** |
| D-AUTH-08 | Consent not bundled with continuity | **APPROVED** |
| D-AUTH-09 | Suspend/close retain identity for audit; hard-delete out of scope | **APPROVED** |
| D-AUTH-10 | Duplicate/merge is registrar-controlled; no self-serve merge | **APPROVED** |

**STREAM B verdict:** `PASS_ACCOUNT_CONTINUITY_CONTRACT_DECIDED`  
**Apply/runtime verdict:** `HOLD_DRAFTS_ONLY_NO_APPLY`
