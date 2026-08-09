# مصفوفة تغطية التقارير حسب المستفيد — PORTAL-REPORTS-BENEFICIARY-COVERAGE-MATRIX-01

**المهمة:** PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01
**الفرع:** `feat/reports-by-beneficiary-full-closure-01`
**BASE:** `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f`
**المصدر:** CODE IS TRUTH — مشتق من `src/lib/reports/catalog/entries.ts` + قواعد النطاق في `src/lib/reports/scope/`.
**المستفيدون القانونيون (10):** مطابقون لـ `REPORT_BENEFICIARIES` في `src/lib/reports/catalog/types.ts`.

## ملخص التغطية حسب المستفيد

| المستفيد | الرمز | عدد المدخلات | LIVE | SOURCE_READY | UNDER_DEVELOPMENT | NOT_ACTIVATED | BLOCKED | DATA_DEPENDENT |
|---|---|---|---|---|---|---|---|---|
| طالب | `student` | 4 | 1 | 1 | 0 | 1 | 1 | 0 |
| عضو هيئة تدريس/مشرف | `faculty_supervisor` | 13 | 3 | 3 | 1 | 5 | 1 | 0 |
| رئيس قسم/منسق | `dept_head_coordinator` | 29 | 4 | 4 | 2 | 10 | 9 | 0 |
| الوحدات التشغيلية | `operational_units_staff` | 13 | 8 | 1 | 2 | 2 | 0 | 0 |
| الشؤون الأكاديمية | `academic_affairs` | 14 | 3 | 2 | 0 | 3 | 6 | 0 |
| الخريجون والجودة | `alumni_quality` | 10 | 1 | 0 | 1 | 5 | 3 | 0 |
| عميد | `dean` | 48 | 12 | 5 | 5 | 16 | 10 | 0 |
| نائب شؤون الطلاب | `vp_student_affairs` | 11 | 8 | 0 | 2 | 1 | 0 | 0 |
| نائب الشؤون الأكاديمية | `vp_academic_affairs` | 40 | 7 | 5 | 1 | 16 | 11 | 0 |
| رئاسة الجامعة/المجلس | `university_presidency_council` | 14 | 3 | 0 | 3 | 6 | 2 | 0 |

> ملاحظة: مجموع أعمدة المستفيدين > 63 لأن المدخل الواحد قد يخدم أكثر من مستفيد.

---

## طالب (`student`)

### قواعد النطاق
- **المستوى التنظيمي:** `self` — ذاتي فقط
- **أدوار التطبيق المرتبطة (facet mapping):** student، graduate
- **القاعدة:** نطاق ذاتي إلزامي (studentProfileId). لا تجاوز جامعي. القيم الناقصة تُعرض كـ MetricPresence وليس صفراً.
- **الدوال الخادمية الأساسية:** `getStudentSelfReportsSummary`، `getMyReportScope`، `getVisibleCatalogForViewer`
- **مسارات الواجهة المرتبطة بالمستفيد:** /student/reports

### التقارير المغطاة من الكتالوج (4)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `CLR-EQUIVALENCY-HOURS` | تقرير الساعات المعادلة والمتبقية | غير مفعّل (NOT_ACTIVATED) | case-level/department | لا يوجد (متابعة لاحقة) | لا باني/عرض مخصص للساعات + مسودة SQL غير مطبقة + لا route |
| `CLR-EQUIVALENCY-MINUTES` | محضر المعادلات واعتماداته النهائية | محجوب (BLOCKED) | case-level | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + عرض المحضر للطالب يتطلب قرار منتج |
| `MAT-USAGE-REPORT` | تقرير استخدام المواد التعليمية | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | الجداول/الميزة Live لكن لم يُنشأ أي تقرير/باني/دالة لاستخدام المواد |
| `STU-SELF-SERVICE-VIEWS` | عروض الطالب الذاتية ومركز تقاريري | مفعّل (LIVE) | self | /student/reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/student/reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `STU-SELF-SERVICE-VIEWS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `MAT-USAGE-REPORT`
- **فجوات/حجب متبقية:** `CLR-EQUIVALENCY-HOURS` (NOT_ACTIVATED)، `CLR-EQUIVALENCY-MINUTES` (BLOCKED)

---

## عضو هيئة تدريس/مشرف (`faculty_supervisor`)

### قواعد النطاق
- **المستوى التنظيمي:** `assigned / self` — المقررات/المجموعات المسندة فقط
- **أدوار التطبيق المرتبطة (facet mapping):** faculty_member، department_head (facet)
- **القاعدة:** نطاق مسند (assigned) عبر facultyProfileId؛ department_head يحصل أيضاً على facet هيئة التدريس لكن بيانات الإسناد تبقى ضمن المقررات المسندة/القسم حسب الدالة.
- **الدوال الخادمية الأساسية:** `getFacultySelfReportsSummary`، `getMaterialsCoverageReport`
- **مسارات الواجهة المرتبطة بالمستفيد:** /faculty-portal/reports

### التقارير المغطاة من الكتالوج (13)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-SCHEDULE-SUITE` | تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) | مفعّل (LIVE) | university/college/department | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `GP-SUPERVISOR-LOAD` | تقرير عبء الإشراف على مشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا باني/RPC مخصص لعبء الإشراف + مسودة SQL غير مطبقة + لا route |
| `GP-TIMELINE-STATUS` | تقرير المراحل والمواعيد المتأخرة لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا تقرير مراحل/تأخر منشأ + مسودة SQL غير مطبقة + لا route |
| `LEC-EXECUTION-MONITORING` | تقرير متابعة تنفيذ المحاضرات | محجوب (BLOCKED) | department/level/course | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة تعيينات recorders/delegates/monitors غير منشأة + قرار D-15 معلق |
| `LEC-WEEKLY-LOG` | سجل التنفيذ الأسبوعي للمحاضرات | قيد التطوير (UNDER_DEVELOPMENT) | course_section | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة التعيينات غير منشأة |
| `LEC-PLAN-COVERAGE` | تقرير تغطية الخطة/المنهاج بالمحاضرات | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | نموذج تغطية المنهاج غير منشأ + مسودة SQL غير مطبقة + لا route |
| `MAT-USAGE-REPORT` | تقرير استخدام المواد التعليمية | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | الجداول/الميزة Live لكن لم يُنشأ أي تقرير/باني/دالة لاستخدام المواد |
| `MAT-PUBLISH-STATUS` | تقرير حالة نشر المواد (منشورة/مسودة) | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير حالة نشر منشأ رغم جاهزية الجداول |
| `MAT-TOP-ACCESSED` | تقرير أكثر المواد وصولاً/تحميلاً | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا عدّادات/أحداث استخدام مثبتة + لا تقرير منشأ |
| `MAT-STALE-ITEMS` | تقرير المواد غير المحدثة | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير مواد قديمة منشأ رغم جاهزية الجداول |
| `MAT-STUDENT-ENGAGEMENT` | تقرير تفاعل الطلاب مع المواد | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا تتبع تفاعل مثبت + لا تقرير منشأ |
| `FAC-TEACHING-LOAD` | العبء التدريسي (ذاتي / قسم / كلية) | مفعّل (LIVE) | self/assigned/department/college | /faculty-portal/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `HUB-FACULTY-REPORTS` | مركز تقاريري لعضو هيئة التدريس | مفعّل (LIVE) | assigned | /faculty-portal/reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/faculty-portal/reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-SCHEDULE-SUITE`، `FAC-TEACHING-LOAD`، `HUB-FACULTY-REPORTS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `LEC-WEEKLY-LOG`، `MAT-USAGE-REPORT`، `MAT-PUBLISH-STATUS`، `MAT-STALE-ITEMS`
- **فجوات/حجب متبقية:** `GP-SUPERVISOR-LOAD` (NOT_ACTIVATED)، `GP-TIMELINE-STATUS` (NOT_ACTIVATED)، `LEC-EXECUTION-MONITORING` (BLOCKED)، `LEC-PLAN-COVERAGE` (NOT_ACTIVATED)، `MAT-TOP-ACCESSED` (NOT_ACTIVATED)، `MAT-STUDENT-ENGAGEMENT` (NOT_ACTIVATED)

