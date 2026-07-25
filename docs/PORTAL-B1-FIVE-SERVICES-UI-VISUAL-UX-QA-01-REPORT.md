# PORTAL-B1-FIVE-SERVICES-UI-VISUAL-UX-QA-01 — تقرير المراجعة البصرية وتجربة الاستخدام

- المستودع: `msorori-mh/saba-uni-portal`
- الفرع: `review/b1-five-services-ui-visual-qa-01`
- القاعدة: PR #221 (`feat/b1-five-services-ui-kimi-01`)
- النطاق: `src/components/student-requests/b1/**`, `src/routes/student.requests.b1.$service.tsx`, `src/routes/staff.b1-requests.tsx`, `tests/student-requests/b1-ui/**`
- التاريخ: 2026-07-25

## القرار

**PASS_B1_FIVE_SERVICES_UI_VISUAL_QA**

## ملخص

راجعت واجهات الخدمات الخمس (إيقاف القيد، العذر عن الغياب، التحويل بين الأقسام، الفرصة النهائية، سحب الملف) للطالب والموظف. وُجدت عيوب حقيقية — أخطرها انحراف واجهات المكونات عن استدعاءاتها الذي يسبب انهيارًا وقت التشغيل وإخفاءً صامتًا للتحذيرات — وأُصلحت جميعها دون لمس العقود أو الـ payloads أو منطق الأمان أو أي ملف خارج الملكية.

## العيوب المكتشفة والإصلاحات

### حرجة (انهيار أو فقدان محتوى وقت التشغيل)

1. **انهيار نموذج الطالب عند العرض — حالة مسودة غير معروفة.**
   `B1StudentRequestForm` كان يستخدم المفردات `"idle"` و`"error"` بينما `B1DraftStatus` يعرّف فقط `draft | saving | saved | save_failed`. عند أول render كانت `STATE_CONFIG["idle"]` تساوي `undefined` ويحدث `TypeError` يُسقط الصفحة كاملة.
   الإصلاح: توحيد النموذج على مفردات المكون (`draft` / `save_failed`)، وتحديث تأكيد `pages-contract.test.ts` المطابق.

2. **تحذيرات الخدمة وملاحظة الرسوم لا تظهر إطلاقًا.**
   النموذج كان يمرّر `requirementsAr` و`feePolicyAr` بينما `B1ServiceHeader` يقبل `requirementsAlertAr` و`feePolicyNoteAr` — فتصل `undefined` ولا تُعرض تنبيهات الأهلية ولا سياسة «السداد في النظام الجامعي الرئيسي».
   الإصلاح: تصحيح أسماء الـ props مع دمج مصفوفة `warnings` في نص واحد.

3. **ملخص المراجعة يعرض «ملخص الطلب — » فارغًا وقيمًا خامًا.**
   `B1RequestSummary` يتطلب `serviceTitleAr` ولم يكن يُمرَّر من النموذج ولا من مساحة عمل الموظف. كما كان `formatValue` يعتمد على `field.options` فقط، فتظهر القيم المرجعية (القسم المطلوب، البرنامج، العام الجامعي، الفصل) كمعرّفات خام بدل التسميات العربية.
   الإصلاح: تمرير `serviceTitleAr` في الموقعين، وتمرير الخيارات المحلولة عبر `resolveOptions` إلى `formatValue`.

### وضوح البيانات (تحويل الأقسام / سحب الملف)

4. **القسم والبرنامج الحاليان يظهران كنص placeholder رغم توفر التسمية.**
   `B1FormOptions` يوفّر `currentDepartmentLabelAr` و`currentProgramLabelAr` لكن الحقول readonly كانت تعرض `defaultValue` الثابت («— يُعرض من ملف الطالب عند التفعيل —»).
   الإصلاح: دالة `displayValue` تعرض القيمة الحقيقية ثم تسمية الخيارات ثم الافتراضي، وتُستخدم في الحقل وفي ملخص المراجعة معًا — فيظهر القسم المصدر والهدف بوضوح قبل الإرسال.

5. **المرفق المطلوب بلا عنوان.**
   `requiredAttachments[].labelAr` (مثل «مرفقات العذر (وثائق داعمة)»، «شهادة الثانوية العامة») لم يكن يُعرض فوق الرافع.
   الإصلاح: عرض التسمية مع علامة الإلزام `*` فوق `B1AttachmentUploader`.

