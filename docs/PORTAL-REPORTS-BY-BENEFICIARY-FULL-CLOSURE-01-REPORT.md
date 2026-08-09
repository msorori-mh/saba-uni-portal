# PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01 — تقرير الإغلاق

| الحقل | القيمة |
|---|---|
| **المهمة** | `PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01` |
| **الفرع** | `feat/reports-by-beneficiary-full-closure-01` |
| **BASE_SHA** | `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f` |
| **FINAL_SHA** | `40874728` (tip; implementation `faa86fa38fb296a930c1cead36025af6baa186e1`) |
| **PR** | https://github.com/msorori-mh/saba-uni-portal/pull/318 |
| **القرار** | `PASS_WITH_BLOCKED_DEPENDENCIES_PORTAL_REPORTS_BY_BENEFICIARY_01` |

---

## 1) الملخص التنفيذي

أُغلقت شريحة تقارير البوابة حسب المستفيد على مستوى المصدر (SOURCE-ONLY): كتالوج مرجعي موحّد (63 مدخلاً)، مصفوفة تتبع مولّدة منه، مصفوفة تغطية للمستفيدين العشرة، مراكز/مسارات تقارير للمستفيدين، ودوال خادمية محروسة بالنطاق. القرار النهائي **PASS مع تبعيات محجوبة** لأن مسودات SQL لعائلات GP / ALU / LEC / CLR ما زالت غير مطبّقة — ولا يُسمح في هذه المهمة بـ migration apply أو كتابة إنتاج أو deploy/publish.

**CODE IS TRUTH:** الأعداد والحالات أدناه مأخوذة من `src/lib/reports/catalog/entries.ts` دون اختراع ترقية LIVE.

## 2) أعداد الكتالوج (من entries.ts)

| الحالة | الرمز | العدد |
|---|---|---|
| مفعّل | `LIVE` | **20** |
| موصول — ينقصه اختبار | `DATA_DEPENDENT` | **0** |
| المصدر جاهز | `SOURCE_READY` | **5** |
| قيد التطوير | `UNDER_DEVELOPMENT` | **6** |
| غير مفعّل | `NOT_ACTIVATED` | **20** |
| محجوب | `BLOCKED` | **12** |
| **المجموع** | | **63** |

### LIVE الحالي (20)
- `ADM-STUDENTS-DIRECTORY` — تقرير دليل الطلاب → `/admin/reports`
- `ADM-IMPORT-JOBS` — تقرير مهام الاستيراد وأخطاؤها → `/admin/reports`
- `ADM-STUDENT-ACCOUNTS` — تقرير حسابات الطلاب → `/admin/reports`
- `ADM-ACADEMIC-STRUCTURE` — التقارير الأكاديمية (برامج/خطط دراسية/مقررات/تغطية الخطط) → `/admin/reports`
- `ADM-SCHEDULE-SUITE` — تقارير الجداول (إسناد/غير مُسندة/مجموعات/جدول زمني/قاعات/عبء هيئة التدريس/تعارض) → `/admin/reports`
- `ADM-STUDENT-REQUESTS` — تقرير طلبات الطلاب → `/admin/reports`
- `EXEC-CORE-KPIS` — لوحة المؤشرات التنفيذية للقيادة → `/admin/executive-dashboard`
- `REQ-PROCESSING-TIME` — متوسط زمن معالجة الطلبات والطلبات المتأخرة → `/admin/executive-reports`
- `REQ-OVERDUE-SLA` — الطلبات المتجاوزة لمدة الخدمة (SLA افتراضي 14 يوماً) → `/admin/executive-reports`
- `REQ-DOCUMENTS-ISSUED` — الوثائق الصادرة بالفترة والنوع → `/admin/executive-reports`
- `DEPT-ACADEMIC-LOAD` — لوحة رئيس القسم — العبء الأكاديمي والإسناد → `/admin/department-reports`
- `FAC-TEACHING-LOAD` — العبء التدريسي (ذاتي / قسم / كلية) → `/faculty-portal/reports`
- `STU-SELF-SERVICE-VIEWS` — عروض الطالب الذاتية ومركز تقاريري → `/student/reports`
- `HUB-FACULTY-REPORTS` — مركز تقاريري لعضو هيئة التدريس → `/faculty-portal/reports`
- `HUB-DEAN-COLLEGE` — مركز تقارير الكلية (العميد) → `/admin/executive-reports`
- `HUB-VP-STUDENT-AFFAIRS` — مركز تقارير نائب شؤون الطلاب → `/admin/executive-reports`
- `HUB-VP-ACADEMIC-AFFAIRS` — مركز تقارير نائب الشؤون الأكاديمية → `/admin/executive-reports`
- `HUB-UNIVERSITY-STRATEGIC` — التقارير والمؤشرات الاستراتيجية → `/admin/executive-reports`
- `HUB-OPERATIONAL-UNITS` — تقارير الوحدات التشغيلية (طلبات/وثائق) → `/admin/executive-reports`
- `HUB-ALUMNI-QUALITY` — تقارير شؤون الخريجين والجودة (المصادر المتاحة) → `/admin/executive-reports`

