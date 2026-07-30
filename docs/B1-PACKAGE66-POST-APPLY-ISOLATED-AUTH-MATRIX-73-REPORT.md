# B1_PACKAGE66_POST_APPLY_ISOLATED_POSITIVE_NEGATIVE_AUTH_MATRIX-73 — REPORT

## القرار

**PASS_B1_PACKAGE66_POST_APPLY_ISOLATED_AUTH_MATRIX_990_POSITIVE_NEGATIVE_267_ZERO_FAIL**

## البيئة

| البند | القيمة |
|---|---|
| النوع | ISOLATED_NON_PRODUCTION |
| القاعدة | `isodb` على `127.0.0.1:54329` (PostgreSQL 17 محلي مؤقت) |
| Production | لم يُقرأ ولم يُكتب في هذه المهمة |
| Staging | لم يُفك تجميده |
| البيانات | TEST_ONLY فقط |
| Package 66 | مطبقة داخل البيئة المعزولة: `alias_gone=true`, `literal_guard=true` |

### ملاحظات تجهيز البيئة المعزولة (لا أثر إنتاجي)

- طُبِّقت 243 migration آليًا؛ الباقي إمّا تكرار بنيوي (`already exists`) أو seed
  يعتمد بيانات تشغيلية غير موجودة في بيئة TEST_ONLY.
- عُدّلت داخل `isodb` فقط: أعمدة `auth.users` الناقصة، إسقاط `sr_type_chk` القديم،
  توحيد الرموز الأساسية (`absence_excuse→excused_absence`, `extra_chance→final_chance`)،
  تفعيل تعريفات الـworkflows الخمس، ومنح `service_role` صلاحية التنفيذ.
- `student_visible=false` للخدمات الخمس داخل البيئة المعزولة (شرط حارس Package 66).

## الـFixtures

`scripts/b1-isolated-authorization-env-65/30-fixtures.sql` — 24 طلب
`ISO-TESTONLY-0001..0024`، طلب لكل (خدمة، خطوة موظف).
النتيجة: **24/24 خطوة موظف نشطة** عبر الخدمات الخمس.

جديد في هذه المهمة: `scripts/b1-atomic-rpc-literal-configured-action-66/45-test-principals.sql`
— سجل `public.iso_test_principals` وهوية `wrong_assignee` بلا أي تعيين معالجة،
مع تحقق fail-closed أنها ليست المُسنَد الفعلي لأي خطوة نشطة.

## المصفوفة السلبية (267)

`scripts/b1-isolated-authorization-env-65/42-negative-harness.sql`

```
ISO_NEG_MATRIX total=267 fail=0 drift=NONE
```

الأصناف الأربعة عشر 24/24 PASS (والثلاثة التكميلية 1/1).
توزيع أكواد الرفض بعد Package 66: `42501` = 243، `28000` = 24.
تغيّر مقصود مقارنة بما قبل التطبيق: صنف `illegal_action_by_exact_assignee`
صار `42501` (`B1_ACTION_TYPE_MISMATCH`) بدل `P0001`.

## المصفوفة الموجبة/الحرفية (990)

`scripts/b1-atomic-rpc-literal-configured-action-66/50-literal-action-rpc-matrix.sql`
— حاصل ضرب (24 خطوة نشطة × 5 إجراءات مُرسَلة × 9 هويات) داخل معاملة واحدة
مع `ROLLBACK` غير مشروط.

```
SUMMARY total=990 passed=990 failed=0
NO_ACTION_ORACLE leaked_cases=0
```

- PASS فقط عندما: الهوية = المُسنَد المباشر الدقيق **و** الإجراء = `action_type` المهيأ حرفيًا.
- كل هوية غير مُسنَدة ترى `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` فقط،
  بصرف النظر عن الإجراء المُرسَل → لا تسريب oracle للإجراء المهيأ.
- `anon` يُرفض بـ`AUTHENTICATION_REQUIRED` أولًا.
- حالات الانحدار (`clear`/`apply_decision`/`archive` مهيأة + إرسال `approve`
  من المُسنَد الدقيق) ترفع `B1_ACTION_TYPE_MISMATCH` — الثغرة مغلقة.

### تصحيحان في الـharness (مصدر فقط)

1. **حل المُسنَد المباشر**: كان يقرأ `assigned_user_id` فقط، فيفشل في الخطوات
   المُسنَدة عبر `staff_profile` / `faculty_profile` / `position_assignment`.
   صار يستخدم الأشكال الأربعة مثل `30-fixtures.sql`، مع رفع استثناء إذا تعذّر الحل.
2. **الـoracle يقارن الهويات لا التسميات**: `registrar` و`dean` و`department_head`
   هم فعليًا المُسنَد الدقيق لخطواتهم، فكان التوقّع المبني على التسمية خاطئًا.

خمس حالات مُصرَّح بها وصلت إلى `*_DETAILS_REQUIRED` (تحقق أعمال بعد بوابتي
التفويض والإجراء، لأن الـfixtures بلا تفاصيل خدمة) وتُحتسب «مُصرَّح بها» صراحةً.

## البوابات

- `bunx tsgo --noEmit`: PASS
- `bun test tests/student-requests tests/b1-manifest`: 1054 pass / 0 fail
- `bun test tests/b1-five-services-rpc-authorization-preflight-01`: 146 pass / 0 fail

## أثر الإنتاج

- اتصال بالإنتاج: **0**
- كتابات إنتاجية أو Migrations أو Workflow RPC إنتاجي: **0**
- Deploy / Publish: **0**
- تغيير `student_visible` في الإنتاج: **0**
- مساس بـ`enrollment_certificate` أو بالسجلات المحمية: **0**
