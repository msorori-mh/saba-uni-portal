# PORTAL-FACULTY-PORTAL-NAVIGATION-RTL-A11Y-CONSISTENCY-QA-01 — تقرير مراجعة الجودة (SOURCE-ONLY)

مراجعة تنقّل بوابة عضو هيئة التدريس واتساق RTL وإمكانية الوصول (360px وسطح المكتب)، مع إصلاحات واختبارات regression. جميع التغييرات على مستوى المصدر فقط؛ لا migrations ولا بيانات ولا نشر.

## الملفات المعدلة

ملفات جديدة:
- `src/components/portal/FacultyPortalShell.tsx` — غلاف موحّد لكل صفحات `/faculty-portal`: يغلّف `PortalShell` ويضيف شريط تنقّل أفقي (`overflow-x-auto`، بدون التفاف، آمن عند 360px) مع `aria-current="page"` للرابط النشط مشتقاً من `useRouterState` (وليس prop يدوي)، وتمييز غير لوني فقط (underline + font-extrabold)، وبreadcrumbs اختيارية (`aria-label="مسار التنقل"`، العنصر الأخير `aria-current="page"`، فاصل chevron بـ `aria-hidden`)، وتسجيل خروج مركزي، و`NotificationsBell` في الـ actions.
- `src/components/portal/FacultyPortalError.tsx` — `FacultyPortalError` (errorComponent) و`FacultyPortalNotFound`: رسائل عربية عامة دون أي تفاصيل تقنية (لا `error.message`/UUID/SQL)، زر «حاول مرة أخرى» (reset عبر `retryRouteError` كما في الجذر)، ورابط «العودة إلى بوابتي» إلى `/faculty-portal`.
- `src/lib/faculty-portal/use-faculty-logout.ts` — hook تسجيل خروج آمن: `try/catch/finally`، يمسح `queryClient.clear()`، وينتقل إلى `/portal-login` بـ `replace: true` دائماً حتى لو فشل `signOut()`.
- `tests/faculty-portal/navigation-rtl-a11y-consistency-01.test.ts` — 49 اختبار regression على مستوى المصدر (بنمط المستودع).

ملفات معدّلة:
- `src/components/portal/PortalShell.tsx` — إضافة prop اختياري `headerClassName` (إضافي فقط، توافق رجعي كامل مع صفحات الطالب/الموظف)، وحذف `aria-label` المكرر من زر الخروج (النص المرئي هو الاسم الميسّر).
- `src/components/portal/NotificationsBell.tsx` — Escape يغلق ويعيد التركيز للزر، `aria-expanded/aria-haspopup/aria-controls`، إعلان عدد غير المقروء عبر `aria-live="polite"` sr-only، حلقات `focus-visible`، نص sr-only «إشعار غير مقروء» (النقطة لم تعد لوناً فقط)، وإصلاح تموضع القائمة: حذف `sm:left-auto sm:right-0` التي كانت تسبب فيضاً أفقياً على RTL (الجرس عند الحافة اليسرى)؛ الآن `left-0` ثابت مع عرض `min(92vw,360px)` — لا فيض عند 360px ولا على سطح المكتب.
- `src/routes/faculty-portal.tsx` — تسجيل `errorComponent` + `notFoundComponent` على مسار التخطيط.
- `src/routes/faculty-portal.index.tsx` — ترحيل إلى `FacultyPortalShell`، حذف `handleLogout` المكرر، إضافة `focus-visible` لبطاقات الروابط. بطاقة «طلبات المعالجة» وبوابتها (`hasActiveProcessingAssignment` + `data-testid="faculty-processing-card"`) كما هي.
- `src/routes/faculty-portal.schedule.tsx` — ترحيل إلى الغلاف (مع `hideChromeOnPrint` للطباعة)، حذف الترويسة اليدوية ورابط «الرجوع» (استُبدل بالتنقّل والـ breadcrumbs)، `ml-1` → `ms-1`. أُبقي نمط `(fp as any)` القائم كما هو (مع `eslint-disable-next-line` موثّق) لأن اختبار `tests/student-portal/current-term-schedule-filters-01.test.ts` — خارج النطاق المسموح — يؤكّد النص الحرفي `.eq("faculty_profile_id", (fp as any).id)`.
- `src/routes/faculty-portal.academic-councils.tsx` — ترحيل إلى الغلاف (حذف الترويسة اليدوية)، `mr-2` → `ms-2`، `aria-label` لأزرار إعادة الترتيب الأيقونية، واستبدال regex ذات محارف التحكم `[\x00-\x7F]` بمساعد `isRawTechnicalMessage` (`/^[ -~]+$/`).
- `src/routes/faculty-portal.materials.index.tsx` — ترحيل إلى الغلاف + breadcrumbs، حذف `handleLogout` ورابط «العودة»، `focus-visible` للبطاقات.
- `src/routes/faculty-portal.materials.$sectionId.tsx` — ترحيل إلى الغلاف + breadcrumbs، حذف `handleLogout`، استبدال عرض `err.message` الخام برسائل عربية عامة في الحوارات (إنشاء/رفع/تنزيل/تقارير)، وتنظيف `any` بأنواع `MaterialItem`/`MaterialFileItem`.
- `src/routes/faculty-portal.processing-requests.tsx` — ترحيل إلى الغلاف مع الحفاظ الحرفي على البوابة و`data-testid="faculty-processing-unauthorized"` وسطر `allowed`.
- `src/routes/faculty-portal.student-progress.$studentId.tsx` — لم يكن يستخدم أي غلاف أصلاً؛ الآن داخل الغلاف، وحالة رفض/خطأ داخل البوابة برسالة عامة «لا تملك صلاحية الوصول إلى هذه الصفحة أو تعذّر تحميل البيانات» + رابط العودة، بدلاً من عرض `(error as any).message` الخام.
- لم يُمسّ أي ملف خارج نطاق بوابة الأكاديمي: `tests/student-portal/current-term-schedule-filters-01.test.ts` بقي دون تعديل (أُعيد نمط `(fp as any)` في schedule.tsx خصيصاً للحفاظ على تأكيده الحرفي).

