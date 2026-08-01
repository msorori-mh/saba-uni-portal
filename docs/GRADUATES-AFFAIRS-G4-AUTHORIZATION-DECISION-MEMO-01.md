# GRADUATES-AFFAIRS-G4-AUTHORIZATION-DECISION-MEMO-01

مذكرة قرار — حزمة تفويض شؤون الخريجين (G4). مصدرية فقط (SOURCE-ONLY): لا SQL
مطبق، لا سياسات RLS، لا منح EXECUTE، لا routes، لا تفعيل إنتاجي. الغرض حصر
البدائل التي **يدعمها المستودع فعلاً** بالأدلة الدقيقة، وما يترتب على كل منها،
والأسس المغلقة (fail-closed) الصالحة تحت أي خيار، والأسئلة المفتوحة لمالك
المنتج. لا تختار هذه المذكرة خياراً ولا تخترع متطلبات.

## 1. الخلفية: ما هو معلّق وأين

- عقد التفويض في تقرير التدقيق
  (`docs/GRADUATES-AFFAIRS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`، قسم «Authorization,
  privacy and security contract») ينص على: default deny عبر RLS وفحوص RPC ذرّية؛
  الخريج يصل فقط إلى بياناته المسموحة؛ موظف شؤون الخريجين يحتاج **دوراً قانونياً
  فعالاً وتعييناً مباشراً** (كائن/نطاق فوج أو تقرير/حالة)؛ وكل من: نفس الدور بلا
  تعيين، وحدة خاطئة، نطاق قسم/برنامج خاطئ، تعيين غير فعال، خريج آخر، مجهول،
  وتجاوز admin/registrar/dean — **DENY**.
- مسودتا SQL (`docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql`،
  `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`) تفعّلان RLS على كل الجداول الـ17
  **بلا أي سياسة**، وتسحبان EXECUTE من PUBLIC/anon/authenticated عن كل دالة
  قابلة للاستدعاء من العميل، مع تعليق ملزم: «Future policies/RPC grants require
  a separate approved authorization bundle with exact self/direct-assignment
  ALLOW/DENY tests» (FOUNDATION-01 السطور 490–491؛ COMPLETION-01 السطور 283–285).
- كل مدخلات كتالوج التقارير `ALU-*` التسع في
  `src/lib/reports/catalog/entries.ts` تحمل `route: null` ودوراً placeholder
  يبدأ بـ `pending:` — ثمانٌ منها `pending:g4_authorization_package`
  (السطور 592–780)، والتاسعة `ALU-CANDIDATES-PIPELINE` تحمل
  `pending:graduates_report_roles` لأن مسارها التشغيلي
  (`src/routes/admin/graduation-candidates.tsx`) Live أصلاً ولا يتبع حزمة G4.

## 2. البدائل المدعومة بالمستودع (مع الأدلة)

### الخيار A — إعادة استخدام `app_role = registrar` عبر المسميات القائمة

**الدليل:** `roles_catalog` يحمل المسميين `graduates_director` (مدير شؤون
الخريجين) و`graduates_officer` (مختص شؤون الخريجين) —
`supabase/migrations/20260611001252_baf44c47-c02b-4323-9a45-5f9fbfd37cfe.sql`
السطور 48–49 — وكلاهما معيّن إلى `app_role_mapping = 'registrar'` —
`supabase/migrations/20260611002102_30161903-025d-4fdc-84b4-b0b8d74078ed.sql`
السطور 21–22.

**الآثار:**
- سياسات RLS ومنح EXECUTE كانت ستبنى على `registrar` الموجود — بلا توسيع enum.
- يتعارض شكلياً مع عقد التدقيق الذي يعتبر «registrar bypass» حالة DENY صريحة:
  الدور وحده لا يكفي؛ يلزم شرط تعيين مباشر إضافي داخل كل سياسة/دالة، وإلا انهار
  الفصل بين سلطة المسجل الأكاديمية وسلطة شؤون الخريجين.
- يورّث كل حاملي `registrar` الحاليين سطح وصول محتملاً؛ مصفوفة DENY يجب أن تثبت
  أن مسجلاً بلا تعيين خريجين مرفوض.

### الخيار B — إعادة استخدام fallback `student_affairs`

**الدليل:** `src/lib/staff-functional-roles.ts` السطور 48–67:
`graduate_affairs_manager` و`graduate_affairs_specialist` بـ
`appRoleFallback: "student_affairs"` (وهو ما يستخدمه
`staffFunctionalRoleToAppRole` عند إنشاء حسابات الدخول اليوم).

**الآثار:**
- بلا توسيع enum أيضاً، لكنه يوسع السطح أكثر من A: كل موظفي شؤون الطلاب (مدير
  ومختص، بلا أي علاقة بالخريجين) يطابقون فحص الدور، فيصبح شرط الوحدة/التعيين
  هو الحاجز الوحيد.
