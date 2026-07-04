# COUNCILS-FACULTY-COUNCILS-READONLY-VERIFY-01-AFTER-MERGE — تقرير التحقق

- التاريخ: 2026-07-04
- الفرع الفعّال في Lovable: `main`
- آخر commit: `36b008c Merge pull request #77 from msorori-mh/councils/faculty-portal-entry-01`
- نطاق العمل: تحقق فقط. لا تعديلات كود، ولا migrations، ولا DB/RLS/Storage/Email/Cron/seed.

## 1) الملفات المفحوصة

| الملف | الحالة |
|---|---|
| `src/routes/faculty-portal.academic-councils.tsx` | موجود (140 سطر) |
| `src/lib/faculty-councils.functions.ts` | موجود (63 سطر) |
| `src/routes/faculty-portal.index.tsx` | يحتوي بطاقة "مجالسي الأكاديمية" مع الرابط `/faculty-portal/academic-councils` (سطر 172) |

## 2) صفحة `/faculty-portal/academic-councils`

- Route مُسجَّل عبر `createFileRoute("/faculty-portal/academic-councils")` مع `meta` تحوي `robots: noindex, nofollow`.
- الحماية عبر layout `faculty-portal.tsx` (جلسة عضو هيئة التدريس + `must_change_password` guard).
- عرض القائمة عبر `useServerFn(getMyAcademicCouncilMemberships)` + `useQuery` (staleTime 30s، بدون refetchOnWindowFocus).
- حالات UI مغطاة: تحميل (Loader2) / خطأ (بلوك destructive) / قائمة فارغة (Empty state) / قائمة عضويات (بطاقات).
- كل بطاقة تعرض: اسم المجلس، نوع المجلس (مجلس الكلية / مجلس قسم)، شارة الفعالية، الدور (رئيس/أمين سر/عضو/مطّلع)، وتاريخ بداية العضوية.
- تنبيه صريح أسفل الصفحة: "هذه الصفحة للاطلاع فقط. إدارة الاجتماعات والموضوعات والقرارات ستُفعَّل في مراحل لاحقة."

## 3) Server function `getMyAcademicCouncilMemberships`

- ينفذ بـ `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])` — جلسة العضو + RLS.
- يقرأ `faculty_profiles` للتأكد من وجود ملف فعّال قبل الاستعلام.
- يقرأ `academic_council_members` مع `join` على `academic_councils` مقيَّداً بـ `user_id = context.userId` و `is_active = true` و `active_to IS NULL`.
- لا يستخدم `supabaseAdmin`، ولا `service_role`، ولا `.insert(`, ولا `.update(`, ولا `.delete(`.
- رسائل الأخطاء عربية وواضحة.

## 4) فحوصات الأمان

| البند | النتيجة |
|---|---|
| `supabaseAdmin` أو `service_role` في المسار (route/handler عميل + server-fn) | ❌ غير مستخدم |
| عمليات كتابة (insert/update/delete) | ❌ لا شيء — قراءة فقط |
| DB schema / RLS changes | ❌ لا شيء |
| Storage / Email / Cron / seed | ❌ لا شيء |
| Migrations جديدة | ❌ لا شيء |
| Robots | `noindex, nofollow` مضبوط |
| RLS للعضو نفسه على `academic_council_members` | مطبَّق من مراحل سابقة (قراءة الصفوف الخاصة بالمستخدم فقط) |

## 5) الملاحظات

- الشاشة قراءة فقط بالكامل — لا أزرار ربط/تعطيل/حذف.
- عرض العضويات الفعّالة فقط (`is_active = true` و `active_to IS NULL`) كما هو مطلوب.
- الدخول محمي بالـ layout `/faculty-portal` (auth + must_change_password redirect).

## 6) القرار

**PASS**

## 7) التوصية التالية

`READY_FOR_FACULTY_COUNCILS_PILOT`
