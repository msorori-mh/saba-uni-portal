# PORTAL-B1-BLOCKED-22-SAFE-ACTIVE-TEST-ONLY-FIXTURES-PRODUCTION-EXEC-19

MODE: SEQUENTIAL TEST_ONLY WORKFLOW TRANSITIONS
PROJECT: wpmicqriltrowwonknox

DECISION: **HOLD_B1_SAFE_FIXTURES_NO_AUTHENTICATED_DIRECT_ASSIGNEE_EXECUTION_CHANNEL**

ZERO_RPC_CALLS · NO_PRODUCTION_WRITE · NO_MIGRATION · NO_DEPLOY

---

## G0 — Pre-write revalidation (read-only، اكتمل)

| بند | نتيجة |
|---|---|
| project ref | `wpmicqriltrowwonknox` ✅ |
| الطلبات الخمسة | موجودة مرة واحدة فقط، جميعها TEST_ONLY، status=`submitted` ✅ |
| active step count | 1 لكل طلب ✅ |
| خرائط الخطوات | مطابقة تمامًا لجدول الخطة (7/6/5/3/3 خطوات) ✅ |
| fee assessments | 0 على الطلبات الخمسة (شامل 3C550070 و 88D885F0) ✅ |
| official documents | 0 مرتبطة بالطلبات الخمسة، و0 وثيقة جديدة منذ 2026-07-27 ✅ |
| service visibility | الخمس: `is_active=true`, `student_visible=false` ✅ |
| enrollment_certificate | `is_active=true`, `student_visible=true` — بلا تغيير ✅ |
| السجلات المحمية | 3 طلبات + وثيقتان USR-2026-000001/2 موجودة وسليمة ✅ |
| events baseline | 1 حدث لكل طلب (حدث التقديم) |

### هوية المكلّف المباشر (مشتقة من `request_processing_assignments` النشطة)

| role / scope | resolved user_id | مطابقة الخطة |
|---|---|---|
| student_affairs_specialist | c8a94548-4782-4252-86f9-23559d3b95bd | ✅ |
| student_affairs_manager | aac0e62d-4e8b-4440-b649-caa388d34837 | ✅ |
| library_officer | e7a93314-bb06-4525-b412-5315198c668a | ✅ |
| labs_manager | 67b39ee4-4918-4b00-b4cc-0d5046ac8a5a | ✅ |
| revenue_finance_officer | 79783c0f-8d95-4110-8239-0ac504d63a24 | ✅ |
| registrar_general | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | ✅ |
| dean | b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0 | ✅ |
| department_head (ce485c67 المصدر) | d4aaa5c9-72d1-4996-b0e8-d30c6327da6e | ✅ |
| department_head (22222222 الهدف) | f602b62c-194b-4591-8e9c-956e5cbb347d | ✅ |
| department_head (11111111 ثالث) | 97acbe02-c59c-409c-8d51-7d4ef72e6db7 | ✅ |
| archive_officer | aec1303e-de6a-4580-94cf-7205c17b5535 | ✅ (خارج النطاق) |

تعيين نشط واحد فقط لكل (unit, role, department scope). لا تكرار.

**كل بنود G0 من 1 إلى 9 تحققت.** الحجب ليس في حالة البيانات.

---

## سبب الـ HOLD (المانع التقني الدقيق)

الانتقالات الآمنة تُنفَّذ حصريًا عبر
`act_on_b1_student_request_step_atomic`، وهي تفوّض على أساس `auth.uid()`
للمكلّف المباشر فقط، بعد إزالة admin/registrar/dean bypass في Migration 28/29.

لتنفيذ الانتقالات الأربعة عشر الآمنة يلزم **جلسة موثّقة (JWT) لكل واحد من
سبعة مستخدمين موظفين حقيقيين** (c8a94548، aac0e62d، e7a93314، 67b39ee4،
79783c0f، d4aaa5c9، f602b62c…). القنوات المتاحة في هذه البيئة:

1. `service_role` / `sandbox_exec` → `auth.uid()` NULL ⇒ رفض 42501 (وهو السلوك الصحيح، ولا يجوز الالتفاف عليه).
2. psql داخل الساندبوكس → للقراءة فقط، ولا يملك صلاحية `SET ROLE` (مثبت في المهام 09–13).
3. المتصفح/البوابة → يتطلب كلمات مرور حسابات الموظفين، وهي غير متاحة ولم تُمنح في هذا التصريح.
4. توليد جلسات إدارية (`generateLink` / إصدار توكن) لحسابات موظفين حقيقيين = انتحال هوية وإسناد أحداث تدقيق إنتاجية لأشخاص حقيقيين، **غير مصرّح به في هذه المهمة**.

