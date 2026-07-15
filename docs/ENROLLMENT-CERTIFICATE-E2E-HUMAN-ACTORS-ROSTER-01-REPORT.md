# ENROLLMENT_CERTIFICATE_E2E_HUMAN_ACTORS_ROSTER_01 — REPORT

- Phase: `ENROLLMENT_CERTIFICATE_E2E_HUMAN_ACTORS_ROSTER_01`
- Mode: **Read-only** (no writes, no Migration, no Publish/Deploy, no Saga, no E2E, no request creation).
- Repository: `msorori-mh/saba-uni-portal`
- Expected main HEAD: `35d868841ea04bb8519d716faa3b3efd09c80467`
- Supabase Production: `wpmicqriltrowwonknox`
- Production URL: `https://quboolye.com`
- Blocked request (untouched): `93807768-a281-42de-bfb4-0c0c03786b20` — owner `student_profile_id=95713a18-22c6-4f15-a825-ab0c2e373c4f`, status `in_review`.

No passwords, tokens, refresh tokens, service-role keys, or secrets were requested, viewed, or exposed. No user, role, assignment, request, submit-window, database, or storage change was performed.

---

## 1) Alternate eligible student (E2E actor #1)

Selected via read-only query: `student_profiles.user_id IS NOT NULL`, active `student_academic_status`, no active (non-completed / non-rejected / non-cancelled) `enrollment_certificate` request, and **not** the blocked request owner.

| Field | Value |
|---|---|
| Full name | احمد محمد علي محمد |
| Academic number | `S2025001` |
| `student_profile_id` | `3bb223d3-bbba-49f7-a48c-3009c380f841` |
| `user_id` (auth) | `d84dc64d-cc48-4bd1-a7d4-e1f66ad55aa5` |
| Department | `ce485c67-5f7c-498d-b120-4b1130a86ae8` |
| Program | `97638001-87cd-4df0-abe9-63c829504072` |
| Enrollment status | `active` |
| `must_change_password` | `false` (portal-ready) |
| Auth status | Registered (user_id present in `auth.users`; sign-in credentials not inspected — owner-managed) |

Backup candidate (also eligible, `must_change_password=false`): ريما مختار السروري — `academic_number=2026`, `student_profile_id=22fe6f8c-9a1e-4852-8d92-a83e48ea3db8`, `user_id=24af606a-6392-472a-bb71-a102fb082194`.

Neither candidate equals the blocked request owner (`95713a18-...`).

---

## 2) Staff / faculty actors per role

All six required roles have exactly one **active** row in `request_processing_assignments`. Auth accounts are provisioned (`staff_profiles.user_id` / `faculty_profiles.user_id` populated).

| Role code | Unit | Actor | Email | `user_id` | Assignment | `must_change_password` | Portal route |
|---|---|---|---|---|---|---|---|
| `student_affairs_specialist` | `student_affairs` | هيثم الشبلي | `hitham@usr.edu.ye` | `c8a94548-4782-4252-86f9-23559d3b95bd` | active, `staff_profile` | **true** (first-login change required) | `/staff` → مجالسة الطلبات (Inbox) |
| `student_affairs_manager` | `student_affairs` | ياسمين الولص | `yasmin@usr.edu.ye` | `aac0e62d-4e8b-4440-b649-caa388d34837` | active, `staff_profile` | **true** | `/staff` inbox |
| `revenue_finance_officer` | `finance` | فارس اليوسفي | `fares@usr.edu.ye` | `79783c0f-8d95-4110-8239-0ac504d63a24` | active, `staff_profile` | **true** | `/staff` inbox (Finance clearance panel) |
| `registrar_general` | `registrar` | عبدالله طعيمان | `toaiman@usr.edu.ye` | `4c261c1c-97fb-42da-a544-e8a59853ebe3` | active, `staff_profile` | **false** | `/staff` inbox |
| `dean` | `dean` | أ.م.د. مقبول قايد عبده الكامل | ⚠️ empty in `faculty.email` (auth email not visible via public schema) | `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0` (`faculty_profiles.id=ce2f9190-27f4-4914-8971-3ffff97ce2d8`, `faculty.id=cd0d4e92-f5b1-41d5-aada-801d1db12e13`, `admin_position=عميد الكلية`) | active, `faculty_profile` | n/a (faculty portal) | `/faculty-portal` → inbox/الطلبات |
| `archive_officer` | `archive` | محمد امين | `mameen@usr.edu.ye` | `aec1303e-de6a-4580-94cf-7205c17b5535` (`staff_profile_id=df2b0ebf-c23c-40d8-aea7-9622dec6d0f1`) | active, `staff_profile` | **true** | `/staff` inbox (Archive) |

Note: `mohammed@usr.edu.ye` (محمد حيدر, `labs_manager`) is registered but **not** assigned to any enrollment-certificate role — not part of this workflow.

---

