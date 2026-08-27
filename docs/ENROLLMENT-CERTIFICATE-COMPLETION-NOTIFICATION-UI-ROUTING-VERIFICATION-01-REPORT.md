# تقرير التحقق: ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-UI-ROUTING-VERIFICATION-01

- **المرحلة:** التحقق مصدرياً واختبارياً من أن إشعار اكتمال طلب شهادة القيد يفتح الطلب الصحيح بأمان، وأن التعامل معه لا يسرّب بيانات ولا يسمح بفتح طلب طالب آخر.
- **الأساس:** `main` عند `debf9d04` (جميع القراءات عبر GitHub API مع تثبيت blob SHA لكل ملف).
- **التاريخ:** 2026-07-23.
- **تحديث REMEDIATION-01 (2026-07-23):** أُغلقت ملاحظة المراجعة المستقلة **MEDIUM-1** بتشديد `getNotificationLink` (تحقق UUID صارم) — انظر القسم 5.
- **القرار:** `PASS_NOTIFICATION_UI_ROUTING_VERIFIED` + `PASS_PR213_REMEDIATION_FIX_VERIFIED` (الدمج مشروط بـ CI أخضر كالمعتاد — القسم 8).
- **القيود:** قراءة مصدرية فقط + اختبارات محلية. لا Deploy، لا Publish، لا Migration، لا SQL على الإنتاج، لا Backfill، لا تعديل سجلات محمية.

---

## 1) التعريف (مكوّنات سلسلة الإشعار → الطلب)

| المكوّن | الملف | blob SHA (8) |
|---|---|---|
| قائمة الإشعارات (الجرس) | `src/components/portal/NotificationsBell.tsx` | `7dfacd79` |
| بطاقة/عنصر الإشعار + معالج النقر | `NotificationsBell.openItem(n)` (نفس الملف) | `7dfacd79` |
| دالة بناء الرابط | `src/lib/notifications/notification-link.ts` — `getNotificationLink` | `32e47558` على main (قبل الإصلاح) — نسخة REMEDIATION-01 المشددة في هذا الـ PR |
| مسار صفحة الطلب | `src/routes/student.requests.$id.tsx` + حارس التخطيط `src/routes/student.tsx` | `54785ad0` (التخطيط) |
| منطق التعليم كمقروء | `NotificationsBell.markRead` + RLS على `public.notifications` | `a85454e0` (الهجرة) |
| صفحة الإشعارات الكاملة | `src/routes/student.notifications.tsx` | — (لا تنقّل فيها، انظر OBS-2) |

## 2) عقد الإشعار — كل البنود متحققة (PASS)

| البند | النتيجة | الدليل |
|---|---|---|
| `notification_type = student_request_completed` | PASS | هجرة `20260716034114_6e850b89` (blob `ac201928`) — الإدراج النهائي المعمول به داخل `archive_enrollment_certificate_from_workflow_step`؛ القيد `notifications_type_chk` وُسّع في `20260716031605` (blob `8b4c6da7`) |
| `reference_type = student_request` | PASS | نفس الإدراج: القيمة الثابتة `'student_request'` |
| `reference_id` غير فارغ | PASS | الإدراج يمرّر `v_req.id` (معرّف الطلب نفسه، NOT NULL)؛ وفهرس فريد جزئي `notifications_student_request_completed_uniq ... WHERE reference_id IS NOT NULL` |
| المسار الحرفي `/student/requests/<reference_id>` | PASS | `getNotificationLink` يعيد `` `/student/requests/${n.reference_id}` `` فقط عند تحقق الثلاثية **و** كون `reference_id` معرّف UUID كاملاً (بعد REMEDIATION-01) |
| لا اعتماد على message/title | PASS | توقيع الدالة `NotificationLinkInput` لا يحوي `title`/`message` أصلاً؛ اختبار بنيوي يمنع ظهورهما |
| لا `pdf_url` ولا `verification_code` | PASS | الرسالة النهائية هي فقط `'رقم الطلب: <n> — رقم الوثيقة: <d>'` (رقم الوثيقة ≠ رمز تحقق)؛ لا وجود للرمزين في مسار UI كله (اختبار بنيوي) |
| لا رابط خارجي / لا open redirect | PASS (بعد REMEDIATION-01) | **تحقق UUID صارم داخل link builder نفسه:** `UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` مثبّت بالأطراف — أي `reference_id` ليس UUID كاملاً يعيد `null` (مسارات نسبية، `//host`، URL كامل، `javascript:`، قيم percent-encoded، UUID ناقص/مشوّه، UUID مع نص إضافي أو فواصل `?` `#` `/` — كلها مرفوضة ومُختبرة). لم يعد الأمر يعتمد على البادئة الثابتة وحدها |

