# STUDENT-REQUESTS-ROUTER-OUTLET-FIX-01 — REPORT

## السبب الجذري
`src/routes/student.requests.new.tsx` و `src/routes/student.requests.$id.tsx` مسجّلان في `routeTree.gen.ts` كأبناء لـ `student.requests.tsx` (parentRoute = StudentRequestsRoute). لكن `student.requests.tsx` كان يعرض قائمة الطلبات مباشرة **دون `<Outlet />`**، فلم يكن هناك موضع لتركيب الابن. النتيجة: `/student/requests/new` و `/student/requests/$id` كانا يطابقان المسار الصحيح لكن يعرضان محتوى القائمة بدلاً من الأبناء.

## الملفات المعدَّلة
- `src/routes/student.requests.tsx` — تحوّل إلى layout بسيط: `component: () => <Outlet />`.
- `src/routes/student.requests.index.tsx` — **جديد**: يحمل محتوى قائمة الطلبات الأصلي بالكامل (نفس الاستعلام، نفس الجدول، نفس روابط "طلب جديد" و "عرض") ومسجّل على `createFileRoute("/student/requests/")`.

## لماذا layout + index route؟
هذا هو النمط الرسمي في TanStack Router عندما يحمل ملف parent محتوى في الوقت نفسه الذي يمتلك أبناء فيه: نقل المحتوى إلى `*.index.tsx` وترك الأب كطبقة تخطيط. البديل (إبقاء المحتوى في الأب وإضافة `<Outlet />` تحته) سيدمج القائمة مع صفحة الابن — سلوك غير مرغوب. الحل المطبق يحفظ سلوك `/student/requests` كما كان تماماً ويصلح `/new` و `/$id` بلا آثار جانبية.

## نتائج المسارات
- `/student/requests` → **قائمة الطلبات** (من `student.requests.index.tsx`) — كما كان.
- `/student/requests/new` → **نموذج إنشاء الطلب** (من `student.requests.new.tsx`) — يعمل الآن.
- `/student/requests/$id` → **تفاصيل الطلب** (من `student.requests.$id.tsx`) — يعمل الآن.

التحقق من `src/routeTree.gen.ts` بعد البناء:
- `/student/requests` = `StudentRequestsRouteWithChildren` (layout)
- `/student/requests/` = `StudentRequestsIndexRoute` (leaf index)

## نتيجة البناء
`bun run build` ✅ نجح في 12.91s بدون أخطاء أو تحذيرات جديدة.

## الالتزامات
- Migration؟ **لا**
- تعديل DB؟ **لا**
- Import؟ **لا**
- delete/reset/cleanup؟ **لا**
- تعديل RLS/Storage/حسابات اختبار/بيانات إنتاج؟ **لا**
- تعديل يدوي على `routeTree.gen.ts`؟ **لا** (تولّد تلقائياً)

## القرار النهائي
**PASS**