6. **إقرارات checkbox لا تظهر في ملخص المراجعة.**
   إقرار سحب الملف («أفهم أن سحب الملف له أثر أكاديمي وإداري…») كان يظهر كـ«نعم» فقط.
   الإصلاح: تمرير `acknowledgmentsAr` للإقرارات المفعّلة إلى قسم «الإقرارات» في `B1RequestSummary`.

### تخطيط وRTL

7. **`display:grid` على `<fieldset>` لا يعمل في Chrome/Safari.**
   المتصفحات المبنية على Blink تفرض تخطيط block على fieldset، فتتجاهل `grid sm:grid-cols-2` وتنهار أعمدة النموذج على desktop.
   الإصلاح: نقل الشبكة إلى `div` داخلي وإبقاء `fieldset/legend` للدلالة، مع `min-w-0` لمنع overflow.

8. **خصائص فيزيائية بدل منطقية في RTL.**
   `pr-8`/`mr-8` في `B1WorkflowTimeline` (وكانت غير متسقة أصلًا) → `ps-8`/`ms-8`؛ و`text-right` في أزرار صندوق الموظف → `text-start`.

### Accessibility

9. **لا ربط برمجي بين الحقول ورسائل الخطأ.**
   الإصلاح: `id` لكل حقل، و`aria-invalid` و`aria-describedby` و`aria-required`، و`id` على رسالة الخطأ (`role="alert"` محفوظ).

10. **checkbox الإقرار هدف لمس صغير وبلا تنسيق.**
    الإصلاح: صف `min-h-11` بحدود واضحة، أيقونة `h-5 w-5 accent-primary`، وامتداد العمودين — موحّد مع بقية الحقول.

11. **زر «إرفاق ملف» بلا مؤشر تركيز مرئي ولمعرّف ثابت.**
    الإصلاح: `peer` + `peer-focus-visible:ring-2` على الـ label، و`useId()` بدل المعرّف الثابت، و`min-h-11`.

12. **عدم توحيد ارتفاع زر إجراء الموظف** (`B1EmployeeActionPanel`) — أُضيف `min-h-11`.

13. **`B1ErrorState` بلا رسالة في قائمة الخدمات** — أُضيفت رسالة عربية واضحة.

## نتائج المراجعة المنهجية

| المحور | النتيجة |
|---|---|
| Mobile 360px | الحقول والأزرار `w-full`/`min-h-11`، الشبكات عمود واحد تحت `sm:`، لا overflow (أُضيف `min-w-0` لـ fieldset) |
| Tablet (`sm:`) | شبكتا أعمدة للحقول والبطاقات تعمل بعد إصلاح fieldset |
| Desktop | نموذج عمودين، ومساحة الموظف `lg:grid-cols-[...]` قائمة/تفاصيل |
| RTL كامل | `dir="rtl"` على كل المكونات، خصائص منطقية، `dir="ltr"` للأرقام والتواريخ |
| التنقل بلوحة المفاتيح | كل العناصر التفاعلية أصلية وقابلة للتركيز؛ أُضيف مؤشر تركيز لرافع المرفقات |
| labels وaria | fieldset/legend، label لكل حقل، aria-invalid/describedby/required، aria-live في حالة المسودة، aria-current="step" في الـ Timeline |
| رسائل validation | عربية لكل مفتاح (مغطاة باختبار)، role="alert"، تُمحى عند التعديل |
| loading/error/empty/success | مكونات مخصصة لكل حالة وتُستخدم في قائمة الخدمات والنموذج ومساحة الموظف |
| double-submit | `submitLock` في النموذج، `inFlightRef` في لوحة الإجراء، `lock` في بطاقة الإيرادات + تعطيل الأزرار أثناء التنفيذ |
| المرفقات | تحقق نوع/حجم مسبق، رسائل عربية، لا روابط تخزين، حذف بتأكيد حالة |
| Timeline | ol/li دلالية، حالات مكتملة/حالية/معلقة/معادة/مرفوضة مع تعليق وتاريخ |
| واجهة الموظف | صندوق مسنَد، إجراء قانوني واحد من الخادم، تعليق إلزامي للإرجاع/الرفض، إعادة قراءة بعد النجاح بلا تحديث تفاؤلي |
| بطاقة الإيرادات | بيانات الطلب/الطالب + المرفقات + ملاحظة اختيارية + زر «تأكيد استلام الرسوم» فقط — بلا مبلغ/عملة/فاتورة/رقم عملية/بوابة دفع/رفض لعدم الدفع (مؤكد باختبار العقد) |
| runtimeAvailable=false | الخدمات تُرشَّح من القائمة والمسار المباشر يُحجب برسالة «هذه الخدمة غير مفعّلة حالياً.» |
| أزرار غير قانونية | تُعرض فقط `allowedAction` القادمة من الخادم |
| رسائل permission denied | «لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.» — غير تقنية |
| العودة والتعديل قبل الإرسال | زر «تعديل البيانات» يعيد للنموذج، وحوار تأكيد نهائي قبل submit |

