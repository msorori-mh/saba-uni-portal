# PORTAL-B1-SAFE-FIXTURES-AUTHENTICATED-ASSIGNEE-SESSION-PREFLIGHT-20

MODE: PRODUCTION READ-ONLY AUTHENTICATED SESSION READINESS AUDIT
PROJECT: wpmicqriltrowwonknox

DECISION: **HOLD_B1_SAFE_FIXTURES_AUTH_SESSION_OWNER_CREDENTIAL_ENTRY_REQUIRED_FOR_7_REAL_STAFF_ACCOUNTS**

ZERO_RPC_CALLS · NO_PRODUCTION_WRITE · NO_PASSWORD_RESET · NO_IMPERSONATION · NO_SESSION_CREATED · NO_MIGRATION · NO_DEPLOY

---

## G0 — إعادة التحقق من حالة الـ fixtures (قراءة فقط)

| request | service | status | active steps | active step | events | fees | docs |
|---|---|---|---|---|---|---|---|
| SR-20260727-42393846 | file_withdrawal | submitted | 1 | student_affairs_intake | 1 | 0 | 0 |
| SR-20260727-50BEDCE2 | enrollment_suspension | submitted | 1 | initial_review | 1 | 0 | 0 |
| SR-20260727-3C550070 | final_chance | submitted | 1 | student_affairs_intake | 1 | 0 | 0 |
| SR-20260727-88D885F0 | department_transfer | submitted | 1 | student_affairs_intake | 1 | 0 | 0 |
| SR-20260727-695EC35B | excused_absence | submitted | 1 | student_affairs_intake | 1 | 0 | 0 |

- الانتقالات المخططة = **14**، المنفذة = **0** (events = 1 لكل طلب = حدث التقديم فقط).
- direct assignment count = **1** لكل (unit, role, department scope) — بلا تكرار.
- لا رسوم، لا مدفوعات، لا وثائق، لا أثر أكاديمي.
- الخدمات الخمس: `is_active=true`, `student_visible=false`. `enrollment_certificate` بلا تغيير.

ملاحظة رصدية (لا تغيّر القرار): صفوف runtime النشطة تحمل
`assigned_user_id = NULL`؛ التفويض يُحلّ وقت التنفيذ من
`request_processing_assignments` عبر (unit, role, scope). لا يؤثر على قناة الدخول.

---

## G1 — جرد مصادقة المكلّفين (7 مستخدمين فريدين)

| user_id | الاسم | login email | profile source | profile_id | auth.users | confirmed | banned/deleted | last_sign_in_at | provider | must_change_password |
|---|---|---|---|---|---|---|---|---|---|---|
| c8a94548-4782-4252-86f9-23559d3b95bd | هيثم الشبلي | hitham@usr.edu.ye | staff | 06f48015-… | ✅ | ✅ | لا | 2026-07-16 | email | false |
| aac0e62d-4e8b-4440-b649-caa388d34837 | ياسمين الولص | yasmin@usr.edu.ye | staff | b3966846-… | ✅ | ✅ | لا | 2026-07-16 | email | false |
| e7a93314-bb06-4525-b412-5315198c668a | ناجي الروقي | naji@usr.edu.ye | staff | 4a838311-… | ✅ | ✅ | لا | — لم يسجل دخولاً | email | **true** |
| 67b39ee4-4918-4b00-b4cc-0d5046ac8a5a | محمد حيدر | mohammed@usr.edu.ye | staff | b59e6e45-… | ✅ | ✅ | لا | — لم يسجل دخولاً | email | **true** |
| 79783c0f-8d95-4110-8239-0ac504d63a24 | فارس اليوسفي | fares@usr.edu.ye | staff | 233c9c36-… | ✅ | ✅ | لا | 2026-07-15 | email | false |
| d4aaa5c9-72d1-4996-b0e8-d30c6327da6e | د. خالد البراحي | kh.alborahy@usr.edu.ye | faculty / position_assignment (قسم ce485c67) | 6f9f004d-… | ✅ | ✅ | لا | 2026-07-06 | email | false |
| f602b62c-194b-4591-8e9c-956e5cbb347d | د. رمزي الجابري | ramzi@usr.edu.ye | faculty / position_assignment (قسم 22222222) | c1fe6084-… | ✅ | ✅ | لا | — لم يسجل دخولاً | email | **true** |

