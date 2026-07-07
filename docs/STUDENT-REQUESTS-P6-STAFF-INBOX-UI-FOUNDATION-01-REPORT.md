# STUDENT-REQUESTS-P6-STAFF-INBOX-UI-FOUNDATION-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **المسار المعتمد** | `/admin/student-requests` — تبويب «صندوق المعالجة» (افتراضي) |
| **ما أصبح متاحاً** | صندوق معالجة للموظفين: قائمة + فلاتر + تفاصيل + form_data + timeline + لوحة إجراءات (معطّلة) |

**الخلاصة:** أُضيفت أساس واجهة صندوق معالجة الطلبات للموظفين المخولين داخل المسار الإداري الحالي، مع محاولة RPC للفاعل أولاً ثم fallback آمن إلى النظام التقليدي عند غياب مخطط workflow. لا كتابة DB ولا استدعاء `act_on_student_request_step`.

---

## 2. Existing Architecture

| الطبقة | التفاصيل |
|--------|----------|
| **Route** | `/admin/student-requests` — `src/routes/admin/student-requests.lazy.tsx` |
| **Route guard** | `src/lib/admin-nav.ts` — أدوار: `system_admin`, `admin`, `dean`, `registrar`, `student_affairs` |
| **Server auth** | `STUDENT_REQUESTS_ADMIN_ROLES` في `admin-student-requests.functions.ts` |
| **Legacy server fns** | `listStudentRequestsOverview`, `getStudentRequestDetails`, `updateStudentRequestStatus` |
| **Actor RPCs (كود)** | `get_my_request_actor_inbox`, `get_student_request_detail_for_actor` — في migration 20260710180000 |
| **Workflow action RPC** | `act_on_student_request_step` — **غير مستدعى** في هذه المرحلة |

**سبب اختيار المسار:** صفحة `/admin/student-requests` موجودة مسبقاً وتخدم نفس الأدوار؛ توسيعها بتبويبين يمنع تكرار المسارات ويحافظ على العرض التقليدي.

---

## 3. Files Added / Modified

### منشأة

