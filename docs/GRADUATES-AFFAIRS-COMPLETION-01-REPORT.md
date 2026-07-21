# GRADUATES-AFFAIRS-MVP-COMPLETION-01 — تقرير استكمال شريحة شؤون الخريجين

- **المهمة:** Q-16 / GRADUATES-AFFAIRS-MVP-COMPLETION-01 (مصدري فقط — SOURCE-ONLY)
- **الأساس:** PR #179 المدموج (GRADUATES-AFFAIRS-MVP-FOUNDATION-01, SOURCE_READY)
- **الفرع:** `feat/graduates-affairs-completion-01` من `main` عند `8f229d09` — **PR #186**
- **الحالة:** SOURCE_READY — بانتظار المراجعة. لا دمج ذاتي، لا تطبيق SQL، لا تفعيل إنتاجي.

## نطاق الشريحة

استكمالاً للأساس (قرار التخرج الرسمي + سجل الخريج + الحراس)، تضيف هذه الشريحة عقود
المصدر والواجهات العرضية لست قدرات، مع إبقاء G4 ملزماً:

| القدرة | المصدر | الواجهة |
| --- | --- | --- |
| ملف الخريج الشامل | `graduate-file.ts` (تجميع fail-closed + ملخص غير مُعرّف) | `GraduateFileCard.tsx` |
| التواصل مع الخريجين | `communications.ts` (أهلية مربوطة بالموافقة ونقطة الاتصال + دورة المتابعات) | `GraduateCommunicationPanel.tsx` |
| الموافقات | `consents.ts` (سجل أغراض + دورة منح/سحب مستقبلية) | ضمن البطاقات أعلاه |
| الحالة الوظيفية | `employment.ts` (أحداث append-only بالإحالة، الحالة الحالية، صفوف التقارير) | ضمن `GraduateFileCard` |
| الاستبيانات | `surveys.ts` (أهلية + تحقق إجابات + تجميع نتائج) | `GraduateSurveyCard.tsx` |
| التقارير المجمعة | `reports.ts` (أفواج برنامج×سنة + حجب الخلايا الصغيرة + فحص أمان التجميع) | `GraduateReportsPanel.tsx` |
| D-13 استمرارية الحساب | `account-continuity.ts` (سياسة configurable، fail-closed) | سطر الحالة في `GraduateFileCard` |

## القرارات الملزمة وكيف نُفذت

1. **لا إنشاء سجل خريج قبل قرار تخرج رسمي موثق (fail-closed):** لم يُمس. `buildGraduateFile`
   يعيد استخدام `evaluateGraduateRecordReadiness` من الأساس أولاً، ثم يطابق السجل مع القرار
   (نفس قاعدة `GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION`) ويرفض أي جزء يشير لسجل آخر.
   لا يوجد أي مسار بديل (لا حالة ملف، لا قوائم مرشحين، لا نسب إنجاز، لا وثائق).
2. **D-13 = NEEDS_USER_INPUT:** صُممت كسياسة configurable (`AccountContinuityPolicy`) افتراضها
   `undecided` ويرفض كل capability. التقييم نقي وغير مُغيّر لأي حساب، ولا يدخل في مسار إنشاء
   سجل الخريج إطلاقاً — فلا يحجب المصدر. في SQL: جدول `graduate_account_continuity_policies`
   (افتراضي undecided، الموافقة تتطلب provenance، الصف المُقرّر غير قابل للتعديل والحذف ممنوع،
   والتصحيح بصف جديد عبر `supersedes_policy_id`) + دالة `evaluate_graduate_account_continuity`
   fail-closed (ترفض غير المعتمدة/خارج الصلاحية/غير المدرج/NULL timestamp، والقدرات الحساسة
   `portal_sign_in` و`university_email_reuse` تتطلب flags مخصصة إضافةً للإدراج).
3. **التقارير مجمعة/غير شخصية:** `buildCohortEmploymentReports` و`aggregateSurveyResponses`
   و`graduate_aggregate_employment_report` كلها تحجب **كل خلية** أصغر من العتبة
   (`GREATEST(minimum, 3)`، افتراضي 5) — الخلية المحجوبة ترجع NULL، و`suppressed=true`
   تعني أن الفوج كله دون العتبة. المدخلات answers-only/aggregate-only بنيوياً، مع
   `assertAggregateReportSafe` كفحص دفاعي إضافي قبل إخراج أي تقرير. لا يوجد أي تصدير على
   مستوى الأفراد (يبقى محظوراً بعقد الأساس حتى حزمة تفويض مستقلة).
