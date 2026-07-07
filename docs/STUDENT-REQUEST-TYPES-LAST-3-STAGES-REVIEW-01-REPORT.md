# STUDENT-REQUEST-TYPES-LAST-3-STAGES-REVIEW-01 Report

**التاريخ:** 2026-07-06  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية الموصى بها:** **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **الاتساق** | المراحل الثلاث **متسقة** مع التصميم والقرارات المعتمدة — SCHEMA يجهّز الأعمدة وFK، RPC/RLS يفرض الأهلية في DB |
| **الانتقال للتالي** | **نعم** — بعد ملاحظات غير حاصرة: تقرير SCHEMA-01 مفقود، ثغرة UPDATE مباشر للإرسال، عدم تهيئة workflow في `submit_student_request` |

**خلاصة:** DESIGN سليم؛ SCHEMA migration مطابق للمواصفة؛ RPC/RLS migration موجود ومطبّق منطقياً لقاعدة الطالب غير المؤهل (`NOT IN ('active','graduated')`). **لم يُطبَّق أي migration على DB.**

---

## 2. Scope

- **مراجعة قراءة فقط** لآخر 3 مراحل طلبات الطلاب.
- **الكتابة الوحيدة:** هذا التقرير.
- لا تعديل migrations، تقارير سابقة، UI، أو DB.

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **المسار** | `C:\projects\saba-uni-portal-git` |
| **الفرع** | `main` (متوقع — لم يُغيَّر) |
| **ملفات غير متتبعة (مرجع)** | تقارير AUDIT، DESIGN، RPC-RLS؛ migrations `20260710130000`، `20260710140000`؛ تقارير PILOT وغيرها — **لم تُلمس** |
| **commit / push / PR** | ❌ |
| **تطبيق migration** | ❌ |

---

## 4. Files Reviewed

| الملف | موجود؟ | الغرض | ملاحظات |
|-------|--------|-------|---------|
| `docs/STUDENT-REQUEST-TYPES-LIFECYCLE-DESIGN-01.md` | ✅ | تصميم | كامل |
| `supabase/migrations/20260710130000_student_request_types_schema.sql` | ✅ | SCHEMA-01 | مطابق |
| `docs/STUDENT-REQUEST-TYPES-SCHEMA-01-REPORT.md` | ❌ | تقرير SCHEMA | **غير موجود في المستودع** |
| `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql` | ✅ | RPC/RLS-01 | كامل |
| `docs/STUDENT-REQUEST-TYPES-RPC-RLS-01-REPORT.md` | ✅ | تقرير RPC/RLS | يذكر No-Write |

---

## 5. DESIGN-01 Review

**النتيجة: PASS**

| معيار | الحالة |
|-------|--------|
| مستمر = `status = 'active'` | ✅ §4 |
| خريج = `status = 'graduated'` | ✅ §4 |
| التخرج بعد اعتماد إداري وليس إكمال مواد | ✅ §4 قاعدة التخرج |
| `request_audience`: active_student / graduate / both | ✅ §5 |
| `ineligible_display_mode`: hidden / disabled | ✅ §6 |
| الحقلان على `request_types` | ✅ §5 |
| ازدواجية `StudentRequestsSection` vs `/student/requests/*` | ✅ §13 — اعتماد الجديد |
| تأجيل الرسوم | ✅ §10 |
| `reenrollment` / `department_transfer` | ✅ §7 — توحيد مؤجّل |
| إسقاط `sr_type_chk` → FK `request_types(code)` | ✅ §7 خيار 3 |
| الحماية في RPC/RLS وليس UI | ✅ §11–12 |

**ملاحظة:** التصميم يذكر أمثلة `suspended`/`withdrawn`/`transferred` — التنفيذ في RPC يستخدم القاعدة العامة `NOT IN ('active','graduated')` وهو **أوسع وأصح** حسب القرار المعتمد.

---

## 6. SCHEMA-01 Review

**النتيجة: PASS** (migration) / **NOTE** (تقرير مفقود)

### `request_audience`