ملاحظة تنسيق: ملفات المسارات الأصلية لم تكن مطابقة لـ prettier (eslint يفشل عليها في الشجرة النظيفة بأخطاء `prettier/prettier`). لأن eslint على الملفات المعدّلة بوابة إلزامية، طُبّق `prettier --write` على الملفات الملموسة فقط — لذا يحتوي الـ diff على إعادة لفّ تنسيقية لأسطر سابقة دون تغيير سلوكي.

## الاختبارات والنتائج

| الأمر | النتيجة |
|---|---|
| `bun install --frozen-lockfile` | نجاح (595 حزمة) |
| `bun test tests` | **1591 ناجح / 0 فاشل** (13813 expect عبر 142 ملفاً) |
| `bunx tsc --noEmit` | نجاح (exit 0) |
| `bunx eslint` على كل ملف معدّل | **0 أخطاء** (3 تحذيرات `react-hooks/exhaustive-deps` سابقة الوجود في academic-councils) |
| `bun run build` | نجاح (vite build + validate-tanstack-route-tree-register) |
| `git diff --check` | نظيف |

أثناء العمل ظهر تعارض بين إزالة cast `(fp as any)` في schedule.tsx واختبار `current-term-schedule-filters-01` (خارج النطاق، يؤكّد النص الحرفي)؛ الحل المعتمد: الإبقاء على النمط القائم مع `eslint-disable-next-line @typescript-eslint/no-explicit-any` موثّق، دون لمس اختبار student-portal. لا فشل سابق الوجود متبقٍ.

## مطابقة قائمة التحقق (13 بنداً)

