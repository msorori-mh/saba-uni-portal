# PORTAL_REFORM_P1_07_CONTROLLED_PRODUCTION_APPLY_AND_E2E_CONTINUATION_07D

## القرار النهائي

**HOLD_P1_07_E2E_CONTINUATION_RUNTIME_STEPS_HAVE_ZERO_DIRECT_ASSIGNEES**

P1-07 طُبِّق بنجاح وتم التحقق منه. توقّف استكمال الـE2E عند مانع تقني حقيقي
موصوف بدقة أدناه، ولم يُنفَّذ أي تعديل خارج نطاق P1-07.

---

## G0 — بوابة ما قبل الكتابة (PASS)

- مسودة P1-07: `docs/migration-drafts/p1/P1-07-WORKFLOW-TRANSITIONS-AND-SPECIALIZED-ACTIONS.sql`
  - `SHA256_LF_NORMALIZED_V1 = b020b107807c9c8fffe9adbc5c31c01fed0e1884fc279ee0495d241379b8d09c`
- خط الأساس الإنتاجي P1-01..P1-06 سليم.
- عدد الانتقالات لمسارات P1 الثلاثة قبل التطبيق = 0.
- `student_visible = false` للخدمات الثلاث (لم يُمَس).
- مراجعة انحراف: تعريفات `act_on_b1_student_request_step_atomic`،
  `can_current_user_act_on_step`، `record_external_university_payment_confirmation`
  في الإنتاج مطابقة لما بُنيت عليه المسودة. لا انحراف وظيفي.

## G1 — تطبيق P1-07 فقط (PASS)

طُبِّقت Migration واحدة فقط، بمحتوى المسودة، داخل معاملة واحدة.

## G2 — التحقق بعد التطبيق (PASS)

| المسار | عدد الانتقالات |
| --- | --- |
| `october_exam_entry_form_v1` | 5 |
| `replacement_student_card_v1` | 4 |
| `final_result_appeal_v1` | 7 |

- الدالة المؤقتة `p1_seed_transition` حُذفت بعد البذر (غير موجودة).
- الدالتان المتخصصتان موجودتان بنسخة واحدة فقط، دون overload:
  - `p1_issue_replacement_card_step(uuid, text, text)`
  - `p1_apply_final_result_appeal_step(uuid, numeric, text)`
  - التنفيذ ممنوح لـ`authenticated` فقط، ومسحوب من `PUBLIC` و`anon`.
- الدوال الثلاث المعدَّلة بقيت بنسخة واحدة لكل منها.
- `student_visible` لم يتغير. لم تُنشأ أي طلبات جديدة.

## G3+ — استكمال الـE2E (BLOCKED)

الطلبات الاختبارية الثلاث القائمة:

| الطلب | الخدمة | الحالة | الخطوة النشطة |
| --- | --- | --- | --- |
| SR-20260816-14A2339B | october_exam_entry_form | submitted | student_affairs_review |
| SR-20260816-F01018CE | replacement_student_card | submitted | student_affairs_review |
| SR-20260816-E852B4E3 | grade_appeal | submitted | registrar_intake |

### المانع التقني الدقيق

جميع خطوات التشغيل لهذه الطلبات الثلاث أُنشئت بقيم تعيين فارغة:

```
assigned_user_id, assigned_staff_profile_id,
assigned_faculty_profile_id, assigned_position_assignment_id  ->  ALL NULL
num_nonnulls(...) = 0
```

السبب الجذري: مسار الإرسال الذرّي `submit_student_request_with_details`
(المطبَّق في P1-06) يستدعي المُهيّئ العام `initialize_student_request_workflow`،
وهذا المُهيّئ **لا يحسب ولا يكتب أي تعيين مباشر إطلاقًا**. أما الخدمات الخمس B1
فتُهيَّأ عبر `initialize_b1_request_workflow_strict`، وهو الذي يحل التعيين المباشر
من `request_processing_assignments` ويكتب `direct_assignment_id` في الـmetadata.

وبعد P1-07 أصبحت خدمات P1 خاضعة لنفس العقد الصارم في
`can_current_user_act_on_step`، الذي يشترط **تعيينًا مباشرًا واحدًا بالضبط**.
النتيجة الحتمية: كل إجراء موظف على هذه الطلبات مرفوض بـ
`B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`، وهو رفض صحيح أمنيًا وليس خللًا
في التفويض. لا يوجد أي التفاف مسموح: التعيين المباشر شرط مطلق ولا يوجد bypass
للمدير أو المسجل أو العميد.

### مانع ثانوي مؤكَّد

الدور `course_instructor` (خطوة `instructor_review` في مسار التظلم) **لا يملك أي
سجل في `request_processing_assignments`** — لا نشِط ولا غير نشط. أي مُهيّئ صارم
سيفشل عند هذه الخطوة بـ`DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:0` ما لم يُعالَج
تعيين أستاذ المقرر بشكل مشتق من المقرر محل التظلم.

### لماذا لم يُصلَح داخل هذه المهمة

الإصلاح يتطلب Migration جديدة خارج الحزمة المصرَّح بها في 07D
(المصرَّح به: P1-07 فقط)، وتمس مسار التهيئة للخدمات الثلاث. المهمة تمنع صراحة
إنشاء طلبات جديدة وإعادة تصميم البنية، ولا يمكن استكمال E2E بدون هذا التعيين.

## الحزمة العلاجية المقترحة (P1-08) — لم تُطبَّق

1. مُهيّئ صارم لخدمات P1 يعيد استخدام منطق `initialize_b1_request_workflow_strict`
   نفسه (حل تعيين مباشر واحد بالضبط + كتابة `direct_assignment_id`)، دون محرك جديد.
2. اشتقاق مُنفِّذ خطوة `instructor_review` من أستاذ المقرر محل التظلم، أو إنشاء
   تعيين معالجة حقيقي للدور `course_instructor` وفق الحوكمة الإدارية المعتمدة.
3. مسار إصلاح forward-only للطلبات الاختبارية الثلاث القائمة لملء التعيينات
   المباشرة عليها، دون حذف أو إعادة إنشاء.
4. إعادة تشغيل مصفوفة التفويض الإيجابية والسلبية كاملةً، ثم استكمال E2E.

## أثر الإنتاج

- Migrations مطبَّقة هذا الدور: **1** (P1-07 فقط).
- طلبات جديدة: **0**. تعديل بيانات حقيقية: **0**.
- `student_visible`: بلا تغيير (الخدمات الثلاث تبقى مخفية).
- الخدمات الخمس B1 وشهادة القيد: بلا تغيير سلوكي؛ كل تعديل مشروط بمُسنِد P1 فقط،
  وارتباط B1-88 E2E بقي حصريًا لخدمات B1.
- نشر/Deploy: لم يُنفَّذ.