---

## رئيس قسم/منسق (`dept_head_coordinator`)

### قواعد النطاق
- **المستوى التنظيمي:** `department` — قسم محدد
- **أدوار التطبيق المرتبطة (facet mapping):** department_head
- **القاعدة:** departmentId إجباري من جهة الفاعل؛ رفض cross-department. لا وصول لكلية/جامعة عبر هذه الواجهة.
- **الدوال الخادمية الأساسية:** `getDepartmentReportsSummary`، `applyScheduleDepartmentScope`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/department-reports؛ /admin/reports (جداول فقط عبر SCHEDULE_REPORT_ROLES)

### التقارير المغطاة من الكتالوج (29)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-ACADEMIC-STRUCTURE` | التقارير الأكاديمية (برامج/خطط دراسية/مقررات/تغطية الخطط) | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-SCHEDULE-SUITE` | تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) | مفعّل (LIVE) | university/college/department | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `CLR-REQUESTS-BY-STATUS` | تقرير طلبات المقاصة حسب الحالة | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL (أساس + استكمال) غير مطبقتين + لا route (routes مملوكة لـ Q-13) + صف إعدادات الجهة (singleton) غير مكوَّن |
| `CLR-COURSE-OUTCOMES` | تقرير مقررات المقاصة المقبولة والمرفوضة (وأكثر المقررات قبولاً/رفضاً) | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-EQUIVALENCY-HOURS` | تقرير الساعات المعادلة والمتبقية | غير مفعّل (NOT_ACTIVATED) | case-level/department | لا يوجد (متابعة لاحقة) | لا باني/عرض مخصص للساعات + مسودة SQL غير مطبقة + لا route |
| `CLR-OVERDUE-STOP-POINT` | تقرير طلبات المقاصة المتأخرة وجهة التوقف | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-SUGGESTED-LEVEL` | تقرير المستوى المقترح بعد المعادلة | غير مفعّل (NOT_ACTIVATED) | case-level | لا يوجد (متابعة لاحقة) | قاعدة اشتقاق المستوى المقترح غير معرفة + مسودة SQL غير مطبقة + لا route |
| `CLR-EQUIVALENCY-MINUTES` | محضر المعادلات واعتماداته النهائية | محجوب (BLOCKED) | case-level | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + عرض المحضر للطالب يتطلب قرار منتج |
| `GP-DEPT-STATES` | تقرير حالات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة على قاعدة البيانات (DRAFT ONLY) + لا route |
| `GP-DEPT-ASSIGNMENTS` | تقرير تعيينات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-EVALUATIONS` | تقرير تقييمات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-ARCHIVE` | تقرير أرشيف مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-SUPERVISOR-LOAD` | تقرير عبء الإشراف على مشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا باني/RPC مخصص لعبء الإشراف + مسودة SQL غير مطبقة + لا route |
| `GP-TIMELINE-STATUS` | تقرير المراحل والمواعيد المتأخرة لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا تقرير مراحل/تأخر منشأ + مسودة SQL غير مطبقة + لا route |
| `GP-DEFENSE-OUTCOMES` | تقرير نتائج المناقشات والدرجات | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير نتائج/درجات منشأ + مسودة SQL غير مطبقة + لا route |
| `LEC-EXECUTION-MONITORING` | تقرير متابعة تنفيذ المحاضرات | محجوب (BLOCKED) | department/level/course | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة تعيينات recorders/delegates/monitors غير منشأة + قرار D-15 معلق |
| `LEC-BY-FACULTY` | تقرير تنفيذ المحاضرات حسب عضو هيئة التدريس | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا بُعد faculty في عرض التقرير المسودة + مسودة SQL غير مطبقة + لا route |
| `LEC-WEEKLY-LOG` | سجل التنفيذ الأسبوعي للمحاضرات | قيد التطوير (UNDER_DEVELOPMENT) | course_section | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة التعيينات غير منشأة |
| `LEC-DELEGATE-CONFIRMATIONS` | تقرير تأكيدات المندوبين | قيد التطوير (UNDER_DEVELOPMENT) | level/department | لا يوجد (متابعة لاحقة) | قرار D-15 معلق + مسودة SQL غير مطبقة + لا route |
| `LEC-EXCUSED-MAKEUP` | تقرير المحاضرات المتعذرة والمعوضة (تفصيلي) | غير مفعّل (NOT_ACTIVATED) | department/course | لا يوجد (متابعة لاحقة) | لا سجل تفصيلي منشأ + مسودة SQL غير مطبقة + لا route |
| `LEC-PLAN-COVERAGE` | تقرير تغطية الخطة/المنهاج بالمحاضرات | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | نموذج تغطية المنهاج غير منشأ + مسودة SQL غير مطبقة + لا route |
| `MAT-USAGE-REPORT` | تقرير استخدام المواد التعليمية | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | الجداول/الميزة Live لكن لم يُنشأ أي تقرير/باني/دالة لاستخدام المواد |
| `MAT-COURSE-COVERAGE` | تقرير تغطية المقررات بالمواد التعليمية | المصدر جاهز (SOURCE_READY) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير تغطية منشأ رغم جاهزية الجداول |
| `MAT-PUBLISH-STATUS` | تقرير حالة نشر المواد (منشورة/مسودة) | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير حالة نشر منشأ رغم جاهزية الجداول |
| `MAT-TOP-ACCESSED` | تقرير أكثر المواد وصولاً/تحميلاً | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا عدّادات/أحداث استخدام مثبتة + لا تقرير منشأ |
| `MAT-STALE-ITEMS` | تقرير المواد غير المحدثة | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير مواد قديمة منشأ رغم جاهزية الجداول |
| `MAT-STUDENT-ENGAGEMENT` | تقرير تفاعل الطلاب مع المواد | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا تتبع تفاعل مثبت + لا تقرير منشأ |
| `DEPT-ACADEMIC-LOAD` | لوحة رئيس القسم — العبء الأكاديمي والإسناد | مفعّل (LIVE) | department | /admin/department-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `FAC-TEACHING-LOAD` | العبء التدريسي (ذاتي / قسم / كلية) | مفعّل (LIVE) | self/assigned/department/college | /faculty-portal/reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/department-reports`
- `/faculty-portal/reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `DEPT-ACADEMIC-LOAD`، `FAC-TEACHING-LOAD`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `LEC-WEEKLY-LOG`، `LEC-DELEGATE-CONFIRMATIONS`، `MAT-USAGE-REPORT`، `MAT-COURSE-COVERAGE`، `MAT-PUBLISH-STATUS`، `MAT-STALE-ITEMS`
- **فجوات/حجب متبقية:** `CLR-REQUESTS-BY-STATUS` (BLOCKED)، `CLR-COURSE-OUTCOMES` (BLOCKED)، `CLR-EQUIVALENCY-HOURS` (NOT_ACTIVATED)، `CLR-OVERDUE-STOP-POINT` (BLOCKED)، `CLR-SUGGESTED-LEVEL` (NOT_ACTIVATED)، `CLR-EQUIVALENCY-MINUTES` (BLOCKED)، `GP-DEPT-STATES` (BLOCKED)، `GP-DEPT-ASSIGNMENTS` (BLOCKED)، `GP-DEPT-EVALUATIONS` (BLOCKED)، `GP-DEPT-ARCHIVE` (BLOCKED)، `GP-SUPERVISOR-LOAD` (NOT_ACTIVATED)، `GP-TIMELINE-STATUS` (NOT_ACTIVATED)، `GP-DEFENSE-OUTCOMES` (NOT_ACTIVATED)، `LEC-EXECUTION-MONITORING` (BLOCKED)، `LEC-BY-FACULTY` (NOT_ACTIVATED)، `LEC-EXCUSED-MAKEUP` (NOT_ACTIVATED)، `LEC-PLAN-COVERAGE` (NOT_ACTIVATED)، `MAT-TOP-ACCESSED` (NOT_ACTIVATED)، `MAT-STUDENT-ENGAGEMENT` (NOT_ACTIVATED)

---

## الوحدات التشغيلية (`operational_units_staff`)

### قواعد النطاق
- **المستوى التنظيمي:** `operational_unit` — وحدة تشغيلية مختصة
- **أدوار التطبيق المرتبطة (facet mapping):** registrar، student_affairs، finance_officer، hr_officer
- **القاعدة:** نطاق وحدة تشغيلية؛ الطلبات/الوثائق ضمن اختصاص الوحدة. لا مؤشرات استراتيجية شاملة افتراضياً.
- **الدوال الخادمية الأساسية:** `getOperationalUnitReportsSummary`، `getRequestProcessingTimeReport`، `getDocumentsIssuedReport`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/reports (حسب الحارس)

### التقارير المغطاة من الكتالوج (13)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-STUDENTS-DIRECTORY` | تقرير دليل الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-IMPORT-JOBS` | تقرير مهام الاستيراد وأخطاؤها | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-ACCOUNTS` | تقرير حسابات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-REQUESTS` | تقرير طلبات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `AGG-FINANCE-SUMMARY` | الملخص المالي المجمع | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route (موثق في تقرير PR #192) |
| `ALU-GRADUATE-REGISTRY` | تقرير سجل الخريجين (الملفات) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير سجل منشأ + مسودة SQL غير مطبقة + لا route + تفويض G4 معلق |
| `ALU-COMMUNICATIONS-LOG` | تقرير التواصل مع الخريجين | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا route + قوالب الرسائل (قرار محتوى) معلقة + تفويض G4 معلق |
| `ALU-CANDIDATES-PIPELINE` | تقرير خط مرشحي التخرج | المصدر جاهز (SOURCE_READY) | university/college | لا يوجد (متابعة لاحقة) | المصدر التشغيلي Live لكن التقرير المجمع غير منشأ + تفويض G4 معلق |
| `REQ-PROCESSING-TIME` | متوسط زمن معالجة الطلبات والطلبات المتأخرة | مفعّل (LIVE) | operational_unit / university_student_affairs | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-OVERDUE-SLA` | الطلبات المتجاوزة لمدة الخدمة (SLA افتراضي 14 يوماً) | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-ISSUED` | الوثائق الصادرة بالفترة والنوع | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-SERVICES` | تقرير الوثائق والخدمات المجمع | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | قسم «سيتم تفعيل هذا القسم لاحقاً» في src/routes/admin/reports.tsx؛ مسجّل gap في report-catalog (أولوية منخفضة) |
| `HUB-OPERATIONAL-UNITS` | تقارير الوحدات التشغيلية (طلبات/وثائق) | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-STUDENTS-DIRECTORY`، `ADM-IMPORT-JOBS`، `ADM-STUDENT-ACCOUNTS`، `ADM-STUDENT-REQUESTS`، `REQ-PROCESSING-TIME`، `REQ-OVERDUE-SLA`، `REQ-DOCUMENTS-ISSUED`، `HUB-OPERATIONAL-UNITS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `AGG-FINANCE-SUMMARY`، `ALU-COMMUNICATIONS-LOG`، `ALU-CANDIDATES-PIPELINE`
- **فجوات/حجب متبقية:** `ALU-GRADUATE-REGISTRY` (NOT_ACTIVATED)، `REQ-DOCUMENTS-SERVICES` (NOT_ACTIVATED)

