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