1. **روابط ميتة** — روابط التنقّل كلها مسارات TanStack مسجّلة ومتحقق منها بـ tsc (`FacultyNavPath` union)؛ breadcrumbs لها `to` مسجّلة فقط.
2. **aria-current** — الرابط النشط في شريط التنقّل وعنصر الـ breadcrumb الأخير يحملان `aria-current="page"` (مؤكَّد باختبار).
3. **Escape** — يغلق قائمة الإشعارات (مؤكَّد باختبار).
4. **إعادة التركيز** — التركيز يعود لزر الجرس بعد Escape (`triggerRef.current?.focus()`).
5. **أسماء ميسّرة** — الجرس (`aria-label="الإشعارات"` + haspopup/expanded/controls)، أزرار إعادة ترتيب الأجندة الأيقونية (`aria-label`)، زر الخروج بنص مرئي دون aria-label مكرر، أيقونات زخرفية `aria-hidden`.
6. **لا معلومة باللون فقط** — النشط في التنقّل = underline + bold + لون؛ النقطة غير المقروءة مقترنة بعدّاد ونص sr-only؛ رقائق الحالة لها نصوص (تم التحقق).
7. **RTL** — `dir="rtl"` محفوظ عبر `PortalShell` والجذر (`<html dir="rtl">`)؛ استبدال الخصائص الفيزيائية `ml/mr` بـ `ms` في الملفات الملموسة؛ لا `sm:right-0` هشّ.
8. **فيض 360px** — قائمة الإشعارات `left-0` + `w-[min(92vw,360px)]` من حافة قريبة من الجهة اليسرى ⇒ امتداد داخل الشاشة دائماً؛ شريط التنقّل `overflow-x-auto` بدون التفاف.
9. **تسجيل الخروج ومسح الكاش** — `useFacultyLogout`: `queryClient.clear()` + انتقال في `finally` (مؤكَّد باختبار)، وحذف 4 نسخ مكررة من `handleLogout`.
10. **نطاق رفض الصلاحية** — processing-requests يخفي الصدفة خلف البوابة (كما كان، مع الاختبار القائم)؛ student-progress أصبحت حالة الرفض داخل البوابة برسالة عامة ورابط عودة؛ academic-councils تعتمد server fns مضبوطة بعضويات المستخدم ولا تعرض رفضاً صامتاً واسعاً (الأقسام الفارغة رسائلها صريحة). لا روابط إلى `/admin` في أي مصدر بالبوابة (مؤكَّد باختبار).
11. **استرداد الخطأ** — errorComponent على `/faculty-portal` بزر إعادة محاولة (reset + invalidate) ورابط «العودة إلى بوابتي»؛ notFoundComponent عربي مخصص.
12. **لا error.message/UUID/SQL** — مكوّن الخطأ لا يعرض أي تفاصيل تقنية (مؤكَّد باختبار)؛ كما أُزيل عرض `err.message` الخام من حوارات المواد ومن student-progress.
13. **لا fallback عابر للأقسام** — صفحات المواد تجلب عبر server fns مربوطة بعضو هيئة التدريس الحالي (`getMyAssignedSectionsForMaterials`/`listMyCourseMaterials`) ولا يوجد في العميل أي fallback واسع يعرض بيانات قسم آخر؛ أي تشدد إضافي (RLS) خارج النطاق ولم يُلمس الـ backend.

## الافتراضات

- صفحة `change-password` تدفق قسري مستقل وتبقى خارج الغلاف الموحّد عمداً.
- في RTL يجلس الجرس عند الحافة اليسرى للترويسة، لذا `left-0` هو التموضع الوحيد الآمن فيزيائياً (الخصائص المنطقية `start-0` كانت ستعيد الفيض).
- بوابة «طلبات المعالجة» في شريط التنقّل تعيد استخدام نفس `queryKey` الخاص بالبطاقة فتتشارك الكاش دون طلب إضافي.
- `bun run security:test` لم يُشغّل (يتطلب بيئة staging آمنة غير متوفرة هنا) وفق اشتراط AGENTS.md «عند توفر بيئة آمنة».

## المخاطر

- إعادة اللفّ التنسيقية (prettier) توسّع الـ diff على ملفات قديمة — لا تغيير سلوكي لكنها تزيد عبء المراجعة.
- student-progress: توحيد رسالة الخطأ/الرفع برسالة واحدة يخفي التمييز بين «مرفوض» و«تعذّر التحميل» — مقصود أمنياً.
- التحقق البصري الفعلي (متصفح 360px حقيقي) لم يُنفّذ؛ الاعتماد على تحليل التموضع المنطقي واختبارات المصدر.

## العوائق

- لا بيئة staging لتشغيل `security:test` ولا متصفح لاختبار بصري حي.

## أثر الإنتاج

لا شيء. تغييرات مصدر فقط؛ لا migration مطبّق، لا اتصال بإنتاج أو تخزين، لا deploy/publish، لا تغيير بيانات أو `student_visible` أو أعلام ميزات.

## القرار

**PASS** — كل بوابات التحقق الإلزامية خضراء، والاختبارات القائمة (بما فيها `processing-requests-visibility`) محفوظة.
