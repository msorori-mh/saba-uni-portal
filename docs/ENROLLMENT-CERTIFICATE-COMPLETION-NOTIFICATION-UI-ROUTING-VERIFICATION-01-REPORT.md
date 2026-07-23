# تقرير التحقق: ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-UI-ROUTING-VERIFICATION-01

- **المرحلة:** التحقق مصدرياً واختبارياً من أن إشعار اكتمال طلب شهادة القيد يفتح الطلب الصحيح بأمان، وأن التعامل معه لا يسرّب بيانات ولا يسمح بفتح طلب طالب آخر.
- **الأساس:** `main` عند `debf9d04` (جميع القراءات عبر GitHub API مع تثبيت blob SHA لكل ملف).
- **التاريخ:** 2026-07-23.
- **القرار:** `PASS_NOTIFICATION_UI_ROUTING_VERIFIED` (انظر القسم 8 — الدمج مشروط بـ CI أخضر كالمعتاد).
- **القيود:** قراءة مصدرية فقط + اختبارات محلية. لا Deploy، لا Publish، لا Migration، لا SQL على الإنتاج، لا Backfill، لا تعديل سجلات محمية.

---

## 1) التعريف (مكوّنات سلسلة الإشعار → الطلب)

| المكوّن | الملف | blob SHA (8) |
|---|---|---|
| قائمة الإشعارات (الجرس) | `src/components/portal/NotificationsBell.tsx` | `7dfacd79` |
| بطاقة/عنصر الإشعار + معالج النقر | `NotificationsBell.openItem(n)` (نفس الملف) | `7dfacd79` |
| دالة بناء الرابط | `src/lib/notifications/notification-link.ts` — `getNotificationLink` | `32e47558` |
| مسار صفحة الطلب | `src/routes/student.requests.$id.tsx` + حارس التخطيط `src/routes/student.tsx` | `54785ad0` (التخطيط) |
| منطق التعليم كمقروء | `NotificationsBell.markRead` + RLS على `public.notifications` | `a85454e0` (الهجرة) |
| صفحة الإشعارات الكاملة | `src/routes/student.notifications.tsx` | — (لا تنقّل فيها، انظر OBS-2) |

## 2) عقد الإشعار — كل البنود متحققة (PASS)

| البند | النتيجة | الدليل |
|---|---|---|
| `notification_type = student_request_completed` | PASS | هجرة `20260716034114_6e850b89` (blob `ac201928`) — الإدراج النهائي المعمول به داخل `archive_enrollment_certificate_from_workflow_step`؛ القيد `notifications_type_chk` وُسّع في `20260716031605` (blob `8b4c6da7`) |
| `reference_type = student_request` | PASS | نفس الإدراج: القيمة الثابتة `'student_request'` |
| `reference_id` غير فارغ | PASS | الإدراج يمرّر `v_req.id` (معرّف الطلب نفسه، NOT NULL)؛ وفهرس فريد جزئي `notifications_student_request_completed_uniq ... WHERE reference_id IS NOT NULL` |
| المسار الحرفي `/student/requests/<reference_id>` | PASS | `getNotificationLink` يعيد `` `/student/requests/${n.reference_id}` `` فقط عند تحقق الثلاثية (`32e47558`) |
| لا اعتماد على message/title | PASS | توقيع الدالة `NotificationLinkInput` لا يحوي `title`/`message` أصلاً؛ اختبار بنيوي يمنع ظهورهما |
| لا `pdf_url` ولا `verification_code` | PASS | الرسالة النهائية هي فقط `'رقم الطلب: <n> — رقم الوثيقة: <d>'` (رقم الوثيقة ≠ رمز تحقق)؛ لا وجود للرمزين في مسار UI كله (اختبار بنيوي) |
| لا رابط خارجي / لا open redirect | PASS | الدالة تُرجع مساراً داخلياً ثابت البادئة دائماً أو `null`؛ حتى `reference_id` عدائي (`https://…`, `//…`, `../../`, `javascript:`) يبقى داخل `/student/requests/*` (6 حالات اختبار) |

## 3) حماية صفحة الطلب — فشل مغلق (PASS)