جميع الملفات `status=active`، و`user_id` مطابق تمامًا للتعيين المباشر النشط.
لم تُقرأ أو تُطبع أي أسرار أو tokens أو كلمات مرور.

### transition → assignee map (14 انتقالاً)

| # | request | step_key | action | assignee |
|---|---|---|---|---|
| 1 | 695EC35B | student_affairs_intake | review | hitham |
| 2 | 695EC35B | manager_review | approve | yasmin (SP1) |
| 3 | 50BEDCE2 | initial_review | review | hitham |
| 4 | 50BEDCE2 | manager_approval | approve | yasmin (SP2) |
| 5 | 42393846 | student_affairs_intake | review | hitham |
| 6 | 42393846 | library_clearance | clear | naji |
| 7 | 42393846 | labs_clearance | clear | mohammed |
| 8 | 42393846 | activities_clearance | clear | yasmin |
| 9 | 42393846 | finance_clearance | clear | fares (SP3) |
| 10 | 88D885F0 | student_affairs_intake | review | hitham |
| 11 | 88D885F0 | source_department_head_approval | approve | kh.alborahy |
| 12 | 88D885F0 | target_department_head_approval | approve | ramzi (SP4) |
| 13 | 3C550070 | student_affairs_intake | review | hitham |
| 14 | 3C550070 | manager_review | approve | yasmin (SP5) |

توزيع: hitham 5، yasmin 4، naji 1، mohammed 1، fares 1، kh.alborahy 1، ramzi 1.

---

## G2 — تصنيف قناة الجلسة

| الحساب | التصنيف |
|---|---|
| hitham | NEEDS_OWNER_ENTERED_CREDENTIALS (حساب سليم، سبق الدخول) |
| yasmin | NEEDS_OWNER_ENTERED_CREDENTIALS (حساب سليم، سبق الدخول) |
| fares | NEEDS_OWNER_ENTERED_CREDENTIALS (حساب سليم، سبق الدخول) |
| kh.alborahy | NEEDS_OWNER_ENTERED_CREDENTIALS (حساب سليم، سبق الدخول) |
| naji | NEEDS_OWNER_ENTERED_CREDENTIALS + first-login password change مطلوب |
| mohammed | NEEDS_OWNER_ENTERED_CREDENTIALS + first-login password change مطلوب |
| ramzi | NEEDS_OWNER_ENTERED_CREDENTIALS + first-login password change مطلوب |

- READY_FOR_INTERACTIVE_REAL_LOGIN: 0 (لا توجد بيانات دخول بحوزة الوكيل)
- READY_WITH_EXISTING_OWNER_CONTROLLED_SESSION: 0 (لا جلسة محقونة سوى جلسة معاينة المالك)
- NEEDS_OWNER_ENTERED_CREDENTIALS: **7**
- NEEDS_SEPARATE_AUTH_REMEDIATION_APPROVAL: 0 حاليًا (يتحول إليه أي حساب تتعذر كلمة مروره)
- BLOCKED_NO_VALID_AUTH_ACCOUNT: **0** — جميع الحسابات موجودة ومؤكدة وغير محظورة

### مسارات مرفوضة (مثبتة)

| المسار | الحكم |
|---|---|
| service_role كفاعل | مرفوض — `auth.uid()` NULL ⇒ 42501 من `assert_b1_runtime_step_assignee_effective` |
| sandbox_exec / psql | مرفوض — قراءة فقط، لا `SET ROLE`، لا هوية auth |
| fabricated JWT | مرفوض — تزوير هوية، محظور صراحةً |
| ضبط auth.uid يدويًا | مرفوض — انتحال، وسيبطل قيمة نتيجة مصفوفة التفويض |
| password reset بلا موافقة مستقلة | مرفوض — لم يُنفَّذ ولن يُنفَّذ في هذه المهمة |

