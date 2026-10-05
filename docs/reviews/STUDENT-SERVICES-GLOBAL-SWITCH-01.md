# STUDENT-SERVICES-GLOBAL-SWITCH-01 — مفتاح الإيقاف المؤقت للخدمات الطلابية

**الحالة:** SOURCE-ONLY. لم يُطبَّق أي ترحيل، ولم يُنشر شيء، ولم تُلمس أي قاعدة بيانات مشتركة.
**الفرع:** `feat/student-services-global-switch` · **القرار:** انظر آخر الوثيقة.

طلب مالك الكلية: «ميزة لدى الأدمن لتفعيل أو تعطيل مؤقت لجميع الخدمات الطلابية لدى الطلاب».

---

## 1. ماذا تفعل الميزة

مفتاح واحد عام، للأدمن فقط (`admin` أو `system_admin` — نفس الزوج الذي يستخدمه `assertAdmin()`؛ لا أدوار جديدة ولا تجاوز لأي دور آخر):

| الحالة | أثرها على الطالب |
|---|---|
| **مفعّلة** (الافتراضي بعد التطبيق) | لا تغيير إطلاقاً عن السلوك الحالي. |
| **متوقفة مؤقتًا** | لا يستطيع **بدء** طلب جديد ولا **إرسال** مسودة، لأي نوع طلب (الخدمات الخمس B1، خدمات P1 الذرية، النماذج الديناميكية/القديمة، وإفادة القيد)، على البوابة `/student/...` وعلى تطبيق الجوال `/mobile/student/requests...`. |

### القرار المتخذ لما يبقى متاحاً أثناء الإيقاف

| العملية | أثناء الإيقاف | السبب |
|---|---|---|
| عرض الطلبات السابقة، الحالة، الخط الزمني | متاح | قراءة فقط؛ لم يُلمس أي مسار قراءة. |
| تنزيل الوثائق الصادرة | متاح | ليست خدمة جديدة. |
| **إعادة إرسال طلب أعاده الموظف للاستكمال** (`returned` / `returned_for_completion`) | **متاح** | ليس خدمة جديدة، والموظف ينتظر الرد؛ منعه يجمّد طلباً جارياً. |
| تعديل مسودة قائمة أو إلغاؤها | متاح | لا تنشئ طلباً ولا ترسله. |
| بدء طلب جديد (أي نوع) | **ممنوع** | — |
| إرسال مسودة (حتى لو أُنشئت قبل الإيقاف) | **ممنوع** | الإرسال هو بداية الخدمة فعلياً. |
| معالجة الموظفين للطلبات الجارية | **لا تتأثر** | — |

هذا القرار مكتوب نصاً في واجهة الطالب وفي بطاقة الأدمن ونافذة التأكيد.

رسالة اختيارية يكتبها الأدمن (نص عادي فقط، 500 حرف كحد أقصى، بلا `<` `>` وبلا محارف تحكم)، وافتراضيها:
«الخدمات الطلابية متوقفة مؤقتًا. يمكنك متابعة طلباتك السابقة.»

---

## 2. التصميم ولماذا

### 2.1 أين يُخزَّن العَلَم

جدول مخصص بصف واحد `public.student_services_switch`، وليس `site_settings`:

- `site_settings` مقروء لـ`anon`/`authenticated` ويُكتب من صفحة الإعدادات العامة عبر service role بدون تدقيق لكل مفتاح؛ وضع مفتاح أمني فيه يوسّع من يستطيع تغييره.
- الجدول المخصص: RLS مفعّل **بلا أي policy**، وكل الصلاحيات مسحوبة من `PUBLIC`/`anon`/`authenticated` (و`service_role` قراءة فقط). الكتابة الوحيدة عبر `admin_set_student_services_enabled()` التي تتحقق من الدور داخل قاعدة البيانات وتكتب سجل تدقيق.

### 2.2 نقطة الإنفاذ: Trigger واحد لا ترقيع لكل RPC

