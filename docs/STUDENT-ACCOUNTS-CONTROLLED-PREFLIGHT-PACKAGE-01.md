# STUDENT-ACCOUNTS-CONTROLLED-PREFLIGHT-PACKAGE-01 — حزمة الفحص المسبق المضبوط لحسابات الطلاب (المسار K)

المستودع: `msorori-mh/saba-uni-portal` — القاعدة: `main @ debf9d041f7c05794f6df33877f1dff91253625e`.
البرنامج: `PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01` — المسار: `K — STUDENT-ACCOUNTS-CONTROLLED-PREFLIGHT-PACKAGE-01`.
النطاق: **وثائق فقط (docs-only)**. صفر إنشاء حسابات، صفر تنفيذ لملف الـ566 صفاً، صفر بيانات شخصية (PII) في git وفي هذه الوثيقة — أعداد إجمالية وقنوات تجزئة فقط.
الحالة: حزمة preflight مضبوطة جاهزة للاستخدام؛ **قرار الحالة الراهنة = HOLD** (مبررات §8).

---

## 1. الغرض

تهيئة حزمة فحص مسبق (preflight) مضبوطة وقابلة للتدقيق تسبق أي تشغيل حي لمستورد `student_accounts` (PR #195، مُدمج) على ملف الطلاب ذي الـ566 صفاً، وتدعم بالترتيب:

1. التقاط **لقطة إنتاج** عبر سطح Lovable المنشور (قراءة فقط، أعداد إجمالية فقط).
2. **مطابقة الملف دون اتصال (offline)** ضد اللقطة — بالتجزئة والأعداد لا بنقل البيانات.
3. **تشغيل تجريبي (dry-run)** عبر مسار المعاينة القراءة-فقط القائم.
4. إثبات **تجزئة الملف المستقرة** و**تجزئة اللقطة**.
5. إنتاج **ملخص مطابقة (reconciliation summary)** موقّع بالتجزئات.
6. إصدار **قرار GO/HOLD** وفق شروط GO العشرة (§7) والقاعدة الملزمة من المسار D.

لا تمنح هذه الحزمة بذاتها أي إذن تنفيذ؛ التنفيذ الحي يتطلب قرار GO موثقاً بقالب الأدلة (§10) وجلسة مفوّضة منفصلة.

## 2. المرجعيات المعتمدة على main (تم التحقق من بصماتها)

المرجع الحاكم هو حراسات المسار D المُدمجة عبر **PR #200** (مُدمج في `main`؛ رأس الفرع المُدمج `2caffb3ee993a38e4ee1e7351b093ea1dfa81c14`):

| المرجع | المسار / المعرف | git blob SHA على main @ debf9d04 |
|---|---|---|
| تقرير D (التصالح مع واقع الإنتاج + الحراسات) | `docs/STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01-REPORT.md` | `1b22a37ab525b2020684d7856016ae12c7402f28` |
| نواة الحارس النقية (12 رمز تصنيف، عقد اللقطة، sha256، القاعدة الملزمة، بوابة GO/HOLD) | `src/lib/imports/student-accounts-preflight.ts` | `8e33a6fae6a66938168f4ec1b5bf130d7dd6e20a` |
| توصيل القراءة فقط (DI: SELECT فقط + مسح Auth) | `src/lib/imports/student-accounts-preflight.server.ts` | `61ab7d5bfed67e83eea74dab72b2872b6293820c` |
| اختبارات الحارس (25 اختبار bun) | `tests/student-accounts-guards/student-accounts-preflight.test.ts` | `cc8edd0a94cf44281bdadac2aa8b80ee56229502` |
| مدقق المستورد القائم (مصدر الدلالات الصفية) | `src/lib/imports/student-accounts.ts` | `1e384173e1e4da7b10dbfce9eef27c44c20f0e6c` |

حقائق مُثبتة من سجل المستودع:

- **PR #195** (مستورد `student_accounts`): مُدمج؛ رأس الفرع المُدمج `5aa85688f4277856f4e766b69d96749ab5a605d7`. نتائجه الصفية: `READY_TO_CREATE` / `ALREADY_LINKED` / `CONFLICT` (بلا ربط تلقائي) / `STUDENT_NOT_FOUND` / `INVALID_EMAIL`؛ التشغيل مقيد بدورَي `admin` و`system_admin` فقط.
- **PR #200** (حراسات D): مُدمج. أرقام واقع الإنتاج (D-02، قراءة فقط): `student_profiles` الإجمالي **846**، المرتبط **843**، غير المرتبط **3**. ملف الاستيراد المرتقب **خارج المستودع** ويحوي **566 صفاً**. اللقطة بـ TTL افتراضي **15 دقيقة**، وسقف مسح Auth **20 صفحة × 200 = 4000 حساب**.
- **PR #205 (المسار F — RUNTIME-DEPLOYED-SHA-PROVENANCE-SOURCE-01)**: **مفتوح (DRAFT) وغير مُدمج بعد** — اجتياز محتوى معلّن ودمج معلّق على انقطاع CI. آليته (وسم `meta[name="build-sha"]` في كل صفحة + مسار `/version.json` بـ `Cache-Control: no-store`) هي **مسار الإثبات المعتمد** لشرط «SHA المنشور مُثبت» (§7 شرط 10)، وتُوثَّق هنا كـ **PENDING**؛ ليست على `main` وقت كتابة هذه الحزمة ولا يُستشهد بها كميزة قائمة.

## 3. مدخلات الفحص المسبق (preflight inputs)

| المدخل | الوصف | قناة الإثبات |
|---|---|---|
| ملف الاستيراد | ملف الـ566 صفاً — **خارج المستودع ويبقى خارجه**؛ لا يُنسخ ولا يُقتبس منه أي صف | `file_hash` = sha256 على بايتات الملف كما هي |
| لقطة الإنتاج | أعداد إجمالية فقط: `total_profiles`, `linked_profiles`, `unlinked_profiles` (= total − linked)، مع `captured_at`, `expires_at` (TTL 15 دقيقة), `project_ref`, `source_channel`, `schema_version` | `snapshot_hash` = sha256 على JSON قانوني لكل حقول اللقطة (كشف أي عبث بالأعداد) |
| هوية المشغّل | حساب المشغّل ودوره في `user_roles` | الدور ∈ {`admin`, `system_admin`} فقط |
| هوية المصدر | `SOURCE_SHA` = التزام git الذي بُني منه المستورد المنشور | سجل النشر / `git rev-parse` وقت النشر |
| هوية النشر | `DEPLOYED_SHA` = SHA المقروء من السطح المنشور نفسه | وسم `meta[name="build-sha"]` أو `/version.json` (آلية F — PENDING) |
| نتيجة dry-run | مخرجات المعاينة القراءة-فقط على نفس الملف ونفس اللقطة | ملخص التصنيف الصفي بالأعداد |

**قاعدة صارمة:** لا يدخل git ولا هذه الوثيقة ولا أي تقرير لاحق أي اسم أو بريد أو رقم أكاديمي حقيقي. المطابقة والتقارير تجري بالأعداد الإجمالية والتجزئات فقط؛ أي قائمة صفية تفصيلية تبقى في القناة التشغيلية المفوّضة خارج git.

## 4. خطوات التقاط لقطة الإنتاج (Lovable production snapshot)

كل الخطوات قراءة فقط، وبصلاحية مفوّضة، ودون أي كتابة:

1. التحقق من `project_ref`: تأكيد أن جلسة القراءة تشير إلى مشروع الإنتاج الصحيح (لا staging ولا معاينة) — عدم التطابق ⇒ إيقاف فوري.
2. قراءة الأعداد الإجمالية فقط: إجمالي `student_profiles`، عدد المرتبط (`user_id IS NOT NULL`)، واشتقاق غير المرتبط = الإجمالي − المرتبط. **ممنوع تصدير أي صف أو عمود شخصي.**
3. تسجيل `captured_at` (UTC) وحساب `expires_at = captured_at + 15 دقيقة`.
4. حساب `snapshot_hash` (sha256 على JSON قانوني لحقول اللقطة كاملة) وتثبيته في قالب الأدلة.
5. تثبيت `DEPLOYED_SHA` من السطح المنشور نفسه: `meta[name="build-sha"]` في HTML أي صفحة، أو `GET /version.json`. قيمة `"unknown"` تعني **UNVERIFIABLE** — ليست إثباتاً ولا دحضاً، وتُبقي القرار HOLD. (هذه القناة متاحة فقط بعد دمج F/PR #205 ونشر أول بناء يحملها؛ قبل ذلك تُسجَّل PENDING.)
6. أي لقطة يتجاوز عمرها TTL عند لحظة القرار تُعتبر `STALE_SNAPSHOT` ويجب إعادة التقاطها.

## 5. المطابقة دون اتصال (offline file matching)

1. حساب `file_hash` محلياً على ملف الـ566 صفاً قبل أي معاينة، وإعادة حسابه بعدها؛ أي تغيّر ⇒ `FILE_CHANGED_AFTER_PREVIEW` ⇒ HOLD.
2. تصنيف كل صف محلياً وفق دلالات `validateStudentAccounts` ورموز التصنيف الاثني عشر المتعاقد عليها في نواة D:
   - مستوى الصف: `ALREADY_LINKED`, `READY_TO_CREATE`, `CONFLICT`, `STUDENT_NOT_FOUND`, `INVALID_EMAIL`, `DUPLICATE_IN_FILE`, `DUPLICATE_ACADEMIC_NUMBER`, `DUPLICATE_EMAIL`, `SNAPSHOT_MISMATCH`.
   - مستوى الدفعة: `FILE_CHANGED_AFTER_PREVIEW`, `UNAUTHORIZED`, `STALE_SNAPSHOT` (+`SNAPSHOT_MISMATCH` عند كسر تجزئة اللقطة).
3. تضمين فحصي اكتشاف إضافيين قبل الاعتماد (متابعتا D التشغيليتان):
   - تكرار البريد على مستوى قاعدة البيانات نفسها (`GROUP BY email HAVING count > 1` — عدد فقط) لغياب قيد UNIQUE على `student_profiles.email`.
   - مسح Auth بالبريد لكشف حسابات يتيمة (نتيجة فك الربط الإداري) ضمن سقف 20×200=4000 — قيد موثق؛ ما وراءه يُفشِل إنشاء الحساب المكرر لاحقاً عند Supabase (فشل مغلق).
4. ناتج المطابقة الذي يدخل القناة التوثيقية هو **الأعداد لكل رمز** فقط؛ التفاصيل الصفية تبقى خارج git.

## 6. التشغيل التجريبي (dry-run)

1. يُنفَّذ عبر `previewBulkImportValidation("student_accounts", rawRows)` — **قراءة فقط بالبناء** (لا كتابات في المدققات؛ مسح Auth `listUsers` قراءة فقط).
2. يُشترط أن يجري dry-run على **نفس الملف** (نفس `file_hash`) و**ضمن صلاحية نفس اللقطة** (نفس `snapshot_hash`)؛ غير ذلك لا يُحتسب دليلاً.
3. غياب dry-run موثق قبل التنفيذ ⇒ `DRY_RUN_MISSING` ⇒ HOLD.
4. يُمنع منعاً باتاً استدعاء مسار التنفيذ الحي ضمن هذه الحزمة؛ dry-run هو أقصى ما يُسمح به.

## 7. شروط GO العشرة (كلها إلزامية — أي إخفاق ⇒ HOLD)

| # | الشرط | التحقق | الدليل المطلوب |
|---|---|---|---|
| 1 | **القاعدة الملزمة:** `READY_TO_CREATE` = `snapshot.unlinked_profiles` تماماً (بحدّيها العلوي والسفلي) | مقارنة عدد الصفوف المصنّفة `READY_TO_CREATE` بقيمة اللقطة | ملخص المطابقة؛ غياب `BINDING_RULE_VIOLATION` |
| 2 | التعارضات = 0 (`conflicts=0`) | لا صف `CONFLICT` (بما فيه يتامى Auth عبر مسح البريد، وتعارض ملكية البريد، و`is_active=false` لغير المرتبط) | عداد `CONFLICT=0`؛ غياب `CONFLICTS_PRESENT` |
| 3 | المكررات = 0 (`duplicates=0`) | لا `DUPLICATE_IN_FILE` ولا `DUPLICATE_ACADEMIC_NUMBER` ولا `DUPLICATE_EMAIL` (ملفاً وقاعدةً) | عداد المكررات=0؛ غياب `DUPLICATES_PRESENT` |
| 4 | غير الموجودين = 0 (`student_not_found=0`) | لا صف `STUDENT_NOT_FOUND` | العداد=0 |
| 5 | البريدات غير الصالحة = 0 (`invalid_email=0`) | لا صف `INVALID_EMAIL` | العداد=0 |
| 6 | اللقطة حالية وسليمة | `now < expires_at` (TTL 15 دقيقة) + تحقق `snapshot_hash` + لا `SNAPSHOT_MISMATCH` صفياً | حقول اللقطة + تجزئتها؛ غياب `STALE_SNAPSHOT`/`SNAPSHOT_MISMATCH_PRESENT` |
| 7 | تجزئة الملف مستقرة | `file_hash` قبل المعاينة = بعدها = المرافق للقرار | التجزئة المسجلة مرتين متطابقة؛ غياب `FILE_CHANGED_AFTER_PREVIEW` |
| 8 | `project_ref` صحيح | اللقطة والجلسة على مشروع الإنتاج المعتمد | `project_ref` الموثق في اللقطة |
| 9 | مشغّل مخوّل | الدور ∈ {`admin`, `system_admin`} فقط | إثبات الدور؛ غياب `UNAUTHORIZED_ROLE` |
| 10 | إثبات المصدر والنشر | `SOURCE_SHA` للمستورد مُثبت ومُثبَّت (pinned)، و`DEPLOYED_SHA` مُثبت من السطح المنشور عبر آلية F (`meta[name="build-sha"]` / `/version.json`) ومطابق لـ `SOURCE_SHA` | تطابق SHAين موثق؛ `"unknown"` ⇒ UNVERIFIABLE ⇒ HOLD. **الحالة: PENDING — آلية F (PR #205) غير مُدمجة بعد** |

**قاعدة القرار:** `GO` فقط عند تحقق الشروط العشرة كاملة وخلو قائمة أسباب الإيقاف تماماً؛ غير ذلك `HOLD` مع تعداد كل سبب.

## 8. قرار الحالة الراهنة: **HOLD**

| البند | القيمة | المصدر |
|---|---|---|
| صفوف ملف الاستيراد | 566 | خارج المستودع (D-02 / تقرير D §1) |
| لقطة الإنتاج: إجمالي / مرتبط / غير مرتبط | 846 / 843 / 3 | D-02 قراءة فقط (تقرير D §1) |
| مطابقة صفية تفصيلية مُنجزة؟ | **لا** | لم تُجرَ بعد ضمن هذه الحزمة |
| آلية إثبات `DEPLOYED_SHA` على main؟ | **لا — PENDING** | PR #205 (F) مفتوح غير مُدمج |

**المبررات:**

1. **القاعدة الملزمة (D §2.5):** يجب أن يساوي `READY_TO_CREATE` قيمة `snapshot.unlinked_profiles` تماماً وإلا `HOLD` بسبب `BINDING_RULE_VIOLATION`. الواقع الراهن: ملف من **566** صفاً مقابل **3** غير مرتبطين في الإنتاج — 566 ≠ 3، ولا يمكن أن تتصالح الأعداد إلا إذا أثبتت مطابقة صفية تفصيلية أن **بالضبط 3 صفوف** تصنّف `READY_TO_CREATE` و**563** `ALREADY_LINKED` مع صفر تعارضات ومكررات وغير-موجود وبريد-غير-صالح. هذه المطابقة **لم تُنجَز بعد**؛ وحتى إنجازها يبقى القرار **HOLD** قسراً.
2. **شرط 10 معلّق:** إثبات `DEPLOYED_SHA` يعتمد على آلية F (PR #205) غير المُدمجة؛ لا يمكن إثبات تطابق المصدر/النشر حالياً ⇒ الشرط غير محقق ⇒ HOLD.
3. اللقطة المرجعية (846/843/3) أُخذت في زمن D-02؛ أي قرار مستقبلي يتطلب لقطة **طازجة** ضمن TTL 15 دقيقة — لا يُبنى قرار GO على أرقام قديمة.

**مسار الخروج من HOLD:** إعادة التقاط لقطة طازجة ⇒ مطابقة offline صفية كاملة (§5) ⇒ dry-run موثق (§6) ⇒ تحقق الشروط العشرة (§7) بما فيها إثبات النشر بعد دمج F ⇒ إصدار GO بقالب الأدلة (§10). أي خلل في أي حلقة يُبقي HOLD.

## 9. قالب ملخص المطابقة (reconciliation summary)

```text
RECONCILIATION SUMMARY — student_accounts preflight
captured_at_utc        : <ISO-8601>
operator_role          : <admin|system_admin>
project_ref            : <production project ref>
file_hash_sha256       : <64 hex>
file_rows              : <n>
snapshot_hash_sha256   : <64 hex>
snapshot_total         : <n>
snapshot_linked        : <n>
snapshot_unlinked      : <n>
snapshot_expires_at    : <ISO-8601> (TTL 15 min)
dry_run_done           : <yes|no> (same file_hash, same snapshot_hash)
row_classification     : ALREADY_LINKED=<n> READY_TO_CREATE=<n> CONFLICT=<n>
                         STUDENT_NOT_FOUND=<n> INVALID_EMAIL=<n>
                         DUPLICATE_IN_FILE=<n> DUPLICATE_ACADEMIC_NUMBER=<n>
                         DUPLICATE_EMAIL=<n> SNAPSHOT_MISMATCH=<n>
binding_rule_check     : READY_TO_CREATE == snapshot_unlinked ? <pass|fail>
source_sha             : <40 hex>
deployed_sha           : <40 hex|unknown> (channel: build-sha meta | /version.json)
stop_reasons           : <[] | list of codes>
decision               : <GO|HOLD>
```

(القالب بلا PII: أعداد وتجزئات ورموز فقط.)

## 10. قالب الأدلة لكل قرار

**عند HOLD (الحالة الراهنة):**

```text
EVIDENCE — HOLD
decision               : HOLD
date_utc               : <ISO-8601>
binding_rule           : file_rows=566 vs snapshot_unlinked=3 => 566 != 3 => BINDING_RULE_VIOLATION (pending row-level matching)
row_matching_status    : NOT_PERFORMED
deployed_sha_proof     : PENDING (F / PR #205 not merged; mechanism: meta[name="build-sha"] + /version.json)
snapshot_freshness     : reference figures 846/843/3 are from D-02; fresh snapshot required within 15-min TTL
stop_reasons           : [BINDING_RULE_VIOLATION(pending matching), DEPLOY_PROOF_UNPROVEN]
next_actions           : fresh snapshot; offline row-level matching; dry-run; 10-condition recheck
```

**عند GO (مستقبلاً — فقط عند تحقق §7 كاملة):**

```text
EVIDENCE — GO
decision               : GO
date_utc               : <ISO-8601>
file_hash_sha256       : <64 hex> (stable across preview)
snapshot_hash_sha256   : <64 hex> (fresh, within TTL)
ready_to_create        : <n> == snapshot_unlinked : <n>
conflicts/duplicates/student_not_found/invalid_email : 0/0/0/0
dry_run                : done, same file_hash + same snapshot_hash
operator_role          : <admin|system_admin>
project_ref            : <verified production ref>
source_sha             : <40 hex> (pinned)
deployed_sha           : <40 hex> (proven via build-sha meta / version.json) == source_sha
stop_reasons           : []
approver               : <authorized human approver id — no PII>
```

## 11. الحدود

1. **صفر إنشاء حسابات** ضمن هذه الحزمة، وصفر تنفيذ لملف الـ566 صفاً، وصفر استيراد حي، وصفر SQL/migration/Deploy إنتاجي.
2. **صفر PII في git**: لا أسماء ولا بريدات ولا أرقام أكاديمية حقيقية في هذه الوثيقة ولا في أي ملف ملتزَم؛ المطابقة بالأعداد وقنوات التجزئة فقط، والملف المصدري يبقى خارج المستودع.
3. هذه الوثيقة لا تعدّل كوداً ولا تلغي حراسات D؛ هي طبقة تشغيلية توثيقية فوقها، والمرجع الحاكم للرموز والقاعدة الملزمة وشروط الإيقاف هو كود D على `main` (بصمات §2).
4. آلية إثبات `DEPLOYED_SHA` مُشار إليها كمسار إثبات **معلق (PENDING)** على دمج F (PR #205) ثم أول نشر يحملها؛ لا تُستعمل كدليل قبل ذلك.
5. قرار GO النهائي وتنفيذ أي استيراد حي يتطلبان جلسة مفوّضة منفصلة وموافقة بشرية مخوّلة — لا دمج ولا تنفيذ تلقائي.

## 12. متابعات (ملكيات خارج هذه الحزمة)

1. دمج F (PR #205) بعد عودة CI، ثم أول نشر يحمل `meta[name="build-sha"]` + `/version.json`، ثم تفعيل شرط 10 فعلياً.
2. تنفيذ المطابقة الصفية التفصيلية (offline) على الملف الحقيقي في قناة مفوّضة، وإنتاج ملخص المطابقة (§9).
3. استعلاما D التشغيليان: تكرار البريد على مستوى DB، وفحص أدوار `user_roles` للحسابات المرتبطة.
4. دمج حارس D كخطاف إلزامي في مسار التنفيذ خلف راية (مهمة مستقلة).