---

## الشؤون الأكاديمية (`academic_affairs`)

### قواعد النطاق
- **المستوى التنظيمي:** `university_academic / college` — نطاق جامعي — الشؤون الأكاديمية
- **أدوار التطبيق المرتبطة (facet mapping):** registrar (facet)، dean (facet)، admin، system_admin
- **القاعدة:** مجال أكاديمي (برامج/خطط/إسناد). لا بيانات شؤون طلاب تشغيلية افتراضياً. عائلات CLR/GP تبقى محجوبة بمسودات SQL.
- **الدوال الخادمية الأساسية:** `getAcademicAffairsReportsSummary`، `getVpAcademicAffairsReportsSummary`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/reports

### التقارير المغطاة من الكتالوج (14)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-ACADEMIC-STRUCTURE` | التقارير الأكاديمية (برامج/خطط دراسية/مقررات/تغطية الخطط) | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-SCHEDULE-SUITE` | تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) | مفعّل (LIVE) | university/college/department | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `CLR-REQUESTS-BY-STATUS` | تقرير طلبات المقاصة حسب الحالة | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL (أساس + استكمال) غير مطبقتين + لا route (routes مملوكة لـ Q-13) + صف إعدادات الجهة (singleton) غير مكوَّن |
| `CLR-COURSE-OUTCOMES` | تقرير مقررات المقاصة المقبولة والمرفوضة (وأكثر المقررات قبولاً/رفضاً) | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-EQUIVALENCY-HOURS` | تقرير الساعات المعادلة والمتبقية | غير مفعّل (NOT_ACTIVATED) | case-level/department | لا يوجد (متابعة لاحقة) | لا باني/عرض مخصص للساعات + مسودة SQL غير مطبقة + لا route |
| `CLR-OVERDUE-STOP-POINT` | تقرير طلبات المقاصة المتأخرة وجهة التوقف | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-SUGGESTED-LEVEL` | تقرير المستوى المقترح بعد المعادلة | غير مفعّل (NOT_ACTIVATED) | case-level | لا يوجد (متابعة لاحقة) | قاعدة اشتقاق المستوى المقترح غير معرفة + مسودة SQL غير مطبقة + لا route |
| `CLR-EQUIVALENCY-MINUTES` | محضر المعادلات واعتماداته النهائية | محجوب (BLOCKED) | case-level | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + عرض المحضر للطالب يتطلب قرار منتج |
| `GP-DEPT-STATES` | تقرير حالات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة على قاعدة البيانات (DRAFT ONLY) + لا route |
| `GP-DEPT-ARCHIVE` | تقرير أرشيف مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `ALU-GRADUATION-DECISIONS` | تقرير قرارات التخرج الرسمية | غير مفعّل (NOT_ACTIVATED) | university/college | لا يوجد (متابعة لاحقة) | لا تقرير قرارات منشأ + مسودة SQL غير مطبقة + تفويض G4 معلق |
| `ALU-CANDIDATES-PIPELINE` | تقرير خط مرشحي التخرج | المصدر جاهز (SOURCE_READY) | university/college | لا يوجد (متابعة لاحقة) | المصدر التشغيلي Live لكن التقرير المجمع غير منشأ + تفويض G4 معلق |
| `MAT-COURSE-COVERAGE` | تقرير تغطية المقررات بالمواد التعليمية | المصدر جاهز (SOURCE_READY) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير تغطية منشأ رغم جاهزية الجداول |
| `HUB-VP-ACADEMIC-AFFAIRS` | مركز تقارير نائب الشؤون الأكاديمية | مفعّل (LIVE) | university_academic | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `HUB-VP-ACADEMIC-AFFAIRS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `ALU-CANDIDATES-PIPELINE`، `MAT-COURSE-COVERAGE`
- **فجوات/حجب متبقية:** `CLR-REQUESTS-BY-STATUS` (BLOCKED)، `CLR-COURSE-OUTCOMES` (BLOCKED)، `CLR-EQUIVALENCY-HOURS` (NOT_ACTIVATED)، `CLR-OVERDUE-STOP-POINT` (BLOCKED)، `CLR-SUGGESTED-LEVEL` (NOT_ACTIVATED)، `CLR-EQUIVALENCY-MINUTES` (BLOCKED)، `GP-DEPT-STATES` (BLOCKED)، `GP-DEPT-ARCHIVE` (BLOCKED)، `ALU-GRADUATION-DECISIONS` (NOT_ACTIVATED)

---

## الخريجون والجودة (`alumni_quality`)

### قواعد النطاق
- **المستوى التنظيمي:** `college / university_academic` — كلية / أكاديمي جامعي (مصادر متاحة فقط)
- **أدوار التطبيق المرتبطة (facet mapping):** admin، system_admin، dean، registrar
- **القاعدة:** يعرض المسار الحي لمرشحي التخرج فقط؛ مؤشرات التوظيف/الاستبيانات تُعلَّم no_access حتى تطبيق DB + حزمة G4.
- **الدوال الخادمية الأساسية:** `getAlumniQualityReportsSummary`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/graduation-candidates (تشغيلي)

### التقارير المغطاة من الكتالوج (10)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `GP-DEPT-EVALUATIONS` | تقرير تقييمات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEFENSE-OUTCOMES` | تقرير نتائج المناقشات والدرجات | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير نتائج/درجات منشأ + مسودة SQL غير مطبقة + لا route |
| `ALU-COHORT-EMPLOYMENT` | تقرير أفواج توظيف الخريجين (برنامج×سنة) | محجوب (BLOCKED) | university/college/program cohorts | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 (RLS/EXECUTE/مصفوفة أدوار) معلقة + قرار D-13 (استمرارية الحساب) NEEDS_USER_INPUT |
| `ALU-SURVEY-AGGREGATES` | تجميعات استبيانات الخريجين (وشيكة الأهلية) | محجوب (BLOCKED) | university | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 + قوالب الرسائل (قرار محتوى) |
| `ALU-GRADUATE-REGISTRY` | تقرير سجل الخريجين (الملفات) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير سجل منشأ + مسودة SQL غير مطبقة + لا route + تفويض G4 معلق |
| `ALU-COMMUNICATIONS-LOG` | تقرير التواصل مع الخريجين | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا route + قوالب الرسائل (قرار محتوى) معلقة + تفويض G4 معلق |
| `ALU-CONSENT-COMPLIANCE` | تقرير موافقات الخريجين (الامتثال) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير امتثال موافقات منشأ + تفويض G4 معلق |
| `ALU-SURVEY-RESPONSE-RATE` | تقرير معدلات الاستجابة لاستبيانات الخريجين | غير مفعّل (NOT_ACTIVATED) | university/program cohorts | لا يوجد (متابعة لاحقة) | يعتمد على تفعيل الاستبيانات (BLOCKED) + تفويض G4 معلق |
| `ALU-QUALITY-INDICATORS` | مؤشرات جودة مخرجات الخريجين | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | يعتمد على تقارير BLOCKED (أفواج/استبيانات) + تفويض G4 معلق |
| `HUB-ALUMNI-QUALITY` | تقارير شؤون الخريجين والجودة (المصادر المتاحة) | مفعّل (LIVE) | college/university_academic | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `HUB-ALUMNI-QUALITY`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `ALU-COMMUNICATIONS-LOG`
- **فجوات/حجب متبقية:** `GP-DEPT-EVALUATIONS` (BLOCKED)، `GP-DEFENSE-OUTCOMES` (NOT_ACTIVATED)، `ALU-COHORT-EMPLOYMENT` (BLOCKED)، `ALU-SURVEY-AGGREGATES` (BLOCKED)، `ALU-GRADUATE-REGISTRY` (NOT_ACTIVATED)، `ALU-CONSENT-COMPLIANCE` (NOT_ACTIVATED)، `ALU-SURVEY-RESPONSE-RATE` (NOT_ACTIVATED)، `ALU-QUALITY-INDICATORS` (NOT_ACTIVATED)

