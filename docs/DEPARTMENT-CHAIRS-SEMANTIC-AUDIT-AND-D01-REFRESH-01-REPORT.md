# تقرير DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01 (المسار B)

- المستودع: `msorori-mh/saba-uni-portal` — القاعدة: `main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac`
- الفرع: `audit/department-chairs-semantic-d01-refresh-01`
- طبيعة التسليم: **مصدر فقط (source-only)** — لم يُنفَّذ أي SQL على الإنتاج، ولم تُطبَّق أي هجرة، ولم يُنشأ أي حساب أو ملف شخصي، ولم يُعدَّل أي رئيس قسم فعلي.
- الحكم: **PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_AND_D01_REFRESH_01_SOURCE_READY**
- **يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**

---

## 1. الملخص

أُنجزت ثلاثة مخرجات مترابطة:

1. **تدقيق دلالي للقراءة فقط** (`DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql`) يصنّف كل قسم من CS/IT/IS في واحد من ثمانية تصنيفات، دون أي اعتماد على تسمية الأدوار (لا نمط مطابقة جزئية لكلمة chair إطلاقًا — خلل D-02 Q3d الموثق في الاستطلاع).
2. **حزمة D-01 مُحدَّثة** (`DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02*.sql`، أربعة ملفات جديدة) أمامية فقط، تتوقف عند اختلال الهوية أو التكرار، لا تنشئ حسابات أو ملفات، لا تخترع UUIDs، لا تحذف تاريخًا، مع بوابة دليل لنقل الشخص بين الأقسام، وقائمة بيضاء للمسّ تُثبت أن الصفوف المحمية لا تُلمس.
3. **إثبات تنفيذي على PostgreSQL 17.10 محلي**: مخطط مصغّر + بيانات اختبارية تغطي التصنيفات الثمانية كلها + متحقق fail-closed، إضافة إلى تنفيذ الحزمة نفسها طرفًا لطرف على مرآة للحالة الإنتاجية (دورة كاملة: تنفيذ → تحقق → تراجع أمامي → فشل متعمد للمتحقق → إعادة تنفيذ → عدم تأثير التكرار).

النتيجة: **8/8 تصنيفات PASS على PG 17.10**، ودورة حياة الحزمة كاملة PASS، واختبارات bun الثابتة PASS.

## 2. المرجعيات الدلالية (من الاستطلاع)

- التعريف الدلالي الرسمي لرئيس القسم (SCHEMA-INVENTORY §11): صف فعّال حاليًا في `request_processing_assignments` بشرط: وحدة `code='department'` + دور `code='department_head'` + `assignment_type='faculty_profile'` + نطاق `department_id` + نافذة `starts_at/ends_at/is_active`، والهوية عبر `faculty_profile_id → faculty_profiles.employee_number`.
- لا يوجد أي رمز دور يحتوي المقطع chair في `app_role` (12 قيمة) أو `roles_catalog` (18 رمزًا) أو `request_processing_roles` (SCHEMA-INVENTORY §11/§9)؛ القيمة الوحيدة من هذا القبيل هي عضوية مجالس `academic_council_member_role='chair'` وهي مفهوم مختلف (رئاسة جلسة مجلس، ليست رئاسة قسم).
- الأقسام **لا عمود `code` فيها** (SCHEMA-INVENTORY §2.1/§13.1) — لذلك لا يُستخدم `d.code` إطلاقًا.
- الأرقام الأكاديمية للهيئة التدريسية تُخزَّن في `faculty_profiles.employee_number` (وليس `academic_number` الذي يخص الطلاب) — SCHEMA-INVENTORY §12.
- الأسماء العربية المخزنة بصياغة مبسطة (اسامه/احمد)؛ المطابقة بالرقم الأكاديمي وUUIDs فقط والأسماء تأكيدات (D01-CURRENT-STATE §3).
- جذر العيب: البذرة الأصلية اشتقت الرؤساء من `position_title ILIKE` نصي حر ونسخت `fp.department_id` (D01-CURRENT-STATE §4.2) — «تسمية تُدخِل أخطاء تسمية».
- **تثبيت نسخة وقت التشغيل (استطلاع §7/§13.6)**: التدقيق والحزمة يستهدفان الدوال **المنشورة** في الهجرة `20260710180000_student_request_actor_rpc_rls.sql` (`user_matches_workflow_runtime_step` بمسار registrar/admin السريع ورجوع `is_department_head_of`)؛ مسودة التشديد `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` **غير مُطبَّقة** ولا تفترضها الحزمة ولا تطبقها. الفرع الثاني من `is_current_user_department_head_for_student` (`op.code IN ('department_head')`) SQL ميت بنيويًا لغياب رمز المنصب (SCHEMA-INVENTORY §8.2/§7.1).

