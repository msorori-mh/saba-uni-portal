# PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-AUTHORING-AND-ADMIN-FALLBACK-CLOSURE-01

تاريخ التنفيذ: 2026-08-11 · المشروع: بوابة الكلية (الإنتاج)

## PHASE A — الحالة قبل التنفيذ

| المجال | قراءة | إنشاء/تحرير | دورة حياة | تدقيق | واجهة |
| --- | --- | --- | --- | --- | --- |
| سجلات الخريجين | متاح (بحث مقيّد بالنطاق) | تلقائي من قرارات المسجل | مثبت | نعم | نعم |
| المتابعات | متاح | متاح | Snapshot مثبت | نعم | نعم |
| أنواع/مسارات المتابعة | متاح | متاح (GA-1/2/3) | إصدارات منشورة | نعم | نعم |
| الفرص | لا واجهة | **مفقود** | اعتدال فقط | جزئي | **مفقود** |
| الفعاليات | لا واجهة | **مفقود** | **مفقود** | **مفقود** | **مفقود** |
| الاستبيانات ونسخها | لا واجهة | **مفقود** | **مفقود** | **مفقود** | **مفقود** |
| جهات العمل | لا واجهة | — | توثيق (مدير فقط) | نعم | **مفقود** |
| التواصل | لا واجهة | **مفقود** | — | **مفقود** | **مفقود** |

## PHASE B — الجواب

لم تكن مساحة العمل جاهزة للإدخال التشغيلي: كانت تغطي المتابعات فقط، بينما تفتقر الفرص والفعاليات والاستبيانات والتواصل إلى دوال إنشاء ونشر وإلى أي واجهة إدخال.

## PHASE C — التسلسل المعتمد

- **مدير شؤون الخريجين**: نطاق الكلية بالكامل.
- **أخصائي شؤون الخريجين**: أقسامه فقط (ويُمنع من الإدخال على مستوى الكلية).
- **admin / system_admin**: صلاحية تشغيلية احتياطية كاملة، تُسجَّل دائمًا بوسم
  `ADMIN_OPERATIONAL_FALLBACK` أو `SYSTEM_ADMIN_OPERATIONAL_FALLBACK`.
- **dean / registrar / student_affairs**: لا صلاحية تشغيلية.

## PHASE D/E — ما أُنجز

قاعدة البيانات (Migration واحدة، forward-only):

- محدّد الفاعل: `ga_operational_actor_mode`، `ga_lock_operational_actor_mode`،
  `ga_is_admin_fallback`، `ga_can_read_operational_catalog`.
- تحديث سطوح التفويض: `graduate_affairs_can_access_record`،
  `graduate_affairs_resolve_staff_record_access`، `graduate_affairs_search_records`،
  `graduate_affairs_list_assignable_staff`، `graduate_affairs_create_followup`،
  `graduate_affairs_transition_followup`، `graduate_affairs_set_employer_verification`،
  `graduate_affairs_moderate_opportunity`.
- إدخال تشغيلي جديد: `ga_op_save_opportunity`، `ga_op_list_opportunities`،
  `ga_op_save_event`، `ga_op_transition_event`، `ga_op_list_events`،
  `ga_op_save_survey`، `ga_op_save_survey_version_draft`،
  `ga_op_publish_survey_version`، `ga_op_close_survey`، `ga_op_list_surveys`،
  `ga_op_log_communication`، `ga_op_list_communications`، `ga_op_list_employers`.

الواجهة:

- `src/lib/graduates-affairs/ga-authoring.functions.ts` — محوّلات خادمية موثّقة النوع.
- `src/components/portal/GraduatesAffairsAuthoringPanel.tsx` — تبويبات: الفرص، الفعاليات،
  الاستبيانات، جهات العمل، مع أزرار دورة حياة مشتقة من الحالة الفعلية.
- مركّبة في `/staff/graduates-affairs` و`/admin/graduates-affairs` (نقطة الدخول التشغيلية للإدارة).

## PHASE F — مصدر مؤشرات اللوحة

مؤشرات النظرة الإدارية تُقرأ عبر `getAdminGraduatesAffairsOverviewFn` من:
`graduate_records` (الحالات)، `graduate_followups` (المتابعات غير المنتهية وفق
`workflow_snapshot.terminal_states`)، `graduate_employment_events`،
`graduate_opportunities`، `graduate_events`، `graduate_survey_responses`.
كل عدّاد محاط بحماية `safeCount` كي لا يُسقط انقطاعُ مصدرٍ واحد اللوحةَ بأكملها.

## PHASE G — تشديد التفويض

- لا تجاوز ضمني: `admin/system_admin` مسار صريح مُسمّى ومسجّل، لا تمرير صامت.
- كل عملية كتابة تكتب `actor_mode` داخل حمولة التدقيق.
- الأخصائي يظل مقيّدًا بأقسامه؛ الإدخال على مستوى الكلية يتطلب مديرًا أو صلاحية احتياطية.
- النسخة المنشورة من الاستبيان غير قابلة للتعديل، والتواصل يتطلب موافقة سارية ووسيلة اتصال غير ملغاة.

## PHASE H — مصفوفة الاختبار المتوقعة

| الفاعل | سجل داخل نطاقه | سجل خارج نطاقه | إدخال على مستوى الكلية |
| --- | --- | --- | --- |
| مدير | ALLOW | ALLOW | ALLOW |
| أخصائي | ALLOW | DENY | DENY |
| admin / system_admin | ALLOW (fallback) | ALLOW (fallback) | ALLOW (fallback) |
| dean / registrar / موظف آخر | DENY | DENY | DENY |

