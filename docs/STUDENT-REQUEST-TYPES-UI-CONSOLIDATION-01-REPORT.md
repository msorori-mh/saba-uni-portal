# STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية:** **STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **توحيد `/student/requests/*`** | ✅ الواجهة الرسمية للقائمة / الإنشاء / التفاصيل / الإرسال |
| **نقل create/submit/list/types إلى RPCs** | ✅ عبر `student-affairs.functions.ts` + `student-request-rpc.ts` |

**ملاحظة (PASS_WITH_NOTES):** `StudentRequestsSection.tsx` ما زال في المستودع (deprecated، غير مُركَّب) ويحتوي INSERT/UPDATE قديم. `saveStudentServiceRequestDraft` و`cancelStudentServiceRequest` ما زالا يستخدمان UPDATE مباشراً لحقول مسودة/إلغاء — مسموح بموجب RLS بعد bypass-fix.

---

## 2. Scope

- UI / client / server helpers لطلبات الطلاب فقط.
- ❌ لا migrations، لا DB apply، لا data writes.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commit** | `b044459` — نفّذ تقرير جاهزية البيانات التجريبية |
| **commit / push / PR** | ❌ |

### الملفات المعدّلة / المنشأة

| الملف | الإجراء |
|-------|---------|
| `src/lib/student-request-rpc.ts` | **جديد** — أنواع RPC + wrappers + رسالة «قيد التحديث» |
| `src/lib/student-affairs.functions.ts` | **معدّل** — types/create/submit/list عبر RPC |
| `src/components/portal/StudentRequestsPortalSummary.tsx` | **جديد** — بطاقة ملخص في لوحة الطالب |
| `src/routes/student.index.tsx` | **معدّل** — إزالة `StudentRequestsSection` + redirect hash |
| `src/routes/student.requests.new.tsx` | **معدّل** — بطاقات أنواع + disabled/ineligible UX |
| `src/routes/student.requests.index.tsx` | **معدّل** — `request_type_name_ar` من RPC |
| `src/routes/mobile.student.requests.tsx` | **معدّل** — server fns + RPC بدل query مباشر |
| `src/components/portal/StudentRequestsSection.tsx` | **معدّل** — تعليق deprecated فقط |
| `docs/STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01-REPORT.md` | **جديد** |

---

## 4. UI Consolidation Changes

### `StudentRequestsSection`

- **أُزيل من** `student.index.tsx`.
- أُضيف تعليق `@deprecated` — الملف (~1900 سطر) **لم يُحذف**؛ لا مسار نشط يعرضه.
- الروابط القديمة `#student-requests` / `#requests` → **redirect** إلى `/student/requests`.

### المسارات المعتمدة

| المسار | الوظيفة |
|--------|---------|
| `/student/requests` | قائمة طلباتي |
| `/student/requests/new` | إنشاء + إرسال |
| `/student/requests/$id` | تفاصيل + إعادة إرسال (returned) |
| `/mobile/student/requests` | عرض مبسّط + روابط للبوابة الموحدة |

### لوحة الطالب (`/student`)

- `StudentRequestsPortalSummary`: ملخص + رابط «إدارة الطلبات» + «طلب جديد».

---

## 5. RPC Integration

| RPC | مستخدم؟ | أين؟ |
|-----|---------|------|
| `get_available_request_types_for_current_student` | ✅ | `getStudentRequestTypesForStudent` → `/new`, mobile |
| `create_student_request` | ✅ | `createStudentServiceRequest` → `/new` |
| `submit_student_request` | ✅ | `submitStudentServiceRequest` → `/new`, `/$id` |
| `get_my_student_requests` | ✅ | `getMyStudentServiceRequests` → index, mobile, summary |

**Typed wrapper:** `src/lib/student-request-rpc.ts` — بدون تعديل `integrations/supabase/types.ts`.