## 3) حماية صفحة الطلب — فشل مغلق (PASS)

| البند | النتيجة | الدليل |
|---|---|---|
| الطالب يفتح طلبه فقط | PASS | `getStudentServiceRequestDetails` (`8194d20a`): `canAccessRequest` يبدأ بشرط الملكية `request.student_profile?.user_id === userId`؛ وقراءات التتبع (`getStudentRequestWorkflowTimelineForStudent` / `getStudentRequestFeeSummaryForStudent`, `52875dc9`) تمرّ إجبارياً عبر `assertStudentOwnsRequest` — **مالك فقط بلا أي استثناء** |
| طلب طالب آخر مرفوض fail-closed | PASS | غير المالك بلا أدوار → `throw new Error("غير مصرح")` قبل أي إرجاع بيانات؛ وفي قاعدة البيانات `can_current_user_act_on_step` (هجرة `20260716052558`, blob `27516766`) يعيد `false` للمالك على الخطوات (دفاع بالعمق) |
| `reference_id` غير صالح → Not Found/حالة آمنة | PASS | مزدوج: link builder يرفض غير UUID (لا رابط أصلاً)، والمسار يرفض غير UUID بـ `z.object({ requestId: z.string().uuid() })` قبل أي جلب؛ وغير الموجود → `"الطلب غير موجود"` |
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

- **MED-1 (مُغلقة — REMEDIATION-01):** رصدت المراجعة المستقلة أن `getNotificationLink` كان يقبل أي `reference_id` نصي ويبني منه `/student/requests/<reference_id>`، وكانت الحماية تعتمد على البادئة الثابتة فقط (قيم مثل `../../admin` أو `//evil.example` أو `javascript:` أو percent-encoded تبقى داخلية نظرياً لكنها غير صالحة ولا يجب أن تُنتج رابطاً). **الإغلاق:** أُضيف تحقق UUID صارم داخل الدالة نفسها (`UUID_RE` مثبّت بالأطراف، بلا أي مكتبة جديدة) — أي قيمة غير UUID كامل تعيد `null`. حُدّثت الاختبارات: حُذف الاختبار القديم الذي كان يعتبر القيم العدائية "روابط داخلية مقبولة" واستُبدل بتغطية رفض شاملة (UUID ناقص/مشوّه، UUID مع نص إضافي، مسارات، URLs، `?` `#` `/`، percent-encoded). أُغلقت بلا CRITICAL/HIGH متبقٍ.
- **GAP-1 (مُغلقة):** لم توجد تغطية اختبارية لجانب العميل (دالة الرابط، تدفق الجرس، الحُرّاس). أُضيف `tests/student-requests/notification-completion-ui-routing-01.test.ts` (القسم 6).
- **OBS-1 (هوية مزدوجة):** `canAccessRequest` يقبل أيضاً `admin/system_admin` أو دور الخطوة الحالية — وهي دالة مشتركة مع أسطح الموظفين. مستخدم يملك **ملف طالب ودور موظف معاً** يمكنه نظرياً فتح تفاصيل طلب طالب آخر عبر مسار الطالب (لكن دالتي التتبع/الرسوم سترفضانه لأنهما مالك-فقط). هذا لا يمسّ الحساب الطلابي الصِرف (يفشل مغلقاً)، ولا يوجد فرع Admin/Dean داخل حارس `/student` نفسه. موثّق للمتابعة ولا يستلزم معالجة في هذه المرحلة.
- **OBS-2:** صفحة الإشعارات الكاملة (`student.notifications.tsx`) لا تتضمن تنقّلاً إلى الطلب (لا تقرأ حقول reference أصلاً) — التنقّل يتم حصرياً عبر الجرس. ليس انتهاكاً: الإشعار يفتح الطلب الصحيح عبر القناة المصممة.
- **OBS-3:** الجرس يعلّم الإشعار مقروءاً عند فتحه حتى لو كان بلا رابط (يعود إلى صفحة "عرض الكل") — وهذا فعل فتح فعلي من المستخدم، سلوك مقبول.
- **OBS-4 (تاريخي):** التصحيح الأول `20260716031605` كان يضمّن رابطاً داخل نص الرسالة؛ أزاله التصحيح النهائي `20260716034114` (المعمول به حالياً — آخر هجرة لاحقة `20260716172804` بذور فقط ولا تلمس الدالة). لا أثر تشغيلي.