- `unitKey: "graduate_affairs"` في هذا الملف يتصادم دلالياً مع وحدة معالجة
  الطلبات `graduate_affairs` = «شؤون الدراسات العليا» (انظر §5-2)؛ أي سياسة
  تبنى على الوحدة تحتاج حسماً للتسمية أولاً.

### الخيار C — `app_role` مخصص مستقبلي لشؤون الخريجين

**الدليل:** `expansionNote` على كلا الدورين في
`src/lib/staff-functional-roles.ts` السطور 56 و66: «قد يحتاج app_role مخصص
لشؤون الخريجين لاحقاً». وسابقة المستودع للتوسيع المؤجل: أدوار المكتبة/المعامل
بـ `appRoleFallback: null` مع ملاحظة «يحتاج توسيع enum قبل إنشاء حساب دخول»
(السطور 88–116).

**الآثار:**
- يتطلب migration جديدة توسع enum `app_role` (يمنع تعديل migrations المطبقة؛
  الإضافة تكون بملف جديد فقط) — أي أنه الخيار الوحيد ذو الكلفة التأسيسية.
- أنظف فصل: سياسات RLS ومنح EXECUTE تشير لدور مستقل، ولا يورث أي حامل دور
  قائم أي وصول، وتبقى شروط التعيين/النطاق طبقة ثانية لا حاجزاً وحيداً.

### الخيار D — وصول مقيّد بالتعيين المباشر (purpose-scoped، منتهي الصلاحية)

**الدليل:** عقد التدقيق: «active canonical role **and** direct object,
cohort/report-scope or case assignment»؛ وتعليق التقرير في FOUNDATION-01
السطور 509–512: «Row-level contact/employment exports remain prohibited until
purpose-scoped, expiring direct assignments and audited export approval are
implemented»؛ ونموذج التعيين الجزئي الموجود: `graduate_followups.assignee_user_id`
مع فهرس فريد «متابعة نشطة واحدة لكل خريج»
(`GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` السطور 14–29).

**الآثار:**
- ليس بديلاً عن A/B/C بل طبقة إلزامية فوقها بموجب عقد التدقيق؛ السؤال المنتجي
  هو نطاقه: هل يقتصر على المتابعات/التصدير أم يمتد لكل قراءة بيانات خريج.
- يتطلب سطح تعيينات غير مسود بعد (جدول/عقد تعيين بالغرض والصلاحية والنطاق)،
  وسياسات RLS باستعلامات فرعية على التعيينات الفعالة، وتدقيقاً (audit) لكل
  قراءة/تصدير حساسة.

### خدمة الخريج الذاتية (مستقلة عن خيار التوظيف)

**الدليل:** جماهير الطلبات تتضمن `graduate` وحالة الملف `graduated` (تقرير
التدقيق، جدول «Account audience»)، مع تحفظ التدقيق نفسه: «This does not prove
post-graduation authentication…»؛ وسياسة D-13 في
`src/lib/graduates-affairs/account-continuity.ts` (افتراضي `undecided` يرفض كل
capability) وجدول `graduate_account_continuity_policies` في COMPLETION-01.

**الآثار:** سياسات self-access (الخريج على سجله فقط) قابلة للصياغة تحت أي خيار
من A–D، لكنها تبقى مغلقة حتى حسم D-13 (استمرارية الحساب: الدخول، استرداد
الهوية، البريد الجامعي، الإغلاق) — القرار D-13 شرط سابق وليس جزءاً من G4.

## 3. مصفوفة الآثار لكل خيار

| البعد | A: registrar | B: student_affairs | C: دور مخصص | D: طبقة التعيين |
|---|---|---|---|---|
| توسيع enum `app_role` | لا | لا | نعم (migration جديدة) | لا بذاته |
| منح EXECUTE للدوال | لدور registrar + شرط تعيين داخل الدالة | لدور student_affairs + شرط وحدة/تعيين | للدور الجديد فقط | تقييد إضافي بالغرض/الصلاحية |
| سياسات RLS | role + assignment | unit + assignment | role + assignment | استعلام تعيين فعال في كل سياسة حساسة |
| خطر التوسعة | وراثة كل المسجلين | وراثة كل موظفي شؤون الطلاب | لا وراثة | تعقيد استعلامات وأداء |
| توافق عقد «registrar bypass = DENY» | مشروط بإلزامية التعيين | متحقق | متحقق | متحقق |
| self-service الخريج | مستقل، ينتظر D-13 | مستقل، ينتظر D-13 | مستقل، ينتظر D-13 | مستقل |

