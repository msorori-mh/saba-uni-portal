# STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01 — تقرير حراسات ما قبل التنفيذ (المسار D)

المستودع: `msorori-mh/saba-uni-portal` — القاعدة: `main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac`.
النطاق: حراسات (guards) جديدة بالكامل، دون اتصال (offline) وللقراءة فقط، تسبق أي تنفيذ حي لمستورد `student_accounts` (PR #195).
سياسة PII: **صفر بيانات شخصية** في هذا الملف وفي الكود والاختبارات — أعداد وأسماء أعمدة ورموز تصنيف فقط؛ الأرقام الأكاديمية في التركيبات الاختبارية اصطناعية (`F9999xxx`).

---

## 1. الخلفية والأدلة من الاستطلاع (recon)

الواقع الإنتاجي (D-02، قراءة فقط): `student_profiles` الإجمالي = **846**، المرتبط = **843**، غير المرتبط = **3**. ملف الاستيراد المرتقب خارج المستودع ويحوي 566 صفاً، ولا يجوز أن يدخل المستورد دون فحص.

أبرز نتائج الاستطلاع التي بُني عليها التصميم:

1. **لا توجد أي حراسة تجميعية** في سلسلة الاستيراد: لا hash للملف، لا لقطة إنتاج، لا تحقق من أعداد متوقعة — المعالجة صفاً-صفاً فقط (IMPORTER-REVIEW §2.5).
2. `previewBulkImportValidation("student_accounts", rawRows)` **للقراءة فقط بالبناء** (لا كتابات في المدققات؛ مسح Auth `listUsers` قراءة فقط) — نقطة الارتكاز المختارة دون أي تغليف لتعديل المستورد (§4.3).
3. `ALREADY_LINKED` يُقرر فقط من `user_id IS NOT NULL` دون مقارنة بريد الملف ببريد الحساب المرتبط — نقطة عمياء للمطابقة عالجناها برمز `SNAPSHOT_MISMATCH` (§2.2).
4. `student_profiles.email` بلا قيد UNIQUE → استعلام `maybeSingle()` قد يرمي خطأً ويسقط المعاينة كلها عند تكرار بريد في قاعدة البيانات (§2.2 / SCHEMA-NOTES §1).
5. فك الربط الإداري (`admin_unlink_portal_login`) يترك حساب Auth يتيمًا محتملاً → صفوف الطلاب الثلاثة غير المرتبطين قد تُصنَّف CONFLICT لا READY_TO_CREATE؛ لذا مسح Auth بالبريد إلزامي في الحارس (SCHEMA-NOTES §2).
6. فشل `admin_mark_student_password_reset` بعد إنشاء الحساب يُبلَّغ كفشل صف رغم وجود الحساب → إعادة المحاولة تُصنّفه ALREADY_LINKED (شفاء ذاتي) — سيناريو "إعادة بعد فشل جزئي" مغطى بالاختبارات (IMPORTER-REVIEW §4.2).
7. سوابق تنظيمية: وحدة سياسة صغيرة خالية من الآثار الجانبية `eligibility-import-policy.ts` هي النمط المتبع (§4.4). سابقة المسح التدميري (PILOT-DATA-CLEANUP-01) موجودة في التاريخ — **لم** يُعتمد هذا النمط؛ النهج هو المطابقة لا إعادة المسح (SCHEMA-NOTES §4b).

## 2. التصميم

### 2.1 الملفات (كلها جديدة — صفر تعديل على ملفات PR #195)

| المسار | الدور |
|---|---|
| `src/lib/imports/student-accounts-preflight.ts` | النواة النقية: رموز التصنيف الـ12، عقد اللقطة، التجزئة (sha256)، التصنيف الصفي، قاعدة الربط، بوابة القرار GO/HOLD. لا تستورد أي عميل Supabase ولا تُجري أي I/O. |
| `src/lib/imports/student-accounts-preflight.server.ts` | توصيل القراءة فقط عبر الحقن (DI): استعلامات SELECT فقط + مسح Auth `listUsers` (نفس أنماط قراءة المدقق الحالي). بلا أي INSERT/UPDATE/DELETE وبلا RPC. |
| `tests/student-accounts-guards/student-accounts-preflight.test.ts` | 25 اختباراً (bun) — انظر المصفوفة §5. |
| `docs/STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01-REPORT.md` | هذا التقرير. |

### 2.2 حد الحقن (DI boundary)

النواة النقية لا تلمس قاعدة البيانات إطلاقاً؛ كل حقائق DB/Auth تصل عبر `StudentAccountsPreflightReaders`:

- `fetchProfileRecords({ academicNumbers, emails })` — حالة الربط/البريد للملفات الشخصية (نفس نمط الجلب المسبق `.in(...)` في `validateStudentAccounts`).
- `findAuthExistingEmails(emails)` — المجموعة الفرعية من البريدات الموجودة كحسابات Auth (كشف اليتامى/الأجانب)، بحد أقصى 20 صفحة × 200 كما في `findAuthUserIdByEmailAdmin`.

الاختبارات تحقن قارئات صريحة بالحقائق الإنتاجية لكل سيناريو — لا يوجد أي mock يزيّف مصدر بيانات مفقوداً.

### 2.3 رموز التصنيف (12 بالضبط — عقد ثابت)

مستوى الصف: `ALREADY_LINKED`, `READY_TO_CREATE`, `CONFLICT`, `STUDENT_NOT_FOUND`, `INVALID_EMAIL`, `DUPLICATE_IN_FILE` (تكرار صف مطابق تماماً), `DUPLICATE_ACADEMIC_NUMBER`, `DUPLICATE_EMAIL`, `SNAPSHOT_MISMATCH` (بريد ملف يخالف بريد ملف شخصي مرتبط).
مستوى الدفعة: `FILE_CHANGED_AFTER_PREVIEW`, `UNAUTHORIZED`, `STALE_SNAPSHOT` (+`SNAPSHOT_MISMATCH` عند كسر تجزئة اللقطة).

### 2.4 عقد لقطة الإنتاج (بلا PII — أعداد فقط)

`schema_version`, `total_profiles`, `linked_profiles`, `unlinked_profiles` (مشتقة = total − linked), `captured_at`, `expires_at` (افتراضي TTL 15 دقيقة), `source_channel`, `project_ref`, `snapshot_hash` (sha256 على JSON قانوني لكل الحقول السابقة — كشف أي عبث بالأعداد).

### 2.5 قاعدة الربط (BINDING RULE) — مفروضة في الكود

**عدد صفوف `READY_TO_CREATE` يجب أن يساوي `snapshot.unlinked_profiles` تماماً، وإلا `decision = HOLD`** (السبب `BINDING_RULE_VIOLATION`). هذا يجعل سيناريو "ملف 566 صفاً مقابل 3 غير مرتبطين" يُغلق تلقائياً ما لم يتطابق العددان بدقة.

### 2.6 شروط الإيقاف (أي شرط ⇒ HOLD)

تعارضات > 0 (`CONFLICTS_PRESENT`)؛ مكررات > 0 (`DUPLICATES_PRESENT`)؛ طلاب غير موجودين > 0؛ بريدات غير صالحة > 0؛ `SNAPSHOT_MISMATCH` صفياً أو تجزئة لقطة معطوبة؛ لقطة منتهية الصلاحية؛ عدم تطابق `project_ref`؛ تغيّر hash الملف بعد المعاينة؛ غياب dry-run؛ دور غير مخوّل (المخوّلون: `admin`, `system_admin` فقط — نفس عقد `IMPORT_ROLES_BY_TYPE`)؛ SHA مصدر المستورد غير مُثبت؛ إثبات النشر غير مُثبت؛ وقاعدة الربط أعلاه. القرار `GO` فقط عند خلو القائمة تماماً.

## 3. لماذا لا تعديل على المستورد

الخطاف المختار لا يتطلب أي لمس لملفات PR #195: التصنيف يعكس دلالات `validateStudentAccounts` حرفياً (بما فيها أسبقية الفحوص و`is_active=false ⇒ CONFLICT`) ويضيف رموز المطابقة فوقها، والقراءات هي نفس قراءات المعاينة الحالية. نقاط دمج مستقبلية اختيارية (خارج نطاق هذه المهمة): استدعاء الحارس في أعلى مسار التنفيذ خلف راية، أو server fn موازية في ملف `*.functions.ts` جديد (IMPORTER-REVIEW §5).

## 4. نتائج التحقق المحلية

- `bun test tests/student-accounts-guards/` على bun 1.3.14: **25 ناجحاً / 0 فاشل** (91 توقعاً).
- فحص `tsc` صارم محدود النطاق (strict، بلا emit) على الوحدتين الجديدتين مع stubs محلية لـ `node:crypto` وعميل Supabase: **0 أخطاء**.
- فحص فراغات زائدة/علامات تبويب على كل الملفات الجديدة: نظيف.
- مجموعة `tests/` الكاملة وبناء المشروع: **مؤجلان إلى CI** (غير منفذين محلياً — الإفصاح في متن PR).

## 5. مصفوفة الاختبارات

| # | السيناريو | النتيجة المتوقعة | الحالة |
|---|---|---|---|
| 1 | **إلزامي:** file_rows=566، production_unlinked=3، كل الصفوف مرتبطة ⇒ READY=0 ≠ 3 | HOLD + `BINDING_RULE_VIOLATION` | ✅ |
| 2 | 563 ALREADY_LINKED + 3 READY_TO_CREATE مع unlinked=3 | GO (أسباب فارغة) | ✅ |
| 3 | تعارض واحد (حساب Auth يتيم لبريد غير مرتبط) | HOLD + `CONFLICTS_PRESENT` | ✅ |
| 4 | تعارض ملكية بريد عبر طالب آخر | CONFLICT | ✅ |
| 5 | بريد مكرر في الملف | DUPLICATE_EMAIL + HOLD | ✅ |
| 6 | رقم أكاديمي مكرر في الملف | DUPLICATE_ACADEMIC_NUMBER + HOLD | ✅ |
| 7 | صف مكرر مطابق تماماً | DUPLICATE_IN_FILE | ✅ |
| 8 | لقطة منتهية الصلاحية | HOLD + `STALE_SNAPSHOT` | ✅ |
| 9 | تغيّر الملف بعد المعاينة (hash) | HOLD + `FILE_CHANGED_AFTER_PREVIEW` | ✅ |
| 10 | تنفيذ مباشر دون dry-run | HOLD + `DRY_RUN_MISSING` | ✅ |
| 11 | دور غير مخوّل (registrar/student/finance_officer) وقبول system_admin | HOLD + `UNAUTHORIZED_ROLE` / GO | ✅ |
| 12 | SHA غير مُثبت / إثبات نشر غائب / project_ref خاطئ | HOLD بالأسباب الثلاثة | ✅ |
| 13 | SNAPSHOT_MISMATCH صفي (بريد ملف ≠ بريد مرتبط) | HOLD + `SNAPSHOT_MISMATCH_PRESENT` | ✅ |
| 14 | تجزئة لقطة معطوبة | HOLD + `SNAPSHOT_MISMATCH_PRESENT` | ✅ |
| 15 | بريد غير صالح | INVALID_EMAIL + HOLD | ✅ |
| 16 | طالب غير موجود | STUDENT_NOT_FOUND + HOLD | ✅ |
| 17 | is_active=false لملف غير مرتبط (مطابقة سلوك المدقق) | CONFLICT | ✅ |
| 18 | إعادة بعد فشل جزئي: لقطة محدّثة (unlinked 3→2) | GO + binding محقق (2=2) | ✅ |
| 19 | إعادة بلقطة قديمة (unlinked=3 بعد نجاح جزئي) | HOLD + `BINDING_RULE_VIOLATION` | ✅ |
| 20 | إعادة تشغيل بعد نجاح كامل: الكل مرتبط، unlinked=0 | GO ولا إنشاء (READY=0) | ✅ |
| 21 | اشتقاق unlinked = total − linked وتحقق التجزئة | صحيح / كشف العبث | ✅ |
| 22 | ثبات hash الملف (ترتيب المفاتيح لا يؤثر) | تطابق/اختلاف صحيحان | ✅ |
| 23 | عقد الرموز الـ12 بالضبط | تطابق تام | ✅ |
| 24 | قاعدة الربط — الحد الأعلى: READY=2 > unlinked=1 | HOLD + `BINDING_RULE_VIOLATION` | ✅ |
| 25 | صفوف بلا رقم أكاديمي متكررة البريد | STUDENT_NOT_FOUND لكل صف (لا DUPLICATE_IN_FILE) | ✅ |

## 6. حدود ومتابعات

1. **لا يُنفَّذ الملف الحقيقي (566 صفاً) ولا أي استيراد حي ضمن هذه المهمة** — الحارس offline/قراءة فقط؛ تشغيله على الإنتاج يتطلب جلسة مفوضة منفصلة.
2. سقف مسح Auth (20×200=4000 حساب) قد يفوّت تعارضاً وراءه — نفس قيد المستورد الحالي؛ موثق، ويُفشل إنشاء الحساب المكرر لاحقاً عند Supabase (فشل مغلق).
3. تكرار بريد على مستوى قاعدة البيانات نفسها (بلا قيد UNIQUE) يحتاج استعلام مطابقة مستقل (`GROUP BY email HAVING count>1`) قبل أي تشغيل — متابعة تشغيلية.
4. إثباتا SHA المصدر والنشر حالياً مدخلان للبوابة؛ أتمتة إثباتهما (توقيع artifact + فحص deploy) متابعة.
5. دمج الحارس كخطاف إلزامي في مسار التنفيذ (خلف راية) متابعة لاحقة بمهمة مستقلة — خارج نطاق الملكية هنا.
6. فحص أدوار `user_roles` للحسابات المرتبطة (إدخال الدور غير المفحوص الخطأ في المستورد) — استعلام مطابقة موصى به.
7. **يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**
