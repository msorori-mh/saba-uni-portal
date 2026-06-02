## السبب الجذري

نموذج تسجيل الدخول في `src/routes/portal-login.tsx` يبني البريد كالتالي:

```
email = `${identifier.toLowerCase()}@${DOMAIN[type]}`
```

عند المقارنة مع ما هو موجود فعليًا في قاعدة البيانات اتضح وجود **عدم تطابق بين رقم الحساب والبريد** للحسابين التجريبيين للمدرّس والموظف:

| الدور | الرقم (identifier) | البريد المتوقع | البريد الفعلي في `auth.users` | النتيجة |
|---|---|---|---|---|
| طالب | `DEMO2024` | `demo2024@students.usr.edu.ye` | `demo2024@students.usr.edu.ye` ✅ | يعمل (لكن كلمة المرور غير معروفة) |
| مدرّس | `DEMO-FAC` | `demo-fac@faculty.usr.edu.ye` | `demo@faculty.usr.edu.ye` ❌ | فشل: المستخدم غير موجود |
| موظف | `DEMO-STF` | `demo-stf@staff.usr.edu.ye` | `demo@staff.usr.edu.ye` ❌ | فشل: المستخدم غير موجود |

ولذلك يرد Auth بـ `invalid_credentials` (هذا ما ظهر في سجلات Auth الأخيرة).

## الإصلاح

### 1. هجرة بيانات (Auth) — سطر واحد لكل حساب
- تحديث `auth.users.email` للمدرّس التجريبي من `demo@faculty.usr.edu.ye` إلى `demo-fac@faculty.usr.edu.ye`.
- تحديث `auth.users.email` للموظف التجريبي من `demo@staff.usr.edu.ye` إلى `demo-stf@staff.usr.edu.ye`.
- إعادة ضبط `encrypted_password` للحسابات الثلاثة (`DEMO2024`, `DEMO-FAC`, `DEMO-STF`) إلى كلمة مرور موحّدة معروفة: **`Demo@2024`**.
- التأكد من `email_confirmed_at IS NOT NULL` و `must_change_password = false` في جداول البروفايل (الحسابات الثلاثة بالفعل `must_change_password = false`، فقط للتأكيد).

سيتم تنفيذ ذلك عبر migration واحدة بصياغة `UPDATE auth.users SET email = ..., encrypted_password = crypt('Demo@2024', gen_salt('bf'))` (مع `pgcrypto`).

### 2. عرض بطاقة "حسابات تجريبية" على صفحة الدخول
إضافة قسم صغير قابل للطيّ أسفل نموذج `SinglePortalLogin` في `src/routes/portal-login.tsx` يعرض فقط الحساب الخاص بالـ`type` الحالي مع زر "تعبئة تلقائية":

- `?type=student` → يعرض: الرقم `DEMO2024` — كلمة المرور `Demo@2024`
- `?type=faculty` → يعرض: الرقم `DEMO-FAC` — كلمة المرور `Demo@2024`
- `?type=staff` → يعرض: الرقم `DEMO-STF` — كلمة المرور `Demo@2024`

البطاقة لا تظهر في `/admin/login` (لا يوجد حساب admin تجريبي عام). وتُنفَّذ كمكوّن واحد ضمن نفس الملف بدون تأثير على المنطق الأمني (تحقق البروفايل بعد الدخول يبقى كما هو).

### 3. لا تغييرات على
- منطق `signInWithPassword` أو فحص البروفايل بعد الدخول.
- صلاحيات RLS، سياسات الجداول، أو أي شيء يخص بيانات الإنتاج.
- بقية الحسابات (`20230001`, `F0001`, `S0001`) التي لها `must_change_password = true` — تُترك كما هي لأنها مخصّصة لاختبار "أول تسجيل دخول".

## الملفات المتأثرة
- migration واحدة جديدة (لا تعديل لأي ملف ضمن `supabase/migrations` السابقة).
- `src/routes/portal-login.tsx`: إضافة بطاقة DemoHint داخل `SinglePortalLogin` فقط.

## معيار القبول
- فتح `/portal-login?type=student` وإدخال `DEMO2024 / Demo@2024` → دخول ناجح وتحويل إلى `/student`.
- فتح `/portal-login?type=faculty` وإدخال `DEMO-FAC / Demo@2024` → دخول ناجح وتحويل إلى `/faculty-portal`.
- فتح `/portal-login?type=staff` وإدخال `DEMO-STF / Demo@2024` → دخول ناجح وتحويل إلى `/staff`.
- لا تظهر بطاقة الحسابات التجريبية في `/admin/login`.
- البناء يمرّ بدون أخطاء.
