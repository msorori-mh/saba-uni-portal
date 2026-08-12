# PORTAL-ENROLLMENT-CERTIFICATE-VIOLATION-BANNER-TRUTHFULNESS-UX-01 — تقرير صدق شريط المخالفة

- المستودع: `msorori-mh/saba-uni-portal`
- الفرع: `review/enrollment-certificate-violation-banner-ux-01` (من `origin/main`)
- التاريخ: 2026-07-25
- النطاق: مسارات طلبات الطالب الثلاثة (إنشاء/قائمة/تفاصيل) + اختبارات + هذا التقرير

## القرار

**PASS_ENROLLMENT_CERTIFICATE_VIOLATION_BANNER_UX_READY**

## 1. أصل ظهور الشريط الأحمر

راجعت كل الأسطح الطلابية لإفادة القيد (إنشاء/قائمة/تفاصيل/موبايل/لوحة الطالب). التصنيف المنطقي
للأهلية (`request-eligibility-ui` + `StudentRequestEligibilityNotice`) كان قد أُصلح سابقًا
(`enrollment-certificate-availability-banner-ux-fix-01`): النموذج الطبيعي النظيف = `available`
بلا أسباب منع، والسياق غير المحسوم = `needs_verification` (عنبر ناعم لا أحمر)، والأحمر الواسع
(`bg-rose-100`) لا يظهر إلا لسبب موثق من حالة الـ picker القادمة من النظام (`is_eligible=false`).

العيوب المتبقية التي أُغلقت في هذه المهمة:

1. **رسائل Backend خام تُعرض في صناديق حمراء** عند أي فشل تحميل/إرسال — وهي التي تُظهر «شريطًا أحمر»
   بنص تقني (PostgREST/RLS) لا علاقة له بمخالفة الطالب:
   - `student.requests.$id.tsx`: صندوق خطأ التحميل كان يعرض `(error as Error)?.message` خامًا، وtoast إعادة الإرسال كذلك.
   - `student.requests.index.tsx`: صندوق فشل القائمة كان يعرض `requestsErr.message` خامًا.
   - `student.requests.new.tsx`: خطأ الإرسال (state + toast) ورسائل البيانات المرجعية المخزّنة كانت خامًا.
2. **تسريب كامن**: رسالة خطأ البيانات المرجعية الخام كانت تُخزَّن في `referenceData` (غير معروضة حاليًا) — أصبحت نصًا عامًا.

## 2. قبل وبعد

| الحالة | قبل | بعد |
|---|---|---|
| فتح طبيعي بلا مخالفة | لا أحمر (سليم منذ الإصلاح السابق) — مثبَّت بحراس بصرية جديدة | كما هو + حارس منع رجوع |
| فشل تحميل/إرسال | شريط أحمر بنص Backend خام | شريط أحمر برسالة عربية عامة آمنة + role="alert" |
| violation مثبتة (picker: مكرر/غير مؤهل) | أحمر واسع مع سبب النظام | كما هو — مثبَّت باختبار |
| loading/undefined | لا ادعاء مخالفة (عنبر ناعم) | كما هو — مثبَّت باختبار |
| طلب قائم (submitted/processing/archived) | تُخفى أهلية الإنشاء كليًا | كما هو — مثبَّت باختبار |

## 3. مصفوفة التصنيف (كما هي مطبقة الآن)

- **Error (أحمر/rose + role="alert"):** رفض موثق من النظام (`is_eligible=false` بسبب مكرر/مانع)، رفض الطلب (rejected)، فشل تحميل/إرسال برسالة عامة.
- **Warning (عنبر):** تعذر إكمال التحقق (needs_verification)، خدمة تتطلب مرفقًا غير مفعّل، فشل تحقق الأهلية المؤقت، إعادة للاستكمال (orange).
- **Info (أزرق/محايد):** معلومات الخدمة ومتطلباتها، إلغاء الطلب (zinc)، حالات سير عادية.
- **Success (زمرد):** تأكيد السداد/الإصدار القادم من Backend فقط.

## 4. الخصوصية

- لا `error.message` خام في المسارات الثلاثة (حارس مصدري).
- لا UUID/user_id/student_profile_id/storage في أي واجهة رُوجعت (الأرقام المعروضة: `request_number` المنسّق فقط).
- لا أسماء جداول/دوال/SQL في الرسائل.

## 5. RTL وAccessibility وMobile

- الجذر `dir="rtl"` في كل الصفحات المراجَعة؛ role="alert" على كل أسطح الفشل؛ رسائل عربية قصيرة تقرأ بوضوح على 360px؛ الأزرار المعطلة مشروطة بأسباب ظاهرة.

## 6. الاختبارات

`tests/student-requests/enrollment-certificate-violation-banner-ux-01.test.ts` — 8 اختبارات:
- لا `bg-rose-100` في الفتح الطبيعي، ولا عند loading/undefined (عنبر ناعم بدلًا منه).
- الأحمر يظهر فقط مع سبب موثق من الـ picker ويحمل نصه.
- إخفاء أهلية الإنشاء للحالات اللاحقة (submitted/processing/completed/archived).
- لا `.message` خام في المسارات الثلاثة؛ رسائل الفشل العامة مثبتة؛ role="alert" مثبت؛ لا `student_visible`.

النتائج:
- `bun test tests/student-requests` — **613/613**
- `bun test tests` — **1550/1550** (142 ملفًا)
- `bunx tsc --noEmit` — pass · `bun run build` — pass · `git diff --check` — نظيف
- eslint: أخطاء prettier في هذه الملفات موجودة مسبقًا على main (391 في `$id` قبل تعديلي) — لا أخطاء جديدة على الأسطر المعدّلة.

## 7. تأكيدات

- لم تُعدّل: SQL/migrations، RPC، التفويض، Workflow، `student_visible`، خدمات B1 الخمس، `enrollment_certificate` backend lifecycle، الوثائق المحمية.
- لا Production/Staging/Deploy/Migration/دمج.
