# PORTAL-B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-MIGRATION-PACKAGE-66

**القرار: `PASS_B1_ATOMIC_RPC_LITERAL_CONFIGURED_ACTION_MIGRATION_PACKAGE_READY`**
(الحزمة جاهزة للمراجعة — **لم تُطبَّق أي Migration في هذه المهمة**، ولم تُنفَّذ أي كتابة إنتاجية، ولا Deploy.)

## 1. إثبات الثغرة في الإنتاج (قراءة فقط)

نسخة الإنتاج `public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)`
(`def_md5 = 19b45767490b4a1312e4f56e8db352ee`) تحتوي على الفرع:

```
public.b1_map_ui_staff_action(v_config.action_type) = p_action
```

و`b1_map_ui_staff_action` تطوي `clear` و`apply_decision` و`archive` إلى `approve`.
النتيجة: المُسنَد المباشر الصحيح لخطوة مُهيّأة كـ `clear` أو `apply_decision` أو `archive`
يستطيع تنفيذها بإرسال `approve` العام بدل الإجراء المُهيّأ حرفيًا.

الاستعلامات التي تثبت ذلك دون أي تنفيذ RPC موجودة في
`docs/migration-drafts/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-PREFLIGHT.sql`
(الفحوص `P3_alias_branch` و`P3_folded_actions`).

كما أن دوال القراءة الثلاث (`get_b1_step_allowed_actions`,
`get_b1_assigned_request_details_for_actor`, `get_b1_assigned_inbox_for_actor`)
تنشر حاليًا `approve` المُستبدل (الفحص `P4_readers`).

## 2. لا يوجد استثناء Alias

مفردات B1 مغلقة: `review, approve, clear, apply_decision, archive, return, reject`
(+ المتخصصة `confirm_payment, issue_document, sign` التي تُرفض هنا ولها RPC مخصص).
**لا يوجد إجراء `skip` في العقد**؛ `skipped` حالة خطوة runtime فقط (تسامح السلف)
وليست إجراءً يرسله المتصل. لذلك لم يُضَف أي استثناء alias في هذه الحزمة.

## 3. محتوى الحزمة

| الملف | الغرض |
|---|---|
| `docs/migration-drafts/B1-...-PRODUCTION-66.sql` | Migration واحدة Forward-only داخل معاملة واحدة |
| `...-66-PREFLIGHT.sql` | فحص إنتاجي SELECT-only + التقاط pre-image + إثبات الثغرة + شروط التوقف |
| `...-66-STRUCTURAL-VERIFIER.sql` | تعداد التأكيدات البنيوية S1..S9 للمراجع |
| `...-66-POST-VERIFIER.sql` | تحقق بعد التطبيق: إزالة alias، حفظ الهوية، delta بيانات = 0 |
| `...-66-ROLLBACK-BY-FORWARD.sql` | قالب استرجاع Forward-only (لا DROP) يرفض العمل قبل ملئه |
| `scripts/b1-atomic-rpc-literal-configured-action-66/50-literal-action-rpc-matrix.sql` | مصفوفة RPC وتفويض كاملة للبيئة المعزولة، معاملة واحدة تنتهي بـ ROLLBACK |
| `tests/b1-five-services-rpc-authorization-preflight-01/atomic-rpc-literal-configured-action-package-66.test.ts` | 20 اختبار مصدر يثبّت كل ما سبق (20 pass / 0 fail) |

## 4. جوهر الإصلاح

```
v_action := p_action;
IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN
  RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE='42501';
END IF;
```

ولأن دوال القراءة كانت تنشر الإجراء المُستبدل، فقد صُحّحت **في نفس الـMigration**
لتنشر `action_type` حرفيًا، وإلا لعجز المُسنَد الشرعي عن التنفيذ (`ALLOWED_ACTION_MISMATCH`
في الواجهة). واجهة B1 الحالية (`b1-staff-action-routing.ts`) تقارن الإجراء المُهيّأ
بالإجراء المنشور حرفيًا، فتصبح متوافقة تمامًا بعد التطبيق.

## 5. المحفوظ دون تغيير

التوقيع، المالك `postgres`، `SECURITY DEFINER`، `search_path`
(`public` للمنفّذ، `public, pg_temp` لدوال القراءة)، وACL
`{postgres=X, authenticated=X, service_role=X, sandbox_exec=X}`
(`CREATE OR REPLACE` لا يعيد ضبط ACL، والتأكيدات تتحقق من ذلك قبل وبعد).
كما حُفظت كل الضوابط القائمة: المصادقة، الأقفال، تفويض المُسنَد المباشر، حارس السلف،
رفض الإجراءات المتخصصة، رفض payload من العميل، وحدانية الانتقال، ثبات الخطوة النشطة،
الأثر الأكاديمي، وإصدار الأحداث.

## 6. الأثر المتوقع

- عدد Migrations: **+1**، تغيّر البيانات: **0 صف**.
- `student_visible`: **بلا تغيير** — الخدمات الخمس تبقى `false` (تأكيد داخل الـMigration
  يُجهض المعاملة إذا اختلّ ذلك).
