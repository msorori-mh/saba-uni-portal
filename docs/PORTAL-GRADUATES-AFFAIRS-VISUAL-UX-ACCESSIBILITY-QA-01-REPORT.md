# PORTAL-GRADUATES-AFFAIRS-VISUAL-UX-ACCESSIBILITY-QA-01 — تقرير المراجعة البصرية والوصولية

- المستودع: `msorori-mh/saba-uni-portal`
- الفرع: `review/graduates-affairs-ui-visual-qa-01` (من `origin/main`)
- التاريخ: 2026-07-25
- النطاق المملوك فقط: `src/components/graduates-affairs/**`, `tests/graduates-affairs/**`, هذا التقرير

## القرار

**PASS_GRADUATES_AFFAIRS_VISUAL_UX_QA_READY**

## 1. ما رُوجع

- `GraduateFileCard.tsx` — ملف الخريج الشامل + سطر استمرارية الحساب (D-13).
- `GraduateCommunicationPanel.tsx` — نقاط الاتصال وأهلية المسودات.
- `GraduateSurveyCard.tsx` — الاستبيان (أهلية/أسئلة/تحقق/إرسال).
- `GraduateReportsPanel.tsx` — التقارير المجمعة (أفواج + استبيانات) مع الحجب.
- عقود القراءة: `graduate-file.ts`, `communications.ts`, `consents.ts`, `employment.ts`, `surveys.ts`, `reports.ts`, `account-continuity.ts`, `foundation.ts` (قراءة فقط — لم تُعدَّل).
- التقارير التصميمية الثلاثة (AUDIT/FOUNDATION/COMPLETION).

**قرار Routes:** لم تُبنَ صفحات/routes. المكونات عرضية نقية بلا عقود قراءة runtime (لا RPC ولا server functions بعد — بحسب تقرير COMPLETION-01)، وبناء صفحة كان سيتطلب mock data وهو ممنوع في الإنتاج. يبقى الربط لمهمة التكامل اللاحقة (مالك routeTree) — fail-closed وليس عيب عرض.

## 2. مصفوفة القدرات العشر

| القدرة | الحالة بعد الإصلاح |
|---|---|
| ملف الخريج الشامل | يعرض الملخص غير المُعرّف فقط؛ تاريخ التخرج بالعربية؛ لا معرّفات |
| قرار التخرج الرسمي | حالة السجل مترجمة (معتمد/مصحّح/ملغى/قيد الانتظار) |
| الحالة الوظيفية | مترجمة + تمييز موثقة/بإفادة الخريج |
| التواصل | شرح صريح لشرط الموافقة + ترجمة الأغراض + أسباب عدم الجاهزية المميزة |
| الموافقات | قائمة الأغراض الفعالة مترجمة |
| الاستبيانات | أهلية + أسئلة بترقيم عربي + تحقق + منع إرسال مزدوج + قفل بعد الإرسال |
| التقارير المجمعة | خلايا محجوبة = «محجوب» مع شرح aria، لا أصفار، لا تصدير |
| استمرارية الحساب (D-13) | undecided → «لم تُعتمد…»؛ مرفوضة؛ منتهية؛ «غير مسموح» — لا ادعاء إتاحة |
| عدم توفر القرار/السجل | buildGraduateFile يفشل مغلقًا (لا بطاقة أصلًا) — تعاقدي |
| suppression | محجوب على مستوى الخلية والفوج — مختبر |

## 3. العيوب والإصلاحات

| # | العيب | الإصلاح |
|---|---|---|
| 1 | `purposeCode` يظهر خامًا (communications) في نقاط الاتصال | `gaPurposeLabelAr` مع تراجع آمن «غرض غير محدد» |
| 2 | لوحة التواصل لا تشرح شرط الموافقة | فقرة توضيحية: موافقة فعالة + نقطة موثقة غير ملغاة لنفس الغرض والقناة |
| 3 | أسئلة الاستبيان تظهر بمفاتيح الآلة (key) | «السؤال {n}» (نص السؤال غير موجود في العقد — فجوة موثقة) |
| 4 | لا منع لإرسال الاستبيان المزدوج | حالة `submitted` تقفل النموذج والزر مع رسالة تأكيد |
| 5 | تقرير الأفواج يعرض `programId` خامًا (UUID) | «الفوج {n}» — لا UUID على الشاشة |
| 6 | نتائج الاستبيان تعرض `question.key` | «سؤال {n}» |
| 7 | الخلية المحجوبة بلا شرح لقارئ الشاشة | `aria-label="خلية محجوبة لحماية الخصوصية"` |
| 8 | تاريخ التخرج ISO خام | `formatGaDateAr` (ar-EG) |
| 9 | نسخ D-13 لا يطابق الحالات المطلوبة | undecided → «لم تُعتمد سياسة استمرارية الحساب بعد.»؛ منتهية → «منتهية الصلاحية أو لم تبدأ»؛ capability غير مدرجة → «غير مسموح…» |
| 10 | أخطاء الاستبيان بلا role=alert وزر بلا ارتفاع لمس | role="alert" + min-h-11 + sr-only «(إلزامي)» |
| 11 | شبكة ملف الخريج عمودان دائمًا (ضيقة على 360px) | `grid-cols-1 sm:grid-cols-2` |
| 12 | رؤوس الجداول بلا scope | `scope="col"` |