---

## عميد (`dean`)

### قواعد النطاق
- **المستوى التنظيمي:** `college` — الكلية فقط
- **أدوار التطبيق المرتبطة (facet mapping):** dean، admin، system_admin
- **القاعدة:** مؤشرات كلية مجمّعة ومقارنة أقسام دون قوائم شخصية افتراضية. لا تجاوز استراتيجي لرئاسة الجامعة عبر facet العميد وحده.
- **الدوال الخادمية الأساسية:** `getDeanCollegeReportsSummary`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/reports؛ /admin/executive-dashboard؛ /admin/department-reports (عبر صلاحية واسعة)

### التقارير المغطاة من الكتالوج (48)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-STUDENTS-DIRECTORY` | تقرير دليل الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-IMPORT-JOBS` | تقرير مهام الاستيراد وأخطاؤها | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-ACCOUNTS` | تقرير حسابات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-ACADEMIC-STRUCTURE` | التقارير الأكاديمية (برامج/خطط دراسية/مقررات/تغطية الخطط) | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-SCHEDULE-SUITE` | تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) | مفعّل (LIVE) | university/college/department | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-REQUESTS` | تقرير طلبات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `EXEC-CORE-KPIS` | لوحة المؤشرات التنفيذية للقيادة | مفعّل (LIVE) | university/college aggregate | /admin/executive-dashboard | لا شيء — مفعّل ومثبت بالأدلة |
| `AGG-REQUESTS-OVERVIEW` | نظرة مجمعة على طلبات الطلاب (aggregate-only) | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route — التوصيل في /admin/reports متابعة لاحقة موثقة (§2.3/§5.8 من تقرير PR #192) + ربط assertAggregateReportSafe بمسار الانبعاث |
| `AGG-STAFF-ACTIVITY-BY-ROLE` | نشاط المعالجة حسب الدور الوظيفي | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route (موثق في تقرير PR #192) |
| `AGG-FINANCE-SUMMARY` | الملخص المالي المجمع | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route (موثق في تقرير PR #192) |
| `CLR-REQUESTS-BY-STATUS` | تقرير طلبات المقاصة حسب الحالة | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL (أساس + استكمال) غير مطبقتين + لا route (routes مملوكة لـ Q-13) + صف إعدادات الجهة (singleton) غير مكوَّن |
| `CLR-COURSE-OUTCOMES` | تقرير مقررات المقاصة المقبولة والمرفوضة (وأكثر المقررات قبولاً/رفضاً) | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-OVERDUE-STOP-POINT` | تقرير طلبات المقاصة المتأخرة وجهة التوقف | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `GP-DEPT-STATES` | تقرير حالات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة على قاعدة البيانات (DRAFT ONLY) + لا route |
| `GP-DEPT-ASSIGNMENTS` | تقرير تعيينات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-EVALUATIONS` | تقرير تقييمات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-ARCHIVE` | تقرير أرشيف مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-SUPERVISOR-LOAD` | تقرير عبء الإشراف على مشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا باني/RPC مخصص لعبء الإشراف + مسودة SQL غير مطبقة + لا route |
| `GP-TIMELINE-STATUS` | تقرير المراحل والمواعيد المتأخرة لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا تقرير مراحل/تأخر منشأ + مسودة SQL غير مطبقة + لا route |
| `GP-DEFENSE-OUTCOMES` | تقرير نتائج المناقشات والدرجات | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير نتائج/درجات منشأ + مسودة SQL غير مطبقة + لا route |
| `GP-UNIVERSITY-SUMMARY` | الملخص الجامعي لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا عرض جامعي مجمع + مسودة SQL غير مطبقة + لا route |
| `ALU-COHORT-EMPLOYMENT` | تقرير أفواج توظيف الخريجين (برنامج×سنة) | محجوب (BLOCKED) | university/college/program cohorts | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 (RLS/EXECUTE/مصفوفة أدوار) معلقة + قرار D-13 (استمرارية الحساب) NEEDS_USER_INPUT |
| `ALU-SURVEY-AGGREGATES` | تجميعات استبيانات الخريجين (وشيكة الأهلية) | محجوب (BLOCKED) | university | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 + قوالب الرسائل (قرار محتوى) |
| `ALU-GRADUATE-REGISTRY` | تقرير سجل الخريجين (الملفات) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير سجل منشأ + مسودة SQL غير مطبقة + لا route + تفويض G4 معلق |
| `ALU-GRADUATION-DECISIONS` | تقرير قرارات التخرج الرسمية | غير مفعّل (NOT_ACTIVATED) | university/college | لا يوجد (متابعة لاحقة) | لا تقرير قرارات منشأ + مسودة SQL غير مطبقة + تفويض G4 معلق |
| `ALU-CONSENT-COMPLIANCE` | تقرير موافقات الخريجين (الامتثال) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير امتثال موافقات منشأ + تفويض G4 معلق |
| `ALU-CANDIDATES-PIPELINE` | تقرير خط مرشحي التخرج | المصدر جاهز (SOURCE_READY) | university/college | لا يوجد (متابعة لاحقة) | المصدر التشغيلي Live لكن التقرير المجمع غير منشأ + تفويض G4 معلق |
| `ALU-SURVEY-RESPONSE-RATE` | تقرير معدلات الاستجابة لاستبيانات الخريجين | غير مفعّل (NOT_ACTIVATED) | university/program cohorts | لا يوجد (متابعة لاحقة) | يعتمد على تفعيل الاستبيانات (BLOCKED) + تفويض G4 معلق |
| `LEC-EXECUTION-MONITORING` | تقرير متابعة تنفيذ المحاضرات | محجوب (BLOCKED) | department/level/course | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة تعيينات recorders/delegates/monitors غير منشأة + قرار D-15 معلق |
| `LEC-BY-FACULTY` | تقرير تنفيذ المحاضرات حسب عضو هيئة التدريس | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا بُعد faculty في عرض التقرير المسودة + مسودة SQL غير مطبقة + لا route |
| `LEC-WEEKLY-LOG` | سجل التنفيذ الأسبوعي للمحاضرات | قيد التطوير (UNDER_DEVELOPMENT) | course_section | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة التعيينات غير منشأة |
| `LEC-DELEGATE-CONFIRMATIONS` | تقرير تأكيدات المندوبين | قيد التطوير (UNDER_DEVELOPMENT) | level/department | لا يوجد (متابعة لاحقة) | قرار D-15 معلق + مسودة SQL غير مطبقة + لا route |
| `LEC-EXCUSED-MAKEUP` | تقرير المحاضرات المتعذرة والمعوضة (تفصيلي) | غير مفعّل (NOT_ACTIVATED) | department/course | لا يوجد (متابعة لاحقة) | لا سجل تفصيلي منشأ + مسودة SQL غير مطبقة + لا route |
| `LEC-PLAN-COVERAGE` | تقرير تغطية الخطة/المنهاج بالمحاضرات | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | نموذج تغطية المنهاج غير منشأ + مسودة SQL غير مطبقة + لا route |
| `MAT-USAGE-REPORT` | تقرير استخدام المواد التعليمية | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | الجداول/الميزة Live لكن لم يُنشأ أي تقرير/باني/دالة لاستخدام المواد |
| `MAT-COURSE-COVERAGE` | تقرير تغطية المقررات بالمواد التعليمية | المصدر جاهز (SOURCE_READY) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير تغطية منشأ رغم جاهزية الجداول |
| `MAT-PUBLISH-STATUS` | تقرير حالة نشر المواد (منشورة/مسودة) | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير حالة نشر منشأ رغم جاهزية الجداول |
| `MAT-TOP-ACCESSED` | تقرير أكثر المواد وصولاً/تحميلاً | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا عدّادات/أحداث استخدام مثبتة + لا تقرير منشأ |
| `MAT-STALE-ITEMS` | تقرير المواد غير المحدثة | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير مواد قديمة منشأ رغم جاهزية الجداول |
| `MAT-STUDENT-ENGAGEMENT` | تقرير تفاعل الطلاب مع المواد | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا تتبع تفاعل مثبت + لا تقرير منشأ |
| `REQ-PROCESSING-TIME` | متوسط زمن معالجة الطلبات والطلبات المتأخرة | مفعّل (LIVE) | operational_unit / university_student_affairs | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-OVERDUE-SLA` | الطلبات المتجاوزة لمدة الخدمة (SLA افتراضي 14 يوماً) | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-ISSUED` | الوثائق الصادرة بالفترة والنوع | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-SERVICES` | تقرير الوثائق والخدمات المجمع | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | قسم «سيتم تفعيل هذا القسم لاحقاً» في src/routes/admin/reports.tsx؛ مسجّل gap في report-catalog (أولوية منخفضة) |
| `AUD-SECURITY-REPORT` | تقرير التدقيق والأمان المجمع | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | مسجّل gap في report-catalog (audit_security_report، أولوية عالية)؛ يحتاج عقداً مجمعاً |
| `FAC-TEACHING-LOAD` | العبء التدريسي (ذاتي / قسم / كلية) | مفعّل (LIVE) | self/assigned/department/college | /faculty-portal/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `LEGACY-ORPHAN-HANDLERS` | دوال التقارير القديمة اليتيمة (أكاديمي/أداء/قبول/هيئة تدريس/مالي) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | غير موصولة بأي route — يستورد reports.tsx من العائلة القديمة getReportsRequests فقط |
| `HUB-DEAN-COLLEGE` | مركز تقارير الكلية (العميد) | مفعّل (LIVE) | college | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/executive-dashboard`
- `/admin/executive-reports`
- `/faculty-portal/reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-STUDENTS-DIRECTORY`، `ADM-IMPORT-JOBS`، `ADM-STUDENT-ACCOUNTS`، `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `ADM-STUDENT-REQUESTS`، `EXEC-CORE-KPIS`، `REQ-PROCESSING-TIME`، `REQ-OVERDUE-SLA`، `REQ-DOCUMENTS-ISSUED`، `FAC-TEACHING-LOAD`، `HUB-DEAN-COLLEGE`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `AGG-REQUESTS-OVERVIEW`، `AGG-STAFF-ACTIVITY-BY-ROLE`، `AGG-FINANCE-SUMMARY`، `ALU-CANDIDATES-PIPELINE`، `LEC-WEEKLY-LOG`، `LEC-DELEGATE-CONFIRMATIONS`، `MAT-USAGE-REPORT`، `MAT-COURSE-COVERAGE`، `MAT-PUBLISH-STATUS`، `MAT-STALE-ITEMS`
- **فجوات/حجب متبقية:** `CLR-REQUESTS-BY-STATUS` (BLOCKED)، `CLR-COURSE-OUTCOMES` (BLOCKED)، `CLR-OVERDUE-STOP-POINT` (BLOCKED)، `GP-DEPT-STATES` (BLOCKED)، `GP-DEPT-ASSIGNMENTS` (BLOCKED)، `GP-DEPT-EVALUATIONS` (BLOCKED)، `GP-DEPT-ARCHIVE` (BLOCKED)، `GP-SUPERVISOR-LOAD` (NOT_ACTIVATED)، `GP-TIMELINE-STATUS` (NOT_ACTIVATED)، `GP-DEFENSE-OUTCOMES` (NOT_ACTIVATED)، `GP-UNIVERSITY-SUMMARY` (NOT_ACTIVATED)، `ALU-COHORT-EMPLOYMENT` (BLOCKED)، `ALU-SURVEY-AGGREGATES` (BLOCKED)، `ALU-GRADUATE-REGISTRY` (NOT_ACTIVATED)، `ALU-GRADUATION-DECISIONS` (NOT_ACTIVATED)، `ALU-CONSENT-COMPLIANCE` (NOT_ACTIVATED)، `ALU-SURVEY-RESPONSE-RATE` (NOT_ACTIVATED)، `LEC-EXECUTION-MONITORING` (BLOCKED)، `LEC-BY-FACULTY` (NOT_ACTIVATED)، `LEC-EXCUSED-MAKEUP` (NOT_ACTIVATED)، `LEC-PLAN-COVERAGE` (NOT_ACTIVATED)، `MAT-TOP-ACCESSED` (NOT_ACTIVATED)، `MAT-STUDENT-ENGAGEMENT` (NOT_ACTIVATED)، `REQ-DOCUMENTS-SERVICES` (NOT_ACTIVATED)، `AUD-SECURITY-REPORT` (NOT_ACTIVATED)، `LEGACY-ORPHAN-HANDLERS` (NOT_ACTIVATED)

---

## نائب شؤون الطلاب (`vp_student_affairs`)

### قواعد النطاق
- **المستوى التنظيمي:** `university_student_affairs` — نطاق جامعي — شؤون الطلاب
- **أدوار التطبيق المرتبطة (facet mapping):** student_affairs، admin، system_admin
- **القاعدة:** مؤشرات طلابية وخدمية جامعية ضمن مجال شؤون الطلاب فقط — بلا مجال أكاديمي/استراتيجي افتراضي.
- **الدوال الخادمية الأساسية:** `getVpStudentAffairsReportsSummary`، `getRequestProcessingTimeReport`، `getDocumentsIssuedReport`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/reports؛ /admin/executive-dashboard

### التقارير المغطاة من الكتالوج (11)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-STUDENTS-DIRECTORY` | تقرير دليل الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-ACCOUNTS` | تقرير حسابات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-STUDENT-REQUESTS` | تقرير طلبات الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `EXEC-CORE-KPIS` | لوحة المؤشرات التنفيذية للقيادة | مفعّل (LIVE) | university/college aggregate | /admin/executive-dashboard | لا شيء — مفعّل ومثبت بالأدلة |
| `AGG-REQUESTS-OVERVIEW` | نظرة مجمعة على طلبات الطلاب (aggregate-only) | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route — التوصيل في /admin/reports متابعة لاحقة موثقة (§2.3/§5.8 من تقرير PR #192) + ربط assertAggregateReportSafe بمسار الانبعاث |
| `ALU-COMMUNICATIONS-LOG` | تقرير التواصل مع الخريجين | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا route + قوالب الرسائل (قرار محتوى) معلقة + تفويض G4 معلق |
| `REQ-PROCESSING-TIME` | متوسط زمن معالجة الطلبات والطلبات المتأخرة | مفعّل (LIVE) | operational_unit / university_student_affairs | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-OVERDUE-SLA` | الطلبات المتجاوزة لمدة الخدمة (SLA افتراضي 14 يوماً) | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-ISSUED` | الوثائق الصادرة بالفترة والنوع | مفعّل (LIVE) | operational_unit | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `REQ-DOCUMENTS-SERVICES` | تقرير الوثائق والخدمات المجمع | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | قسم «سيتم تفعيل هذا القسم لاحقاً» في src/routes/admin/reports.tsx؛ مسجّل gap في report-catalog (أولوية منخفضة) |
| `HUB-VP-STUDENT-AFFAIRS` | مركز تقارير نائب شؤون الطلاب | مفعّل (LIVE) | university_student_affairs | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/executive-dashboard`
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-STUDENTS-DIRECTORY`، `ADM-STUDENT-ACCOUNTS`، `ADM-STUDENT-REQUESTS`، `EXEC-CORE-KPIS`، `REQ-PROCESSING-TIME`، `REQ-OVERDUE-SLA`، `REQ-DOCUMENTS-ISSUED`، `HUB-VP-STUDENT-AFFAIRS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `AGG-REQUESTS-OVERVIEW`، `ALU-COMMUNICATIONS-LOG`
- **فجوات/حجب متبقية:** `REQ-DOCUMENTS-SERVICES` (NOT_ACTIVATED)

---

## نائب الشؤون الأكاديمية (`vp_academic_affairs`)

### قواعد النطاق
- **المستوى التنظيمي:** `university_academic` — نطاق جامعي — الشؤون الأكاديمية
- **أدوار التطبيق المرتبطة (facet mapping):** dean، registrar، admin، system_admin
- **القاعدة:** برامج/خطط/إسناد/نصاب على مستوى الجامعة — مجال أكاديمي فقط.
- **الدوال الخادمية الأساسية:** `getVpAcademicAffairsReportsSummary`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/reports؛ /admin/executive-dashboard

### التقارير المغطاة من الكتالوج (40)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `ADM-STUDENTS-DIRECTORY` | تقرير دليل الطلاب | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-IMPORT-JOBS` | تقرير مهام الاستيراد وأخطاؤها | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-ACADEMIC-STRUCTURE` | التقارير الأكاديمية (برامج/خطط دراسية/مقررات/تغطية الخطط) | مفعّل (LIVE) | university | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `ADM-SCHEDULE-SUITE` | تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) | مفعّل (LIVE) | university/college/department | /admin/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `EXEC-CORE-KPIS` | لوحة المؤشرات التنفيذية للقيادة | مفعّل (LIVE) | university/college aggregate | /admin/executive-dashboard | لا شيء — مفعّل ومثبت بالأدلة |
| `CLR-REQUESTS-BY-STATUS` | تقرير طلبات المقاصة حسب الحالة | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL (أساس + استكمال) غير مطبقتين + لا route (routes مملوكة لـ Q-13) + صف إعدادات الجهة (singleton) غير مكوَّن |
| `CLR-COURSE-OUTCOMES` | تقرير مقررات المقاصة المقبولة والمرفوضة (وأكثر المقررات قبولاً/رفضاً) | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-EQUIVALENCY-HOURS` | تقرير الساعات المعادلة والمتبقية | غير مفعّل (NOT_ACTIVATED) | case-level/department | لا يوجد (متابعة لاحقة) | لا باني/عرض مخصص للساعات + مسودة SQL غير مطبقة + لا route |
| `CLR-OVERDUE-STOP-POINT` | تقرير طلبات المقاصة المتأخرة وجهة التوقف | محجوب (BLOCKED) | department/university | لا يوجد (متابعة لاحقة) | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-SUGGESTED-LEVEL` | تقرير المستوى المقترح بعد المعادلة | غير مفعّل (NOT_ACTIVATED) | case-level | لا يوجد (متابعة لاحقة) | قاعدة اشتقاق المستوى المقترح غير معرفة + مسودة SQL غير مطبقة + لا route |
| `CLR-EQUIVALENCY-MINUTES` | محضر المعادلات واعتماداته النهائية | محجوب (BLOCKED) | case-level | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + عرض المحضر للطالب يتطلب قرار منتج |
| `GP-DEPT-STATES` | تقرير حالات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة على قاعدة البيانات (DRAFT ONLY) + لا route |
| `GP-DEPT-ASSIGNMENTS` | تقرير تعيينات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-EVALUATIONS` | تقرير تقييمات مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-ARCHIVE` | تقرير أرشيف مشاريع التخرج (قسم) | محجوب (BLOCKED) | department | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route |
| `GP-SUPERVISOR-LOAD` | تقرير عبء الإشراف على مشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا باني/RPC مخصص لعبء الإشراف + مسودة SQL غير مطبقة + لا route |
| `GP-TIMELINE-STATUS` | تقرير المراحل والمواعيد المتأخرة لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا تقرير مراحل/تأخر منشأ + مسودة SQL غير مطبقة + لا route |
| `GP-DEFENSE-OUTCOMES` | تقرير نتائج المناقشات والدرجات | غير مفعّل (NOT_ACTIVATED) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير نتائج/درجات منشأ + مسودة SQL غير مطبقة + لا route |
| `GP-UNIVERSITY-SUMMARY` | الملخص الجامعي لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا عرض جامعي مجمع + مسودة SQL غير مطبقة + لا route |
| `ALU-COHORT-EMPLOYMENT` | تقرير أفواج توظيف الخريجين (برنامج×سنة) | محجوب (BLOCKED) | university/college/program cohorts | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 (RLS/EXECUTE/مصفوفة أدوار) معلقة + قرار D-13 (استمرارية الحساب) NEEDS_USER_INPUT |
| `ALU-SURVEY-AGGREGATES` | تجميعات استبيانات الخريجين (وشيكة الأهلية) | محجوب (BLOCKED) | university | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 + قوالب الرسائل (قرار محتوى) |
| `ALU-GRADUATE-REGISTRY` | تقرير سجل الخريجين (الملفات) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير سجل منشأ + مسودة SQL غير مطبقة + لا route + تفويض G4 معلق |
| `ALU-GRADUATION-DECISIONS` | تقرير قرارات التخرج الرسمية | غير مفعّل (NOT_ACTIVATED) | university/college | لا يوجد (متابعة لاحقة) | لا تقرير قرارات منشأ + مسودة SQL غير مطبقة + تفويض G4 معلق |
| `ALU-CANDIDATES-PIPELINE` | تقرير خط مرشحي التخرج | المصدر جاهز (SOURCE_READY) | university/college | لا يوجد (متابعة لاحقة) | المصدر التشغيلي Live لكن التقرير المجمع غير منشأ + تفويض G4 معلق |
| `ALU-SURVEY-RESPONSE-RATE` | تقرير معدلات الاستجابة لاستبيانات الخريجين | غير مفعّل (NOT_ACTIVATED) | university/program cohorts | لا يوجد (متابعة لاحقة) | يعتمد على تفعيل الاستبيانات (BLOCKED) + تفويض G4 معلق |
| `ALU-QUALITY-INDICATORS` | مؤشرات جودة مخرجات الخريجين | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | يعتمد على تقارير BLOCKED (أفواج/استبيانات) + تفويض G4 معلق |
| `LEC-EXECUTION-MONITORING` | تقرير متابعة تنفيذ المحاضرات | محجوب (BLOCKED) | department/level/course | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + إدارة تعيينات recorders/delegates/monitors غير منشأة + قرار D-15 معلق |
| `LEC-BY-FACULTY` | تقرير تنفيذ المحاضرات حسب عضو هيئة التدريس | غير مفعّل (NOT_ACTIVATED) | department | لا يوجد (متابعة لاحقة) | لا بُعد faculty في عرض التقرير المسودة + مسودة SQL غير مطبقة + لا route |
| `LEC-DELEGATE-CONFIRMATIONS` | تقرير تأكيدات المندوبين | قيد التطوير (UNDER_DEVELOPMENT) | level/department | لا يوجد (متابعة لاحقة) | قرار D-15 معلق + مسودة SQL غير مطبقة + لا route |
| `LEC-EXCUSED-MAKEUP` | تقرير المحاضرات المتعذرة والمعوضة (تفصيلي) | غير مفعّل (NOT_ACTIVATED) | department/course | لا يوجد (متابعة لاحقة) | لا سجل تفصيلي منشأ + مسودة SQL غير مطبقة + لا route |
| `LEC-PLAN-COVERAGE` | تقرير تغطية الخطة/المنهاج بالمحاضرات | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | نموذج تغطية المنهاج غير منشأ + مسودة SQL غير مطبقة + لا route |
| `MAT-USAGE-REPORT` | تقرير استخدام المواد التعليمية | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | الجداول/الميزة Live لكن لم يُنشأ أي تقرير/باني/دالة لاستخدام المواد |
| `MAT-COURSE-COVERAGE` | تقرير تغطية المقررات بالمواد التعليمية | المصدر جاهز (SOURCE_READY) | department/college | لا يوجد (متابعة لاحقة) | لا تقرير تغطية منشأ رغم جاهزية الجداول |
| `MAT-PUBLISH-STATUS` | تقرير حالة نشر المواد (منشورة/مسودة) | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير حالة نشر منشأ رغم جاهزية الجداول |
| `MAT-TOP-ACCESSED` | تقرير أكثر المواد وصولاً/تحميلاً | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا عدّادات/أحداث استخدام مثبتة + لا تقرير منشأ |
| `MAT-STALE-ITEMS` | تقرير المواد غير المحدثة | المصدر جاهز (SOURCE_READY) | course/department | لا يوجد (متابعة لاحقة) | لا تقرير مواد قديمة منشأ رغم جاهزية الجداول |
| `MAT-STUDENT-ENGAGEMENT` | تقرير تفاعل الطلاب مع المواد | غير مفعّل (NOT_ACTIVATED) | course/department | لا يوجد (متابعة لاحقة) | لا تتبع تفاعل مثبت + لا تقرير منشأ |
| `FAC-TEACHING-LOAD` | العبء التدريسي (ذاتي / قسم / كلية) | مفعّل (LIVE) | self/assigned/department/college | /faculty-portal/reports | لا شيء — مفعّل ومثبت بالأدلة |
| `LEGACY-ORPHAN-HANDLERS` | دوال التقارير القديمة اليتيمة (أكاديمي/أداء/قبول/هيئة تدريس/مالي) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | غير موصولة بأي route — يستورد reports.tsx من العائلة القديمة getReportsRequests فقط |
| `HUB-VP-ACADEMIC-AFFAIRS` | مركز تقارير نائب الشؤون الأكاديمية | مفعّل (LIVE) | university_academic | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/reports`
- `/admin/executive-dashboard`
- `/faculty-portal/reports`
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `ADM-STUDENTS-DIRECTORY`، `ADM-IMPORT-JOBS`، `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `EXEC-CORE-KPIS`، `FAC-TEACHING-LOAD`، `HUB-VP-ACADEMIC-AFFAIRS`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `ALU-CANDIDATES-PIPELINE`، `LEC-DELEGATE-CONFIRMATIONS`، `MAT-USAGE-REPORT`، `MAT-COURSE-COVERAGE`، `MAT-PUBLISH-STATUS`، `MAT-STALE-ITEMS`
- **فجوات/حجب متبقية:** `CLR-REQUESTS-BY-STATUS` (BLOCKED)، `CLR-COURSE-OUTCOMES` (BLOCKED)، `CLR-EQUIVALENCY-HOURS` (NOT_ACTIVATED)، `CLR-OVERDUE-STOP-POINT` (BLOCKED)، `CLR-SUGGESTED-LEVEL` (NOT_ACTIVATED)، `CLR-EQUIVALENCY-MINUTES` (BLOCKED)، `GP-DEPT-STATES` (BLOCKED)، `GP-DEPT-ASSIGNMENTS` (BLOCKED)، `GP-DEPT-EVALUATIONS` (BLOCKED)، `GP-DEPT-ARCHIVE` (BLOCKED)، `GP-SUPERVISOR-LOAD` (NOT_ACTIVATED)، `GP-TIMELINE-STATUS` (NOT_ACTIVATED)، `GP-DEFENSE-OUTCOMES` (NOT_ACTIVATED)، `GP-UNIVERSITY-SUMMARY` (NOT_ACTIVATED)، `ALU-COHORT-EMPLOYMENT` (BLOCKED)، `ALU-SURVEY-AGGREGATES` (BLOCKED)، `ALU-GRADUATE-REGISTRY` (NOT_ACTIVATED)، `ALU-GRADUATION-DECISIONS` (NOT_ACTIVATED)، `ALU-SURVEY-RESPONSE-RATE` (NOT_ACTIVATED)، `ALU-QUALITY-INDICATORS` (NOT_ACTIVATED)، `LEC-EXECUTION-MONITORING` (BLOCKED)، `LEC-BY-FACULTY` (NOT_ACTIVATED)، `LEC-EXCUSED-MAKEUP` (NOT_ACTIVATED)، `LEC-PLAN-COVERAGE` (NOT_ACTIVATED)، `MAT-TOP-ACCESSED` (NOT_ACTIVATED)، `MAT-STUDENT-ENGAGEMENT` (NOT_ACTIVATED)، `LEGACY-ORPHAN-HANDLERS` (NOT_ACTIVATED)

---

## رئاسة الجامعة/المجلس (`university_presidency_council`)

### قواعد النطاق
- **المستوى التنظيمي:** `university_strategic` — مؤشرات استراتيجية مجمعة
- **أدوار التطبيق المرتبطة (facet mapping):** admin، system_admin، dean، registrar
- **القاعدة:** عرض استراتيجي مجمّع بلا PII افتراضياً. fail-closed على القوائم الشخصية وأداء الفرد (PER-PERSON محجوب حوكميًا).
- **الدوال الخادمية الأساسية:** `getUniversityStrategicReportsSummary`، `getExecutiveCoreKpis`
- **مسارات الواجهة المرتبطة بالمستفيد:** /admin/executive-reports؛ /admin/executive-dashboard

### التقارير المغطاة من الكتالوج (14)

| report_code | name_ar | status | data_scope | route | blocker / فجوة |
|---|---|---|---|---|---|
| `EXEC-CORE-KPIS` | لوحة المؤشرات التنفيذية للقيادة | مفعّل (LIVE) | university/college aggregate | /admin/executive-dashboard | لا شيء — مفعّل ومثبت بالأدلة |
| `AGG-REQUESTS-OVERVIEW` | نظرة مجمعة على طلبات الطلاب (aggregate-only) | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route — التوصيل في /admin/reports متابعة لاحقة موثقة (§2.3/§5.8 من تقرير PR #192) + ربط assertAggregateReportSafe بمسار الانبعاث |
| `AGG-STAFF-ACTIVITY-BY-ROLE` | نشاط المعالجة حسب الدور الوظيفي | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route (موثق في تقرير PR #192) |
| `AGG-FINANCE-SUMMARY` | الملخص المالي المجمع | قيد التطوير (UNDER_DEVELOPMENT) | university | لا يوجد (متابعة لاحقة) | لا server function ولا route (موثق في تقرير PR #192) |
| `GP-UNIVERSITY-SUMMARY` | الملخص الجامعي لمشاريع التخرج | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا عرض جامعي مجمع + مسودة SQL غير مطبقة + لا route |
| `ALU-COHORT-EMPLOYMENT` | تقرير أفواج توظيف الخريجين (برنامج×سنة) | محجوب (BLOCKED) | university/college/program cohorts | لا يوجد (متابعة لاحقة) | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 (RLS/EXECUTE/مصفوفة أدوار) معلقة + قرار D-13 (استمرارية الحساب) NEEDS_USER_INPUT |
| `ALU-GRADUATION-DECISIONS` | تقرير قرارات التخرج الرسمية | غير مفعّل (NOT_ACTIVATED) | university/college | لا يوجد (متابعة لاحقة) | لا تقرير قرارات منشأ + مسودة SQL غير مطبقة + تفويض G4 معلق |
| `ALU-CONSENT-COMPLIANCE` | تقرير موافقات الخريجين (الامتثال) | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | لا تقرير امتثال موافقات منشأ + تفويض G4 معلق |
| `ALU-QUALITY-INDICATORS` | مؤشرات جودة مخرجات الخريجين | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | يعتمد على تقارير BLOCKED (أفواج/استبيانات) + تفويض G4 معلق |
| `REQ-PROCESSING-TIME` | متوسط زمن معالجة الطلبات والطلبات المتأخرة | مفعّل (LIVE) | operational_unit / university_student_affairs | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |
| `AUD-SECURITY-REPORT` | تقرير التدقيق والأمان المجمع | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | مسجّل gap في report-catalog (audit_security_report، أولوية عالية)؛ يحتاج عقداً مجمعاً |
| `AUD-ROLE-CHANGES` | تقرير تغييرات الأدوار | غير مفعّل (NOT_ACTIVATED) | university | لا يوجد (متابعة لاحقة) | مسجّل gap في report-catalog (role_changes_report) |
| `PER-PERSON-STAFF-PERFORMANCE` | أداء الموظفين على مستوى الفرد | محجوب (BLOCKED) | university | لا يوجد (متابعة لاحقة) | قرار حوكمة غائب — مُستبعد تصميمياً ومسجّل gap في report-catalog (per_person_staff_performance) |
| `HUB-UNIVERSITY-STRATEGIC` | التقارير والمؤشرات الاستراتيجية | مفعّل (LIVE) | university_strategic | /admin/executive-reports | لا شيء — مفعّل ومثبت بالأدلة |

### المسارات الفعلية (من مدخلات ذات route غير null)
- `/admin/executive-dashboard`
- `/admin/executive-reports`

### الملخص التشغيلي
- **LIVE مفتوح:** `EXEC-CORE-KPIS`، `REQ-PROCESSING-TIME`، `HUB-UNIVERSITY-STRATEGIC`
- **قيد التجهيز (SOURCE_READY / UNDER_DEVELOPMENT):** `AGG-REQUESTS-OVERVIEW`، `AGG-STAFF-ACTIVITY-BY-ROLE`، `AGG-FINANCE-SUMMARY`
- **فجوات/حجب متبقية:** `GP-UNIVERSITY-SUMMARY` (NOT_ACTIVATED)، `ALU-COHORT-EMPLOYMENT` (BLOCKED)، `ALU-GRADUATION-DECISIONS` (NOT_ACTIVATED)، `ALU-CONSENT-COMPLIANCE` (NOT_ACTIVATED)، `ALU-QUALITY-INDICATORS` (NOT_ACTIVATED)، `AUD-SECURITY-REPORT` (NOT_ACTIVATED)، `AUD-ROLE-CHANGES` (NOT_ACTIVATED)، `PER-PERSON-STAFF-PERFORMANCE` (BLOCKED)

---

## ملاحظات حوكمة مشتركة
- الرؤية fail-closed عبر `canSeeReport` + `required_role` الحرفي؛ رموز `pending:*` / `assignment:*` / `department_assignment:*` لا تطابق أحداً.
- الحالات `BLOCKED` و`NOT_ACTIVATED` مخفية عن بطاقات المستخدم النهائي افتراضياً (`HIDDEN_CATALOG_STATUSES`).
- الحالات `SOURCE_READY` و`UNDER_DEVELOPMENT` تظهر كـ «قيد التجهيز» دون ادعاء بيانات جاهزة (`PREPARATION_REPORT_STATUSES`).
- لا ترقية LIVE خارج ما يثبته الكتالوج الحالي.
