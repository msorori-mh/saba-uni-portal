# PORTAL-UNIVERSITY-EMAIL-LOGIN-IMPORT-01 Report

## 1. Executive Summary

* **القرار:** PASS_WITH_NOTES
* **تحويل الدخول إلى الإيميل الجامعي:** نعم — واجهات الطالب/الأكاديمي/الموظف تستخدم `signInWithPassword({ email, password })` مع رفض المدخلات التي لا تحتوي `@`.
* **تعديل نماذج الاستيراد:** نعم — قوالب الطلاب وأعضاء هيئة التدريس والموظفين و`faculty_accounts` محدّثة مع تعليمات واضحة.
* **إجبار تغيير كلمة المرور عند أول دخول:** نعم — `must_change_password` ما زال يُضبط عند إنشاء الحسابات (طلاب، أكاديميون، موظفون) عبر RPC/الحقول الموجودة.

## 2. Login Changes

| البوابة | الملف | ما الذي تغيّر |
|--------|------|----------------|
| الطلاب / الأكاديميون / الموظفون (موحّد) | `src/routes/portal-login.tsx` | التسمية → «الإيميل الجامعي»، `type="email"`، التحقق عبر `validateUniversityLoginEmailInput`، إزالة منطق `رقم@domain`، الدخول المباشر بـ `signInWithPassword({ email })`. |
| الطلاب (موبايل) | `src/routes/mobile.student-login.tsx` | نفس النمط: إيميل جامعي فقط. |
| استعادة كلمة المرور | `src/routes/forgot-password.tsx` | النصوص التوضيحية تذكر الإيميل الجامعي بدل الرقم. |
| مساعد التحقق | `src/components/auth/IdentifierInput.tsx` | رسائل الخطأ بالعربية توضّح رفض الرقم الأكاديمي/الوظيفي. |
| مساعدات مشتركة | `src/lib/university-email-auth.ts` | **ملف جديد:** تطبيع الإيميل، التحقق من الصيغة، `facultyTemporaryPassword`. |

**ملاحظة:** لا يُستخدم `service role` في المتصفح؛ المصادقة عبر `supabase` client العادي فقط.

## 3. Faculty Account Import

* **login = email:** نعم — `faculty_accounts` و`createFacultyMember` و`admin-users` (`resolveProfileLoginEmail`) يقرأون الإيميل من حقل `faculty.email` / عمود `email` في الاستيراد.
* **temporary password = academic_number:** نعم — `facultyTemporaryPassword(academic_number, employee_number)`؛ الاستيراد يقبل `academic_number` أو `initial_password`.
* **must_change_password:** نعم — يُضبط `true` عند الإنشاء (`admin-people.functions.ts`, `faculty-accounts.functions.ts`, استيراد الطلاب/الحسابات).
* **الرقم الوظيفي:** يبقى للتعريف الإداري فقط، ليس اسم دخول.

## 4. Student Account Import

* **login = email:** نعم — `provisionStudentLogin` واستيراد الطلاب (`engine.server.ts`) يتطلبان `university_email` عند `create_login=true`.
* **الرقم الأكاديمي:** يبقى معرّفاً أكاديمياً فقط؛ لا يُقبل كاسم دخول في الواجهة أو التحقق.
* **backfill حسابات الطلاب:** معاينة/إنشاء الحسابات يتطلب وجود `email` في `student_profiles`؛ يُتخطّى الطالب بدون إيميل برسالة واضحة.

## 5. Staff Account Import

* **login = email:** نعم في واجهة الإدارة (`staff-management.tsx`) و`createStaffMember` — الإيميل الجامعي إلزامي عند `create_login=true`.
* **الرقم الوظيفي:** يبقى معرّفاً إدارياً فقط.
* **كلمة المرور المؤقتة:** **تحتاج قراراً منفصلاً** — حالياً `generateTemporaryPassword()` عشوائية (8+ أحرف) وليست الرقم الوظيفي؛ لا يوجد رقم أكاديمي للموظفين.
* **فجوة معروفة:** قالب Excel للموظفين (`templates.ts`) يتضمن عمود `university_email`، لكن `validateStaff` / `importStaff` لا يخزّنان الإيميل بعد في `staff_profiles` حتى تُطبَّق migration `staff_profiles.email` (انظر §8).

## 6. Import Templates Updated