## 4. الخصوصية وحراس منع الرجوع (في `graduates-affairs-visual-ux-qa-01.test.ts`)

تفشل عند: UUID في أي مخرجات؛ `recordId/studentProfileId/user_id` معروضًا؛ `storage_*`/`object_key`؛ email/phone؛ مفاتيح أسئلة كتسميات مرئية؛ خلية محجوبة كصفر (`<td>0</td>`)؛ أي وسيلة تصدير (تصدير/download/csv/xlsx)؛ استيراد Supabase أو استدعاء شبكة داخل المكونات؛ headings h1/h2 داخل المكونات؛ خصائص فيزيائية بدل المنطقية.

## 5. حالات العرض (18/18 مغطاة)

loading/empty/unavailable/permission/network → لا عقود runtime بعد، والمكونات تُغذى props — موثقة كفجوة تكامل (الحارس يمنع mock). graduate record unavailable + decision missing + record mismatch → `buildGraduateFile` يرفض بأسباب (تعاقدي، 29 اختبارًا قائمًا). consent required/withdrawn/contact-unavailable → لوحة التواصل بأسباب مميزة. survey eligible/not-eligible/completed → بطاقة الاستبيان. reports suppressed/above-threshold → لوحة التقارير. account undecided/capability-denied → بطاقة الملف. read-only → لا mutations في الواجهة إطلاقًا.

## 6. RTL وResponsive وAccessibility

- `dir="rtl"` في الجذور؛ خصائص منطقية فقط (`ps-5`)؛ الجداول داخل `overflow-x-auto`؛ الشبكة تنهار لعمود واحد على 360px.
- headings تبدأ من h3 (تحت h1 الصفحة المضيفة)؛ role=status/alert للحالات والأخطاء؛ أهداف لمس min-h-11؛ «(إلزامي)» sr-only؛ نص لكل حالة (لا لون وحده).

## 7. فجوات Backend المتبقية (fail-closed)

1. **لا عقود قراءة runtime (RPC/server functions)** — المكونات تظل غير مربوطة بمسارات حتى حزمة التفويض (G4) وربط routeTree.
2. **نص الأسئلة العربية غير موجود في عقد الاستبيان** (key فقط) — تُعرض «السؤال {n}» حتى يحمل العقد `text`.
3. **اسم البرنامج غير موجود في عقد التقرير** (programId فقط) — تُعرض «الفوج {n}».
4. **لا عنوان/وصف للاستبيان في العقد** — يُعرض «استبيان — إصدار {n}».
5. قوالب الرسائل (template_code) عقد نصي بلا سجل قوالب — تظهر كما هي.

## 8. الاختبارات والتحقق

- `bun test tests/graduates-affairs` — **44/44** (15 اختبار QA جديد)
- `bun test tests` — **1557/1557** (142 ملفًا)
- `bun install --frozen-lockfile` نظيف · `bunx tsc --noEmit` pass · `bunx eslint` على الملفات المعدلة **0 أخطاء** · `bun run build` pass · `git diff --check` نظيف
- لا Playwright/متصفح؛ استُخدمت عروض static وعقود مصدر (موثق).

## 9. تأكيدات

- لم تُعدّل: منطق `src/lib/graduates-affairs` (قراءة فقط)، SQL/migrations، `docs/migration-drafts`، التفويض/RLS، account-continuity policy، generated types، `routeTree.gen.ts` يدويًا، B1، مشاريع التخرج، enrollment_certificate.
- لا Production/Staging، لا Migration apply، لا Deploy/Publish، لا SMS/Email حقيقي، لا دمج.