فحص المسارات أظهر ثمانية مداخل على الأقل ينشئ أو يرسل بها الطالب طلباً:
`create_student_request`، `submit_student_request`، `submit_student_request_with_details`، `submit_student_request_with_secure_attachments`، `submit_b1_student_request_atomic`، `create_b1_request_draft_for_student`، `save_b1_request_draft_for_student`، والكتابة المباشرة على الجدول عبر RLS (المكوّن القديم `StudentRequestsSection.tsx`).

كلها تنتهي في مكان واحد: `INSERT` أو انتقال `draft → غير draft` على `public.student_requests`. لذلك اختير Trigger واحد `BEFORE INSERT OR UPDATE` (نفس نمط `trg_guard_b1_request_submit_boundary` و`trg_p1_guard_detailless_submit` الموجودَين):

- **لا يمكن تجاوزه** بمدخل منسي أو مدخل يُضاف لاحقاً.
- **لا يعيد كتابة أي دالة منشورة**، فلا anchors تنحرف ولا تعارض مع مسودة PR #436.
- **لا يكسر كتابات الموظفين/النظام**: يمنع فقط حين يكون `auth.uid()` هو مالك الطلب نفسه. الموظف (uid ≠ المالك) و`service_role`/النظام (uid = NULL) لا يُمنعان.
- لا استثناء بالدور داخل الحارس: طالب يحمل دوراً إدارياً لا يتجاوز الإيقاف لطلبه هو.

رمز الخطأ: `STUDENT_SERVICES_TEMPORARILY_DISABLED` (`ERRCODE P0001`). اختير `P0001` عمداً: ليس `42883` (الذي يفسّره الكود كـ«RPC غير متاح» فيفتح مسار fallback) وليس `42501` (الذي يُعرض كـ«لا تملك صلاحية»).

**طبقة ثانية في الخادم:** في `student-affairs.functions.ts` مساران احتياطيان يكتبان بـservice role (`fallbackCreateStudentRequestDraft`، `fallbackSubmitStudentRequest`) حيث `auth.uid()` = NULL، فلا يراهما الحارس ككتابة طالب. لذلك أُضيفت `assertStudentServicesOpenForNewRequest()` في أعلى كل server function للبدء/الإرسال (ثلاثة مواضع في `submitCanonicalStudentRequestCore` + `createStudentServiceRequest`). تفشل مغلقة: إن تعذرت قراءة الحالة لا يُرسل الطلب.

### 2.3 الصف المفقود

`student_services_enabled()` تُرجع `false` إذا غاب الصف (**fail-closed**، لا تجاوز بالخطأ). ولا خطر انقطاع دائم لأن:
1. الصف يُزرع `enabled = true` في **نفس معاملة** المسودة؛
2. Trigger يمنع `DELETE` و`TRUNCATE` على الجدول؛
3. `admin_set_student_services_enabled()` تعمل **UPSERT**، فيستطيع الأدمن إعادة الخدمة من الواجهة حتى لو اختفى الصف (مُثبت في البروفة).

قبل تطبيق المسودة (RPC غير موجود أصلاً) يعامل الخادم الميزة كـ«غير مثبّتة» = لا إيقاف، فلا يتعطل شيء إن نُشر الكود قبل الترحيل.

---

## 3. ما تنشئه المسودة بالضبط

`docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql` — معاملة واحدة، قابلة لإعادة التطبيق.

**جدول واحد (جديد):** `public.student_services_switch (id boolean PK = true, enabled, message_ar, updated_at, updated_by)`.

**ست دوال (كلها جديدة، لا تستبدل أي دالة قائمة):**

| الدالة | الغرض | EXECUTE |
|---|---|---|
| `student_services_enabled()` | المحمول الوحيد، STABLE | authenticated, service_role |
| `get_student_services_status()` | قراءة للطالب: الحالة + الرسالة (فقط عند الإيقاف)، بلا هوية من غيّر | authenticated, service_role |
| `admin_get_student_services_switch()` | قراءة الأدمن: من ومتى | authenticated (تتحقق من الدور) |
| `admin_set_student_services_enabled(boolean, text)` | الكتابة الوحيدة: تحقق دور + تحقق رسالة + UPSERT + `log_audit` | authenticated (تتحقق من الدور) |
| `guard_student_services_switch()` | دالة الحارس | لا أحد |
| `guard_student_services_switch_row()` | تمنع حذف/تفريغ الصف | لا أحد |

