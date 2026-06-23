# Security Test Plan — Post SECURITY-FULL-ASSURANCE-01

**الهدف:** اختبارات آمنة على **staging / بيانات اختبار مصطنعة** — لا production، لا هجوم، لا brute force.

---

## 1. بيئة الاختبار

| البند | Requirement |
|-------|-------------|
| Environment | staging أو local dev مع Supabase project منفصل |
| Accounts | حسابات اختبار لكل دور (لا credentials حقيقية في repo) |
| Data | synthetic students/faculty — **لا ندى ولا PII حقيقي** |
| Tools | Playwright (UI), curl/fetch (API), Supabase SQL editor (read-only verify) |

---

## 2. Role Test Matrix

### 2.1 Anonymous (زائر غير مسجل)

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| A1 | GET `/admin/students` | redirect login | P0 |
| A2 | POST server fn without Bearer | 401 Unauthorized | P0 |
| A3 | SELECT `student_profiles` via anon key | 0 rows / denied | P0 |
| A4 | `verify_document` with random code | no PII leak | P1 |
| A5 | SELECT `class_schedule` via anon | document if intentional public schedule | P1 |
| A6 | Storage private bucket URL guess | 403/404 | P0 |

### 2.2 Student

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| S1 | `/admin/*` | blocked | P0 |
| S2 | `getMyProgress` own id | 200 | P0 |
| S3 | `getUnofficialTranscriptData` other student UUID | 403 | P0 |
| S4 | `document-view` other doc id | 403 | P0 |
| S5 | Modify own grade via client supabase | RLS deny | P0 |
| S6 | Open another student's request attachment | deny | P0 |
| S7 | Upload receipt for another student fee | deny | P1 |

### 2.3 Faculty (`faculty_member`)

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| F1 | `/admin/*` | blocked | P0 |
| F2 | Grades grid own sections only | scoped | P0 |
| F3 | Edit grades outside assigned section | deny | P0 |
| F4 | View student outside section | deny or limited | P1 |
| F5 | `communications` send as faculty | allowed paths only | P2 |

### 2.4 Staff portal

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| ST1 | `/admin/*` | blocked | P0 |
| ST2 | audit_logs | deny | P0 |
| ST3 | HR admin pages | deny | P0 |

### 2.5 hr_officer

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| H1 | faculty-management, staff-management | allow | P0 |
| H2 | students write | deny | P0 |
| H3 | finance | deny | P0 |
| H4 | audit_logs entity staff/faculty only | scoped | P1 |
| H5 | staff outside department_scope | deny | P1 |

### 2.6 registrar / student_affairs

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| R1 | students CRUD | allow (write per role) | P0 |
| R2 | finance fees import | registrar deny / finance allow | P0 |
| R3 | `/admin/users` roles | deny | P0 |
| R4 | audit_logs restricted entity (pilot, role) | deny | P1 |

### 2.7 dean

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| D1 | executive-dashboard | allow | P1 |
| D2 | operations center | deny | P0 |
| D3 | audit_logs security/role entity | deny | P1 |
| D4 | pilot-center manage | deny (read may vary) | P1 |
| D5 | automation settings write | deny | P1 |

### 2.8 admin / system_admin

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| AD1 | operations, users, roles | allow | P0 |
| AD2 | runDataCleanup | audit + confirm UI | P0 |
| AD3 | Sensitive writes create audit_logs row | verify | P1 |
| AD4 | system_admin vs admin difference (if any) | document | P2 |

---

## 3. Surface-specific tests

### 3.1 Bulk Imports

| # | Test |
|---|------|
| I1 | Preview valid departments file — server preview matches counts |
| I2 | Preview invalid file — errors shown, no DB write |
| I3 | `runBulkImport` as registrar on student_fees — deny |
| I4 | `runBulkImport` without auth — 401 |
| I5 | Excel formula injection in text field — stored escaped / no XSS in UI |
| I6 | `updateExisting` toggle — preview reflects (note revalidation drift) |

### 3.2 Schedule Import

| # | Test |
|---|------|
| SC1 | Preview as dean — no execute button |
| SC2 | Execute as registrar — success on test context |
| SC3 | Blocking conflict — full abort, no partial write |
| SC4 | Cross-context room conflict detected |

### 3.3 Official Documents

| # | Test |
|---|------|
| DOC1 | verify-document public — minimal fields only |
| DOC2 | Tamper document UUID in URL — 403 |
| DOC3 | Tamper verification code — invalid result |
| DOC4 | Cancelled document — not viewable |
| DOC5 | QR links to verify endpoint only |

### 3.4 Storage

| # | Test |
|---|------|
| STG1 | Signed URL expiry (300s) |
| STG2 | Path traversal in attachment path param |
| STG3 | Upload disallowed MIME to official bucket |
| STG4 | Direct public URL to payment-receipts — deny |

### 3.5 Auth / Sessions

| # | Test |
|---|------|
| AU1 | Logout clears session — admin fn 401 |
| AU2 | Role removed while session active — next fn fails |
| AU3 | Password reset flow — rate limited |
| AU4 | `getAdminSession` returns roles matching DB |

### 3.6 Audit Logs

| # | Test |
|---|------|
| AU5 | Client INSERT audit_logs — deny |
| AU6 | Student SELECT audit_logs — deny |
| AU7 | Dean SELECT audit_logs role entity — deny |
| AU8 | Import completed — import_logs + audit entry |

---

## 4. Automation roadmap

| Phase | Scope | Tool |
|-------|-------|------|
| Phase 1 | A2, S3, F3, R3 — server fn auth | Vitest + mock JWT |
| Phase 2 | Admin route matrix | Playwright |
| Phase 3 | RLS spot checks | Supabase test project + SQL |
| Phase 4 | IDOR parameterized suite | Custom script |

---

## 5. Pass criteria (Pilot gate)

- **P0 tests:** 100% pass
- **P1 tests:** ≥ 95% pass, no open critical
- **P2:** tracked as backlog

---

## 6. Out of scope (this plan)

- Load/stress testing
- DDoS simulation
- Social engineering
- Physical security
- Supabase dashboard misconfiguration audit