## 3. التدقيق الدلالي (SELECT فقط)

الملف: `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql`

- يعمل داخل `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY` وينتهي بـ `ROLLBACK`؛ لا يحتوي أي DML/DDL (تتحقق من ذلك اختبارات bun بعد تجريد التعليقات).
- `SET LOCAL search_path TO b_chairs, public` — في الإنتاج لا وجود لمخطط `b_chairs` فيُتجاهل وتُحل الأسماء إلى `public`؛ في المختبر تُحل إلى `b_chairs`. الترتيب مقصود لصالح المختبر أولًا لمنع قراءة جداول غريبة محتملة في `public` على العنقود المشترك.
- المدخلات المثبتة: CS=`11111111-…` متوقع F2025006، IT=`ce485c67-…` متوقع F2025005، IS=`22222222-…` متوقع F2025004.

### طبقات الكشف (لكل قسم)

1. **الهوية**: عدد الملفات المطابقة `employee_number = المتوقع`.
2. **الوحدة/القسم**: `department_id` للتعيين مقابل `department_id` لملف الحامل.
3. **النافذة**: `is_active` + `starts_at<=now()` + `ends_at>now()|null` (حالي/مستقبلي/منتهٍ).
4. **التكرار**: أكثر من تعيين فعّال حاليًا لنفس القسم.
5. **الوحدة الخاطئة**: تعيين فعّال حامله ملفه في قسم آخر.

### أولوية الحسم (حتمية)

`AMBIGUOUS` (تعدد ملفات الهوية أو هوية التعيين الوحيد غير قابلة للحسم لأن `faculty_profile_id` فارغ — مسموح بنيويًا حسب §6.3) ← `DUPLICATE` (أكثر من فعّال) ← `WRONG_UNIT` (فعّال وحيد وحامله خارج القسم) ← `WRONG_IDENTITY` (فعّال وحيد داخل القسم لكن برقم أكاديمي غير المتوقع) ← `MATCHED` ← `INACTIVE` (صفوف `is_active=false` فقط) ← `EXPIRED` (صفوف موسومة فعّالة لكن خارج النافذة) ← `MISSING` (لا صفوف إطلاقًا).

مخرجات كل قسم: الرقم الأكاديمي المتوقع، عدد الملفات المطابقة، عدد التعيينات الفعّالة، الموضع الدلالي، عداد الوحدة الخاطئة، عداد التكرار، تشخيصات (غير فعّال/منتهي النافذة)، عداد الرؤساء الفعّالين خارج الأقسام الثلاثة، والتصنيف النهائي.

## 4. حزمة D-01 المُحدَّثة (أمامية فقط، ملفات جديدة كليًا)

لم تُمسّ الملفات التاريخية (`DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql` ولا أي تقرير سابق). الملفات الأربعة في `docs/migration-drafts/`:

| الملف | الدور |
|---|---|
| `…-PACKAGE-02-PREFLIGHT.sql` | قراءة فقط + ROLLBACK؛ قائمة فحص من 14 بندًا (مرتكزات الأقسام/الوحدة/الدور، هويات الكراسي الثلاثة، عضوية تكرار IT المعروفة، عدم وجود رؤساء فعّالين خارج النطاق، مرشحو CS غير الفعّالين ≤1) |
| `…-PACKAGE-02.sql` | التصحيح الأمامي في معاملة واحدة مع قفل استشاري |
| `…-PACKAGE-02-POST-VERIFIER.sql` | قراءة فقط + ROLLBACK؛ fail-closed على cardinality=1 والهوية المتوقعة وبقاء الصف الخاطئ كتاريخ |
| `…-PACKAGE-02-ROLLBACK-BY-FORWARD.sql` | تراجع بتصحيح أمامي (UPDATEs فقط) يعيد الحالة السابقة للتنفيذ بما فيها العيب المعروف |