**ثلاثة Triggers:**
`trg_00_student_services_switch_guard` على `student_requests`؛ `trg_student_services_switch_row_keep` و`trg_student_services_switch_no_truncate` على جدول المفتاح.

**التدقيق:** عبر الآلية القائمة `public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)`، `entity_type = 'student_services_switch'`، و`action_type` أحد: `student_services_disabled` / `student_services_enabled` / `student_services_message_updated`، مع القيم القديمة والجديدة والفاعل. تكرار نفس الحالة لا يكتب شيئاً.

**ما لا تفعله المسودة:** لا تعدّل أي دالة منشورة، ولا أي policy أو grant قائم، ولا `request_types` (ولا `student_visible`)، ولا تكتب أي صف في `student_requests` أو خطوات/أحداث سير العمل أو الوثائق، ولا backfill/cleanup/delete/reset. **لم يُمس `enrollment_certificate`** لا في المسودة ولا في المصدر؛ يشمله الإيقاف فقط لأنه يمر بنفس الجدول ونفس الـserver functions.

**حراسة مسبقة تُجهض التطبيق قبل إنشاء أي شيء:** غياب الأدوار/الجداول/الأعمدة/`has_any_role`/`log_audit`، وجود أكثر من overload لـ`log_audit`، جدول بنفس الاسم وبشكل مختلف، أو Trigger بنفس الاسم لدالة أخرى. **وفحص ذاتي قبل COMMIT:** صف واحد، RLS مفعّل، لا policy، لا تسريب صلاحيات، الحارس مثبّت.

---

## 4. ما يراه كل طرف

**الأدمن** — بطاقة «الخدمات الطلابية» أعلى صفحة `/admin/request-types` (أنواع الطلبات؛ الصفحة القائمة لإعدادات طلبات الطلاب — لا عنصر تنقل جديد): الحالة (مفعّلة / متوقفة مؤقتًا)، مفتاح، حقل الرسالة مع عدّاد، «آخر تغيير: التاريخ — بواسطة فلان». الإيقاف يفتح نافذة تأكيد تعرض الرسالة التي ستظهر للطلاب؛ إعادة التفعيل فورية. المسجل وشؤون الطلاب (يصلون للصفحة نفسها) يرون الحالة **للقراءة فقط** وبلا اسم من غيّر.

**الطالب (البوابة والجوال)** عند الإيقاف:
- شريط واضح برسالة الأدمن (أو الافتراضية) + سطر يوضح ما بقي متاحاً.
- بطاقات الخدمات **ظاهرة لكن معطّلة** («متوقفة مؤقتًا») — غير مخفية.
- الروابط المباشرة لنموذج طلب جديد (`.../requests/new`، `.../requests/b1/$service`) تعرض الإشعار نفسه بدل النموذج، إلا إذا كان للطالب طلب B1 مُعاد لنفس الخدمة فيُفتح النموذج لإعادة الإرسال.
- إرسال يسابق المفتاح يظهر بخطأ عربي واضح مترجم من رمز الخادم.
- «طلباتي السابقة» تعمل كاملة؛ تبويب الجوال السفلي «الخدمات الطلابية» باقٍ.

**الموظف:** لا تغيير في صندوق الوارد ولا في تنفيذ الخطوات.

> إخفاء/تعطيل الأزرار عرض فقط. الإنفاذ في قاعدة البيانات وفي الخادم.

---

## 5. التطبيق والتحقق والتراجع

> التطبيق بوابة مستقلة تحتاج تفويضاً صريحاً. لا يُطبَّق من مسار `docs/migration-drafts`.

**الترتيب مع PR #436:** مسودة `EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01` تُطبَّق أولاً. هذه المسودة لا تشاركها أي كائن، وتُطبَّق بنفس الشكل قبلها أو بعدها (مُثبت في البروفة: جسما الدالتين اللتين ترقعهما #436 متطابقان بايت-لبايت بعد تطبيق هذه المسودة).

