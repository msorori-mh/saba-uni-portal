# PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-02 — تقرير الإغلاق

| الحقل | القيمة |
|---|---|
| **المهمة** | `PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-02` |
| **المستودع** | `msorori-mh/saba-uni-portal` |
| **الفرع** | `feat/reports-beneficiary-authz-scope-hardening-02` |
| **PR الهدف** | [#318](https://github.com/msorori-mh/saba-uni-portal/pull/318) (يُحدَّث على فرع الإغلاق السابق) |
| **starting HEAD** | `0f1c51d55c9a510b411f4c1683f30d35c389b755` |
| **final HEAD** | `0f1c51d55c9a510b411f4c1683f30d35c389b755` (تغييرات غير مُلتزَمة بعد — اطلب commit عند الحاجة) |
| **القرار** | `PASS_PORTAL_REPORTS_BENEFICIARY_AUTHZ_SCOPE_HARDENING_02` |

---

## 1) الملخص

أُغلقت فجوات التفويض والنطاق G1–G7 مصدرًا فقط: إزالة استنتاج VP/رئاسة من أدوار الموظفين العاديين، ربط الوحدة التشغيلية من مصادر موجودة، فشل مغلق لعميد بلا `college_id`، فصل رفض التفويض عن `DATA_INCOMPLETE`، ومطابقة رؤية الكتالوج مع التفويض الخادمي، مع اختبارات سلوكية مباشرة.

**لا Migration / لا كتابة إنتاج / لا Deploy / لا Publish / لا Merge في هذه المهمة.**

---

## 2) عقود الهوية / النطاق

### VP identity (صريح فقط)
- رموز المناصب المطلوبة: `university_vp_student_affairs` / `vice_president_student_affairs` و `university_vp_academic_affairs` / `vice_president_academic_affairs`.
- المصدر: `position_assignments` → `organizational_positions.code`.
- **لا** تُستنتج من `student_affairs` أو `dean`/`registrar`.
- الحالة الحالية: غير مكوّنة → الدوال `assertVpStudentBinding` / `assertVpAcademicBinding` ⇒ DENY/NOT_CONFIGURED؛ المراكز BLOCKED.

### رئاسة / مجلس الجامعة
- رموز: `university_president` / `university_council` / `university_presidency_council`.
- **لا** تُستنتج من `EXEC_ROLES`.
- المركز `HUB-UNIVERSITY-STRATEGIC` BLOCKED.

### Dean college binding
- هوية العميد: `app_role=dean` **أو** position code `dean`.
- عزل الكلية: يتطلب `collegeId` موثوقًا — **غير موجود** في المخطط الحالي.
- `HUB-DEAN-COLLEGE` BLOCKED؛ `getDeanCollegeReportsSummary` يستدعي `assertDeanCollegeConfigured` (fail-closed).

### Operational unit binding
- مصادر: `staff_profiles.role_type` → `unitKey` (عبر `STAFF_FUNCTIONAL_ROLES` / legacy map) و/أو `request_processing_assignments` → `request_processing_units.code`.
- الاستعلام: `loadUnitScopedRequestRows` يصفّي `student_requests.current_role_key` على أدوار الوحدة.
- بلا ربط ⇒ DENY — لا نطاق جامعي صامت.
- `official_documents` بلا عمود وحدة ⇒ `REQ-DOCUMENTS-ISSUED` / `getDocumentsIssuedReport` BLOCKED/NOT_CONFIGURED.

---

## 3) أعداد الكتالوج بعد إعادة التقييم (63)

| الحالة | العدد |
|---|---|
| LIVE | **15** |
| DATA_DEPENDENT | 0 |
| SOURCE_READY | 5 |
| UNDER_DEVELOPMENT | 6 |
| NOT_ACTIVATED | 20 |
| BLOCKED | **17** |

### LIVE (15)
`ADM-STUDENTS-DIRECTORY`, `ADM-IMPORT-JOBS`, `ADM-STUDENT-ACCOUNTS`, `ADM-ACADEMIC-STRUCTURE`, `ADM-SCHEDULE-SUITE`, `ADM-STUDENT-REQUESTS`, `EXEC-CORE-KPIS`, `REQ-PROCESSING-TIME`, `REQ-OVERDUE-SLA`, `DEPT-ACADEMIC-LOAD`, `FAC-TEACHING-LOAD`, `STU-SELF-SERVICE-VIEWS`, `HUB-FACULTY-REPORTS`, `HUB-OPERATIONAL-UNITS`, `HUB-ALUMNI-QUALITY`

### BLOCKED الجديد/المعزّز (تفويض/نطاق)
- `HUB-DEAN-COLLEGE`
- `HUB-VP-STUDENT-AFFAIRS`
- `HUB-VP-ACADEMIC-AFFAIRS`
- `HUB-UNIVERSITY-STRATEGIC`
- `REQ-DOCUMENTS-ISSUED`

---

## 4) مصفوفة التفويض السلبية (سلوكية)

| # | السيناريو | النتيجة |
|---|---|---|
| 1 | طالب A لا يقرأ طالب B | self `user_id` enforced |
| 2 | عضو هيئة A لا يقرأ إسناد B | `faculty_profile_id` forced |
| 3 | رئيس قسم A لا يطلب قسم B | `enforceDepartmentFilter` DENY |
| 4 | عميد كلية A ≠ كلية B | collegeId binding؛ hub BLOCKED بلا college_id |
| 5 | student_affairs العادي ≠ VP طلاب | لا facet / hub BLOCKED |
| 6 | registrar العادي ≠ VP أكاديمي | لا facet / hub BLOCKED |
| 7 | dean ≠ VP أكاديمي تلقائيًا | لا facet / hub BLOCKED |
| 8 | finance_officer ⇒ وحدة finance فقط | unit codes scoped |
| 9 | وحدة A لا ترى عبء وحدة B | unit-scoped request rows |
| 10 | دور مجهول ⇒ DENY | fail-closed |
| 11 | ربط تنظيمي مفقود ⇒ DENY | scope denied / NOT_CONFIGURED |
| 12 | أدوار مزدوجة = اتحاد المنح الصريحة | union only |
| 13 | رفض تفويض ≠ DATA_INCOMPLETE | `rethrowIfAuthorizationDenial` |
| 14 | service-role لا يوسّع النطاق المُعاد | filters قبل التجميع |

الاختبار: `tests/reports-beneficiaries/authz-scope-hardening.test.ts`

---

## 5) G7 — إغلاق قائمة PR #318 اليدوية (harness)

- مسارات موثّقة ومربوطة: `/student/reports`, `/faculty-portal/reports`, `/admin/department-reports`, `/admin/executive-reports`
- `department_head` لا يختار/يقرأ قسمًا آخر: مثبت عبر `enforceDepartmentFilter` + اختبارات سلوكية
- لا كتابة إنتاج

---

## 6) التحقق

| الأمر | النتيجة |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test tests/reports` + `tests/admin-reports` + `tests/reports-beneficiaries` | **288 pass / 0 fail** |
| `bun run build` | PASS (~11.66s) |
| `git diff --check` | PASS (تحذيرات CRLF فقط) |

---

## 7) السلامة

- ZERO_PRODUCTION_WRITE
- ZERO_MIGRATION_APPLY
- NO_DEPLOY
- NO_PUBLISH
- NO_ROLE_CHANGE_IN_PRODUCTION
- NO_RLS_CHANGE_IN_PRODUCTION
- NO_MERGE

---

## 8) العوائق المتبقية (مقصودة / fail-closed)

1. بذرة مناصب VP / رئاسة الجامعة غير موجودة في `organizational_positions`.
2. لا عمود `college_id` لعزل كليات متعددة.
3. لا ربط وحدة على `official_documents`.
4. تفعيل LIVE للمراكز المحجوبة يتطلب migration/seed لاحقًا خارج هذه المهمة.
