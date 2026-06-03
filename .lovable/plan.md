## التحقق من الحالة الفعلية

فحصتُ `src/routes/portal-login.tsx` و كل أماكن الاستخدام:

- **لا يوجد مكوّن `Tabs` / `TabsList` / `TabsTrigger` في `portal-login.tsx` على الإطلاق.** بحثت بـ `rg "Tabs"` فلم يظهر شيء.
- الملف بالفعل ينفّذ النمط المطلوب تماماً (السطور 36–56):
  ```tsx
  validateSearch: (s) => {
    const t = s.type;
    if (t === "student" || t === "faculty" || t === "staff") return { type: t };
    return {};
  }
  function PortalLoginPage() {
    const { type } = Route.useSearch();
    if (type) return <SinglePortalLogin accountType={type} />;
    return <PortalSelector />;
  }
  ```
  `SinglePortalLogin` يعرض فقط نموذج النوع المحدد، و `PortalSelector` يعرض 3 بطاقات (لا تابات) عند غياب `type`.
- التحقق بعد الدخول موجود (السطور ~140–146): `dest !== REDIRECT_AFTER_LOGIN[accountType]` → `signOut()` + رسالة "هذا الحساب لا يطابق نوع البوابة المحددة."
- روابط الـ Homepage / Header / Footer كلها تمرّر `search={{ type }}` بشكل صحيح.

**الاستنتاج:** UX-AUTH-02 منفّذة فعلياً في الكود. على الأرجح ما تراه:
1. **نسخة مكتشة في المتصفح / CDN (Cloudflare).** اعمل Hard Refresh (Ctrl+Shift+R) أو افتح وضع التصفح الخاص.
2. **خلط بين "بطاقات الاختيار" والتابات.** صفحة `/portal-login` بدون `?type=` تعرض **3 بطاقات** (هذا مطلوب حسب المواصفات: "show 3 clean cards, not tabs") — هذه ليست تابات.

## ما يحتاج فعلاً إلى عمل (تحسين توافق مع المواصفات)

نقطة وحيدة لم تتطابق حرفياً مع المواصفات:

### مواءمة اسم المعامل في `forgot-password` من `ctx` إلى `type`

المواصفات تطلب `/forgot-password?type=student` لكن المشروع حالياً يستخدم `ctx`. سأقوم بـ:

1. **`src/routes/forgot-password.tsx`** — استبدال `ctx` بـ `type` في `validateSearch` والقراءة، مع إبقاء قبول `ctx` كـ alias اختياري لتفادي كسر أي روابط قديمة (backward-compat).
2. **`src/routes/portal-login.tsx`** — تغيير `<Link to="/forgot-password" search={{ ctx: accountType }}>` إلى `search={{ type: accountType }}`.
3. **`src/routes/admin/login.tsx`** — تغيير الرابط من `ctx: "admin"` إلى `type: "admin"`.
4. البحث وتعديل أي رابط آخر يستخدم `ctx` لـ forgot-password.

## ملفات لن تُلمس
- لا تعديلات DB / RLS / Auth.
- لا تعديل في `portal-login.tsx` على منطق العرض (هو صحيح بالفعل).
- لا تعديل في الـ Homepage / Header / Footer (الروابط صحيحة بالفعل).

## اختبارات القبول (سيتم التحقق منها بعد البناء)

- `/portal-login?type=student` → فقط نموذج الطالب، لا تابات، لا ذكر "عضو هيئة تدريس".
- `/portal-login?type=faculty` → فقط نموذج عضو هيئة التدريس.
- `/portal-login?type=staff` → فقط نموذج الموظف.
- `/portal-login` (بدون type) → 3 بطاقات اختيار.
- حساب طالب على `?type=faculty` → رفض + signOut.
- `/forgot-password?type=student|faculty|staff|admin` → يعرض السياق الصحيح.

## السؤال قبل التنفيذ

هل تريد:
- **(أ)** تطبيق مواءمة `ctx → type` فقط (التحسين الوحيد المتبقي)، أم
- **(ب)** عدم تغيير أي شيء لأن الميزة منفّذة فعلاً، والاكتفاء بـ Hard Refresh للمتصفح؟