1. **قبل التطبيق (قراءة فقط):** `STUDENT-SERVICES-GLOBAL-SWITCH-01.preflight.sql` → يجب أن ينتهي بـ`READY_TO_APPLY`.
2. **التطبيق:** ترقية المسودة إلى `supabase/migrations` وتطبيقها ضمن البوابة المعتمدة.
3. **بعد التطبيق (قراءة فقط):** `STUDENT-SERVICES-GLOBAL-SWITCH-01.verify.sql` → يجب أن ينتهي بـ`VERIFIED`، والصف `enabled = true`.
4. **نشر الكود** (بأي ترتيب مع الترحيل: الكود يعامل غياب الـRPC كـ«غير مثبّت»).
5. **تحقق وظيفي يدوي** بحساب أدمن: إيقاف → طالب تجريبي يرى الشريط ويُرفض إرساله → إعادة التفعيل → مراجعة سجل التدقيق.

**التراجع:**
- **الفوري (بلا SQL):** الأدمن يعيد المفتاح إلى «مفعّلة».
- **الكامل (rollback-by-forward، بتفويض):**

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_00_student_services_switch_guard ON public.student_requests;
DROP FUNCTION IF EXISTS public.guard_student_services_switch();
DROP FUNCTION IF EXISTS public.admin_set_student_services_enabled(boolean, text);
DROP FUNCTION IF EXISTS public.admin_get_student_services_switch();
DROP FUNCTION IF EXISTS public.get_student_services_status();
DROP FUNCTION IF EXISTS public.student_services_enabled();
DROP TABLE IF EXISTS public.student_services_switch;   -- يسقط معه Triggers الصف
DROP FUNCTION IF EXISTS public.guard_student_services_switch_row();
COMMIT;
```

  صفوف `audit_logs` الخاصة بالمفتاح تبقى (لا حذف). بعد الإسقاط يعود الكود تلقائياً لوضع «غير مثبّت» = لا إيقاف.
  جُرِّب هذا التراجع في الكتلة المعزولة بعد البروفة: لا جدول ولا دوال ولا Triggers متبقية، صفوف التدقيق باقية، وإنشاء طلب الطالب يعمل.

---

## 6. الاختبارات والبروفة

**اختبارات المصدر (جديدة، 62 اختباراً في 4 ملفات):**
`tests/student-requests/student-services-global-switch-01.test.ts` (العقد، ترجمة الخطأ، المسودة، بوابة الخادم، دوال الأدمن) ·
`tests/student-portal/student-services-global-switch-ui-01.test.ts` (واجهة الويب + بطاقة الأدمن) ·
`tests/mobile/student-services-global-switch-mobile-01.test.ts` ·
`tests/security/student-services-global-switch-authz-01.test.ts`.

| التشغيل | قبل | بعد |
|---|---|---|
| `bun test tests/student-requests tests/student-portal tests/mobile tests/security` | 1305 pass / 25 fail / 24 errors | 1367 pass / 25 fail / 24 errors |
| `bun test` (الكل) | 3437 pass / 89 fail / 43 errors | 3499 pass / 89 fail / 43 errors |

مجموعة الإخفاقات متطابقة قبل وبعد (كلها بسبب حزم غير مثبّتة في البيئة: `react`، `@tanstack/*`، `@supabase/supabase-js`). لم يُضعف أي اختبار قائم. كل ملف TS/TSX معدَّل أو جديد يمر بـ`bun build --no-bundle`.

**بروفة PostgreSQL معزولة** — `scripts/student-services-global-switch-01-pg17/run.sh` (PostgreSQL 16.13 محلي، socket خاص، `listen_addresses=''`، يُهدم بعد التشغيل) → `STUDENT_SERVICES_GLOBAL_SWITCH_01_REHEARSAL_PASS` في مرحلتين مستقلتين:

- **A — على main**، و**B — بعد تطبيق مسودة PR #436 أولاً** (مع preimages الإنتاجية التي تحملها، ومنها `trg_protect_student_request`).

في كل مرحلة: preflight = `READY_TO_APPLY` → خمسة مجسّات fail-closed (كل واحد يُجهض ولا يغيّر شيئاً) → تطبيق المسودة **مرتين** ببصمة متطابقة ودون أي كتابة في `student_requests` → verify = `VERIFIED` → المصفوفة:

- **مفعّلة:** نجاح إرسال قديم (`enrollment_certificate` عبر create + submit)، P1 ذري (`replacement_student_card`)، و B1 (`excused_absence`).
- **من يقلب المفتاح:** غير مصادق، عميد، مسجل، شؤون طلاب، بلا دور، موظف معالجة، طالب — كلهم مرفوضون للإيقاف والتفعيل وقراءة الأدمن، والصف وسجل التدقيق لم يتغيرا؛ دور `authenticated` لا يقرأ ولا يكتب الجدول مباشرة.
- **الأدمن يوقف:** رفض الرسالة الطويلة/ذات الوسوم/محارف التحكم؛ صف تدقيق واحد بالفاعل والدور والقيم القديمة والجديدة؛ التكرار لا يُدقَّق مرتين.
- **متوقفة:** تسعة مسارات طالب تُرفض بالرمز المخصص **ولا تترك أي صف** (بدء قديم، إرسال مسودة قديمة، P1 ذري، بدء B1، إرسال مسودة B1، INSERT مباشر، UPDATE مباشر إلى submitted / under_review / returned).
- **متوقفة وما زال يعمل:** تعديل وإلغاء المسودة، إعادة إرسال المُعاد (قديم و B1 — في المرحلة B أُعيد عبر إجراء الموظف الحقيقي `return`)، تنفيذ الموظف المعيَّن لخطوة على طلب جارٍ، كتابات الموظف والنظام، ومنع حذف/تفريغ الصف.
- **إعادة التفعيل** من `system_admin` مدقَّقة، والمسارات المرفوضة تعمل مجدداً.
- **الصف المفقود:** رفض مغلق، ثم الأدمن يعيد إنشاءه.

---

## 7. الملفات

**جديدة:** المسودة + `.preflight.sql` + `.verify.sql`؛ `scripts/student-services-global-switch-01-pg17/{run.sh,00-preimages.sql,01-cases.sql}`؛ `src/lib/student-requests/student-services-switch{.ts,.server.ts,.functions.ts}`؛ `src/components/student-requests/StudentServicesPausedNotice.tsx`؛ `src/components/admin/StudentServicesSwitchCard.tsx`؛ أربعة ملفات اختبار؛ هذه الوثيقة.

**معدّلة:** `src/lib/student-affairs.functions.ts` (البوابة) · `src/lib/student-request-rpc.ts` و`src/lib/student-requests/b1-secure-draft/rpc.ts` و`src/lib/student-requests/b1-ui/adapter.types.ts` (ترجمة الخطأ) · `src/components/student-requests/{NewStudentRequestScreen,StudentRequestDetailsScreen}.tsx` (ترجمة الخطأ) · `src/components/student-requests/b1/B1StudentServiceList.tsx` · المسارات الستة `student.requests.{index,new,b1.$service}.tsx` و`mobile.student.requests.{index,new,b1.$service}.tsx` · `src/routes/admin/request-types.tsx`.

**لم تُعدَّل عمداً:** `src/integrations/supabase/types.ts` (الـRPCs الجديدة تُستدعى بعميل مُضيَّق محلياً)، `routeTree.gen.ts` (لا مسارات جديدة)، ملفات التنقل، وأي ملف تحت `supabase/migrations`.

### التداخل مع PR #436

- **قاعدة البيانات:** لا تداخل (لا دالة ولا جدول ولا Trigger مشترك).
- **المصدر:** ملف واحد مشترك: `src/lib/student-requests/b1-ui/adapter.types.ts` — هنا سطر import واحد + أربعة أسطر في أول `b1AdapterErrorMessageAr`، بعيدة عن موضعي تعديل #436 في الملف. `git merge-tree` بين الفرعين: **بلا تعارضات**.
- تُجنّب عمداً تعديل `B1StudentRequestForm.tsx`، `b1-ui.functions.ts`، `adapter.live.ts`، `b1-rpc.ts`، `b1-business-error-mapping.ts` (كلها يعدّلها #436).

---

## 8. الافتراضات

1. «الخدمات الطلابية» = كل ما يُخزَّن في `public.student_requests`. مشاريع التخرج وشؤون الخريجين وطلبات الموظفين خارج النطاق.
2. «الأدمن» = `admin` | `system_admin` فقط؛ العميد والمسجل وشؤون الطلاب لا يقلبون المفتاح.
3. في الإنتاج `auth.uid()` يساوي مستخدم الطالب في كل مسار جلسة طالب، وNULL في كتابات service role (نفس افتراض الحراس القائمة).
4. `public.log_audit` في الإنتاج هو الـoverload السباعي الوحيد (بعد `LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01`)؛ الـpreflight يتحقق.
5. سياسات RLS والدوال القائمة تمنع الطالب من إنشاء طلب لملف طالب آخر.

## 9. المخاطر

- **كتابة service role لطلب طالب من كود مستقبلي** لا يراها الحارس. مغطاة اليوم ببوابة الخادم وباختبار يثبّت قائمة الملفات التي تُدرج في `student_requests`؛ أي كاتب جديد يُسقط الاختبار.
- **ترتيب رسائل الخطأ عند السباق:** فحوص الأهلية داخل بعض الـRPCs تسبق الكتابة، فقد يرى طالب غير مؤهل خطأ الأهلية بدل خطأ الإيقاف. النتيجة واحدة (لا طلب).
- **fail-closed في الخادم:** خطأ عابر في قراءة الحالة يرفض الإرسال مؤقتاً برسالة «حاول بعد قليل». مقصود.
- **الواجهة تخزّن الحالة 30 ثانية:** طالب فتح النموذج قبل الإيقاف يُرفض عند الإرسال برسالة واضحة.
- **البروفة على PostgreSQL 16** وهيكل «شبيه بالإنتاج» لا نسخة منه؛ الـpreflight هو خط الدفاع عند التطبيق الفعلي.

## 10. غير متحقَّق منه

- لم يُشغَّل `tsc` ولا `vite build` ولا المتصفح (لا `node_modules` في البيئة)؛ التحقق كان بـ`bun build --no-bundle` واختبارات المصدر. **لم تُشاهَد الواجهة فعلياً.**
- لم يُختبر شيء على Supabase حقيقي: سلوك PostgREST مع `P0001`، وربط `auth.uid()`، والمنح الافتراضية للمخطط.
- `submit_b1_student_request_atomic` اختُبر عبر جسمه `_core` الإنتاجي مع stub لـ`persist_validated_b1_request_details`؛ غلافا step-up لم يُشغَّلا (يفوّضان إلى `_core`).
- `create_b1_request_draft_for_student` و`submit_student_request_with_secure_attachments` لم يُشغَّلا كدالتين؛ اختُبرت كتابتهما النهائية (INSERT على الجدول بجلسة الطالب).
- اسم «بواسطة» يُحلّ من `staff_profiles.full_name_ar` ثم بريد الحساب؛ لم يُتحقق منه على بيانات حقيقية.

## 11. أسئلة مفتوحة

1. هل يُسمح للعميد أيضاً بقلب المفتاح؟ (حالياً لا.)
2. هل يُراد استثناء أنواع بعينها من الإيقاف (مثل التظلمات)؟ (حالياً يشمل الجميع بلا استثناء.)
3. هل تُرسل إشعارات للطلاب عند الإيقاف/الإعادة؟ (حالياً لا.)
4. هل يُراد إيقاف مجدول بوقت بداية/نهاية؟ (حالياً يدوي فقط.)
5. هل تظهر سجلات المفتاح للعميد في سجل التدقيق؟ (حالياً `entity_type` جديد يراه الأدمن فقط.)

---

## القرار

**PASS (source-only)** — جاهز للمراجعة. **التطبيق على الإنتاج HOLD** حتى: تفويض صريح، تطبيق مسودة PR #436 أولاً، نجاح الـpreflight على الإنتاج، ومعاينة بصرية للواجهة في بيئة فيها `node_modules`.

**أثر الإنتاج الآن:** صفر. وبعد التطبيق وقبل أن يقلب أدمن المفتاح: صفر تغيير في السلوك.