| معيار | مطابق؟ |
|-------|--------|
| `ADD COLUMN IF NOT EXISTS` | ✅ سطر 17–18 |
| `DEFAULT 'active_student'` | ✅ |
| `NOT NULL` | ✅ |
| CHECK: active_student, graduate, both | ✅ `request_types_request_audience_chk` |
| idempotent DO block | ✅ |

### `ineligible_display_mode`

| معيار | مطابق؟ |
|-------|--------|
| `ADD COLUMN IF NOT EXISTS` | ✅ |
| `DEFAULT 'hidden'` | ✅ |
| `NOT NULL` | ✅ |
| CHECK: hidden, disabled | ✅ |
| idempotent DO block | ✅ |

### COMMENT

| معيار | مطابق؟ |
|-------|--------|
| COMMENT على العمودين | ✅ |
| يوضح RPC/RLS وليس UI فقط | ✅ |

### `sr_type_chk` / FK

| معيار | مطابق؟ |
|-------|--------|
| `DROP CONSTRAINT IF EXISTS sr_type_chk` | ✅ سطر 72–73 |
| FK `student_requests_type_request_types_code_fk` | ✅ |
| `student_requests.request_type` → `request_types(code)` | ✅ |
| `NOT VALID` | ✅ |
| لا `VALIDATE CONSTRAINT` | ✅ |
| يعتمد UNIQUE موجود على `code` (20260601000207) | ✅ — لا unique index زائد |

### السلامة

| ممنوع | موجود؟ |
|-------|--------|
| UPDATE / DELETE / INSERT seed | ❌ لا |
| VALIDATE CONSTRAINT | ❌ لا |

**مشكلة توثيق:** `docs/STUDENT-REQUEST-TYPES-SCHEMA-01-REPORT.md` **غير موجود** — لا يؤثر على صحة migration لكن يُفضّل إنشاؤه لاحقاً (خارج هذه المرحلة).

---

## 7. Blocked / Ineligible Student Status Rule Review

**النتيجة: PASS** في RPC/RLS migration

| معيار | التطبيق |
|-------|---------|
| قاعدة عامة `status NOT IN ('active','graduated')` | ✅ `assert_student_can_use_request_type` سطر 68–70 |
| جميع الخدمات disabled | ✅ `get_available_request_types_for_current_student` سطر 130–148 |
| منع create | ✅ EXCEPTION برسالة القيد |
| منع submit | ✅ نفس `assert` عند الإرسال |
| الرسالة العربية المعتمدة | ✅ `student_request_ineligible_status_message()` |
| لا enum status إضافي في schema | ✅ |

**ثغرة جزئية (غير حاصرة):** `sr_update_self` ما زال يسمح للطالب بـ UPDATE `draft` → `submitted` عبر `protect_student_request` **بدون** إعادة فحص `request_audience`/حالة القيد في الـ trigger. الطالب غير المؤهل **لا يستطيع الإنشاء** عبر RPC، لكن مسودة قديمة نظرياً قد تُرسَل بـ UPDATE مباشر. يُوصى بإغلاقها في مرحلة RPC/RLS-02 أو توسيع `protect_student_request`.

---

## 8. RPC/RLS-01 Review

**النتيجة: PASS_WITH_NOTES** — المرحلة **منفذة** (ملف migration + تقرير موجودان)

### عدم وجود data writes في migration

| ممنوع | موجود؟ |
|-------|--------|
| VALIDATE / UPDATE / DELETE / INSERT seed | ❌ لا |

### RPCs

| RPC | النتيجة | ملاحظات |
|-----|---------|---------|
| `get_available_request_types_for_current_student()` | ✅ PASS | `auth.uid()`؛ active/graduated/غير مؤهل؛ eligible/disabled/hidden؛ SECURITY DEFINER + search_path |
| `create_student_request(...)` | ✅ PASS | لا student_id من العميل؛ draft؛ `is_active` + `student_visible`؛ لا رسوم/مرفقات |
| `submit_student_request(uuid)` | ⚠️ NOTES | أهلية + ملكية ✅؛ **لا** `initializeSteps`؛ TODO مرفقات |
| `get_my_student_requests(...)` | ✅ PASS | عزل profile من auth |

### RLS