مصفوفة ALLOW/DENY المطلوبة عند التنفيذ (من عقد التدقيق) ثابتة تحت كل الخيارات:
ALLOW فقط لـ (الخريج على نفسه ضمن D-13) و(دور قانوني فعال + تعيين مباشر بنفس
النطاق)؛ DENY لـ: نفس الدور بلا تعيين، وحدة/قسم/برنامج خاطئ، تعيين غير فعال،
خريج/جهة عمل أخرى، مجهول، وتجاوز admin/registrar/dean — مع صفر آثار جانبية
عند فشل التفويض.

## 4. الأسس المغلقة الصالحة تحت كل خيار (مثبّتة باختبارات)

مهما كان القرار، هذه الثوابت لا تُمس وهي مغطاة اليوم بـ
`tests/graduates-affairs/graduates-affairs-g4-default-deny-03.test.ts`:

1. لا route تحت `src/routes` يشير إلى مكونات أو مكتبة graduates-affairs.
2. `src/lib/graduates-affairs/` طبقة عقود نقية: لا `createServerFn`، لا عميل
   Supabase، لا `.rpc(`.
3. كلتا مسودتي SQL: RLS مفعّلة على كل جدول منشأ، صفر `CREATE POLICY`، كل دالة
   `SECURITY DEFINER` بـ `search_path` مثبت، وكل دالة قابلة للاستدعاء من العميل
   مسحوبة من PUBLIC/anon/authenticated، ولا منح لأدوار العميل.
4. كل مدخلات `ALU-*` التسع: `route: null` ودور placeholder يبدأ بـ `pending:`.
5. المكونات العرضية الأربعة: لا شبكة ولا أدوات تصدير (csv/xlsx/download/تصدير).
6. D-13: السياسة `undecided` ترفض كل قدرات `GRADUATE_ACCOUNT_CAPABILITIES`.
7. التقارير مجمعة فقط: حجب كل خلية دون 5، و`assertAggregateReportSafe` يرفض أي
   مفتاح مُعرّف للأشخاص.

## 5. ملاحظات توثيقية (لا متطلبات جديدة)

1. **دوال trigger بـ SECURITY DEFINER:** المسودتان تثبتان `search_path` لكنهما
   لا تسحبان EXECUTE الافتراضي من PUBLIC عن دوال الـ trigger (مثل
   `enforce_graduate_record_official_decision`). لم تُعدّل المسودتان (خارج
   النطاق)؛ يُترك تقييم سحب EXECUTE عنها لحزمة التفويض.
2. **تصادم التسمية:** وحدة معالجة الطلبات `graduate_affairs` تعني «شؤون الدراسات
   العليا» بأدوار `graduate_affairs_manager/specialist` (مدير/أخصائي الدراسات
   العليا) — `supabase/migrations/20260716172804_...024c8.sql` السطور 9 و21–22 —
   بينما نفس مفتاحي الدورين في `src/lib/staff-functional-roles.ts` يعنيان
   «شؤون الخريجين». أي قرار G4 يحتاج حسم التسمية القانونية للوحدة أولاً حتى لا
   تُبنى السياسات على معنيين مختلفين لنفس المفتاح.
3. **ALU-CANDIDATES-PIPELINE** ليست جزءاً من G4 (مسارها التشغيلي Live) لكن
   تقريرها المجمع غير المنشأ يحتاج قرار أدوار خاصاً
   (`pending:graduates_report_roles`).

## 6. أسئلة مفتوحة لمالك المنتج

1. أي بديل توظيف (A/B/C) هو الوحدة القانونية لشؤون الخريجين، وما التسمية
   الحاكمة بعد حسم تصادم `graduate_affairs` مع الدراسات العليا؟
2. هل طبقة التعيين المباشر (D) تغطي كل قراءة بيانات خريج أم تقتصر على
   المتابعات والتصدير على مستوى الأفراد؟ ومن يملك إنشاء/إنهاء التعيينات؟
3. من يعتمد التصديرات المجدولة (export approvers) وما عتبة الخلية الدنيا
   النهائية (المسودات تفرض `GREATEST(minimum, 3)` بافتراضي 5)؟
4. هل تبقى سلطة المسجل على قرارات التخرج الرسمية منفصلة تماماً عن قراءة شؤون
   الخريجين، أم يُمنح المسجل وصول قراءة محدداً على `graduate_official_decisions`؟
5. ما علاقة حسم D-13 (استمرارية الحساب) زمنياً بـ G4: هل يُنشر self-service
   للخريجين في نفس الحزمة أم لاحقاً؟
6. هل يُسحب EXECUTE عن دوال الـ trigger الأمنية في حزمة التفويض (ملاحظة §5-1)؟

## 7. القرار

**HOLD — لا خيار مختار.** كل البدائل أعلاه موثقة بالأدلة ومحايدة؛ الأسس المغلقة
في §4 مثبتة باختبارات خضراء وتبقى شرطاً لأي تفعيل مستقبلي. أثر الإنتاج: صفر.