## 3) مصفوفة التفويض (ملخص)

- **المستفيدون (10 facets):** `student`, `faculty_supervisor`, `dept_head_coordinator`, `operational_units_staff`, `academic_affairs`, `alumni_quality`, `dean`, `vp_student_affairs`, `vp_academic_affairs`, `university_presidency_council`.
- **تعيين الدور→المستفيد:** `src/lib/reports/scope/beneficiary-roles.ts` (`ROLE_TO_BENEFICIARIES`) — اتحاد صريح للأدوار المزدوجة، بلا تجاوز عام.
- **حل النطاق الخادمي:** `resolve-scope.ts` / `resolve-scope.server.ts` — مستويات: self / assigned / department / college / university_student_affairs / university_academic / university_strategic / operational_unit.
- **الرؤية:** `canSeeReport` fail-closed؛ مطابقة حرفية لـ `required_role`؛ رموز `pending:*` لا تطابق أحداً.
- **العزل السلبي:** اختبارات `tests/reports-beneficiaries/cross-scope-negative.test.ts` ترفض التسريب عبر الأقسام/الوحدات.
- **لا bypass** لأدمن/مسجّل/عميد خارج ما يمنحه الدور+النطاق صراحة.

| المستفيد | مستوى النطاق | LIVE | محجوب/غير مفعّل (فجوات) |
|---|---|---|---|
| `student` | `self` | 1 | 2 |
| `faculty_supervisor` | `assigned / self` | 3 | 6 |
| `dept_head_coordinator` | `department` | 4 | 19 |
| `operational_units_staff` | `operational_unit` | 8 | 2 |
| `academic_affairs` | `university_academic / college` | 3 | 9 |
| `alumni_quality` | `college / university_academic` | 1 | 8 |
| `dean` | `college` | 12 | 26 |
| `vp_student_affairs` | `university_student_affairs` | 8 | 1 |
| `vp_academic_affairs` | `university_academic` | 7 | 27 |
| `university_presidency_council` | `university_strategic` | 3 | 8 |

## 4) المسارات (routes)