| البند | الحالة |
|-------|--------|
| منع INSERT المباشر للطلاب | ✅ `DROP sr_insert_self` |
| يكسر واجهات حالية | ⚠️ متوقع — مُوثَّق في تقرير RPC/RLS |
| SELECT طلباته | ✅ سياسات قديمة بدون تغيير |
| UPDATE | ⚠️ ما زال مسموحاً للمسودات — انظر §7 |
| مرفقات `sra_insert` | ✅ مالك + `status IN (active, graduated)` + حالة طلب قابلة للتعديل |

### Grants

| معيار | مطابق؟ |
|-------|--------|
| REVOKE FROM PUBLIC | ✅ |
| GRANT EXECUTE TO authenticated | ✅ |
| لا anon | ✅ |
| لا service role | ✅ |

---

## 9. Security Review

| معيار | الحالة |
|-------|--------|
| لا service role في migrations | ✅ |
| لا user_id من العميل في RPCs الحساسة | ✅ |
| `auth.uid()` مستخدم | ✅ |
| SECURITY DEFINER + `search_path = public` | ✅ |
| grants متسقة | ✅ |
| ليس UI فقط — create/list/submit في RPC | ✅ |
| INSERT مباشر مُغلق للطلاب | ✅ |

---

## 10. Deferred Items

| البند | الحالة |
|-------|--------|
| VALIDATE CONSTRAINT FK | مؤجّل |
| DATA-NORMALIZATION (`reenrollment`, `department_transfer`) | مؤجّل |
| seed `request_audience` per type | مؤجّل |
| fees / needs_payment | مؤجل |
| UI consolidation | مؤجّل |
| E2E smoke | مؤجّل |
| تقرير SCHEMA-01 | **مفقود** (توثيق) |
| إغلاق UPDATE→submitted bypass | مؤجّل |
| workflow steps عند submit RPC | مؤجّل |

---

## 11. Issues Found

| # | الخطورة | الوصف |
|---|---------|--------|
| 1 | منخفضة | `docs/STUDENT-REQUEST-TYPES-SCHEMA-01-REPORT.md` غير موجود |
| 2 | متوسطة | إرسال الطلب عبر UPDATE مباشر (`sr_update_self`) دون إعادة فحص أهلية القيد/الجمهور |
| 3 | متوسطة | `submit_student_request` لا يهيئ `student_service_request_steps` |
| 4 | متوقعة | كسر INSERT المباشر للواجهات الحالية حتى UI-CONSOLIDATION |
| 5 | تشغيلية | ترتيب التطبيق: SCHEMA-01 ثم RPC-RLS-01 على staging قبل UI |

**No blocking issues found** للانتقال إلى UI-CONSOLIDATION مع معالجة البنود 2–3 في مرحلة لاحقة.

---

## 12. Recommended Next Step

### **STUDENT-REQUEST-TYPES-UI-CONSOLIDATION-01** (أولوية)

1. استدعاء RPCs من `/student/requests/*`
2. عرض disabled / إخفاء hidden
3. إيقاف `createStudentServiceRequest` INSERT المباشر
4. ترحيل `StudentRequestsSection`

### بالتوازي أو قبل smoke على staging

**STUDENT-REQUEST-TYPES-MIGRATION-REVIEW-01** — مراجعة تطبيق `20260710130000` ثم `20260710140000` على بيئة غير إنتاجية.

### لاحقاً (عند الحاجة)

- **STUDENT-REQUEST-TYPES-DATA-NORMALIZATION-01** — قبل `VALIDATE CONSTRAINT`
- إعادة إنشاء **SCHEMA-01-REPORT** للتوثيق (اختياري)
- **RPC-RLS-02** — إغلاق UPDATE submit + تهيئة workflow في submit RPC

---

## 13. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تعديل migrations | ❌ |
| تشغيل migration | ❌ |
| تعديل DB | ❌ |
| data writes | ❌ |
| تعديل UI/server/routes | ❌ |
| service role | ❌ |
| تعديل تقارير/ملفات SQL سابقة | ❌ |
| commit / push / PR | ❌ |
| **الملف الوحيد المُنشأ** | ✅ `docs/STUDENT-REQUEST-TYPES-LAST-3-STAGES-REVIEW-01-REPORT.md` |

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-LAST-3-STAGES-REVIEW-01*