4. **قناة الإرسال مقيدة بالموافقة:** التواصل والاستبيانات والفعاليات مربوطة بموافقة فعالة
   مطابقة لـ (purpose, notice_version) ونقطة اتصال موثقة غير ملغاة لنفس الغرض والقناة.

## الملفات

**مصدر (7):**
- `src/lib/graduates-affairs/account-continuity.ts`
- `src/lib/graduates-affairs/consents.ts`
- `src/lib/graduates-affairs/employment.ts`
- `src/lib/graduates-affairs/communications.ts`
- `src/lib/graduates-affairs/surveys.ts`
- `src/lib/graduates-affairs/reports.ts`
- `src/lib/graduates-affairs/graduate-file.ts`

**واجهات عرضية (4):** `src/components/graduates-affairs/GraduateFileCard.tsx`,
`GraduateCommunicationPanel.tsx`, `GraduateSurveyCard.tsx`, `GraduateReportsPanel.tsx`
— بنمط المكونات الشقيقة (`src/components/graduation-projects`, `src/components/academic-clearance`):
RTL، Tailwind، aria، بدون استدعاءات شبكة؛ الحد الأمني يبقى في SQL لا في الواجهة.

**مسودة SQL (DRAFT ONLY — DO NOT APPLY):**
- `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`
  - `graduate_followups` + فهرس فريد جزئي (متابعة نشطة واحدة لكل خريج) + حارس انتقالات
    (`open→in_progress→completed/cancelled`، نهائي، outcome إلزامي عند الإكمال، هوية غير قابلة للتعديل)
    + حارس `BEFORE DELETE` (السجل append-only بالكامل).
  - `graduate_communication_events` (append-only) + حارس الموافقة/نقطة الاتصال/عملة السجل
    (`GRADUATE_COMMUNICATION_CONSENT_REQUIRED`, `GRADUATE_CONTACT_POINT_NOT_USABLE`,
    `GRADUATE_RECORD_NOT_CURRENT`).
  - `graduate_account_continuity_policies` + حارس عدم قابلية القرار للتعديل + منع الحذف.
  - `evaluate_graduate_account_continuity(text,text,timestamptz)` (يرفض p_at=NULL) و
    `graduate_aggregate_employment_report(uuid,integer,integer)` (حجب كل خلية دون العتبة داخل الدالة)
    — SECURITY DEFINER بـ `search_path` مثبت، REVOKE من PUBLIC/anon/authenticated،
    RLS default-deny بلا سياسات.
  - يعتمد على مسودة الأساس (يعيد استخدام `reject_graduate_immutable_mutation`) ولا يعدّلها.

**اختبارات (2):**
- `tests/graduates-affairs/graduates-affairs-completion-01.test.ts` — 23 اختبار unit
  (بنمط bun test) + عقد أمان مسودة SQL النصي.
- `tests/graduates-affairs/graduates-affairs-completion-01.pg-verify.sql` — تحقق تنفيذي.

**موضع مسودة SQL:** وُضعت في `docs/migration-drafts/` اتساقاً مع مسودة الأساس المدموجة
(وليس `docs/drafts/`) حتى تبقى سلسلة التحقق (setup → أساس → استكمال → verify) في مسار واحد.

## التحقق المنفذ

- `bun test tests/graduates-affairs/` → **29/29 ناجح** (6 أساس + 23 استكمال).
- تنفيذ فعلي على PostgreSQL 18.4 معزول (نفس نمط تحقق الأساس):
  - سلسلة الأساس (setup → FOUNDATION-01 → pg-verify) → **OK** (لا regression).
  - سلسلة الاستكمال (setup → FOUNDATION-01 → COMPLETION-01 → pg-verify) → **OK**:
    رفض المتابعة النشطة المزدوجة (الفهرس الفريد)، رفض الإكمال بلا outcome، رفض الانتقالات
    الخلفية/بعد الإنهاء، منع تعديل هوية المتابعة، منع حذف المتابعات؛ قبول رسالة موافق عليها
    ورفض موافقة مسحوبة ونقطة ملغاة/غير موثقة، append-only للسجل؛ سياسة undecided ترفض،
    الموافقة بلا provenance مرفوضة، السياسة المعتمدة تسمح بالقدرة المدرجة فقط وتمنع الحساسة
    بلا flag، p_at=NULL مرفوض، الصف المُقرّر غير قابل للتعديل/الحذف، المنتهية/المرفوضة/المفقودة
    ترفض؛ تقرير الأفواج: الفوج دون العتبة محجوب كلياً، وفوج عند العتبة (3) يُرجع population
    مع حجب كل خلية فرعية (2<3 → NULL)، وبعد حدث رابع تُرجع كل الخلايا (4/3/3/3)، والافتراضي
    5 يحجب فوجاً من 4، والأحداث المُحال عليها لا تُحسب (population يبقى 4 مع حجب الخلايا)،
    والسجلات الملغاة تخرج من العينة؛ RLS/ACL default-deny على الجداول الثلاثة والدالتين.
