# BATCH-B1-SHARED-FOUNDATION-REMAINING-REVIEW-FIXES-01

## القرار

`PASS`

## الملفات المعدلة

- `src/lib/student-affairs.functions.ts`
- `src/lib/student-requests/request-service-adapter.ts`
- `src/lib/student-requests/request-type-registry.ts`
- `src/routeTree.gen.ts`
- `src/routes/student.requests.new.tsx`
- `tests/student-requests/request-b1-shared-foundation-source-01.test.ts`

## النتيجة

- أضيف تحميل reference data للسنوات والفصول والشعب المسجل فيها الطالب عبر العميل المصادق وRLS.
- رُبطت reference data بالنموذج الديناميكي مع منع الإرسال عند loading/error/missing data وإعادة ضبط الفصل عند تغيير السنة.
- أضيف fail-closed للكتابة بأكواد الأنواع التاريخية المعروفة فقط، مع رفض الأكواد المجهولة.
- أضيف منع تفعيل الخدمات المدفوعة دون fee code معتمد مسبقاً، دون اعتماد مبلغ أو عملة أو اختراع fee code.
- شُدد نطاق اعتماد رئيس القسم ليشمل التعيين المباشر والقسم المطلوب، دون admin/registrar/dean bypass.
- بقيت خدمة العذر عن الغياب محجوبة خلف `BLOCKED_PENDING_SECURE_ATTACHMENTS_RUNTIME` مع رفض قيم سبب الغياب المجهولة.
- وُصلت بوابة التفعيل نفسها في زر الإرسال وفي server submit؛ الخدمات المدفوعة تفشل مغلقاً حتى يصل fee code معتمد من مصدر موثوق، دون قبول قيمة من العميل.
- يتحقق server submit من وجود السنة، ومن انتماء الفصل للسنة، ومن ملكية الطالب لتسجيل نشط في الشعبة قبل إنشاء الطلب.
- وُصل تحويل canonical code إلى stored write code في payload الفعلي، مع رفض أي كود مجهول.

## الاختبارات

- `bun test tests/student-requests`: PASS — 322 tests، 0 failures.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS. آخر تشغيل استغرق نحو 165 ثانية؛ التحذيرات الصادرة من bundler تخص `use client` في dependencies ولم تفشل البناء.
- `git diff --check`: PASS.

## الافتراضات

- أكواد التخزين `extra_chance` و`transfer` توافق تاريخي موجود، وليست mapping أكاديمياً جديداً.
- قيمة fee code لا ينشئها هذا التغيير؛ يجب أن تأتي من إعداد معتمد خارج هذا النطاق.

## المخاطر

- تظل جودة labels للشعب مقيدة بـ`section_code` المتاح للمستخدم عبر RLS.
- runtime للمرفقات الآمنة غير متاح، لذلك تبقى خدمة العذر عن الغياب محجوبة عمداً.

## العوائق

- لا عوائق ضمن نطاق المصدر الحالي.
- يلزم review مستقل قبل أي دمج.
- تظل الخدمات المدفوعة HOLD بشكل مقصود حتى يتوفر fee code معتمد عبر إعداد موثوق؛ لم يخترع هذا التغيير قيمة بديلة.

## أثر الإنتاج

- لا أثر إنتاجي: لم تُطبق migrations أو SQL، ولم يحدث اتصال كتابي بالإنتاج، ولم يتم Deploy أو Publish.
- لم يتغير `student_visible` أو `enrollment_certificate`، ولم تتغير الحزم أو lockfile.