| الملف |
|-------|
| `src/lib/student-requests/staff-inbox-ui.ts` *(مسبقاً — types/helpers)* |
| `src/lib/student-requests/staff-inbox.functions.ts` |
| `src/components/student-requests/StaffInboxShell.tsx` |
| `src/components/student-requests/StaffRequestInbox.tsx` |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` |
| `src/components/student-requests/StudentRequestFormDataView.tsx` |
| `src/components/student-requests/StaffRequestWorkflowTimeline.tsx` |
| `src/components/student-requests/StaffRequestActionPanel.tsx` |
| `docs/STUDENT-REQUESTS-P6-STAFF-INBOX-UI-FOUNDATION-01-REPORT.md` |

### معدّلة (هذه المرحلة)

| الملف | التغيير |
|-------|---------|
| `src/lib/student-request-rpc.ts` | `isWorkflowRpcUnavailable`, actor inbox/detail RPC wrappers *(مسبقاً)* |
| `src/routes/admin/student-requests.lazy.tsx` | تبويب «صندوق المعالجة» + «العرض التقليدي» |

**لم يُعدَّل:** `StudentRequestsSection.tsx`, `src/routeTree.gen.ts`, `mobile.student.requests.tsx` (سليم بعد build).

---

## 4. Inbox UI

### حقول بطاقة الطلب

- رقم الطلب / الرقم الأكاديمي
- اسم الطالب
- نوع الطلب (registry)
- العنوان
- الحالة (تسمية عربية)
- الخطوة والدور الحالي
- القسم
- مدة الانتظار
- شارة «يتطلب إجراءك» عند `isActionable`

### الفلاتر

| الفلتر | الوصف |
|--------|--------|
| الحالة | الكل، جديد، بانتظار الإجراء، معاد، مكتمل، مرفوض، ملغي |
| نوع الطلب | من lookups |
| القسم | من lookups |
| بحث | اسم / رقم أكاديمي / رقم طلب (RPC) |

### حالات الصفحة

| الحالة | السلوك |
|--------|--------|
| Loading | spinner |
| Empty | «لا توجد طلبات تتطلب إجراءك حالياً.» |
| RPC unavailable | banner عربي + fallback legacy |
| Unauthorized | رسالة من `STAFF_INBOX_UNAVAILABLE_MSG` |
| Error | رسالة مُنقّاة — لا stack traces |

---

## 5. Request Detail

### بيانات الطالب

الاسم، الرقم الأكاديمي، القسم، البرنامج، المستوى (إن وُجد)، نظام الدراسة، حالة القيد/الملف — حسب ما يعيده backend.

### بيانات الطلب

رقم الطلب، النوع، العنوان، الوصف، `form_data`، ملاحظات الطالب، التواريخ، الحالة، المرفقات (signed URLs).

### form_data renderer

`StudentRequestFormDataView.tsx`:
- تسميات من `request-form-registry`
- بدون JSON خام للمستخدم
- إخفاء القيم الفارغة
- قسم «بيانات إضافية» للحقول غير المعروفة
- escape للأحرف `<>&` — لا تنفيذ HTML

### المرفقات

عبر `getStudentRequestAttachmentUrl` (signed URL) — legacy path فقط حالياً؛ RPC actor يُرجع `attachments: []` حسب migration.

---

## 6. Workflow Timeline

| الوضع | العرض |
|-------|--------|
| **Actual** | خطوات من `get_student_request_detail_for_actor` عند توفر runtime |
| **Expected preview** | `buildExpectedWorkflowPreview()` للأنواع الثمانية عند غياب runtime |

### الأنواع الثمانية (preview)

`enrollment_suspension`, `grade_statement_non_graduate`, `enrollment_certificate`, `file_withdrawal`, `excused_absence`, `grade_appeal`, `department_transfer`, `october_exam_entry_form` — مسارات معرّفة في `staff-inbox-ui.ts`.

شارة «معاينة فقط» تظهر عند `workflowIsPreview === true`.

---

## 7. Action Panel

| الزر | الحالة |
|------|--------|
| موافقة / رفض / إعادة للطالب / طلب استكمال / إحالة | **معطّل** عند `workflowRuntimeAvailable === false` |
| إضافة ملاحظة | حالة محلية فقط — **لا تُحفظ** |

**رسالة التعطيل:** «تنفيذ الإجراء يحتاج تطبيق مخطط دورة حياة طلبات الطلاب.»

**تأكيد:** لا `act_on_student_request_step`، لا UPDATE، لا optimistic state للقرارات.

---

## 8. Role Handling

- تسميات الأدوار من `STAFF_ROLE_LABELS_AR` و `CENTRAL_SIGNATORY_LABELS_AR`
- لا منح صلاحيات من UI
- الجهات المركزية (مسجل الجامعة العام، نائب رئيس الجامعة) تُعرض كـ central signatories — بدون حسابات أو sign-off فعلي

---

## 9. Schema-Unavailable Fallback

| البند | السلوك |
|-------|--------|
| **Inbox** | `fetchStaffInbox` → `supabaseAdmin` overview + `assertRequestsAdmin` |
| **Detail** | `fetchStaffRequestDetail` → legacy row + `form_data` + attachments + expected preview |
| **الرسالة** | `STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable` |
| **Direct client DB** | ❌ — القراءة عبر server functions فقط |

---

## 10. Security Review

| الفحص | الحالة |
|-------|--------|
| Server-only reads | ✅ |
| لا Supabase مباشر من components | ✅ |
| `STUDENT_REQUESTS_ADMIN_ROLES` على server | ✅ |
| لا كشف أخطاء SQL خام | ✅ `sanitizeStaffErrorMessage` |
| مرفقات عبر signed URLs | ✅ |
| UI filtering ≠ authorization | ✅ — auth على server |

---

## 11. Validation

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | ✅ exit 0 |
| `git diff --check` | ✅ (تحذير CRLF على routeTree — مُستَرجَع) |
| `git restore --worktree src/routeTree.gen.ts` | ✅ |
| `git status --short` | ملفات P6 جديدة + `student-requests.lazy.tsx` معدّل |

---

## 12. No-Write Assurance

| البند | الحالة |
|-------|--------|
| migrations | ❌ |
| Supabase apply / seed | ❌ |
| DB writes | ❌ |
| `act_on_student_request_step` | ❌ |
| commit / push / PR | ❌ |

---

## PASS_WITH_NOTES — الملاحظات

1. **البيانات:** على DB بدون apply لـ actor RPC → fallback legacy (نظرة عامة إدارية) + workflow preview للأنواع الثمانية.
2. **Actor inbox RPC** لا يُرجع `academic_number` في الصف — يُعرض رقم الطلب أو «—».
3. **المرفقات** من RPC actor فارغة حتى مرحلة لاحقة — legacy detail يحمّل المرفقات.
4. **أزرار الإجراءات** معطّلة بالكامل (ما عدا ملاحظة محلية) حتى تطبيق workflow runtime.
5. **لا اختبار متصفح يدوي** — الاعتماد على `npm run build`.
