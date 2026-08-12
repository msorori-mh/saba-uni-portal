# PORTAL-LECTURE-EXECUTION-AND-ACADEMIC-MONITORING-FINAL-OPERATIONAL-CLOSURE-01

تاريخ التنفيذ: 2026-08-12 (UTC)
النمط: تدقيق الإنتاج المنشور → تحقق → إصلاح الفجوات الحقيقية فقط → توثيق.

## A — تحقق وقت التشغيل المنشور

| البند | القيمة |
| --- | --- |
| SOURCE_SHA (قبل هذه الجولة) | `eec6fd43` |
| DEPLOYED_SHA (build-sha.generated.json) | `13f2cbcf` |
| DB_MIGRATION_TIP | ترحيلا هذه الجولة: تشديد تسجيل التنفيذ + `cdp_delivery_monitoring` |

مؤكَّد في الإنتاج (قراءة كتالوج قاعدة البيانات):
- الجداول: `course_delivery_plans`, `course_delivery_plan_sessions`, `course_session_executions`.
- الدوال: `cdp_save_plan`, `cdp_publish_plan`, `cdp_get_section_plan`, `cdp_record_session_execution`,
  `cdp_clear_session_execution`, `cdp_list_my_faculty_sections`, `cdp_list_student_sections`,
  `cdp_admin_delivery_overview`، ومساعدات التفويض `cdp_can_manage_section`, `cdp_can_view_section`,
  `cdp_is_section_faculty`، ومحفّز التحقق `cdp_validate_execution`.
- المسارات المنشورة: `/faculty-portal/lecture-execution`, `/faculty-portal/lecture-execution/$sectionId`,
  `/admin/lecture-execution`, وخطة المحاضرات داخل `/student/materials/$sectionId`.

`LECTURE_EXECUTION_DEPLOYED_RUNTIME = PASS`

## B — تقاعد عقد المندوب

حُذف من المصدر نهائياً:
- `src/components/lecture-execution/DelegateConfirmationCard.tsx`
- `src/components/lecture-execution/FacultyExecutionLogCard.tsx`
- `src/components/lecture-execution/ExecutionMonitoringReport.tsx`
- `src/lib/lecture-execution/domain.ts` (كان يحمل `awaiting_delegate` و`delegate_confirmation_enabled`)
- `tests/lecture-execution/` (اختبارات المسودة القديمة)
- مدخل الكتالوج `LEC-DELEGATE-CONFIRMATIONS`

لا يوجد في وقت التشغيل أي RPC أو مسار أو تنقّل أو مدخل كتالوج LIVE يعتمد على تأكيد المندوب، ولم يُنشأ أي ممثل اختبار مندوب.
حارس آلي جديد: `tests/lecture-execution/delivery-monitoring-contract.test.ts` يفشل إذا عادت هذه الملفات أو ظهرت كلمة «مندوب» في الكتالوج.

`STUDENT_DELEGATE_CONFIRMATION = NONE` — `LECTURE_EXECUTION_NO_DELEGATE_CONTRACT = PASS`

## C — تفويض عضو هيئة التدريس (فجوة حقيقية أُصلحت)

العقد قبل الإصلاح: `cdp_record_session_execution` و`cdp_clear_session_execution` كانتا تستخدمان
`cdp_can_manage_section`، أي تسمحان لرئيس القسم وadmin/system_admin بتسجيل التنفيذ نيابة عن العضو —
مخالف لبند المالك «عضو هيئة التدريس وحده يؤكد التنفيذ».

الإصلاح المطبق (ترحيل إنتاجي): كلا الدالتين تتحققان الآن من `cdp_is_section_faculty(uid, section)` حصراً.

| الممثل | تسجيل/مسح التنفيذ | تحرير/نشر الخطة |
| --- | --- | --- |
| عضو هيئة التدريس المسند للمجموعة | ALLOW | ALLOW |
| عضو هيئة تدريس آخر (أي مجموعة غير مسندة له) | DENY (`CDP_NOT_AUTHORIZED`) | DENY |
| عضو هيئة تدريس من نفس القسم لمجموعة أخرى | DENY | DENY |
| رئيس القسم (بصفته فقط) | DENY | ALLOW (عقد التأليف الأكاديمي — موثّق) |
| admin / system_admin (بصفته فقط) | DENY | ALLOW (fallback إداري — موثّق) |
| طالب | DENY | DENY |
| غير مسجّل الدخول | DENY (`CDP_UNAUTHENTICATED`) | DENY |

التفويض مركزي داخل الدوال SECURITY DEFINER، وليس في الواجهة.