| الملف | التغيير |
|------|---------|
| `src/lib/imports/templates.ts` | طلاب: عمود `university_email` + تعليمات login؛ موظفون: عمود `university_email`؛ تعليمات `create_login`/`must_change_password`. |
| `src/lib/imports/master-templates.ts` | `faculty_accounts`: login=email، temp password=academic_number؛ طلاب: عمود `university_email`؛ `must_change_password`. |
| `src/lib/imports/validators.ts` | `university_email` مطلوب عند `create_login=true` للطلاب؛ تحقق صيغة email. |
| `src/lib/imports/engine.server.ts` | حفظ `email` على `student_profiles`؛ تزويد `provisionStudentLogin` بالإيميل الجامعي. |

## 7. Validation

* **email required:** عند `create_login=true` للطلاب (استيراد + إنشاء يدوي + backfill).
* **email format:** `UNIVERSITY_EMAIL_REGEX` / Zod `.email()` في النماذج والاستيراد.
* **university email domain:** النطاقات المعروفة مُعرّفة في `KNOWN_UNIVERSITY_EMAIL_SUFFIXES` (`@students.usr.edu.ye`, `@faculty.usr.edu.ye`, `@staff.usr.edu.ye`, `@usr.edu.ye`) للتوثيق؛ **لا يُفرض** قيد النطاق صراحةً في التحقق حالياً (يُقبل أي email صالح).
* **رفض الرقم كمعرّف دخول:** واجهة الدخول ترفض المدخلات بدون `@` برسالة عربية صريحة.

## 8. Risks / Notes

1. **كلمات مرور قصيرة (أعضاء هيئة التدريس):** إذا كان الرقم الأكاديمي أقصر من الحد الأدنى لـ Supabase Auth (عادة 6–8 أحرف)، قد يفشل `createUser`. **لم تُغيَّر سياسة Auth العامة** — الحل الآمن المقترح: استخدام `initial_password` يدوياً عند الفشل، أو تمديد الرقم ببادئة ثابتة بموافقة إدارية.
2. **حسابات قديمة:** حسابات أُنشئت ببريد اصطناعي `رقم@domain` (دالة `emailFor` المُهمَلة) تحتاج ترحيلاً لاحقاً لربط الإيميل الجامعي الحقيقي في Auth — **خارج نطاق هذه المرحلة**.
3. **لا تعديل بيانات حالية:** لم يُنشأ أي حساب ولم تُعدَّل بيانات فعلية.
4. **Migration مُنشأة غير مُطبَّقة:** `supabase/migrations/20260711000000_staff_profiles_university_email.sql` تضيف `email` إلى `staff_profiles` — مطلوبة لإكمال استيراد الموظفين بالإيميل.
5. **موظفون — كلمة مرور مؤقتة:** تحتاج سياسة منفصلة (عشوائية حالياً).

## 9. Checks

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | **نجح** (≈13–52 ثانية، بدون أخطاء) |
| `git diff --check` | **نجح** (لا تعارضات whitespace) |

## 10. No-DB-Write Assurance

* لا DB changes مُطبَّقة
* لا data writes
* لا إنشاء حسابات
* لا migrations مُطبَّقة (ملف migration مُنشأ فقط)
* لا Supabase/Lovable apply
* لا commit / push / PR

---

## الملفات المعدّلة (نطاق هذه المرحلة)

**جديد:**
- `src/lib/university-email-auth.ts`
- `supabase/migrations/20260711000000_staff_profiles_university_email.sql` (draft)

**معدّل:**
- `src/routes/portal-login.tsx`
- `src/routes/mobile.student-login.tsx`
- `src/routes/forgot-password.tsx`
- `src/components/auth/IdentifierInput.tsx`
- `src/components/admin/people/shared.tsx`
- `src/lib/admin-users.functions.ts`
- `src/lib/admin-students.functions.ts`
- `src/lib/admin-people.functions.ts`
- `src/lib/faculty-accounts.functions.ts`
- `src/lib/imports/validators.ts`
- `src/lib/imports/engine.server.ts`
- `src/lib/imports/templates.ts`
- `src/lib/imports/master-templates.ts`
- `src/routes/admin/students.lazy.tsx`
- `src/routes/admin/faculty-management.tsx`
- `src/routes/admin/staff-management.tsx`

---

## ملخص سريع للمستخدم

| السؤال | الجواب |
|--------|--------|
| القرار | **PASS_WITH_NOTES** |
| الدخول بالإيميل فقط | **نعم** |
| قوالب الاستيراد | **نعم، محدّثة** |
| كلمة مرور عضو هيئة التدريس المؤقتة = الرقم الأكاديمي | **نعم** (مع تحذير طول كلمة المرور) |
| نتيجة build | **نجح** |
