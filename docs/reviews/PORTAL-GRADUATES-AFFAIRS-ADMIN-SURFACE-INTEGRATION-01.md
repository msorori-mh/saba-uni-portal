# PORTAL-GRADUATES-AFFAIRS-ADMIN-SURFACE-INTEGRATION-01

## النتيجة

أُنشئت مساحة تشغيل فعلية لشؤون الخريجين في المسار الحالي `/staff/graduates-affairs`، خلف العلم `portalFeatures.staffGraduatesAffairs` الذي بقي `false`. تعرض المساحة مؤشرات السجلات الواقعة ضمن نطاق الموظف، والحالة الرسمية للمرشحين والخريجين، والبحث والتصفية، وملف الخريج، وقائمة المتابعات المفتوحة. لا تحتوي على بيانات وهمية أو وصول مباشر للجداول.

## حدود العقود المعاد استخدامها

- `graduate_affairs_search_records`: مصدر قائمة السجلات وحالات `pending / approved / corrected / revoked`، مع فرض نطاق المدير أو أقسام المختص داخل قاعدة البيانات.
- `graduate_affairs_get_graduate_file`: مصدر ملخص الملف، أعداد التوظيف والموافقات والمتابعات، وقائمة المتابعات دون قيم اتصال أو ملاحظات محمية.
- استدعاءات الواجهة تمر عبر `searchGraduateRecordsFn` و`getStaffGraduateFileFn` ثم `GraduatesAffairsRpcClient` فقط.
- لا يمنح `admin` أو أي `app_role` صلاحية. رفض غير المكلّف أو خارج النطاق يأتي من AUTH-04 RPC، وليس من إخفاء عناصر الواجهة.
- لا يعيد عقد القراءة الحالي حالة أهلية مستقلة قبل الترشيح؛ لذلك تظهر هذه المحدودية بوضوح ولا تُشتق أهلية غير رسمية.
- لم تُضف إجراءات كتابة؛ عقود الانتقال الحالية تحتاج مدخلات وسياقاً تشغيلياً لا توفرهما شاشة القراءة، ولا يجوز اختلاقهما.

## الملفات المعدلة

- `src/routes/staff.graduates-affairs.tsx`
- `src/components/portal/GraduatesAffairsStaffWorkspace.tsx`
- `src/lib/graduates-affairs/rpc.ts`
- `tests/graduates-affairs/graduates-affairs-admin-surface-integration-01.test.ts`
- `docs/reviews/PORTAL-GRADUATES-AFFAIRS-ADMIN-SURFACE-INTEGRATION-01.md`

لم يُعدّل `src/lib/admin-navigation-config.ts` امتثالاً لعزل المهمة المتزامنة.

## تعليمات دمج عنصر التنقل لاحقاً

بعد اكتمال GA1→GA3 في الإنتاج واتخاذ قرار تفعيل مستقل:

1. افتح مجموعة `id: "projects"` في `src/lib/admin-navigation-config.ts`.
2. أضف الاستيراد `BriefcaseBusiness` من `lucide-react` إلى قائمة الأيقونات إن لم يكن موجوداً.
3. بعد عنصر مشاريع التخرج مباشرة أضف:

   ```ts
   { to: "/staff/graduates-affairs", label: "شؤون الخريجين", icon: BriefcaseBusiness },
   ```

4. يجب أن تكون رؤية العنصر مشروطة بـ`portalFeatures.staffGraduatesAffairs` أو أن تدعم بنية التنقل شرط feature gate قبل إدراجه. لا تُفعّل العلم في نفس تغيير التنقل قبل اكتمال تطبيق GA1→GA3 والتحقق منه.
5. ظهور العنصر ليس تفويضاً: يجب إبقاء AUTH-04 RPCs حداً أمنياً نهائياً، واختبار أن `admin` وحده يُرفض وأن المدير/المختص المكلّف فقط يُسمح له ضمن نطاقه.

## الاختبارات والنتائج

- `bun test tests/graduates-affairs`: **PASS** — 180 ناجح، 0 فشل. تشمل الحزمة مصفوفة AUTH-04 الإيجابية/السلبية المباشرة ومحاكاة PostgreSQL محلية معزولة.
- `bun test tests/student-requests`: **PASS** — 1066 ناجح، 0 فشل.
- `bunx tsc --noEmit`: **PASS**.
- `bun run build`: **PASS** (تحذيرات bundler الاعتيادية فقط؛ المحاولة الأولى انتهت بمهلة الأداة ثم نجحت الإعادة بمهلة مناسبة).
- `bun run security:test`: **NOT RUN / ENV BLOCKED** — يتطلب `SEC_TEST_TARGET_URL`. لم يُحدد هدف افتراضي لتجنب أي اتصال غير مصرح ببيئة إنتاج.
- `git diff --check`: يُثبت نهائياً قبل commit.

## الافتراضات والمخاطر والعوائق

- المؤشرات تخص النتائج المرئية من RPC وبحد أقصى 100 سجلاً؛ وُصف هذا صراحة في الواجهة حتى لا تُفهم كإجمالي غير محدود.
- البحث النصي محلي داخل النتيجة المفوضة، بينما مرشح السنة يُعاد إلى RPC. لا يُرسل نص حر إلى قاعدة البيانات ولا يوسع النطاق.
- كل فتح لملف خريج عملية قراءة مدققة حسب عقد AUTH-04.
- لا عوائق مصدرية معروفة. تفعيل الإنتاج يبقى عائق إصدار مقصوداً وخارج هذه المهمة.

## أثر الإنتاج

لا أثر إنتاجي حالي: لا migrations، لا تطبيق مخطط، لا بيانات، لا نشر، لا تغيير feature flags، ولا merge. السطح يبقى مجمداً حتى تفعيل منفصل بعد GA1→GA3.

## القرار

`PASS` للمصدر والبناء ومصفوفة التفويض. فحص الأمن الشبكي غير منفذ لغياب هدف آمن، ولا يحوّل ذلك إلى اتصال إنتاجي افتراضي. لا يبقى أي إجراء إنتاج أو merge ضمن هذه المهمة.