- `tsc --noEmit` (strict, ES2023 lib — نفس مستوى الأساس المدموج الذي يستخدم `toSorted`)
  على ملفات `src/lib/graduates-affairs/**` و`src/components/graduates-affairs/**` → **0 أخطاء**.
  ملاحظة: `tsconfig` المستودع يحدد `ES2022` مع `noCheck: true`، والأساس المدموج نفسه يتطلب
  ES2023؛ لم أغيّر إعدادات المستودع (خارج النطاق).

## جولة مراجعة PR #186 (REVISE) — الإصلاحات

| البند | الإصلاح | الإثبات |
| --- | --- | --- |
| MEDIUM-1: حجب خلايا التقرير الفرعية | `graduate_aggregate_employment_report` صار يرجع NULL لكل مقياس `< v_threshold` (CASE لكل خلية) مع توثيق دلالة `suppressed`/NULL في ترويسة الدالة | pg-verify: فوج من 3 عند عتبة 3 → population=3 وكل الخلايا الفرعية NULL؛ حدث رابع → 4/3/3/3 غير محجوب؛ ما بعد الإحالة → خلايا محجوبة |
| LOW-2: `p_at=NULL` فشل-مفتوح | `IF p_at IS NULL THEN RETURN false` أول الدالة | pg-verify: تقييم بتوقيت NULL مرفوض |
| LOW-3: حالة سياسة غير معروفة (TS) | `evaluateAccountContinuityAccess` يرفض أي `state !== 'approved'` بـ `account_continuity_policy_unknown_state` قبل فحوص النافذة | bun test: حالة `"pending"` مرفوضة |
| LOW-4: حذف المتابعات | حارس `graduate_followups_append_only` (BEFORE DELETE) عبر `reject_graduate_immutable_mutation` | pg-verify: حذف متابعة مرفوض + عقد SQL النصي |

## لم يُمس

`routeTree.gen.ts`، `supabase/migrations/`، الأنظمة الأخرى، ملفات الأساس المدموجة،
`docs/PORTAL-SWARM-*`. لم تُطبق أي migration ولم يُدمج أي PR.

## الفجوات / Follow-ups

1. **ربط المسارات:** المكونات غير مربوطة بـ routes لأن `routeTree.gen.ts` خارج النطاق؛ تحتاج
   مهمة تكامل لاحقة (صاحب routeTree) لإضافة routes تستهلك المكونات الأربع.
2. **حزمة التفويض (G4):** سياسات RLS ومنح EXECUTE للدالتين + مصفوفة ALLOW/DENY للأدوار
   (self/تعيين مباشر) — شرط الإنتاج، لم يحن بعد بعقد الأساس.
3. **ربط runtime فعلي:** قراءة/كتابة عبر RPC بعد حزمة التفويض؛ حالياً كل العقود pure/draft.
4. **قوالب الرسائل:** `template_code` عقد نصي الآن؛ سجل القوالب المعتمدة ومحتواها يحتاج قرار
   محتوى (يرتبط بالإشعارات).
5. **D-13:** القرار المنتجي ما زال NEEDS_USER_INPUT؛ السطح جاهز (اعتماد/رفض/تقييد زمني/قدرات)
   وعند الحسم تُدرج سياسة معتمدة أو يُبقى الرفض.
6. **عدّ الأفواج:** تقرير التوظيف يعد الأحداث الجارية (current) لكل سجل؛ إن سُمح مستقبلاً بأكثر
   من حدث جارٍ لسجل واحد يُفضّل إضافة قيد DB يضمن حدثاً جارياً واحداً لكل خريج.

## قرار

**PASS (SOURCE_READY)** — شريحة متماسكة واحدة، fail-closed في كل الحدود، بدون أي تفعيل إنتاجي.