### شروط الإيقاف (fail-closed)

- بوابات جلسة إلزامية: التذكرة، المُنفِّذ UUID بدور `system_admin` فعّال (يُحسم من `auth.users + user_roles`)، و**دليل النقل** `app.department_chairs_semantic_fix_evidence = 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006'` — بدونه لا يحدث أي نقل لشخص بين الأقسام.
- توقف عند اختلال الهوية: `OSAMA/KHALED/RAMZI_PROFILE_IDENTITY_DRIFT`، `AUTH_ACCOUNT_ANCHOR_DRIFT`، `…_ASSIGNMENT_DRIFT`.
- توقف عند التكرار: `IT_DUPLICATE_UNKNOWN_MEMBER_STOP_%`، `CS_DUPLICATE_ACTIVE_STOP`، `OSAMA_CS_INACTIVE_DUPLICATES_STOP_%`، `IS_ACTIVE_HEAD_CARDINALITY_STOP`.
- توقف نطاقي: `ACTIVE_HEAD_OUTSIDE_CS_IT_IS_STOP` (أي رئيس فعّال خارج CS/IT/IS).
- بعد الكتابة: cardinality=1 لكل قسم + الحامل = الهوية المعتمدة داخل القسم + بقاء خالد/رمزي بايت-بايت + **قائمة بيضاء للمسّ** (لقطات temp قبل/بعد: المجموعة المتغيرة ⊆ {الصف الخاطئ، صف أسامة-CS} ولا صف جديد غيره ولا ملف غير ملف أسامة) + `ASSIGNMENT_HISTORY_ROW_LOST`.
- لا INSERT إطلاقًا إلا صف واحد محتمل في `request_processing_assignments` (يأخذ `gen_random_uuid()` الافتراضي — لا UUID مخترع)، ولا DELETE إطلاقًا، والصف الخاطئ يبقى `is_active=false` كتاريخ دائم.

### الهويات المحمية

الكراسي الثلاثة (أسامة F2025006 / خالد F2025005 / رمزي F2025004 بأسمائهم المعتمدة: د. أسامة عبدالجليل أحمد سيف، د. خالد قاسم محمد البراحي، د. رمزي حميد الجابري) + السجلات الخمسة `SR-20260713-2DE64041`، `SR-20260715-FEDCB3E1`، `SR-20260716-26BAD4C8`، `USR-2026-000001`، `USR-2026-000002`. الحماية إنشائية: الحزمة لا تشير إلى أي جدول طلبات طلاب أو حسابات، وقائمة البيضاء تثبت أن مجموعة الصفوف المتغيرة محصورة بالصفوف المسموح بها فقط، وتتحقق اختبارات bun من حضور المعرفات في الحزمة ومن غياب أي DML محظور.

### النتائج المتوقعة بدقة

- **التدقيق على الإنتاج قبل التصحيح** (حسب أدلة D-01، يخضع للتأكد عند التشغيل الفعلي): IT=`DUPLICATE` (خالد الشرعي + صف أسامة الخاطئ فعّالان معًا)، IS=`MATCHED`، CS=`MISSING` أو `INACTIVE` (حسب وجود صف CS غير فعّال سابق — UNKNOWN حتى التشغيل).
- **بعد تنفيذ الحزمة**: CS/IT/IS كلها cardinality=1 والحامل = المتوقع المعتمد في القسم الصحيح (`MATCHED`)، الصف الخاطئ `7ab0b14f-…` موجود وغير فعّال ونافذته مغلقة، لا رئيس فعّال خارج الأقسام الثلاثة، إعادة التنفيذ = لا-عملية (idempotent).
- **المتحقق PG17**: 8/8 صفوف `pass=true` + الحكم `PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17_ALL_8_CLASSIFICATIONS`.

## 5. مخرجات تشغيل PG 17.10 (مختبر محلي، مخطط b_chairs فقط)

البيئة: `PostgreSQL 17.10 on x86_64-pc-linux-gnu` (حاضنة `/mnt/agents/output/work/pgharness`، منفذ 55444). كل الكائنات داخل `b_chairs` / `b_chairs_pkg` فقط.

### 5.1 المتحقق — التصنيفات الثمانية