| البند | النتيجة | الدليل |
|---|---|---|
| الطالب يفتح طلبه فقط | PASS | `getStudentServiceRequestDetails` (`8194d20a`): `canAccessRequest` يبدأ بشرط الملكية `request.student_profile?.user_id === userId`؛ وقراءات التتبع (`getStudentRequestWorkflowTimelineForStudent` / `getStudentRequestFeeSummaryForStudent`, `52875dc9`) تمرّ إجبارياً عبر `assertStudentOwnsRequest` — **مالك فقط بلا أي استثناء** |
| طلب طالب آخر مرفوض fail-closed | PASS | غير المالك بلا أدوار → `throw new Error("غير مصرح")` قبل أي إرجاع بيانات؛ وفي قاعدة البيانات `can_current_user_act_on_step` (هجرة `20260716052558`, blob `27516766`) يعيد `false` للمالك على الخطوات (دفاع بالعمق) |
| `reference_id` غير صالح → Not Found/حالة آمنة | PASS | المدخل يُرفض بـ `z.object({ requestId: z.string().uuid() })` قبل أي جلب؛ وغير الموجود → `"الطلب غير موجود"` |
| المحذوف/غير المتاح لا يكشف شيئاً | PASS | رسائل عامة فقط (`الطلب غير موجود` / `غير مصرح`) بلا تفاصيل تمييزية |
| لا تجاوز Admin/Dean في مسار الطالب | PASS | حارس التخطيط `src/routes/student.tsx` (`54785ad0`): بلا سطر في `student_profiles` → `signOut()` + `redirect` إلى `/portal-login`؛ الحارس لا يحوي أي فرع لأدوار (`has_any_role`/"admin"/"dean" غير موجودة — مؤكد اختبارياً). حساب موظف صِرف لا يصل أصلاً إلى `/student/*`. انظر OBS-1 للحالة الحدّية |

## 4) التعليم كمقروء — PASS

| البند | النتيجة | الدليل |
|---|---|---|
| فقط عند الفعل الفعلي | PASS | `openItem`: `if (!n.is_read) await markRead(n.id)` ثم الإغلاق ثم `navigate` — الترتيب مؤكد اختبارياً (الفهرس قبل التنقّل) |
| المستخدم الحالي فقط | PASS | سياسة RLS `notif_update_own_read` (هجرة `20260601021528_918c7cad`, blob `a85454e0`): `FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` |
| لا تعليم عبر المستخدمين | PASS | سياسة UPDATE وحيدة على الجدول (مؤكد: عدّاد السياسات = 1) — لا سياسة للمدير على إشعارات الغير؛ والزناد `protect_notification_fields` يجمّد `user_id`/`title`/`message`/`notification_type`/`reference_type`/`reference_id`/`created_at` لغير المدير |
| متكرر بلا خطأ (idempotent) | PASS | `markRead` تحديث `is_read:true` خالص — التكرار no-op؛ وإنشاء الإشعار نفسه `ON CONFLICT ... DO NOTHING` (مغطى بالاختبارات القائمة) |

## 5) الفجوات والملاحظات

- **GAP-1 (مُغلقة):** لم توجد تغطية اختبارية لجانب العميل (دالة الرابط، تدفق الجرس، الحُرّاس). أُضيف `tests/student-requests/notification-completion-ui-routing-01.test.ts` (القسم 6).
- **OBS-1 (هوية مزدوجة):** `canAccessRequest` يقبل أيضاً `admin/system_admin` أو دور الخطوة الحالية — وهي دالة مشتركة مع أسطح الموظفين. مستخدم يملك **ملف طالب ودور موظف معاً** يمكنه نظرياً فتح تفاصيل طلب طالب آخر عبر مسار الطالب (لكن دالتي التتبع/الرسوم سترفضانه لأنهما مالك-فقط). هذا لا يمسّ الحساب الطلابي الصِرف (يفشل مغلقاً)، ولا يوجد فرع Admin/Dean داخل حارس `/student` نفسه. موثّق للمتابعة ولا يستلزم معالجة في هذه المرحلة.
- **OBS-2:** صفحة الإشعارات الكاملة (`student.notifications.tsx`) لا تتضمن تنقّلاً إلى الطلب (لا تقرأ حقول reference أصلاً) — التنقّل يتم حصرياً عبر الجرس. ليس انتهاكاً: الإشعار يفتح الطلب الصحيح عبر القناة المصممة.
- **OBS-3:** الجرس يعلّم الإشعار مقروءاً عند فتحه حتى لو كان بلا رابط (يعود إلى صفحة "عرض الكل") — وهذا فعل فتح فعلي من المستخدم، سلوك مقبول.
- **OBS-4 (تاريخي):** التصحيح الأول `20260716031605` كان يضمّن رابطاً داخل نص الرسالة؛ أزاله التصحيح النهائي `20260716034114` (المعمول به حالياً — آخر هجرة لاحقة `20260716172804` بذور فقط ولا تلمس الدالة). لا أثر تشغيلي.