## الاختبارات والتحقق

- `bun test tests/student-requests/b1-ui` — **81/81 pass**
- `bun test tests/student-requests` — **679/679 pass**
- `bunx tsc --noEmit` — **pass** (ملاحظة: `tsconfig.json` يضبط `noCheck: true`؛ شغّلت فحصًا صارمًا اختياريًا `--noCheck false` فظهرت 369 خطأً موجودة مسبقًا في ملفات خارج النطاق، و**صفر** أخطاء في ملفات B1 المعدلة)
- `bunx eslint` على نطاق الملكية — لا أخطاء جديدة؛ أخطاء `prettier/prettier` الخاصة بـ CRLF موجودة مسبقًا في كل ملفات المستودع (CRLF) ولم تتغير
- `bun run build` (يتضمن توليد routeTree والتحقق منه) — انظر أدناه
- `git diff --check` — **نظيف**

## الملفات المعدلة

- `src/components/student-requests/b1/B1StudentRequestForm.tsx` — إصلاحات التوافق الحرجة + aria + checkbox + fieldset + ملخص المراجعة + عناوين المرفقات + الإقرارات
- `src/components/student-requests/b1/B1StudentServiceList.tsx` — رسالة خطأ واضحة
- `src/components/student-requests/b1/B1StaffWorkspace.tsx` — `serviceTitleAr` للملخص + `text-start`
- `src/components/student-requests/b1/B1WorkflowTimeline.tsx` — خصائص RTL منطقية
- `src/components/student-requests/b1/B1EmployeeActionPanel.tsx` — `min-h-11`
- `src/components/student-requests/b1/B1AttachmentUploader.tsx` — مؤشر تركيز + `useId` + `min-h-11`
- `tests/student-requests/b1-ui/pages-contract.test.ts` — تحديث التأكيد لمفردات `save_failed`

## الافتراضات

- مفردات `B1DraftStatus` في المكون (`draft/saving/saved/save_failed`) هي المرجع الصحيح لأن `components.test.tsx` يثبّتها.
- لم تُلتقط screenshots: لا يوجد Playwright/Puppeteer أو متصفح headless في هذه البيئة، والتثبيت خارج نطاق العمل المعزول. المراجعة البصرية تمت عبر تحليل البنية والأصناف (Tailwind) والاختبارات.

## المخاطر

- منخفضة: كل التغييرات عرضية (props/classes/aria) ولا تمس العقود أو الـ payloads أو الأذونات.
- `noCheck: true` في tsconfig يجعل `tsc --noEmit` شكليًا — دين تقني موجود مسبقًا خارج هذا النطاق، يستحق مهمة مستقلة.

## العوائق

- لا screenshots آلية (انظر الافتراضات).
- `request-form-registry.ts` خارج الملكية؛ تحذير «سحب الملف» يظهر عبر checkbox الإقرار البارز (المُحسَّن الآن) — إن رغبت الإدارة في تنبيه amber إضافي للخدمة فيُضاف `warnings` هناك بمهمة مخوّلة.

## أثر الإنتاج

- لا شيء. لم تُطبَّق migrations ولم يُنشر شيء ولم تتغير `student_visible` أو التفعيل أو العقود الخلفية. `adapter.live.ts` و`adapter.mock.ts` و`request-form-registry.ts` و`routeTree.gen.ts` (يدويًا) لم تُمسّ.