```
OK  MINIMAL-SCHEMA / FIXTURES / VERIFIER   (node run-sql.mjs، exit=0)
D1 expected=MATCHED         actual=MATCHED         pass=true  active=1
D2 expected=MISSING         actual=MISSING         pass=true  active=0 (صف الطُعم department_member لم يُحتسب)
D3 expected=DUPLICATE       actual=DUPLICATE       pass=true  active=2 duplicate_count=1
D4 expected=WRONG_UNIT      actual=WRONG_UNIT      pass=true  wrong_unit_count=1 (الحامل F0099 قسمه D1)
D5 expected=WRONG_IDENTITY  actual=WRONG_IDENTITY  pass=true  (الحامل F0098 داخل القسم لكن ليس F0005)
D6 expected=INACTIVE        actual=INACTIVE        pass=true  inactive_assignment_count=1
D7 expected=EXPIRED         actual=EXPIRED         pass=true  expired_window_count=1
D8 expected=AMBIGUOUS       actual=AMBIGUOUS       pass=true  (faculty_profile_id فارغ)
out_of_scope_active_head_count=1 على كل الصفوف (القسم D9 خارج النطاق اكتُشف)
verdict = PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17_ALL_8_CLASSIFICATIONS
```

### 5.2 إثبات fail-closed للمتحقق (اختبار سلبي)

عكس التوقع D2 إلى MATCHED في نسخة مؤقتة ⇒ `FAIL … AUDIT_CLASSIFICATION_MISMATCH` و `exit=1`.

### 5.3 تشغيل التدقيق بمعاملات الإنتاج على مخطط الاختبار

3 صفوف (CS/IT/IS) كلها `MISSING` و`out_of_scope_active_head_count=7` — يثبت أن ملف التدقيق نفسه يعمل حرفيًا (قراءة فقط، ROLLBACK) وأن عداد خارج النطاق يلتقط التعيينات السبعة الفعّالة الاختبارية.

### 5.4 دورة حياة الحزمة طرفًا لطرف (مرآة إنتاجية `b_chairs_pkg`)

بُنيت مرآة للحالة الإنتاجية قبل الإصلاح (أسامة على IT + الزوج المعيب + صفا خالد/رمزي + منفّذ system_admin) ونُفذت الملفات بعد تحويل النطاقات `public./auth.` إلى المخطط المرآة (sed على نسخ مؤقتة فقط — الملفات المُسلَّمة لم تُمس):

```
1) تنفيذ PACKAGE-02           OK (مسار INSERT — لا يوجد صف CS سابق)
2) POST-VERIFIER              OK  (CS=F2025006 / IT=F2025005 / IS=F2025004، active_chair_count=1 للكل)
3) ROLLBACK-BY-FORWARD        OK  (إعادة الحالة المعيبة أماميًا)
4) POST-VERIFIER بعد التراجع  FAIL متعمد: POST_CARDINALITY_DEPT_11111111-…_COUNT_0  (إثبات كشف الانحراف)
5) إعادة تنفيذ PACKAGE-02     OK  (مسار إعادة استخدام الصف غير الفعّال الوحيد)
6) إعادة التنفيذ مرة ثانية    OK  (لا-عملية idempotent)
7) POST-VERIFIER نهائي        OK  + verdict PASS_DEPARTMENT_CHAIRS_SEMANTIC_FIX_PACKAGE_02_POST_VERIFIED
```

PREFLIGHT على الحالة المعيبة: 14/14 بندًا `ok=true` (منها `IT_DUPLICATE_PRESTATE_MEMBERSHIP` و`NO_ACTIVE_HEADS_OUTSIDE_CS_IT_IS out_of_scope=0`).

### 5.5 إثبات شروط الإيقاف (اختبارات سلبية)

- تنفيذ الحزمة دون تذكرة الجلسة ⇒ `SEMANTIC_FIX_TICKET_REQUIRED` (exit=1).
- حقن رئيس IT فعّال ثالث مجهول ثم التنفيذ ⇒ `IT_DUPLICATE_UNKNOWN_MEMBER_STOP_1` (exit=1)؛ ثم أُزيل الصف المحقون وعاد POST-VERIFIER سليمًا.

## 6. اختبارات bun الثابتة (مضاد انحدار)