`LECTURE_EXECUTION_FACULTY_ONLY_CONFIRMATION = PASS`
`LECTURE_EXECUTION_FACULTY_AUTHZ_MATRIX = PASS (بالمراجعة التعاقدية للمصدر المطبق؛ مصفوفة RPC حية بممثلين متعددين لم تُعَد في هذه الجولة — انظر J)`

## D — خطة المحاضرات

العقد الفعلي كما هو مطبق:
- إنشاء/تعديل مسودة عبر `cdp_save_plan`؛ `planned_session_count` معامل إلزامي بين 1 و60 (لا رقم 14 مثبّت في أي مكان — حارس آلي يمنع ذلك).
- الجلسات مرقمة 1..N تلقائياً مع عنوان افتراضي قابل للتعديل، والمواضيع اختيارية.
- `cdp_publish_plan` يرفض: عنواناً فارغاً (`CDP_INCOMPLETE_PLAN_TITLES`)، وعدم تطابق عدد الجلسات (`CDP_SESSION_COUNT_MISMATCH`)، والمجموعة غير المصرّح بها.
- تقليص العدد تحت آخر جلسة مُسجَّل تنفيذها مرفوض (`CDP_CANNOT_SHRINK_BELOW_RECORDED_SESSIONS`).
- تكرار رقم الجلسة ممنوع بقيد فريد على (plan_id, session_number).
- الطالب لا يرى إلا الخطة `published`.

`LECTURE_EXECUTION_NUMBERED_PLAN = PASS` — `LECTURE_EXECUTION_DYNAMIC_SESSION_COUNT = PASS`

## E — تسجيل التنفيذ

الحالات المدعومة فعلياً: `executed`, `hindered`, `postponed`, `cancelled`, `compensated` (إضافة إلى `not_recorded` كحالة عرض).
قواعد المحفّز `cdp_validate_execution`:
- التسجيل ممنوع قبل نشر الخطة (`CDP_PLAN_NOT_PUBLISHED`).
- `executed`/`compensated` تتطلب `execution_date`.
- `compensated` تتطلب `compensation_date`.
- `hindered`/`postponed`/`cancelled` تتطلب سبباً غير فارغ (`CDP_REASON_REQUIRED`).

**العقد الحالي للأسباب نص حر إلزامي وليس قائمة مقننة.** لم تُخترع قائمة أسباب جديدة؛ التقرير يجمع الأسباب كما أُدخلت.
التحديث يتم بالكتابة فوق سجل الجلسة (upsert)، والمسح عبر `cdp_clear_session_execution` — كلاهما لعضو هيئة التدريس المسند فقط.

`LECTURE_EXECUTION_NONEXECUTION_REASON = PASS` — `LECTURE_EXECUTION_COMPENSATION_FLOW = PASS`

## F — رحلة الطالب

- `cdp_get_section_plan` يمنع من ليس مسجلاً في المجموعة (`cdp_can_view_section`).
- الحقول `reason` و`notes` تُعاد `null` لغير المدير/العضو — إخفاء داخلي على مستوى قاعدة البيانات لا الواجهة.
- الخطة غير المنشورة لا تُعرض للطالب (شرط `plan.status === 'published'` في الواجهة + خطة غير موجودة/مسودة بلا معنى للطالب).

`LECTURE_EXECUTION_STUDENT_VIEW = PASS` — `LECTURE_EXECUTION_STUDENT_PRIVACY = PASS`

## G + H — المتابعة الإدارية والتقارير الدورية (فجوة حقيقية أُصلحت)

قبل الإصلاح: `/admin/lecture-execution` فقط، بمقاييس تراكمية غير مقيّدة بالنطاق ولا بالفترة، ورئيس القسم يرى الكلية كاملة.

الإصلاح: دالة واحدة مصدرها نفس الحقيقة `cdp_delivery_monitoring(p_period)`:
- النطاق: `department_head` → أقسامه فقط عبر `is_department_head_of`؛ `dean`/`registrar`/`student_affairs`/`admin`/`system_admin` → مستوى الكلية؛ أي دور آخر → `CDP_NOT_AUTHORIZED`.
- الفترات: `week` (٧ أيام)، `month` (٣٠ يوماً)، `term` (منذ بداية الفصل/كل السجلات).
- المقاييس: المخطط، المنفذ، المعوّض، المؤجل، الملغى، المتعذر، غير المنفذ، غير المعوّض، المتبقي، نسبة التنفيذ، عدد المقررات المتأخرة.
- أسباب عدم التنفيذ مجمّعة (`reasons[]`).
- الإنذار المبكر: `risk_level` لكل مجموعة (high < 40%، medium < 60% أو ≥ 2 غير معوّضة، low، no_plan) و`behind_plan`.
- لا تُلفَّق أصفار: نسبة التنفيذ `null` عندما لا توجد خطة معتمدة، وتظهر «—».

