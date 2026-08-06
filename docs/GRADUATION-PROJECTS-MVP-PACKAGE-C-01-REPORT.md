# تقرير حزمة C — واجهة مشاريع التخرج MVP

**المهمة:** `PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_C_ROUTES_UI_IMPLEMENTATION_01`

**العقد المجمّد:** `7b67539aeb21bd223287de39d480cb1e6c0332b0`

**الفرع:** `feat/gp-mvp-package-c-01`

**التاريخ:** 2026-08-06

## النتيجة

تم تنفيذ واجهة عربية RTL قابلة للبناء للمسارات الخمسة المجمّدة، مع مساحات عمل واعية بالممثل، حالات تحميل/خطأ/فراغ/نجاح، مرفقات خاصة، تأكيد الإجراءات النهائية، وروابط تنقل الطالب وعضو هيئة التدريس والإدارة.

**القرار: HOLD** بسبب فشل اختبارين داخل بوابة التحقق الإلزامية `bun test tests/student-requests` على المصدر المجمّد: اختبار polarity لـ`student_visible` (لا علاقة له بتغييرات الحزمة ولم تُلمس migrations)، واختبار hash ثابت لـ`routeTree.gen.ts` يتوقع شجرة ما قبل إضافة المسارات المطلوبة. لم تُعدّل اختبارات أو ملفات النطاق غير المملوك لإخفاء الفشل.

## الملفات المعدلة

- مكونات Package C الجديدة تحت `src/components/graduation-projects/`: نموذج العرض، قائمة المشاريع، مساحة العمل، حالات الواجهة، وتحكم الملف الخاص.
- المسارات الجديدة تحت `src/routes/`: مسارا الطالب، مسارا مساحة عضو هيئة التدريس، العرض الإداري، والـadapter المؤقت المملوك للواجهة.
- روابط التنقل: `src/routes/student.index.tsx` و`src/components/portal/FacultyPortalShell.tsx` و`src/components/admin/AdminShell.tsx` و`src/lib/admin-nav.ts`.
- `src/routeTree.gen.ts` مولّد بواسطة build.
- اختبار Package C: `tests/graduation-projects/graduation-projects-package-c-ui.test.tsx`.
- هذا التقرير.

## التغطية الوظيفية

- الطالب: الفريق والقائد، إدارة الأعضاء قبل القفل، المقترح المنظم ومرفقه الخاص، قرار المنسق، المشرف وحالة القبول، سجل التقدم والتصحيح، التسليم النهائي، موعد المناقشة، النتيجة والتعديلات، وملخص الأرشيف والتنزيل المصرح.
- المنسق: قائمة المشاريع/طابور المقترحات، قبول/إعادة/رفض، اختيار المشرف بالهوية، موعد ومكان المناقشة، اختيار عضوين فأكثر للجنة بالهوية، جاهزية ومتوسط التقييم، القرار النهائي، والأرشفة بعد النجاح أو الرسوب.
- المشرف: دعوة معلقة قبولاً/رفضاً، عمليات المشروع بعد القبول فقط، اعتماد/إعادة التقدم، وجاهز/إعادة للملف النهائي.
- عضو اللجنة: المناقشات المسندة، عرض الملف النهائي المصرح، درجته 0..100 وملاحظاته فقط، وحالة إرسال نهائية غير قابلة للتعديل دون عرض تقييمات الزملاء.
- الإدارة: قائمة الحالة والنتيجة فقط، بلا callbacks أو أزرار تشغيلية أو معرّفات خام.

## حدود التكامل النهائية مع Package B

الحد المؤقت الوحيد هو `src/routes/-graduation-projects-adapter.ts`. لا توجد قراءة/كتابة جدول مباشرة ولا استخدام مباشر لـSupabase Storage. الاستبدال النهائي المطلوب بعد دمج Package B:

1. `list_my_graduation_projects_mvp` يعيد `GraduationProjectSummary[]`.
2. `get_my_graduation_project_workspace(p_project_id)` يعيد `GraduationProjectDetail` بعد تصفية البيانات حسب الممثل؛ خصوصاً عدم إرجاع تقييمات/ملاحظات الزملاء لعضو اللجنة.
3. `list_graduation_projects_administration_overview` يعيد DTO إداري محدوداً للحالة/العنوان/النتيجة دون UUID أو object keys.
4. إجراءات `UiAction` تمر حصراً عبر RPCs المسماة في `ACTION_RPC` مع `p_project_id` وpayload موثّق؛ على Package B استبدال التغليف المؤقت `p_payload` بتواقيعه النهائية أو توفير mapping مكافئ داخل adapter.
5. الرفع الخاص: `prepare_graduation_project_private_upload` ثم PUT إلى URL مؤقت خاص ثم `finalize_graduation_project_private_upload`؛ التنزيل: `create_graduation_project_authorized_download`. لا تحفظ الواجهة أي URL ولا تطلب public URL.

## الاختبارات والنتائج

- `bun test tests/graduation-projects`: **PASS — 56/56**.
- `bun test tests/graduation-projects/graduation-projects-package-c-ui.test.tsx`: **PASS — 14/14**.
- `bunx tsc --noEmit`: **PASS**.
- `bun run build`: **PASS**؛ ولّد route tree وحزم المسارات الخمسة.
- `git diff --check`: **PASS** (تحذيرات تحويل LF/CRLF فقط، بلا أخطاء whitespace).
- `bun test tests/student-requests`: **HOLD — 1063 PASS / 2 FAIL**:
  - `b1-five-services-terminal-visibility-34.test.ts`: آخر replay مجمّد يعيد `student_visible=true` بدلاً من المتوقع `false`; لا يوجد diff تحت `supabase/`.
  - `tanstack-register-stable-augmentation-01.test.ts`: hash شجرة التوجيه تغيّر بسبب إضافة المسارات المتعاقد عليها (`b143...` مقابل hash القديم `9398...`).
- `bun run security:test`: **لم يُشغّل**؛ لا توجد متغيرات بيئة staging الآمنة المطلوبة، ولا يسمح النطاق بالاتصال بالإنتاج أو إنشاء ممثلين.

## الافتراضات

- Package B سيقدم DTOs وتواقيع RPC النهائية عبر نقطة التكامل المذكورة؛ الـadapter الحالي compile-safe ويفشل مغلقاً برسالة عربية عند غياب RPC.
- قائمة مرشحي الطلاب/المشرفين/اللجنة تأتي من Package B مفلترة حسب الأهلية والتعيين ولا تُستخرج من الجداول في الواجهة.
- إخفاء أدوات الممثل لتحسين UX فقط؛ التفويض النهائي دائماً في RPC.

## المخاطر

- يلزم reconciliation واحد للـadapter بعد اكتمال Package B، ولا سيما أسماء RPC وتفصيل payloads.
- لا يمكن اعتبار بوابة regression كاملة خضراء حتى يُعالج مالك اختبارات student-requests فشل polarity ويحدّث pin شجرة التوجيه وفق عملية الملكية المعتمدة.
- لم يُنفذ E2E أو اتصال آمن لأن مصفوفة التفويض المباشر وبيئة TEST_ONLY من ملكية Package D وغير متاحة هنا.

## العوائق

- فشلا regression الإلزاميان المذكوران.
- عدم توفر بيئة security staging آمنة.
- Package B متزامن ولم تُدمج واجهته النهائية بعد.

## أثر الإنتاج

لا أثر إنتاجي: تغييرات source-only، بلا migrations، بلا نشر، بلا اتصال كتابي بقاعدة الإنتاج، بلا تعديل بيانات أو حسابات أو `request_types.student_visible`، وبلا public URLs.

## القرار النهائي

`HOLD_GRADUATION_PROJECTS_MVP_PACKAGE_C_MANDATORY_STUDENT_REQUESTS_REGRESSION_GATE_2_FAILURES`