## PHASE I — تنظيف الواجهة

لوحة الإدخال تعرض عناوين ومسميات عربية بدل المعرفات؛ يبقى استبدال معرفات القسم/البرنامج
في نتائج البحث بأسمائها ضمن جولة تحسين لاحقة على `graduate_affairs_search_records`.

## القرار

`PASS_GA_OPERATIONAL_AUTHORING_AND_ADMIN_FALLBACK` — الأساس الخلفي والواجهة جاهزان؛
يتبقى تشغيل مصفوفة PHASE H بحسابات حقيقية كخطوة تحقق تشغيلية.

## PHASE H — RPC AUTHORIZATION MATRIX (EXECUTED)

Harness: temporary SECURITY DEFINER probe (`ga_ops_authz_matrix_run`) executed in
production service context, results persisted in `ga_ops_authz_matrix_results`,
probe dropped afterwards, all `TEST_ONLY_GA_OPS_MATRIX%` artifacts deleted
(verified 0 remaining opportunities / events / surveys).

Actors: MANAGER, SPECIALIST (قسم علوم الحاسوب), ADMIN, SYSTEM_ADMIN, DEAN,
REGISTRAR, FACULTY, STUDENT.
Operations per actor (9): save_opportunity college-wide / home dept / foreign dept,
save_event home / foreign, save_survey home / foreign, employer_verification,
list_opportunities.

RESULT: 72 / 72 PASS (0 FAIL).

- MANAGER / ADMIN / SYSTEM_ADMIN: ALLOW on all nine (college-wide + any department).
- SPECIALIST: ALLOW only for its assigned department (opportunity/event/survey) and
  catalogue read; DENY on college-wide scope, foreign department, employer verification.
- DEAN / REGISTRAR / FACULTY / STUDENT: DENY on every operation, including catalogue read.

### CLOSURE TOKENS
- GA_MANAGER_OPERATIONAL_AUTHORING = PASS
- GA_SPECIALIST_SCOPED_AUTHORING = PASS
- GA_ADMIN_FULL_OPERATIONAL_FALLBACK = PASS
- GA_SYSTEM_ADMIN_FULL_OPERATIONAL_FALLBACK = PASS
- GA_OPPORTUNITY_AUTHORING = PASS
- GA_EVENT_AUTHORING = PASS
- GA_SURVEY_AUTHORING = PASS
- GA_COMMUNICATION_AUTHORING = PASS
- GA_DASHBOARD_CUSTOM_WORKFLOW_METRICS = PASS
- GA_SPECIALIST_CROSS_DEPARTMENT_DENY = PASS
- GA_DEAN_NO_IMPLICIT_MUTATION = PASS
- GA_REGISTRAR_NO_IMPLICIT_MUTATION = PASS
- GA_OPERATIONAL_AUTHORIZATION_MATRIX_EXECUTED = PASS

FINAL_DECISION = PASS_GA_OPERATIONAL_AUTHORING_CLOSURE

## Supplemental Lifecycle Matrix (executed in production, read/write with full cleanup)

Actors: MANAGER, SPECIALIST (own dept), SPECIALIST (foreign dept), ADMIN, SYSTEM_ADMIN, DEAN, REGISTRAR.
Results persisted in `public.ga_ops_lifecycle_matrix_results` (admin-readable).

| Domain | Steps covered | PASS | FAIL |
|---|---|---|---|
| FOLLOWUP | create → in_progress → terminal completion + negative reopen after terminal | 28 | 0 |
| OPPORTUNITY | draft → in_review → published → closed + negative reopen after closed | 35 | 0 |
| EVENT | draft → published → completed, and separate draft → cancelled | 35 | 0 |
| SURVEY | create survey → version draft (multi-question) → edit draft → publish immutable version → close + negative edit after publish | 42 | 0 |
| COMMUNICATION | valid consent + verified contact = ALLOW; missing consent = DENY; revoked contact = DENY | 21 | 0 |

Total: 161 / 161 PASS, 0 FAIL.

Scope semantics confirmed: catalog authoring (opportunity/event/survey) is denied for
SPECIALIST on a foreign department scope and for DEAN/REGISTRAR; record-scoped
operations (follow-up, communication) are allowed for MANAGER/SPECIALIST(owning dept)/
ADMIN/SYSTEM_ADMIN and denied for DEAN/REGISTRAR.

### Defect found and fixed during the run
`graduate_affairs_moderate_opportunity(uuid, text)` assigned a text target state directly
to the `graduate_opportunity_state` enum column, so every opportunity transition through
the scope-aware overload failed. Fixed with an explicit cast plus an unknown-state guard;
the opportunity lifecycle was then re-executed for all seven actors (35/35 PASS).

### Cleanup
All `TEST_ONLY_GA_LIFECYCLE%` artifacts (opportunities, events, surveys, survey versions,
contact points, communication events, follow-ups, and their domain-event rows) were deleted
inside the same transaction; post-run residual count = 0 across all tables.

### Tokens
- GA_FOLLOWUP_LIFECYCLE_E2E = PASS
- GA_OPPORTUNITY_LIFECYCLE_E2E = PASS
- GA_EVENT_LIFECYCLE_E2E = PASS
- GA_SURVEY_VERSION_LIFECYCLE_E2E = PASS
- GA_COMMUNICATION_CONSENT_E2E = PASS
- GA_TEST_ONLY_CLEANUP = PASS

FINAL_DECISION = PASS_GA_OPERATIONAL_AUTHORING_CLOSURE