الملف: `tests/docs/department-chairs-semantic-audit-d01-refresh-01.test.ts` (اتفاقية `tests/<area>/` المتبعة في المستودع). يتحقق من:

- حظر نمط D-02 المعيب (مطابقة chair الجزئية، العمود `d.code` غير الموجود، اشتقاق `position_title`) في كل ملفات SQL الجديدة.
- حظر إنشاء الحسابات/الملفات (`INSERT INTO auth.users`، `INSERT INTO faculty_profiles`) وحذف/اقتطاع تاريخ التعيينات.
- التدقيق قراءة فقط صرف (لا DML/DDL بعد تجريد التعليقات) وينتهي ROLLBACK؛ الحزمة الأمامية هدف INSERT الوحيد فيها `public.request_processing_assignments`.
- تطابق «الجسم المشترك» بايت-بايت بين التدقيق والمتحقق (علامتا `SHARED:CLASSIFICATION_BODY`).
- حضور الهويات المحمية الثمانية، بوابة الدليل، قائمة البيضاء، تثبيت نسخة وقت التشغيل، عدم وجود مسافات زائدة في نهايات الأسطر.

## 7. قرارات التصميم والمواضع

- **المواضع**: حزم SQL في `docs/migration-drafts/` (اتفاقية المستودع الموثقة في FILES.json: الحزم غير المُطبَّقة تعيش هناك)، ملفات مختبر PG17 بنفس المجلد بأسماء مسبوقة `…-PG17-` تمييزًا لها كأدوات مختبر لا مسودات إنتاج، اختبار bun في `tests/docs/` (اتفاقية قائمة)، التقرير في `docs/`. كلها ملفات **جديدة**؛ لم يُعدَّل أي ملف قائم.
- **AMBIGUOUS** عرّفناه على هوية غير قابلة للحسم (رابط `faculty_profile_id` فارغ — حالة يسمح بها المخطط فعليًا §6.3) بدل كسر قيد UNIQUE في المخطط المصغّر، ليبقى DDL منقولًا حرفيًا.
- **عداد خارج النطاق** أُضيف لأن D01-CURRENT-STATE §4.6 طالب صراحة بفحص غياب تعيينات رئيس فعّالة خارج CS/IT/IS.
- تسمية الحزمة `…-02` لتفادي أي التباس مع الحزمة التاريخية `…-01` المحفوظة كما هي.

## 8. الإخلاء والمتابعات

- لم يُنفَّذ أي شيء على الإنتاج؛ تنفيذ الحزمة يبقى **HOLD — يتطلب تفويضًا صريحًا منفصلًا** (نفس وضعية الحزمة التاريخية).
- الحزمة تحقق منطقها على مرآة محلية بتحويل نطاقات آلي؛ التحقق النهائي الواجب هو PREFLIGHT على الإنتاج ثم التنفيذ ثم POST-VERIFIER.
- البنية الكاملة/المجموعة الكاملة للاختبارات: **مؤجلة إلى CI** (نُفذت هنا اختبارات bun المستهدفة فقط).
- فحص tsc scoped strict: نُفذ على ملف الاختبار مع shim محلي لتعريف `bun:test` (حزمة bun-types غير متاحة في القالب) — التفاصيل في سجل التسليم.
- **يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**

## 9. الملفات الجديدة (سجل الملكية)

| المسار | الغرض |
|---|---|
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql` | التدقيق الدلالي (قراءة فقط) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-MINIMAL-SCHEMA.sql` | مخطط PG17 المصغّر (مختبر) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-FIXTURES.sql` | بيانات التصنيفات الثمانية (مختبر) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-VERIFIER.sql` | المتحقق fail-closed (مختبر) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-PREFLIGHT.sql` | قائمة فحص ما قبل التنفيذ (قراءة فقط) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02.sql` | التصحيح الأمامي (مسودة — غير مُطبَّقة) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-POST-VERIFIER.sql` | متحقق ما بعد التنفيذ (قراءة فقط) |
| `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK-BY-FORWARD.sql` | التراجع بالتصحيح الأمامي (مسودة — غير مُطبَّقة) |
| `tests/docs/department-chairs-semantic-audit-d01-refresh-01.test.ts` | اختبارات bun الثابتة |
| `docs/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01-REPORT.md` | هذا التقرير |