- `enrollment_certificate`: **غير ممسوس** (ليس ضمن خدمات B1 الخمس، ولا تُعدَّل أي دالة تخصّه).
- لا Deploy، ولا تشغيل Workflow RPC، ولا تعديل على السجلات المحمية.

## 7. شروط التوقف

قبل التطبيق: أي انحراف في المالك أو `search_path` أو ACL، أو غياب فرع alias
(يعني انحرافًا يستوجب إعادة الأساس)، أو `student_visible <> false` لأي خدمة من الخمس.
أثناء التطبيق: أي تأكيد يفشل يُجهض المعاملة كاملة — **التطبيق الجزئي مستحيل**.
بعد التطبيق: أي صف `ok = false` في الـPost-verifier، أو delta بيانات ≠ 0.

## 8. المخاطر

- **متوسط:** أي متصل خارجي يرسل `approve` لخطوة `clear/apply_decision/archive`
  سيفشل بعد التطبيق — وهو الهدف المقصود؛ الواجهة الحالية ترسل الإجراء الحرفي.
- **منخفض:** دوال القراءة تُستبدل أيضًا؛ خُفِّف بتثبيت `search_path` وSECURITY DEFINER
  والتحقق منهما بعد التطبيق.

---

## 9. المعالجة 68 — PORTAL-B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PACKAGE66-REMEDIATION-68

نتيجة المراجعتين المستقلتين عولجت بالكامل، دون تطبيق Migration ودون أي اتصال بالإنتاج.

### G1 — EOL PORTABILITY
- كل قراءة نصية في اختبارات الحزمتين 66 و65 تمرّ عبر `toLf` قبل أي تأكيد،
  وأضيف تأكيد «توأم CRLF» يثبت أن النص المطبَّع متطابق وأن الفرق الدلالي = صفر.
- التأكيد على `SET search_path TO 'public'` صار عبر `/SET search_path TO 'public'\r?\n/`.
- المدقق البنيوي يطبّع `CRLF -> LF` مرة واحدة (S12) فيصدر الحكم نفسه على أي checkout.
- `.gitattributes` وسِّع بحدود ضيقة فقط: ملفات SQL للحزمتين 65/66 واختبارات
  `tests/b1-five-services-rpc-authorization-preflight-01/*.ts` بـ `text eol=lf`
  (لا `* text=auto`، ولا إعادة تنسيق للمستودع).

### G2 — AUTHORIZATION BEFORE ACTION ORACLE
- في المنفّذ: المصادقة ← قفل الخطوة ← `B1_ACTIVE_STEP_REQUIRED` ← تفويض المُسنَد
  المباشر ← حارس السلف ← **ثم** مقارنة الإجراء الحرفي.
- الفحص التفويضي يستدعى بالإجراء **المُهيّأ**
  (`can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,''))`)
  لا بالإجراء القادم من العميل، فلا يستطيع غير المُسنَد استنتاج الإجراء المهيّأ
  من نص الخطأ (لا Action Oracle).
- غير المُسنَد يحصل دائمًا على `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED (42501)`
  أيًا كان الإجراء المرسل؛ و`B1_ACTION_TYPE_MISMATCH (42501)` مقصور على المُسنَد الصحيح.

### G3 — COMPLETE PRINCIPAL COVERAGE
- مصفوفة الحزمة 66 تغطي صراحة: `exact_assignee`, `wrong_assignee`, `admin`,
  `system_admin`, `registrar`, `dean`, `department_head`, `student_owner`, `anon`
  × خمسة إجراءات مهيّأة × خمسة إجراءات مرسلة.
- كتلة `NO_ACTION_ORACLE` ترفع `B1_66_ACTION_ORACLE_LEAK` إذا لاحظ أي مبدأ غير مُسنَد
  رسالة `B1_ACTION_TYPE_MISMATCH`، وكتلة أخرى ترفع `B1_66_MATRIX_FAILED_CASES`
  عند أي حالة فاشلة. لا bypass لـadmin/system_admin/registrar/dean.

### G4 — EXECUTABLE FAIL-CLOSED VERIFIERS
- **STRUCTURAL VERIFIER**: صار سكربتًا تنفيذيًا (`\set ON_ERROR_STOP on` + `DO`)
  يقرأ ملف الـMigration ويرفع استثناءات S1..S12 المسمّاة، وينتهي بـ
  `B1_66_STRUCTURAL_VERIFIER_PASS`. للقراءة فقط: لا DDL ولا DML ولا معالجة تلقائية.
- **POST-VERIFIER**: كتلة `DO` للقراءة فقط ترفع `V_FAIL_*` عند أي انحراف في
  التوقيع/المالك/SECURITY DEFINER/`search_path`/ACL، أو بقاء alias، أو غياب الحارس
  الحرفي، أو اختلال ترتيب التفويض، أو delta Migrations ≠ 1، أو أي delta بيانات ≠ 0،
  أو انحراف `student_visible`، أو تأثر `enrollment_certificate`.
- لم يعد أي verifier يُخرج `ok=false` بصمت؛ الفشل يوقف التنفيذ.

### التحقق
- `bun test tests/b1-five-services-rpc-authorization-preflight-01` → **144 pass / 0 fail**.
- لا Migration مطبقة، لا Deploy، لا كتابة إنتاجية، لا تشغيل Operator أو أي حالة RPC.
