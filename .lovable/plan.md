# منع وميض صفحة تسجيل الدخول عند تحديث الصفحات المحمية

## السبب الجذري
المسارات المحمية الحالية (`/admin`, `/student`, `/staff`, `/faculty-portal`, `/mobile/student`) تعمل SSR افتراضياً. عند التحديث:
1. الخادم ينفّذ `beforeLoad` بلا جلسة (الجلسة في `localStorage` المتصفح فقط).
2. `supabase.auth.getUser()` ترجع فارغة → الخادم يصدر redirect إلى صفحة تسجيل الدخول ويرسل HTML الخاص بها.
3. المتصفح يستلم HTML تسجيل الدخول ويعرضه لحظياً.
4. بعد الترطيب (hydration)، يقرأ Supabase التوكن من `localStorage`، يعيد تنفيذ `beforeLoad` بنجاح، ويتم التوجيه للمحتوى الفعلي.

النتيجة: وميض صفحة تسجيل الدخول قبل المحتوى.

## الإصلاح
إضافة `ssr: false` إلى تعريف كل مسار محمي (الـ layout)، حتى لا يصدر الخادم HTML خاطئاً، ويتم فحص الجلسة فقط في المتصفح حيث تتوفر. خلال هذا، يعرض الـ Layout بالفعل سبينر تحميل (`Loader2`) فيظهر بدلاً من صفحة تسجيل الدخول.

## الملفات المتأثرة (تعديل سطر واحد لكل ملف)
أضف `ssr: false` داخل `createFileRoute(...)({ ... })`:

1. `src/routes/admin.tsx`
2. `src/routes/student.tsx`
3. `src/routes/staff.tsx`
4. `src/routes/faculty-portal.tsx`
5. `src/routes/mobile.student.tsx`

مثال:
```text
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ ... }),
  beforeLoad: async ({ location }) => { ... },
  component: AdminLayout,
});
```

## خارج النطاق
- لا تغيير في منطق `beforeLoad` أو إدارة الأدوار.
- لا تغيير في الصفحات العامة (`/`, `/about`, `/faculty`...) — تبقى SSR لأنها تحتاج SEO.
- صفحات تسجيل الدخول نفسها (`/admin/login`, `/portal-login`, `/mobile/student-login`) تبقى كما هي.

## التحقق
- تحديث `/admin` و`/student` و`/faculty-portal` بعد تسجيل الدخول → يظهر سبينر فقط ثم المحتوى، بدون وميض صفحة تسجيل الدخول.
- تحديث أي مسار محمي بدون جلسة → ينتقل مباشرة لصفحة تسجيل الدخول كالمعتاد.