بناءً عليه، لا توجد قناة تنفيذ مشروعة، وتوقفت المهمة **قبل أول RPC**.

---

## G1 — Immutable baseline (ملتقطة، بلا تعديل)

| request | service | status | active step | events | fees | payments | docs | academic effect |
|---|---|---|---|---|---|---|---|---|
| SR-20260727-42393846 | file_withdrawal | submitted | student_affairs_intake (1/7) | 1 | 0 | 0 | 0 | 0 |
| SR-20260727-50BEDCE2 | enrollment_suspension | submitted | initial_review (1/3) | 1 | 0 | 0 | 0 | 0 |
| SR-20260727-3C550070 | final_chance | submitted | student_affairs_intake (1/5) | 1 | 0 | 0 | 0 | 0 |
| SR-20260727-88D885F0 | department_transfer | submitted | student_affairs_intake (1/6) | 1 | 0 | 0 | 0 | 0 |
| SR-20260727-695EC35B | excused_absence | submitted | student_affairs_intake (1/3) | 1 | 0 | 0 | 0 | 0 |

---

## الانتقالات المخططة (لم يُنفَّذ أي منها)

| # | request | step | actor | action | next step | safe stop |
|---|---|---|---|---|---|---|
| 1 | 695EC35B | student_affairs_intake | c8a94548 | review | manager_review | — |
| 2 | 695EC35B | manager_review | aac0e62d | approve | record_apply | **SP1** |
| 3 | 50BEDCE2 | initial_review | c8a94548 | review | manager_approval | — |
| 4 | 50BEDCE2 | manager_approval | aac0e62d | approve | registrar_apply | **SP2** |
| 5 | 42393846 | student_affairs_intake | c8a94548 | review | library_clearance | — |
| 6 | 42393846 | library_clearance | e7a93314 | clear | labs_clearance | — |
| 7 | 42393846 | labs_clearance | 67b39ee4 | clear | activities_clearance | — |
| 8 | 42393846 | activities_clearance | aac0e62d | clear | finance_clearance | — |
| 9 | 42393846 | finance_clearance | 79783c0f | clear | registrar_apply | **SP3** |
| 10 | 88D885F0 | student_affairs_intake | c8a94548 | review | source_department_head_approval | — |
| 11 | 88D885F0 | source_department_head_approval | d4aaa5c9 | approve | target_department_head_approval | — |
| 12 | 88D885F0 | target_department_head_approval | f602b62c | approve | dean_approval | **SP4** |
| 13 | 3C550070 | student_affairs_intake | c8a94548 | review | manager_review | — |
| 14 | 3C550070 | manager_review | aac0e62d | approve | dean_decision | **SP5** |

planned = 14 · executed = 0 · successful = 0 · stopped = none (توقف قبل البدء)

خطوات ممنوعة لم تُلمس: registrar_apply، record_apply، payment_confirmation، archive.

ملاحظة تصحيحية على الخطة 18: عدّ «19 انتقالاً» يشمل انتقالات تقع خلف نقاط
التوقف الخمس (إكمال registrar_apply/record_apply/dean عند F2/F3). العدد الآمن
الفعلي المطابق لـ SP1..SP5 هو **14 انتقالاً**، ويظل يفعّل 18 حالة.

---

## G5 — Verdicts (الحالة الراهنة)

- fixtures مستخدمة: 0 من 5
- حالات أصبحت قابلة للاختبار: 0 (المستهدف 18)
- حالات محجوبة: 22 (منها 4 على مسار الرسوم/الأثر الأكاديمي)
- طلبات غير TEST_ONLY متأثرة: 0
- fee/payment: لا شيء
- academic effect: لا شيء
- official documents: لا شيء
- enrollment_certificate: بلا تغيير
- service visibility: الخمس ما زالت `student_visible=false`
- NO_MIGRATION · NO_DEPLOY

---

## ما يلزم لرفع الـ HOLD (اختيار واحد صريح)

1. تزويد المشغل بجلسة تفاعلية `psql -W` بهوية كل مبدأ (كما في حزمة
   `scripts/b1-rpc-principal-harness-01`) لتنفيذ الانتقالات الأربعة عشر، أو
2. تزويد بيانات دخول حسابات الموظفين السبعة لتنفيذ الانتقالات من البوابة، أو
3. تصريح مكتوب مستقل بإصدار جلسات مؤقتة لهذه الحسابات لغرض الـ fixture فقط،
   مع الإقرار بأن أحداث التدقيق ستُسند إلى تلك الحسابات.
