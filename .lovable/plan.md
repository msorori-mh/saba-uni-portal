
## الهدف
استبدال نظام الخطوط الحالي (Cairo نصوص + Tajawal عناوين) بـ:
- **نصوص**: IBM Plex Sans Arabic (400/500/600/700) + Noto Sans Arabic (fallback) + system-ui
- **عناوين فقط**: Cairo (600/700)

## الملفات المعدّلة

### 1) `src/routes/__root.tsx` — تحميل الخطوط عبر `<link>`
حسب قاعدة Tailwind v4 (ممنوع `@import` لروابط Google Fonts داخل styles.css)، نضيف داخل `head().links`:
- `preconnect` إلى `fonts.googleapis.com` و `fonts.gstatic.com` (موجود بالفعل ضمنياً عند استخدام Google Fonts).
- `stylesheet` واحد يجمع الخطوط الثلاثة بالأوزان المطلوبة فقط مع `display=swap`:
  ```
  https://fonts.googleapis.com/css2?
    family=IBM+Plex+Sans+Arabic:wght@400;500;600;700
    &family=Cairo:wght@600;700
    &family=Noto+Sans+Arabic:wght@400;500
    &display=swap
  ```

### 2) `src/styles.css` — تحديث متغيرات الخطوط
- إزالة سطر `@import url('https://fonts.googleapis.com/css2?family=Cairo...&family=Tajawal...')` (سيُنقل إلى `<link>`).
- داخل `@theme inline` تحديث:
  ```css
  --font-sans: "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif;
  --font-display: "Cairo", "IBM Plex Sans Arabic", sans-serif;
  ```
- إضافة متغيرات صريحة في `:root`:
  ```css
  --font-body: "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif;
  --font-heading: "Cairo", "IBM Plex Sans Arabic", sans-serif;
  ```
- في `@layer base`:
  - `body { font-family: var(--font-body); line-height: 1.7; }`
  - `h1..h6 { font-family: var(--font-heading); line-height: 1.35; font-weight: 700; letter-spacing: -0.01em; }`
- إضافة على `html`:
  ```css
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  ```
- ضمان حد أدنى لحجم نص الجوال داخل `/mobile/*` (موجود فعلياً غالباً ≥14px؛ سيتم التحقق بصرياً دون فرض overrides عامة كي لا نكسر التصميم).

### 3) لا تعديل على JS/TSX للمكوّنات
- مكوّنات تستخدم `font-display` (مثل `PageHeader`, `ComingSoon`) ستحصل تلقائياً على Cairo بفضل تحديث `--font-display` في `@theme inline`.
- باقي المكوّنات تستخدم خط الـ body الافتراضي → تحصل تلقائياً على IBM Plex Sans Arabic.

## ما لا يتغيّر
- لا تعديل على الألوان / الـ tokens / الـ layout.
- لا حذف لاستخدامات `font-display` في JSX.
- لا تعديل على Auth / DB / Business logic / Capacitor / GitHub Actions.
- لا إضافة مكتبات أو حزم npm.

## خطة الاختبار (بعد التنفيذ في build mode)
1. فتح `browser--view_preview` على المسارات:
   - `/`, `/student`, `/admin`, `/admin/faculty-management`, `/admin/finance`
   - `/mobile/student-login`, `/mobile/student`, `/mobile/student/grades`, `/mobile/student/academic-record`, `/mobile/student/finance`, `/mobile/student/requests`, `/mobile/student/documents`
2. تكرار الاختبار على مقاسات: 360×640، 375×667، 390×844، 412×915.
3. التحقق من:
   - ظهور IBM Plex Sans Arabic للنصوص + Cairo للعناوين (عبر screenshot).
   - عدم وجود scroll أفقي.
   - عدم كسر RTL.
   - تطبيق `font-display: swap` (لا FOIT).

## تقرير التسليم (يُرسل بعد التنفيذ)
- قائمة الملفات المعدلة (`src/routes/__root.tsx`, `src/styles.css`).
- طريقة التحميل: `<link rel="stylesheet">` من Google Fonts بأوزان محدودة + `display=swap`.
- الخط الأساسي / خط العناوين المطبق.
- نتائج الاختبار على المقاسات الأربعة.
- ملاحظات حول RTL والأداء (الخطوط من Google Fonts → لا تأثير على Initial JS Bundle، فقط طلبات CSS/woff2 خفيفة بسبب اقتصار الأوزان).
- لقطات قبل/بعد لصفحتين تمثيليتين (الرئيسية + `/mobile/student`).

## معيار النجاح
- جميع النصوص العادية بـ IBM Plex Sans Arabic.
- جميع العناوين (h1..h6 + كلاسات `font-display`) بـ Cairo.
- لا regression بصري في RTL أو الجوال.
- لا زيادة ملحوظة في حجم الحزمة.