## 3) Actor sequence (Enrollment Certificate v2 — 7 processing steps)

| # | Step | Actor | Email | Portal route (production) | UI ready? |
|---|---|---|---|---|---|
| 1 | Student submits request | احمد محمد علي محمد | (student auth) | `/student/requests/new?type=enrollment_certificate` | ✅ Ready (`DynamicStudentRequestForm`) |
| 2 | مختص شؤون الطلاب — Intake/Review | هيثم الشبلي | `hitham@usr.edu.ye` | `/staff` (Staff Inbox) | ✅ `StaffRequestInbox` + `StaffRequestActionPanel` |
| 3 | مدير شؤون الطلاب — Approval | ياسمين الولص | `yasmin@usr.edu.ye` | `/staff` | ✅ same shell |
| 4 | مسؤول الإيرادات والمالية — Finance clearance (only if fees) | فارس اليوسفي | `fares@usr.edu.ye` | `/staff` | ✅ `StaffRequestFinanceClearancePanel` |
| 5 | المسجل العام — Academic verification | عبدالله طعيمان | `toaiman@usr.edu.ye` | `/staff` | ✅ same shell |
| 6 | العميد — Final endorsement | أ.م.د. مقبول الكامل | ⚠️ email missing on record | `/faculty-portal` | ⚠️ Faculty portal shell exists; dean approval action panel present but cannot verify sign-in email without owner-provided credentials |
| 7 | مختص شؤون الطلاب — Issuance (triggers Saga + PDF) | هيثم الشبلي | `hitham@usr.edu.ye` | `/staff` — `EnrollmentCertificateIssueButton` | ✅ Ready |
| 8 | مسؤول الأرشيف — Archive filing | محمد امين | `mameen@usr.edu.ye` | `/staff` — `RequestDocumentArchivePanel` | ✅ Ready |
| 9 | الطالب — Download signed PDF | احمد محمد علي محمد | (student auth) | `/student` → قسم الوثائق (`StudentDocumentsSection`) → `/document-view/:id` | ✅ Ready |

---

## 4) Findings on suggested candidate accounts

| Email | Match | Notes |
|---|---|---|
| `hitham@usr.edu.ye` | ✅ Confirmed | `student_affairs_specialist` |
| `yasmin@usr.edu.ye` | ✅ Confirmed | `student_affairs_manager` |
| `fares@usr.edu.ye` | ✅ Confirmed | `revenue_finance_officer` |
| `toaiman@usr.edu.ye` | ✅ Confirmed | `registrar_general` |
| `mohammed@usr.edu.ye` | ⚠️ Registered as `labs_manager`; **not** part of the enrollment certificate workflow — do not use |

Dean is **not** among the suggested emails — dean role is bound to `faculty_profiles.id=ce2f9190-27f4-4914-8971-3ffff97ce2d8` (أ.م.د. مقبول قايد عبده الكامل), `faculty.email` is empty.

---

## 5) Gaps / risks (read-only observations)

1. **Dean login email not visible in public schema** — `faculty.email` is empty for the assigned dean; `auth.users` is not readable from public schema. Owner must confirm the dean's sign-in email out-of-band before Step 6.
2. **Four staff accounts have `must_change_password=true`** (Hitham, Yasmin, Fares, Mameen). First login will force a password change on `/staff/change-password`; that's a normal flow and not a blocker, but adds a mandatory pre-step per actor before the E2E clock starts.
3. Archive officer route wiring exists (`RequestDocumentArchivePanel`) but has not been exercised end-to-end in production for enrollment certificates.

None of these gaps required any write or change during this phase.

---

## 6) Decision

**HOLD_ENROLLMENT_CERTIFICATE_E2E_HUMAN_ACTORS_ROSTER_INCOMPLETE**

Reason: dean sign-in email cannot be confirmed from data (empty `faculty.email`, `auth.users` not exposed). All other 5 roles + 1 student are confirmed and ready.

Upgrade path to **PASS_ENROLLMENT_CERTIFICATE_E2E_HUMAN_ACTORS_ROSTER_READY_NO_CHANGES**: owner confirms the dean's auth email (or grants the AI a read of `auth.users` for `user_id=b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0`). No data change required.

## 7) Publish / Deploy

`PUBLISH_DEPLOY_FORBIDDEN` — respected. No Migration, no Publish, no Deploy, no Saga, no E2E, no writes performed. Blocked request `93807768-...` untouched.

---

## Compact actor sequence

الطالب (احمد S2025001) ← مختص شؤون الطلاب (هيثم) ← مدير شؤون الطلاب (ياسمين) ← الإيرادات (فارس، عند الحاجة) ← المسجل (عبدالله) ← العميد (مقبول — ⚠️ إيميل غير مؤكد) ← مختص شؤون الطلاب للإصدار (هيثم) ← الأرشيف (محمد امين) ← الطالب للتنزيل (احمد).