## 6) الاختبارات المضافة (البند 5 من المواصفة)

`tests/student-requests/notification-completion-ui-routing-01.test.ts` — **22 اختباراً / 103 expect / 22 ناجحاً / 0 فاشل** (bun 1.3.14 محلياً على شجرة مطابقة بايت-لبايت لـ `main`):

| تغطية مطلوبة | الاختبارات |
|---|---|
| إشعار صحيح يفتح الطلب الصحيح | §1: المسار الحرفي الدقيق |
| `reference_type` غير مدعوم → لا رابط | §1: خمس قيم بديلة → `null` |
| `reference_id` فارغ → فشل آمن | §1: `null` و `""` → `null` |
| طلب مملوك لطالب آخر مرفوض | §3: الملكية أولاً + owner-only الصارم + RLS |
| فتح متكرر بلا خطأ | §5: no-op + حتمية الدالة |
| لا تسريب PDF/رمز تحقق | §1+§2: فحص بنيوي على المسار كله |
| لا open redirect | §1: ست قيم عدائية تبقى داخلية + §2: لا `window.open`/`location.href`/`_blank` |

ملف الاختبار ASCII-صِرف (العربية بتهريبات `\uXXXX`)، blob SHA `cec4643a`، ولا يعدّل أي ملف إنتاجي.

## 7) التشغيل (البند 6)

- **اختبارات مركّزة:** `bun test tests/student-requests/notification-completion-ui-routing-01.test.ts` → 22/22 PASS (محلياً، شجرة مركّبة من نفس blobs بالضبط: `32e47558`, `7dfacd79`, `54785ad0`, `8194d20a`, `52875dc9`, `a85454e0`).
- **`bun test tests/` الكاملة + typecheck + build + `git diff --check`:** تُنفَّذ عبر CI على الـ PR. **CI معطّل حالياً بعطل خارجي في GitHub Actions** (كل الفحوص تفشل خلال ثوانٍ منذ ~05:41Z) — لا يجوز الدمج على CI أحمر، والدمج مجدول في سلسلة الاسترداد التلقائي عند عودة الخدمة. لم تُختلق أي نتيجة.

## 8) المراجعة المستقلة والقرار

- الـ PR مستقل يحوي ملفين فقط: الاختبار الجديد + هذا التقرير.
- المراجعة المستقلة: طلب مراجعة GitHub Copilot على الـ PR + قائمة تحقق منسّق موثقة في جسم الـ PR (بيئة العمليات الفرعية غير متاحة في هذه الجلسة — موثق).
- بوابة الدمج كالمعتاد: CRITICAL=0/HIGH=0/MEDIUM=0 + CI أخضر فعلي.
- **القرار: `PASS_NOTIFICATION_UI_ROUTING_VERIFIED`** — العقد كامل، الحُرّاس فشل-مغلق، لا تسريب، لا open redirect، التعليم كمقروء محصور بالمستخدم الحالي على مستوى RLS، والفجوة الاختبارية الوحيدة أُغلقت. لا يلزم أي معالجة مصدرية (`HOLD_..._REMEDIATION_REQUIRED` غير منطبق). الدمج معلّق فقط على العطل الخارجي في CI.
