# PORTAL-B1-SEVEN-TEST-ONLY-STAFF-ACCOUNTS-OWNER-SECRETS-PRODUCTION-EXEC-22

MODE: PRODUCTION READ-ONLY PREFLIGHT → HALT BEFORE FIRST WRITE

DECISION: **HOLD_B1_TEST_ONLY_STAFF_ACCOUNTS_NO_REQUEST_SCOPED_ASSIGNMENT_CHANNEL_EXISTS_REBIND_REQUIRES_GLOBAL_REAL_STAFF_ASSIGNMENT_MUTATION**

ZERO_ACCOUNTS_CREATED · ZERO_PRODUCTION_WRITE · ZERO_RPC_ACTIONS · NO_WORKFLOW_TRANSITION · NO_MIGRATION · NO_DEPLOY
لم تُخزَّن أي كلمة مرور في Git أو SQL أو logs أو metadata، ولا تُذكر في هذا التقرير.

---

## G0 — إثبات الحالة قبل الكتابة (قراءة فقط)

| البند | النتيجة |
|---|---|
| البُرد السبعة `test-only.b1.*@usr.edu.ye` في `auth.users` | **غير موجودة (0/7)** — لا تعارض |
| حسابات test-only سابقة | 14 حسابًا على نطاق `@testonly.quboolye.com` + `test-only.b1.e2e03@usr.edu.ye` (خارج نطاق الأسماء المطلوبة) |
| `TEST_B1_STAFF_001..007` في `staff_profiles` | **غير موجودة (0 صفوف)** — لا تعارض |
| الطلبات الخمسة TEST_ONLY | جميعها `status=submitted`، خطوة نشطة واحدة لكل طلب (`step_order=1`) |
| الرسوم / المدفوعات / الوثائق / الآثار الأكاديمية | **0** |
| `student_visible` للخدمات الخمس | **false** (و`is_active=true`) |
| `enrollment_certificate` | بلا تغيير (`student_visible=true`) |

G0 مُستوفى بالكامل. التوقف حدث بعد G0 وقبل أي كتابة.

---

## المانع التقني (سبب HOLD)

مصدر التفويض `public.assert_b1_runtime_step_row_assignee_effective` (Migration 29) يحسم
«المكلَّف المباشر» حصريًا من `public.request_processing_assignments` بمفتاح
`(unit_id, role_id[, department_id])`:

1. جدول `request_processing_assignments` **لا يحتوي أي عمود ربط بطلب**
   (الأعمدة: `unit_id, role_id, assignment_type, user_id, staff_profile_id,
   faculty_profile_id, position_assignment_id, department_id, is_active, starts_at, ends_at`).
   ⇒ **لا توجد قناة تعيين request-specific في المحرك إطلاقًا.**
2. الدالة تفرض `count(*) = 1` للتعيينات الفعّالة لكل (unit, role, scope)، وترفع
   `B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE` عند أي رقم آخر.
   ⇒ إضافة تعيين TEST_ONLY بجانب تعيين الموظف الحقيقي ⇒ count=2 ⇒ رفض 42501.
   ⇒ الطريق الوحيد هو **تعطيل تعيين الموظف الحقيقي عالميًا**، وهو ممنوع صراحةً في G2،
   ويحوّل مسار كل طلبات الإنتاج (خارج TEST_ONLY) إلى حسابات اختبار.
3. حتى الكتابة على مستوى صف runtime لا تصلح كبديل: الدالة تشترط
   `assigned_user_id/assigned_staff_profile_id/assigned_faculty_profile_id/
   assigned_position_assignment_id` أن **تطابق** الهوية المحسومة عالميًا، وإلا
   `B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH` (42501)، إضافة إلى فحص
   `direct_assignment_id` في `metadata`.

ملاحظة إضافية مرصودة (لا تغيّر القرار): جميع صفوف runtime للطلبات الخمسة تحمل الأربعة
أعمدة `assigned_*` = NULL ⇒ `num_nonnulls = 0` ⇒ أي إجراء عليها سيُرفض حاليًا بـ
`B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:<step>:0` قبل بلوغ بوابة الهوية. أي أن propagation
الخاص بـ Migration 29 لم يُطبَّق على هذه الصفوف القائمة.

### التعيينات العالمية القائمة (لم تُمس)

| unit | role | نوع التعيين | ملاحظة |
|---|---|---|---|
| student_affairs | student_affairs_specialist | staff_profile | موظف حقيقي واحد فعّال |
| student_affairs | student_affairs_manager | staff_profile | موظف حقيقي واحد فعّال |
| library | library_officer | staff_profile | موظف حقيقي واحد فعّال |
| labs | labs_manager | staff_profile | موظف حقيقي واحد فعّال |
| dean | dean | faculty_profile | عضو هيئة تدريس واحد فعّال |
| department | department_head ×3 | position_assignment (بنطاق قسم) | رؤساء الأقسام الحقيقيون |

---

## لماذا لم تُنشأ الحسابات السبعة

قرار المهمة ذرّي: `CREATED_AND_REQUEST_ASSIGNMENTS_REBOUND`. بما أن G2 غير قابل للتحقيق
ضمن قيوده، فإن إنشاء سبعة مستخدمين إنتاجيين في `auth.users` + سبعة `staff_profiles`
سيترك سجلات إنتاجية يتيمة بلا فائدة اختبارية وبلا مسار تنظيف مسموح
(«لا cleanup ولا DELETE»). لذلك تم التوقف **قبل** أول كتابة.

---

## المسارات الممكنة (تحتاج قرار مالك جديدًا — لم يُنفَّذ أي منها)

| # | المسار | الأثر |
|---|---|---|
| A | Migration forward-only تضيف قناة تعيين request-scoped (override موسوم TEST_ONLY يُحترم فقط لطلبات موسومة) + propagation لصفوف runtime | يتطلب تعديل محرك التفويض (Migration 30) ومصفوفة تفويض جديدة كاملة |
| B | نافذة تبديل عالمية مؤقتة للتعيينات ثم إرجاعها | يخالف G2 صراحةً ويعرّض طلبات الإنتاج الحقيقية — **غير موصى به** |
| C | تنفيذ الانتقالات الأربعة عشر بجلسات الموظفين الحقيقيين (وثيقة 20) | لا يحتاج حسابات جديدة، لكنه يحتاج إدخال المالك لبيانات دخول 7 حسابات حقيقية |

---

## G3 — إثبات عدم الأثر

| الفحص | النتيجة |
|---|---|
| accounts created | 0 |
| staff_profiles / roles / assignments مضافة | 0 |
| تعديل حسابات أو تعيينات الموظفين الحقيقيين | 0 |
| workflow transitions | 0 |
| workflow events delta | 0 |
| fees / payments / documents / academic effects | 0 |
| student_visible | false (بلا تغيير) |
| enrollment_certificate | بلا تغيير |
| migrations / deploys | 0 |