**بعد submit RPC:** server fn يهيّئ workflow steps عبر `supabaseAdmin` (خارج نطاق RPC الحالي).

---

## 6. Direct DB Access Review

| النمط | الحالة |
|-------|--------|
| INSERT `student_requests` من واجهة طالب نشطة | ❌ لا — استبدل بـ `create_student_request` |
| UPDATE → `submitted` / `under_review` / `in_review` من طالب | ❌ لا — `submit_student_request` |
| SELECT `request_types` لأهلية الطالب | ❌ لا — RPC |
| SELECT `student_requests` بفلتر `student_id` من الواجهة | ❌ لا في المسارات النشطة — RPC |
| UPDATE مسودة (حقول نصية) | ✅ `saveStudentServiceRequestDraft` — draft→draft |
| UPDATE `cancelled` | ✅ `cancelStudentServiceRequest` |
| INSERT/UPDATE في `StudentRequestsSection` (غير مُركَّب) | ⚠️ legacy code — deprecated |

---

## 7. Ineligible Student UX

- الأنواع من RPC: `is_disabled` / `disabled_reason`.
- بطاقات **باهتة** و**غير قابلة للنقر** في `/student/requests/new` وmobile.
- إذا كل الأنواع disabled → بانر: «لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي…»
- لا حساب أهلية محلي من `status` — الاعتماد على مخرجات RPC فقط.

---

## 8. Attachments Notes

- صفحة التفاصيل `/student/requests/$id` تعرض المرفقات عبر `getStudentServiceRequestDetails` (قراءة آمنة بصلاحيات).
- **لم يُضف** رفع مرفقات في المسار الجديد (`/new` لا يحتوي widget رفع).
- `create_student_request` **يرجع** `uuid` — كافٍ لربط مرفقات لاحقاً.
- رفع المرفقات في `StudentRequestsSection` القديم غير متاح للمستخدم (deprecated).
- **مؤجّل:** widget رفع في `/new` + تحقق `required_documents` في RPC.

---

## 9. Deferred Items

- migrations لم تُطبَّق على DB
- DATA-NORMALIZATION / FK VALIDATE
- seed `request_audience`
- fees (`STUDENT-REQUEST-FEES-01`)
- E2E smoke
- production publish
- حذف `StudentRequestsSection.tsx` legacy
- مرفقات في مسار `/new`

---

## 10. Checks Run

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | ✅ نجح (exit 0) |
| `npm run lint` | ⚠️ فشل — أخطاء prettier/CRLF **مسبقة** على مستوى المشروع + ملفاتنا الجديدة |
| `git diff --check` | ✅ بدون conflict markers |
| `git status --short` | ملفات UI معدّلة + تقارير/migrations غير متتبعة من مراحل سابقة |

---

## 11. Risks / Notes

1. **الواجهة تحتاج تطبيق migrations** (`20260710130000` → `20260710150000`) قبل العمل في staging/production.
2. إذا RPC غير موجود → رسالة: «خدمة الطلبات قيد التحديث. يرجى المحاولة لاحقاً.»
3. `submit_student_request` RPC لا يهيّئ workflow steps — يُكمَّل في server fn عبر admin (موثّق للمراجعة).
4. `getStudentServiceRequestDetails` ما زال يستخدم `supabaseAdmin` select مع فحص صلاحيات — ليس RPC؛ مقبول لعرض التفاصيل.

---

## 12. Recommended Next Phase

### **STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01**

- مراجعة سلسلة migrations الأربعة قبل التطبيق
- ترتيب التطبيق وفحص التعارضات
- تجهيز أمر Lovable/Supabase apply بموافقة صريحة لاحقاً

**لا E2E smoke قبل تطبيق migrations.**

---

## 13. No-DB-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| migration جديد | ❌ |
| تشغيل migration | ❌ |
| تعديل DB | ❌ |
| data writes | ❌ |
| service role من الواجهة | ❌ |
| commit / push / PR | ❌ |

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01*