المسارات الظاهرة في الكتالوج كـ route غير null:
- `/admin/department-reports` ← `DEPT-ACADEMIC-LOAD`
- `/admin/executive-dashboard` ← `EXEC-CORE-KPIS`
- `/admin/executive-reports` ← `REQ-PROCESSING-TIME`، `REQ-OVERDUE-SLA`، `REQ-DOCUMENTS-ISSUED`، `HUB-DEAN-COLLEGE`، `HUB-VP-STUDENT-AFFAIRS`، `HUB-VP-ACADEMIC-AFFAIRS`، `HUB-UNIVERSITY-STRATEGIC`، `HUB-OPERATIONAL-UNITS`، `HUB-ALUMNI-QUALITY`
- `/admin/reports` ← `ADM-STUDENTS-DIRECTORY`، `ADM-IMPORT-JOBS`، `ADM-STUDENT-ACCOUNTS`، `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `ADM-STUDENT-REQUESTS`
- `/faculty-portal/reports` ← `FAC-TEACHING-LOAD`، `HUB-FACULTY-REPORTS`
- `/student/reports` ← `STU-SELF-SERVICE-VIEWS`

مسارات داعمة خارج عمود route لبعض المدخلات (تشغيلي/مصدر):
- `/admin/graduation-candidates` — مصدر تشغيلي لـ `ALU-CANDIDATES-PIPELINE` / `HUB-ALUMNI-QUALITY`
- `/faculty-portal/materials` و `/student/materials` — مصدر Live لعائلة MAT دون تقرير مفعّل بعد

## 5) الدوال الخادمية (server functions)

### `src/lib/beneficiary-reports.functions.ts`
- `getMyReportScope`
- `getVisibleCatalogForViewer`
- `getStudentSelfReportsSummary`
- `getFacultySelfReportsSummary`
- `getDepartmentReportsSummary`
- `getDeanCollegeReportsSummary`
- `getVpStudentAffairsReportsSummary`
- `getVpAcademicAffairsReportsSummary`
- `getUniversityStrategicReportsSummary`
- `getOperationalUnitReportsSummary`
- `getAcademicAffairsReportsSummary`
- `getAlumniQualityReportsSummary`
- `getMaterialsCoverageReport`
- `getRequestProcessingTimeReport`
- `getDocumentsIssuedReport`

### `src/lib/admin-reports.functions.ts` (أقسام `/admin/reports` الستة LIVE)
- دليل الطلاب / الاستيراد / الحسابات / الأكاديمي / الجداول / طلبات الطلاب — محروسة بـ `assertStudentRead` / `IMPORT_REPORT_ROLES` / `assertReportsAccess` / `SCHEDULE_REPORT_ROLES`.

### أخرى
- `src/lib/executive-dashboard.functions.ts` — `getExecutiveCoreKpis` / `getExecutiveScope` (`EXEC-CORE-KPIS`)
- بناة مجمّعة بلا server fn إنتاجي بعد: `request-reports.ts` / `staff-activity-reports.ts` / `finance-reports.ts` (`UNDER_DEVELOPMENT`)

## 6) التصدير (exports)

- **screen:** القناة الافتراضية لمعظم LIVE والمجمّعات.
- **excel/CSV:** مدخلات تدعم excel في الكتالوج (9): `ADM-STUDENTS-DIRECTORY`، `ADM-IMPORT-JOBS`، `ADM-STUDENT-ACCOUNTS`، `ADM-ACADEMIC-STRUCTURE`، `ADM-SCHEDULE-SUITE`، `ADM-STUDENT-REQUESTS`، `REQ-PROCESSING-TIME`، `REQ-DOCUMENTS-ISSUED`، `HUB-OPERATIONAL-UNITS`.
- **pdf:** `CLR-EQUIVALENCY-MINUTES` فقط (حالة BLOCKED — لا سطح LIVE حالياً).
- مسار التصدير الإداري يعتمد صفوف الشاشة المحروسة أصلاً (`src/lib/reports/export.ts`) — لا مسار تصدير منفصل يتجاوز الحارس.
- اختبارات النطاق/التصدير: `tests/reports-beneficiaries/exports-scope.test.ts` + `tests/admin-reports/privacy-and-export-scope.test.ts`.

## 7) التقارير المحجوبة (BLOCKED) مع الأسباب

| report_code | السبب (blocker من الكتالوج) |
|---|---|
| `CLR-REQUESTS-BY-STATUS` | مسودتا SQL (أساس + استكمال) غير مطبقتين + لا route (routes مملوكة لـ Q-13) + صف إعدادات الجهة (singleton) غير مكوَّن |
| `CLR-COURSE-OUTCOMES` | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-OVERDUE-STOP-POINT` | مسودتا SQL غير مطبقتين + لا route (routes مملوكة لـ Q-13) |
| `CLR-EQUIVALENCY-MINUTES` | مسودة SQL غير مطبقة + لا route + عرض المحضر للطالب يتطلب قرار منتج |
| `GP-DEPT-STATES` | مسودة SQL غير مطبقة على قاعدة البيانات (DRAFT ONLY) + لا route |
| `GP-DEPT-ASSIGNMENTS` | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-EVALUATIONS` | مسودة SQL غير مطبقة + لا route |
| `GP-DEPT-ARCHIVE` | مسودة SQL غير مطبقة + لا route |
| `ALU-COHORT-EMPLOYMENT` | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 (RLS/EXECUTE/مصفوفة أدوار) معلقة + قرار D-13 (استمرارية الحساب) NEEDS_USER_INPUT |
| `ALU-SURVEY-AGGREGATES` | مسودة SQL غير مطبقة + لا route + حزمة تفويض G4 + قوالب الرسائل (قرار محتوى) |
| `LEC-EXECUTION-MONITORING` | مسودة SQL غير مطبقة + لا route + إدارة تعيينات recorders/delegates/monitors غير منشأة + قرار D-15 معلق |
| `PER-PERSON-STAFF-PERFORMANCE` | قرار حوكمة غائب — مُستبعد تصميمياً ومسجّل gap في report-catalog (per_person_staff_performance) |

**الخلاصة:** الحجب الصلب المتبقي يتركّز في مسودات SQL غير المطبّقة لـ **GP / ALU / LEC / CLR** + حزمة تفويض G4 + قرار حوكمة أداء الفرد (`PER-PERSON-STAFF-PERFORMANCE`).

## 8) تغييرات قاعدة البيانات المطلوبة لاحقاً (خارج هذه المهمة)

| المسودة / الحزمة | العائلة المتأثرة | ملاحظة |
|---|---|---|
| `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` | GP-* | DRAFT-ONLY — RPCs تقارير القسم |
| `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` + حزمة G4 | ALU-* | DRAFT-ONLY + تفويض RLS/EXECUTE معلّق |
| `docs/drafts/20260722120000_lecture_execution_mvp_01.draft.sql` | LEC-* | DRAFT-ONLY + تعيينات monitors/delegates |
| `docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql` + أساس المقاصة | CLR-* | DRAFT-ONLY + routes Q-13 + إعدادات الجهة |
| قرارات محتوى/حوكمة | ALU-COMMUNICATIONS / D-13 / D-15 / PER-PERSON | ليست SQL وحدها — قرارات منتج |

**في هذه المهمة:** لم يُنقل أي ملف إلى `supabase/migrations/` ولم يُطبَّق شيء.

## 9) قيود البرنامج (compliance)

| القيد | الحالة |
|---|---|
| `ZERO_PRODUCTION_WRITE` | ✅ ملتزَم |
| `ZERO_MIGRATION_APPLY` | ✅ ملتزَم |
| `NO_DEPLOY` | ✅ ملتزَم |
| `NO_PUBLISH` | ✅ ملتزَم |
| SOURCE-ONLY | ✅ ملتزَم |
| لا عمل على main مباشرة | ✅ فرع `feat/reports-by-beneficiary-full-closure-01` |

## 10) الوثائق المسلّمة

| الملف | الغرض |
|---|---|
| `docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md` | مصفوفة تتبع — كل report_code مرة واحدة |
| `docs/PORTAL-REPORTS-BENEFICIARY-COVERAGE-MATRIX-01.md` | تغطية المستفيدين العشرة + نطاق/مسارات/فجوات |
| `docs/PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01-REPORT.md` | تقرير الإغلاق هذا |

## 11) الافتراضات

- الكتالوج في `entries.ts` على رأس الفرع هو مصدر الحقيقة الوحيد للحالات والأعداد.
- ترقية `EXEC-CORE-KPIS` وHUB-* وREQ-* إلى LIVE تعكس الاختبارات/الربط الحاليين في الفرع؛ لا اختراع LIVE إضافي.
- `FINAL_SHA` ورابط PR مثبتان في رأس التقرير (PR #318).

## 12) المخاطر

- بقاء عائلات GP/ALU/LEC/CLR بلا SQL مطبّق يمنع أي ادعاء جاهزية تشغيلية لها.
- رموز التفويض المعلّقة تُخفي التقارير fail-closed — قد يُفسَّر غيابها كخلل منتج إن لم تُوثَّق.
- دوال LEGACY اليتيمة ما زالت في الشجرة (`NOT_ACTIVATED`) ومرشحة لتنظيف لاحق.

## 13) العوائق

- مسودات SQL غير مطبّقة (GP/ALU/LEC/CLR).
- حزمة تفويض G4 + قرارات D-13/D-15/حوكمة أداء الفرد.
- توصيل بناة PR #192 بـ server functions + routes.

## 14) أثر الإنتاج

**صفر.** لا كتابة إنتاج، لا migration apply، لا deploy، لا publish. التغييرات مصدرية/توثيقية واختبارات على الفرع فقط.

## 15) القرار

```
PASS_WITH_BLOCKED_DEPENDENCIES_PORTAL_REPORTS_BY_BENEFICIARY_01
```

السبب: إغلاق المصدر لمسارات المستفيدين والكتالوج والاختبارات متحقق، مع بقاء تبعيات DB/تفويض صلبة (مسودات GP/ALU/LEC/CLR غير مطبّقة) تمنع الإغلاق الكامل للتشغيل.