## 6) الاختبارات المضافة/المحدّثة (البند 5 من المواصفة)

`tests/student-requests/notification-completion-ui-routing-01.test.ts` — **26 اختباراً / 100 expect / 26 ناجحاً / 0 فاشل** (bun 1.3.14 محلياً على شجرة مطابقة بايت-لبايت لـ `main` — كل الملفات المرجعية مؤكدة بـ blob SHA):

| تغطية مطلوبة | الاختبارات |
|---|---|
| UUID صحيح → `/student/requests/<uuid>` | §1 (من ضمنه UUID كبير الأحرف مقبول) |
| `null` → null و empty string → null | §1 |
| UUID ناقص/مشوّه → null | §1: 6 حالات (مجموعة ناقصة، طول خاطئ، حرف غير hex، بلا شرطات، فواصل `_`) |
| UUID مع نص إضافي → null | §1: 6 حالات (سابقة/لاحقة/فراغ/`/`/`?`/`#`) |
| `../../admin/requests` → null | §1 |
| `%2e%2e%2fadmin` → null | §1 |
| `/admin` → null | §1 |
| `//evil.example` → null | §1 |
| `https://evil.example` → null | §1 |
| `javascript:alert(1)` → null | §1 |
| قيم تحتوي `?` أو `#` أو `/` → null | §1 |
| `reference_type` غير مدعوم → لا رابط | §1: خمس قيم بديلة → `null` |
| طلب مملوك لطالب آخر مرفوض | §3: الملكية أولاً + owner-only الصارم + RLS |
| فتح متكرر بلا خطأ | §5: no-op + حتمية الدالة |
| لا تسريب PDF/رمز تحقق | §1+§2: فحص بنيوي على المسار كله |
| لا open redirect | §1: الرفض الكامل لغير UUID + §2: لا `window.open`/`location.href`/`_blank` |

ملف الاختبار ASCII-صِرف (العربية بتهريبات `\uXXXX`)، والتعديل الإنتاجي الوحيد هو تشديد `notification-link.ts` (تحقق UUID، ~6 أسطر، بلا مكتبة جديدة).

## 7) التشغيل (البند 6)

- **اختبارات مركّزة:** `bun test tests/student-requests/notification-completion-ui-routing-01.test.ts` → 26/26 PASS (محلياً، شجرة مركّبة مؤكدة بايت-لبايت عبر blob SHAs: `7dfacd79`, `54785ad0`, `8194d20a`, `52875dc9`, `a85454e0`).
- **`bun test tests/` الكاملة + typecheck + build:** تُنفَّذ عبر CI على الـ PR. **CI معطّل حالياً بعطل خارجي في GitHub Actions** (كل الفحوص تفشل خلال ثوانٍ منذ ~05:41Z) — لا يجوز الدمج على CI أحمر، والدمج مجدول في سلسلة الاسترداد التلقائي عند عودة الخدمة. لم تُختلق أي نتيجة.
- **`git diff --check`:** لا مسافات زائدة/أخطاء مسافات بيضاء في الملفات المعدلة (فحص محلي مكافئ على الملفات الثلاثة).

## 8) المراجعة المستقلة والقرار

- الـ PR (#213) يحوي: تعديل `src/lib/notifications/notification-link.ts` (تشديد UUID) + تحديث الاختبار + هذا التقرير.
- المراجعة المستقلة الأولى أصدرت: CRITICAL=0 / HIGH=0 / **MEDIUM=1** / LOW=1 → أُغلقت MEDIUM-1 في REMEDIATION-01 (القسم 5)، وأُعيدت المراجعة بعد الدفع (Copilot review مطلوبة + قائمة تحقق المنسّق في جسم الـ PR).
- بوابة الدمج كالمعتاد: CRITICAL=0/HIGH=0/MEDIUM=0 + CI أخضر فعلي. لا دمج إن كان CI أحمر أو مفقوداً.
- **القرار: `PASS_NOTIFICATION_UI_ROUTING_VERIFIED` + `PASS_PR213_REMEDIATION_FIX_VERIFIED`** — العقد كامل، الحُرّاس فشل-مغلق، لا تسريب، لا open redirect (تحقق UUID صارم داخل link builder)، التعليم كمقروء محصور بالمستخدم الحالي على مستوى RLS، والملاحظة MEDIUM أُغلقت ومُختبرة. الدمج معلّق فقط على العطل الخارجي في CI.