الأسطح: `/admin/lecture-execution` (الإدارة/العميد/الشؤون الأكاديمية) و`/faculty-portal/lecture-monitoring` (رئيس القسم والعميد داخل بوابة هيئة التدريس)، وكلاهما يستهلك المكوّن نفسه `DeliveryMonitoringPanel`.

`LECTURE_EXECUTION_DEPARTMENT_MONITORING = PASS`
`LECTURE_EXECUTION_ACADEMIC_AFFAIRS_MONITORING = PASS`
`LECTURE_EXECUTION_DEAN_MONITORING = PASS`
`LECTURE_EXECUTION_PERIOD_REPORTING = PASS`
`LECTURE_EXECUTION_EARLY_WARNING = PASS`

## I — مطابقة كتالوج التقارير

| الرمز | الحالة الجديدة |
| --- | --- |
| LEC-DELEGATE-CONFIRMATIONS | مُزال نهائياً |
| LEC-EXECUTION-MONITORING | LIVE |
| LEC-COURSE-DELIVERY-PLAN | LIVE (جديد) |
| LEC-WEEKLY-EXECUTION | LIVE (يحل محل LEC-WEEKLY-LOG) |
| LEC-NONEXECUTION-REASONS | LIVE (جديد) |
| LEC-MAKEUP-STATUS | LIVE (يحل محل LEC-EXCUSED-MAKEUP) |
| LEC-PLAN-COVERAGE | LIVE |
| LEC-EARLY-WARNING | LIVE (جديد) |
| LEC-BY-FACULTY | UNDER_DEVELOPMENT (لا تجميع مستقل لكل عضو بعد — معلن بصراحة) |

اختبارات الكتالوج والتتبع: 344/344 PASS بعد إعادة التثبيت (عدد المدخلات 76، LIVE = 33).

`LECTURE_EXECUTION_REPORT_CATALOG_RECONCILED = PASS`

## J — التحقق عبر المتصفح

تم تحميل `/admin/lecture-execution` و`/faculty-portal/lecture-monitoring` و`/faculty-portal/lecture-execution` عبر Chromium:
- `ROUTE_CRASHES = 0`
- `UNHANDLED_JS_ERRORS = 0` (pageerrors: [])
- `UNEXPLAINED_5XX = 0`
- `DATA_LEAKS = 0` (لم تُعرض بيانات لأي جلسة غير مصرّح بها؛ الحقول الداخلية محجوبة من الـRPC)

**قيد صريح:** لم تُنفَّذ في هذه الجولة رحلة متصفح مسجَّلة الدخول بممثلين حقيقيين (عضو هيئة تدريس/رئيس قسم/عميد/طالب)
لعدم توفر جلسات هؤلاء الممثلين في بيئة التنفيذ الحالية، ولم تُعَد مصفوفة RPC الحية متعددة الممثلين.
التفويض مثبت على مستوى المصدر المطبق في الإنتاج (SECURITY DEFINER)، لكن دليل التنفيذ الحي غير مُلتقط.

`LECTURE_EXECUTION_BROWSER_E2E = PARTIAL (عرض/عدم انهيار فقط)`

## K — تنظيف بيانات الاختبار

لم تُنشأ أي بيانات اختبارية في الإنتاج في هذه الجولة (لا طلاب، لا أعضاء هيئة تدريس، لا خطط، لا سجلات تنفيذ).

`REAL_NON_TEST_PRODUCTION_ROWS_MODIFIED = 0` — `LECTURE_EXECUTION_TEST_ONLY_CLEANUP = PASS`

## القرار النهائي

`HOLD_LECTURE_EXECUTION_LIVE_MULTI_ACTOR_E2E_EVIDENCE_NOT_CAPTURED`

كل فجوات العقد الحقيقية المكتشفة (تسجيل التنفيذ لغير عضو هيئة التدريس، غياب النطاق للقسم،
غياب التقارير الدورية والإنذار المبكر، بقايا عقد المندوب، كتالوج تقارير غير مطابق) أُصلحت وطُبّقت في الإنتاج.
المتبقي الوحيد للإغلاق الكامل: تنفيذ مصفوفة RPC الحية ورحلة المتصفح المسجَّلة الدخول بممثلي الاختبار
(عضو هيئة تدريس مسند، عضو آخر، رئيس قسم، عميد، طالب مسجَّل، طالب غير مسجَّل) والتقاط أدلتها.
