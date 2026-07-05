# COUNCILS-FACULTY-TOPIC-SUBMIT-AUTH-UX-01 — تقرير إصلاح تجربة انتهاء الجلسة

**التاريخ:** 2026-07-05
**القرار:** **PASS**
**التوصية التالية:** **READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DESIGN_01**

---

## 1. سبب المشكلة

عند انتهاء JWT أثناء استدعاء `submitCouncilTopic` عبر `useServerFn`، كان الخطأ الخام (`JWT has expired`) يُمرَّر مباشرة إلى `toast.error` عبر `mapSubmitError` القديمة التي كانت تُعيد النص التقني كما هو لغير أخطاء الصلاحيات.

---

## 2. الملفات المعدّلة

| الملف | التغيير |
|-------|---------|
| `src/routes/faculty-portal.academic-councils.tsx` | تعريف أخطاء الجلسة + رسالة عربية + رابط تسجيل الدخول |

**لم يُمس:** `faculty-councils.functions.ts`، DB، RLS، migrations، Storage، admin UI، routes.

---

## 3. كيف تم التعامل مع JWT expired

### دوال جديدة في الواجهة

| الدالة | الغرض |
|--------|--------|
| `extractErrorMessage` | استخراج نص الخطأ من `unknown` |
| `isSessionExpiredError` | كشف أنماط: `jwt has expired`، `invalid jwt`، `refresh token`، `session expired`، `authapierror`، `token expired`، إلخ |
| `mapSubmitError` (محدّثة) | تحويل أخطاء الجلسة والمصادقة إلى رسالة عربية؛ الإبقاء على رسالة الصلاحيات؛ إخفاء النصوص التقنية الإنجليزية |

### الرسالة المعروضة

> انتهت جلسة تسجيل الدخول، يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.

### تجربة المستخدم

1. **Toast** بالرسالة العربية (بدون `JWT has expired`).
2. **بانر داخل نموذج التقديم** عند كشف انتهاء الجلسة يتضمن رابط:
   **العودة إلى تسجيل الدخول** → `/portal-login` (نمط المشروع لبوابة هيئة التدريس).

### ما بقي دون تغيير

- رسالة الصلاحيات: «لا تملك صلاحية تقديم موضوع لهذا المجلس.»
- مسار النجاح: toast نجاح + إعادة تحميل الموضوعات + إفراغ النموذج.
- منطق RLS و`submitCouncilTopic` في الخادم.

---

## 4. نتائج التحقق

| الفحص | النتيجة |
|-------|---------|
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |

---

## 5. تأكيدات الامتثال

| البند | الحالة |
|-------|--------|
| migrations | ❌ |
| DB changes | ❌ |
| RLS changes | ❌ |
| Storage | ❌ |
| Email/Cron | ❌ |
| service role | ❌ |
| admin UI | ❌ |
| route جديد | ❌ |
| تعديل صلاحيات | ❌ |
| بيانات اختبارية | ❌ |

---

## 6. التوصية التالية

**READY_FOR_COUNCILS_TOPIC_ATTACHMENTS_DESIGN_01** — مرحلة تصميم مرفقات الموضوعات بعد استقرار تجربة التقديم والمصادقة.
