# PORTAL-REPORTS-CANONICAL-CATALOG-AND-TRACEABILITY-01 — تقرير الإنجاز

**المستودع:** msorori-mh/saba-uni-portal — **الفرع:** feat/reports-canonical-catalog-traceability-01
**رأس main وقت الجرد:** `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6`
**رأس main عند إنشاء الفرع (تحقق عبر list_commits):** `1cedb8884b927aeae2c35d20dc39f25a991c3b1d` (docs #197)
**الحالة:** PR جاهز للمراجعة المستقلة — **لا دمج تلقائي**.

---

## 1) الملخص

بنينا الكتالوج المرجعي الوحيد لتقارير البوابة (`src/lib/reports/catalog/` — 56 مدخلاً) مع مصفوفة تتبع مولّدة منه (`docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md` — كل مدخل يظهر بالضبط مرة واحدة)، وهيكل مركز تقارير عرضي props-driven (`src/components/reports-center/`)، وثوابت مفروضة بالاختبارات (26 اختباراً أخضر).

**لا routes جديدة. لا بيانات وهمية. لا migrations. لا SQL إنتاجي. لا deploy.** كل مدخل غير المفعّل موثق بسبب عدم جاهزية ومسار متابعة.

## 2) المنهجية

1. اعتمدنا جرد main المثبت بالمسارات (INVENTORY.md على رأس `0e2d25c9`)، وتحققنا أن رأس main الحالي `1cedb888` لم يغيّر أي قدرة تقاريرية (الفارق: #196/#197 وثائق فقط + #195 مستورد حسابات خارج النطاق).
2. راجعنا مسودة السجل (28 مدخلاً) ووسّعناها إلى 56 مدخلاً لتغطية صريحة لكل بند فرعي في §5: المقاصة 7 (في 6 مدخلات — دمج موثق)، مشاريع التخرج 8، الخريجون 9، متابعة المحاضرات 6، المواد التعليمية 6، طلبات الطلاب والوثائق 7.
3. كل حالة قررتها قاعدة صارمة (§3) مدعومة بدليل مسار ملف في حقل `evidence`، وتفرضها `invariants.ts` + الاختبارات.
4. مصفوفة التتبع **مولّدة برمجياً** من `entries.ts` (مولّد محلي غير مشحون) ⇒ استحالة انحراف الجدول عن الكتالوج؛ والاختبار يقرأ ملف المصفوفة ويتحقق أن كل `report_code` يظهر مرة واحدة بالضبط وأن عدد الصفوف = عدد المدخلات.

## 3) قواعد الحالة (الحالات الست المسموحة فقط)

| الحالة | القاعدة الصارمة | العدد |
|---|---|---|
| `LIVE` | مصدر بيانات فعلي + صلاحية + route + اختبار مؤتمت + ربط واجهة — **كلها مثبتة بمسار ملف** | 1 |
| `DATA_DEPENDENT` | موصول بالواجهة ويخدم بيانات حقيقية لكن ينقصه ركن LIVE (الاختبار المؤتمت هنا) | 7 |
| `SOURCE_READY` | مصدر البيانات Live على main لكن لا سطح تقرير؛ **route=null إلزاماً** | 8 |
| `UNDER_DEVELOPMENT` | باني/مكون (+اختبارات) موجود بلا server function وبلا route | 6 |
| `NOT_ACTIVATED` | فجوة موثقة — لا مصدر تقرير على main | 22 |
| `BLOCKED` | مصدر/عميل/اختبارات موجودة لكن شرطاً خارجياً صلباً يحجبها (SQL مسودة غير مطبقة، حزمة تفويض، قرار حوكمة) — **blocker نصي إلزامي** | 12 |

**المجموع: 56 مدخلاً.**

### قرار LIVE الوحيد
- `STU-SELF-SERVICE-VIEWS` (عروض الطالب الذاتية): مصدر (`src/routes/student.requests.tsx` + `student.materials.*` + `mobile.student.*`) + صلاحية (self-scoped RLS، دور `student`) + routes فعلية + اختبارات (`tests/student-requests/`، `tests/student-portal/`) + ربط — مثبت في الجرد §2.1/§5. **لم يُرفع أي مدخل آخر إلى LIVE.**

### لماذا أقسام `/admin/reports` الستة + لوحة القيادة ليست LIVE
الجرد أثبت أن `tests/admin/` لا يحوي أي اختبار تقارير ⇒ ركن «اختبار مؤتمت» غائب رغم وجود المصدر والصلاحية والـroute والربط ⇒ `DATA_DEPENDENT` (لا ادعاء LIVE زائف؛ الاختبار يفرض ذلك).

### لماذا بناة PR #192 ليست LIVE
بناة + لوحات + اختبارات (69) موجودة، لكن **لا server function ولا route** (موثق في §2.3/§5.8 من تقرير PR #192) ⇒ `UNDER_DEVELOPMENT` مع route=null وblocker نصي.

### لماذا عائلات SQL-المسودة BLOCKED
مشاريع التخرج (4 تقارير قسم)، المقاصة (4)، متابعة المحاضرات (المراقبة)، الخريجون (أفواج/استبيانات)، أداء الفرد: عملاء/بناة/اختبارات موجودة لكن **المسودات لم تُطبَّق على قاعدة البيانات** (لا شيء في `supabase/migrations/`) + لا routes + تعيينات/تفويضات معلقة ⇒ `BLOCKED` بأسباب نصية دقيقة.

## 4) الرؤية fail-closed

`canSeeReport(entry, viewerRoles)`: أدوار فارغة/غير معروفة ⇒ `false`. رموز الصلاحيات تطابق حرفياً؛ الرموز المعلقة (`pending:*`، `assignment:*`، `department_assignment:*`) لا تطابق أي دور فعلي ⇒ **من لا تُعرف صلاحيته لا يرى التقرير** (مغطى باختبار: كل الأدوار الإدارية الأحد عشر لا ترى المدخلات المعلقة التفويض).

## 5) سجل ملكية ملفات هذا الPR (كلها جديدة — لا تعديل أي ملف قائم)

| المسار | الملكية |
|---|---|
| `src/lib/reports/catalog/types.ts` | هذا الPR |
| `src/lib/reports/catalog/entries.ts` | هذا الPR |
| `src/lib/reports/catalog/invariants.ts` | هذا الPR |
| `src/lib/reports/catalog/visibility.ts` | هذا الPR |
| `src/lib/reports/catalog/index.ts` | هذا الPR |
| `src/components/reports-center/types.ts` | هذا الPR |
| `src/components/reports-center/ReportCard.tsx` | هذا الPR |
| `src/components/reports-center/ReportsCenter.tsx` | هذا الPR |
| `tests/reports/catalog.test.ts` | هذا الPR |
| `docs/PORTAL-REPORTS-CANONICAL-CATALOG-AND-TRACEABILITY-01-REPORT.md` | هذا الPR |
| `docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md` | هذا الPR |

**لم تُمسّ:** `.github/workflows/**`، وثائق إغلاق PR194/اختبارات bun، `src/lib/imports/**`، `src/routes/admin/imports*`، `tests/imports/**`، ملفات student_accounts، `routeTree.gen.ts`، student_visible. لا migrations/SQL/deploy.

## 6) الفجوات الرئيسية (موثقة كمدخلات NOT_ACTIVATED/BLOCKED)

- تقرير التدقيق والأمان المجمع (أولوية عالية)، تغييرات الأدوار، لوحة رئيس القسم، العبء التدريسي المستقل، الوثائق والخدمات، أداء الفرد (مستبعد تصميمياً — قرار حوكمة).
- دوال التقارير القديمة اليتيمة الخمس (بلا مستهلك) — مرشحة للإزالة/الاستبدال بعقود PR #192.
- كل مدخلات المواد التعليمية الست: الميزة Live لكن لا تتبع استخدام ولا تقارير.

## 7) Route follow-ups (لا routes في هذا الPR)

1. توصيل لوحات PR #192 الثلاث في `/admin/reports` عبر server functions + تجديد routeTree (ملكية routeTree خارج نطاقنا).
2. مسارات عائلات SQL-المسودة بعد تطبيق المسودات (قرار DBA/حوكمة خارج هذا الPR).
3. route لمركز التقارير نفسه (`/admin/reports-center` مقترح) — المكونات جاهزة props-driven وتُغذّى بـ`REPORT_CATALOG_ENTRIES` + أدوار المشاهد من الحارس الخادمي.
4. قرارات تفويض معلقة تحجب الرؤية بحكم fail-closed: G4 (خريجون)، تعيينات المقاصة/المحاضرات، أدوار تقارير المواد والطلبات.

## 8) توافق PR #192

- مدخلات لوحاته الثلاث موجودة بالأكواد `AGG-REQUESTS-OVERVIEW` / `AGG-STAFF-ACTIVITY-BY-ROLE` / `AGG-FINANCE-SUMMARY`، وحالتها `UNDER_DEVELOPMENT` (ليس LIVE — لا ربط حقيقي بعد)، وroute=null، وblocker يذكر server function صراحة. الاختبار يفرض هذا التوافق.
- كتالوج PR #192 (`src/lib/reports/report-catalog.ts` — 17 مدخلاً بصيغة delivered/existing/gap) يبقى كما هو دون مساس؛ هذا الPR يضيف الكتالوج المرجعي الموحد بجانبه ولا يعدّله. توحيد الاثنين (أو جعل report-catalog يستهلك من الكتالوج المرجعي) متابعة لاحقة مقترحة.

## 9) التحقق المحلي

- `bun test tests/reports/catalog.test.ts` ⇒ **26/26 أخضر** (544 expect) — bun 1.3.14، الوحدة منعزلة (TS صرف).
- `tsc --strict` على مكتبة الكتالوج + مكونات مركز التقارير (مع stubs محلية لـreact و`@/components/ui/{badge,card,input}` — غير مشحونة) ⇒ **0 أخطاء**.
- ملفات التحقق المحلية غير المشحونة: `stubs/*`، `tsconfig.check.json`، مولّد المصفوفة.
- تواقيع `git hash-object` النهائية لكل ملف مشحون مسجلة في MANIFEST.txt ضمن مخرجات العمل وفي وصف الPR.
