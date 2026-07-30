# PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65 — REPORT

## القرار

**PASS_B1_ISOLATED_AUTHORIZATION_ENVIRONMENT_267_EXECUTABLE_0_BLOCKED**

## البيئة

| البند | القيمة |
|---|---|
| النوع | ISOLATED_NON_PRODUCTION |
| القاعدة | `isodb` على `127.0.0.1:54329` (PostgreSQL 17 محلي مؤقت) |
| Production | لم يُقرأ ولم يُكتب في هذه المهمة |
| Staging | لم يُفك تجميده |
| البيانات | TEST_ONLY فقط (أقسام، برامج، طلاب، موظفون، تعيينات معزولة) |
| الهجرات | 265 migration مطبقة + workflows الخمس مثبتة |

## التجهيز

- `10-testonly-reference.sql` — وحدات ومهام المعالجة والهويات المعزولة والتعيينات المباشرة.
- `30-fixtures.sql` — 24 طلب `ISO-TESTONLY-0001..0024`، طلب لكل (خدمة، خطوة)، لكل طلب طالب TEST_ONLY فريد.
- تقدُّم كل fixture إلى خطوته المستهدفة تم عبر `act_on_b1_student_request_step_atomic` بانتحال المُسنَد المباشر الدقيق لكل خطوة سابقة — لا كتابة مباشرة على جداول الـruntime.
- النتيجة: **24/24 خطوة موظف نشطة** عبر الخدمات الخمس.

## المصفوفة

`scripts/b1-isolated-authorization-env-65/ISO-MATRIX.json`

| البند | العدد |
|---|---|
| total cases | 267 |
| executable cases | 267 |
| blocked cases | 0 |
| negative core | 240 |
| illegal action | 24 |
| supplemental department scope | 3 |

## التنفيذ

`42-negative-harness.sql` — معاملة واحدة، `ROLLBACK` غير مشروط، استدعاء RPC مباشر، إثبات zero-mutation.

```
ISO_NEG_MATRIX total=267 fail=0 drift=NONE
```

توزيع أكواد الرفض: `42501` = 219، `P0001` = 24، `28000` = 24.
جميع الأصناف الأربعة عشر 24/24 PASS (والثلاثة التكميلية 1/1).

## اكتشاف أمني وإصلاحه

الجولة الأولى أعطت **7 FAIL** في صنف `illegal_action_by_exact_assignee`:
المُسنَد المباشر الدقيق لخطوة مُهيّأة كـ `clear` أو `apply_decision` أو `archive`
كان يستطيع التنفيذ بإرسال الإجراء العام `approve`، لأن
`b1_map_ui_staff_action(action_type) = p_action` كانت تعيد كتابته إلى الإجراء المهيأ.
هذا يخالف عقد المصدر «`p_action` = configured action_type بلا fallback عام».

الإصلاح forward-only: `docs/migration-drafts/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-01.sql`
يحذف ترجمة التوافق ويرفع `B1_ACTION_TYPE_MISMATCH` عند أي اختلاف حرفي.
طُبّق في البيئة المعزولة فقط، ثم أُعيدت المصفوفة كاملة: **267/267 PASS**.

ملاحظة: لوحة الموظف B1 تُرسل الإجراء المهيأ حرفيًا منذ المهمتين 42 و53، لذا لا أثر وظيفي متوقع؛ ومع ذلك يبقى التطبيق على Production معلقًا على تصريح منفصل.

## أثر الإنتاج

- كتابات إنتاجية: **0**
- Migrations مطبقة على Production: **0**
- Deploy / Publish: **0**
- تغيير `student_visible`: **0**
- مساس بـ`enrollment_certificate` أو بالسجلات المحمية: **0**
