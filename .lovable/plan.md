## المشكلة

في صفحة `/admin/faculty-management` تظهر رسالة خطأ حمراء أعلى الجدول:
> Database error loading user

هذا النص ليس نصاً من تطبيقنا — بل هو رسالة قياسية ترجعها خدمة المصادقة (GoTrue) عندما تفشل عملية قراءة سجل المستخدم من `auth.users`. الرسالة تُعرض عبر `useBusyError().error` الذي لا يُملأ إلا عند تنفيذ أحد إجراءات الأزرار: «إنشاء حساب» أو «إعادة تعيين» أو «تعطيل/تفعيل» أو حفظ تعديل من المودال — أي أنها رسالة فشل لإجراء، وليست رسالة فشل تحميل القائمة.

## ما لاحظته من الفحص

- لا توجد triggers على `auth.users` تسبّب الخطأ.
- جدول `auth.users` يحتوي على المستخدمين بشكل طبيعي.
- الإجراءات التي تستدعي GoTrue Admin API في هذه الصفحة:
  - `createAccount` → `supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })` ثم `createUser`.
  - `resetPassword` → `auth.admin.updateUserById(...)`.
  - `setActive` → `auth.admin.updateUserById(...)`.
- `listUsers({ perPage: 200 })` تُرجِع 200 سجل دفعة واحدة، وفي حال وجود سجل `auth.users` واحد فاسد (مثلاً `raw_user_meta_data` بقيمة غير صالحة، أو `identities` معطوبة، أو رقم مستخدم بلا `aud/role`)، يرجع GoTrue الخطأ النصي **"Database error loading user"** ويفشل الاستدعاء بالكامل — وهو الأكثر احتمالاً هنا.

## خطة التنفيذ (بدون تعديل RLS أو منطق الصلاحيات)

### 1. تشخيص حقيقي عبر Playwright + سجلات GoTrue

- تشغيل سكربت Playwright يدخل لصفحة `/admin/faculty-management` ويضغط «إنشاء حساب» على عضو بدون حساب، ويلتقط:
  - رد server-fn الفعلي (الـ JSON الخام).
  - رسالة الخطأ من شبكة المتصفح.
- قراءة سجلات GoTrue من `auth_logs` خلال نافذة التنفيذ لتأكيد أن المصدر هو `listUsers`/`createUser`/`updateUserById` وأي مستخدم تحديداً يفشل.

### 2. إزالة الاعتماد على `auth.admin.listUsers` في `createAccount`

`createAccount` يستخدم `auth.admin.listUsers({ perPage: 200 })` فقط للتحقق من وجود حساب بنفس البريد قبل الإنشاء. هذا الاستدعاء:
- يجلب 200 سجلاً في كل مرة وقد يفشل كلياً بسبب سجل فاسد واحد.
- لا يغطي الحالة إذا تجاوز عدد المستخدمين 200.

البديل الآمن: استعلام مباشر على `auth.users` بالبريد عبر `supabaseAdmin` (Service Role يستطيع القراءة من `auth`):

```ts
const { data: existing } = await supabaseAdmin
  .schema("auth")
  .from("users")
  .select("id, email")
  .ilike("email", email)
  .maybeSingle();
```

هذا يحل مشكلة "Database error loading user" في زر «إنشاء حساب» نهائياً ويُسرّع الاستدعاء.

### 3. تحسين رسالة الخطأ للمستخدم

في `createAccount` / `resetPassword` / `setActive`، عند فشل أي استدعاء `auth.admin.*` نلتقط الرسالة الأصلية ونُعيدها بصيغة مفيدة بالعربية بدلاً من تمرير نص GoTrue الخام:

```
"تعذّر إتمام العملية على حساب الدخول (auth) — السبب التقني: <message>"
```

دون كتم الخطأ — فقط تغليفه ليفهم المستخدم أنه ليس خطأً في بياناته.

### 4. (في حال أكدت السجلات وجود سجل auth فاسد)

نفحص `auth.users` لاكتشاف أي سطر بـ `raw_user_meta_data` غير صالح أو `identities` معطلة، ثم نُصلحه عبر migration (مثل ضبط `raw_user_meta_data = '{}'::jsonb` للسطر المُتأثر). لن نُنفّذ هذه الخطوة قبل تأكيد التشخيص من السجلات.

### 5. التحقق

- تشغيل Playwright مرة أخرى على نفس السيناريو والتحقق من اختفاء الرسالة.
- التأكد أن «إنشاء حساب» و«إعادة تعيين» و«تعطيل/تفعيل» تعمل لعضو واحد على الأقل.

## ممنوع في هذا التنفيذ

- تعديل أي RLS policy.
- تغيير منطق الصلاحيات/الأدوار.
- لمس schema الـ `auth` بأي تعديل بنيوي.
- حذف/تعطيل أي وظيفة قائمة.
