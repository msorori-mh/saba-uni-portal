# B1 Stage 2 — Shared Prerequisites Closure (77)

MODE: PRODUCTION READ-ONLY. لم يُنفَّذ أي Workflow RPC، ولا migration، ولا deploy/publish، ولا تغيير `student_visible`، ولا مساس بـ`enrollment_certificate`. صفر كتابة.

## 1) حالة الطلبات الخمسة (TEST_ONLY)

| الخدمة | الطلب | حالة السلسلة |
|---|---|---|
| excused_absence | SR-20260727-78427CC5 | intake=completed، **manager_review=active**، record_apply=pending |
| enrollment_suspension | SR-20260727-50BEDCE2 | **initial_review=active**، manager_approval، registrar_apply |
| enrollment_suspension | SR-20260727-F67CF366 | **initial_review=active**، manager_approval، registrar_apply |
| department_transfer | SR-20260727-88D885F0 | **student_affairs_intake=active**، source/target dept head، dean، payment_confirmation، registrar_apply |
| final_chance | SR-20260727-3C550070 | **student_affairs_intake=active**، manager_review، dean_decision، payment_confirmation، registrar_apply |
| file_withdrawal | SR-20260727-42393846 | **student_affairs_intake=active**، library/labs/activities/finance clearance، registrar_apply، archive |

## 2) خريطة الفاعلين المُسندين (reusable actor/session map)

| البريد | auth.uid | staff_profile | الخطوات والإجراءات الحرفية |
|---|---|---|---|
| hitham@usr.edu.ye | c8a94548-4782-4252-86f9-23559d3b95bd | 06f48015-bb18-461e-b818-cfd1a31a8e0d | 7 خطوات: `review` ×5 (intake/initial_review للخدمات الأربع)، `apply_decision` (excused_absence.record_apply) |
| yasmin@usr.edu.ye | aac0e62d-4e8b-4440-b649-caa388d34837 | b3966846-116e-44a9-ba54-1cce7971af15 | 5: `approve` (excused_absence.manager_review، enrollment_suspension.manager_approval، final_chance.manager_review)، `clear` (file_withdrawal.activities_clearance) |
| toaiman@usr.edu.ye | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | 89d5e758-6971-45df-98c0-8de9caabb00d | 5: `apply_decision` (registrar_apply × 4 خدمات) |
| fares@usr.edu.ye | 79783c0f-8d95-4110-8239-0ac504d63a24 | 233c9c36-29de-4352-9db3-938a89efe897 | 3: `confirm_payment` ×2، `clear` (file_withdrawal.finance_clearance) |
| naji@usr.edu.ye | e7a93314-bb06-4525-b412-5315198c668a | — | 1: `clear` (library_clearance) |
| mohammed@usr.edu.ye | 67b39ee4-4918-4b00-b4cc-0d5046ac8a5a | — | 1: `clear` (labs_clearance) |
| mameen@usr.edu.ye | aec1303e-de6a-4580-94cf-7205c17b5535 | — | 1: `archive` (file_withdrawal.archive) |

جميع الحسابات `active`. تسجيل الدخول: `/portal-login` → تبويب «الموظفين» → `/staff/b1-requests`.

## 3) الفجوة المشتركة (SHARED CONFIGURATION GAP)

4 خطوات runtime بلا `assigned_staff_profile_id` رغم أن `assignment_strategy = specific_user`:

| الخدمة | الخطوة | الوحدة/الدور | الإجراء |
|---|---|---|---|
| department_transfer | source_department_head_approval | department/department_head | approve |
| department_transfer | target_department_head_approval | department/department_head | approve |
| department_transfer | dean_approval | dean/dean | approve |
| final_chance | dean_decision | dean/dean | approve |

سبب الجذر (ليس خاصًا بالطلب): مصفوفة `request_processing_assignments` لهذين الدورين لا تُسند `staff_profile`، بل:

- **dean**: تعيين نشط واحد من نوع `faculty_profile` → أ.م.د. مقبول قايد عبده الكامل (`maqbol3@usr.edu.ye`، uid `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0`). **لا يوجد `staff_profiles` مرتبط بهذا الحساب**.
- **department_head**: 3 تعيينات نشطة من نوع `position_assignment` فقط:
  - قسم تكنولوجيا المعلومات → `kh.alborahy@usr.edu.ye` (uid d4aaa5c9-72d1-4996-b0e8-d30c6327da6e)
  - قسم نظم المعلومات الحاسوبية → `ramzi@usr.edu.ye` (uid f602b62c-194b-4591-8e9c-956e5cbb347d)
  - قسم علوم الحاسوب → `osamah.saif@usr.edu.ye` (uid 97acbe02-c59c-409c-8d51-7d4ef72e6db7)

نطاق طلب التحويل SR-20260727-88D885F0: القسم المصدر = تكنولوجيا المعلومات (`ce485c67…`) → رئيسه kh.alborahy؛ القسم الهدف = نظم المعلومات الحاسوبية (`22222222…`) → رئيسه ramzi.

التصنيف: **shared across services + shared runtime/configuration** (يؤثر على department_transfer وfinal_chance معًا)، وليس request-local.

قرار مطلوب من المالك قبل استكمال هاتين السلسلتين — أحد الخيارين، ولا يُنفَّذ أي منهما الآن:
1. تمكين الحل عبر `faculty_profile` / `position_assignment` في مسار الإسناد المباشر لخطوات B1 (تعديل مصدري + migration مراجعة)، أو
2. إنشاء ربط `staff_profiles` للعميد ولرؤساء الأقسام الثلاثة ثم إعادة توليد الإسناد المباشر للخطوات الأربع.

ملاحظة أمنية: العقد الحالي `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` سيرفض أي فاعل غير مُسند مباشرة؛ لا يوجد ولن يُقترح bypass لأدمن/مسجل/عميد.

## 4) بوابات الحماية (تحقق قراءة فقط)

- `student_visible=false` للخدمات الخمس جميعها — مؤكَّد.
- `enrollment_certificate.student_visible=true` وغير ممسوس — مؤكَّد.
- Package 66 مطبق: تعريف `act_on_b1_student_request_step_atomic` بصمة MD5 = `3dccda29c348a46ce60a687bcb49803c` (مطابقة لقيمة ما بعد التطبيق المعتمدة).
- لا deploy، لا publish، لا migration، لا تعديل إعدادات workflow.

## 5) الجاهزية للاستكمال

| الخدمة | جاهزة للتشغيل كاملة؟ | المانع |
|---|---|---|
| excused_absence | نعم (yasmin ثم hitham) | لا شيء |
| enrollment_suspension ×2 | نعم (hitham → yasmin → toaiman) | لا شيء |
| file_withdrawal | نعم (hitham → naji → mohammed → yasmin → fares → toaiman → mameen) | لا شيء |
| department_transfer | لا | خطوتا رئيس القسم + العميد بلا إسناد مباشر |
| final_chance | جزئيًا (حتى manager_review) | dean_decision بلا إسناد مباشر |

## القرار

**HOLD_B1_STAGE2_SHARED_PREREQUISITES_DEAN_AND_DEPARTMENT_HEAD_STEPS_HAVE_NO_DIRECT_STAFF_ASSIGNEE**

ثلاث خدمات (excused_absence، enrollment_suspension ×2، file_withdrawal) جاهزة تشغيليًا بالكامل بمجرد توفر جلسات الفاعلين أعلاه. خدمتان محجوبتان بفجوة إسناد مشتركة تحتاج قرار المالك.
