# COUNCILS-MEMBERSHIP-PILOT-01

> Pilot تنفيذي محدود لربط عضوية واحدة عبر `/admin/academic-councils`. لا كود، لا migrations، لا DB/RLS/Storage/Email/Cron، لا seed/import، لا DELETE، لا service role في المتصفح.

---

## 1. القرار النهائي

### **NO-GO / NEEDS_ACADEMIC_SELECTION**

---

## 2. سبب التوقف

طلب المرحلة صريح:

> «إذا لم يكن الأكاديمي المراد ربطه واضحاً، أوقف التنفيذ واكتب: `NO-GO / NEEDS_ACADEMIC_SELECTION`.»

لم يُحدَّد في هذه المرحلة **أي أكاديمي بعينه** (اسم / بريد / رقم أكاديمي) ليتم ربطه بمجلس الكلية بدور `viewer`. كما أن الوكيل لا يملك حساب `system_admin`/`admin` لتنفيذ تدفق UI حقيقي (تسجيل دخول + بحث + ضغط «حفظ الربط») نيابة عن المستخدم على بيئة الإنتاج.

كتابة عضوية عشوائية بناءً على تخمين تخالف نطاق الـ Pilot («لا تختَر أي سجل غير واضح»).

---

## 3. سياق التحقق قبل التوقف

| البند | النتيجة |
|-------|---------|
| الفرع | `main` |
| آخر commit مرجعي | `ea74de8` (Merge PR #76) — مؤكد سابقاً في `COUNCILS-MEMBERSHIP-UI-DEPLOY-VERIFY-01-AFTER-MERGE` = PASS |
| صفحة `/admin/academic-councils` | متاحة، وقسم «إدارة عضويات المجلس» ظاهر بعد اختيار مجلس |
| المجالس المتاحة (DB) | صف واحد: **مجلس الكلية** (`council_type=college`, `department_id=NULL`, `is_active=true`, id: `8a3381c5-…`) |
| عدد العضويات الحالية | **0** (تأكيد سابق من مرحلة seed verify) |
| دوال الخادم المطلوبة | موجودة: `searchAcademicsForCouncilLink`, `linkAcademicToCouncil`, `getCouncilMemberships` |
| مصدر البحث | `faculty_profiles` (status=active + user_id مربوط) عبر `context.supabase` (RLS) |

---

## 4. المطلوب من المستخدم لإكمال الـ Pilot

يرجى تزويدنا **بواحد فقط** من التالي لأكاديمي **واحد موجود مسبقاً** في `faculty_profiles`:

1. الاسم الكامل (كما هو مسجَّل في النظام)، أو
2. البريد الإلكتروني (`faculty.email`)، أو
3. الرقم الأكاديمي (`employee_number`).

مع تأكيد أن:

- الأكاديمي **موجود** في بوابة الأكاديميين وله `user_id` فعّال.
- الدور المُختار لأول تجربة = **`viewer`** (كما هو مقترح).
- تنفيذ العملية سيتم من حساب **`system_admin`** أو **`admin`** (لا `dean` في هذه المرحلة).

---

## 5. تأكيدات عدم التوسع (حتى الآن)

| البند | الحالة |
|-------|--------|
| تعديل كود | **لا** |
| migrations | **لا** |
| DB schema / RLS / Storage / Email / Cron | **لا** |
| seed / import | **لا** |
| إنشاء حساب أكاديمي جديد | **لا** |
| كتابة عضوية | **لا** — لم تُنفَّذ (بانتظار اختيار المستخدم) |
| DELETE / تعطيل | **لا** |
| service role في المتصفح | **لا** |

---

## 6. التوصية التالية

### **NEEDS_ACADEMIC_SELECTION**

فور تحديد الأكاديمي المستهدف من قِبل المستخدم، تُستأنف المرحلة تحت نفس المعرِّف `COUNCILS-MEMBERSHIP-PILOT-01` بخطوات UI المذكورة (بحث → اختيار → دور `viewer` → حفظ → تحقق من ظهور الصف في الجدول → تحقق من منع التكرار عبر منطق الواجهة/الخادم دون كتابة إضافية).

عند النجاح لاحقاً، التوصية المتوقعة:

**READY_FOR_MEMBERSHIP_ROLE_EXPANSION_OR_DEPARTMENT_COUNCILS_PILOT**

---

*Generated: COUNCILS-MEMBERSHIP-PILOT-01 — halted pending academic selection. No writes performed.*