---

## G3 — Safe Execution Runbook (غير منفّذ)

**أقل عدد جلسات دخول تفاعلية = 7** (واحدة لكل حساب فريد؛ لا يمكن الدمج لأن كل خطوة تتطلب `auth.uid()` المطابق).
أقل عدد **مرات تبديل حساب** = 7 إذا رُتّبت الانتقالات حسب الحساب:
hitham (1,3,5,10,13) → yasmin (2,4,8,14) → naji (6) → mohammed (7) → fares (9) → kh.alborahy (11) → ramzi (12).
ترتيب صالح لأن كل انتقال لاحق لنفس الطلب يقع بعد سلفه: نفّذ 1,3,5,10,13 ثم 2,4,8,14 ثم 6 ثم 7 ثم 9 ثم 11 ثم 12 — يستلزم مراجعة تسلسل 42393846 (6 قبل 7 قبل 8 قبل 9)، لذا تُنفَّذ yasmin/8 بعد mohammed/7؛ العدد الفعلي لمرات الدخول يصبح **8 جلسات** (yasmin مرتين) مقابل 7 حسابات فريدة.

الخطوات لكل انتقال:
1. المالك يدخل بيانات الحساب مباشرة في شاشة دخول الموظفين — لا تُرسل أي كلمة مرور في المحادثة.
2. نافذة خاصة/بروفايل متصفح مستقل لكل حساب.
3. بعد الدخول: تأكيد أن `auth.uid()` = user_id المتوقع، وأن الخطوة النشطة والتعيين مطابقان.
4. تنفيذ **انتقال واحد فقط** عبر `act_on_b1_student_request_step_atomic`.
5. التحقق: الخطوة التالية نشطة، +1 حدث فقط، لا رسوم/وثائق/أثر أكاديمي.
6. تسجيل الخروج ومسح الجلسة قبل الحساب التالي.
7. توقف فوري عند أي اختلاف في المستخدم أو التعيين أو الحالة.

نقاط التوقف الخمس SP1..SP5 كما في تقرير 19؛ لا `registrar_apply` ولا `record_apply` ولا `payment_confirmation`.

ملاحظة تشغيلية: naji و mohammed و ramzi عليهم `must_change_password=true`،
فسيُوجَّهون إلى شاشة تغيير كلمة المرور عند أول دخول — يغيّرها صاحب الحساب/المالك بنفسه،
ولا يقوم الوكيل بأي إعادة ضبط.

---

## G4 — خيارات رفع الحجب (بلا تنفيذ)

1. المالك يدخل بيانات الدخول بنفسه في المتصفح لكل حساب من السبعة (المسار المفضل).
2. تنسيق دخول الموظف الحقيقي صاحب الحساب لتنفيذ خطوته.
3. Auth remediation منفصلة (إعادة ضبط/حساب تشغيلي بديل) بموافقة صريحة مستقلة — غير مطلوبة الآن لأن كل الحسابات صالحة.

---

## الملخص

- unique assignee count: **7**
- transition-to-assignee map: أعلاه (14 انتقالاً)
- ready accounts (حساب صالح تقنيًا): **7 / 7**
- blocked accounts (لا حساب auth صالح): **0**
- minimum interactive sessions: **7 حسابات / 8 عمليات دخول**
- exact owner input required: إدخال بيانات دخول 7 حسابات مباشرة في شاشة الدخول + تغيير كلمة المرور الأولى لـ naji و mohammed و ramzi
- ZERO_RPC_CALLS · NO_PRODUCTION_WRITE · NO_PASSWORD_RESET · NO_IMPERSONATION · NO_MIGRATION · NO_DEPLOY
