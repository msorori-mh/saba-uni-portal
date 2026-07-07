# STAFF-ROLES-CLEANUP-READINESS-AUDIT-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**المصادر (قراءة فقط):** migrations، تقارير Pilot، تصميم طلبات الطلاب  
**القرار:** **PASS_WITH_NOTES** + **NEEDS_DB_READ** قبل أي تنفيذ تنظيف  
**المرحلة التالية الموصى بها:** **STAFF-ROLES-READONLY-DB-AUDIT-01**

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار** | **PASS_WITH_NOTES** — الجاهزية **للتخطيط** موجودة؛ التنفيذ **غير مناسب الآن** بدون فحص DB وجلسة قرارات |
| **هل الوقت مناسب للتنظيف؟** | **لا مباشرة** — يلزم أولاً جرد read-only للحسابات الفعلية + موافقة المستخدم على من يُعطّل/يُحذف |
| **خطة أم تنفيذ فوري؟** | **خطة** — STAFF-ROLES-CLEANUP-PLAN-01 بعد READONLY-DB-AUDIT |
| **delete أم deactivate؟** | **deactivate (التوصية)** — تعطيل حساب/دور/منصب؛ hard delete فقط لحسابات demo معزولة بعد إثبات عدم الارتباط |

### الخلاصة

النظام يمثل الأشخاص عبر **ثلاث طبقات profiles** (`student_profiles`, `faculty_profiles`, `staff_profiles`) مرتبطة بـ `auth.users`، مع **أدوار** في `user_roles` + `user_role_assignments` + `roles_catalog`، و**مناصب** في `organizational_positions` / `position_assignments`، و**مجالس** في `academic_council_members`.

تقرير Pilot الأخير ([PORTAL-PILOT-DATA-READINESS-AUDIT-01-REPORT.md](./PORTAL-PILOT-DATA-READINESS-AUDIT-01-REPORT.md)) يُظهر **بيانات تشغيلية حقيقية/تجريبية مختلطة**: 34 faculty، 5 staff، 4 admin، 11 عضوية مجلس، 501 طالب، **0** `position_assignments`. **لا يمكن** تحديد من «تجريبي» ومن «فعلي» من schema وحدها — يلزم **استعلام read-only** بموافقة لاحقة.

**لا يُنصح** بحذف جماعي الآن: `audit_logs`، مجالس، موضوعات مجلس، ومراجع `user_id` في طلبات/workflow تمنع أو تُعقّد الحذف.

---

## 2. Scope

| ضمن النطاق | خارج النطاق (لم يُنفَّذ) |
|------------|-------------------------|
| تحليل schema + تقارير + كود | DELETE / UPDATE / INSERT |
| خريطة تبعيات | cleanup / truncate / reset |
| استراتيجية مقترحة | auth user deletion |
| قرارات مطلوبة من المستخدم | migrations apply |
| | commit / push / PR |

**هذه المرحلة فحص وتحليل فقط.**

---

## 3. Git State

| البند | القيمة |
|-------|--------|
| **الفرع** | `main` |
| **آخر commits** | `b044459` → `f98252d` → `5728214` → `5191940` → `98daec1` |
| **تعديلات سابقة غير متتبعة** | لم تُلمس (migrations طلبات الطلاب، تقارير، UI) |
| **commit / push / PR** | ❌ |
| **الملف الوحيد المُنشأ** | `docs/STAFF-ROLES-CLEANUP-READINESS-AUDIT-01-REPORT.md` |

---

## 4. Existing People / Roles Model

### 4.1 طبقات الهوية

```text
auth.users (Supabase Auth — حساب الدخول)
    │
    ├── student_profiles.user_id  → طالب
    ├── faculty_profiles.user_id  → عضو هيئة تدريس
    └── staff_profiles.user_id    → موظف إداري

لا يوجد جدول عام `profiles` — كل بوابة لها profile مستقل.
لا يوجد جدول `staff_accounts` أو `faculty_accounts` في DB — هذه ميزات import في UI.
```

### 4.2 الأدوار والصلاحيات

| الطبقة | الجدول | الغرض |
|--------|--------|--------|
| **أمن تشغيلي** | `user_roles` + enum `app_role` | RLS/RPC: admin, registrar, dean, faculty_member, student, … |
| **كتالوج مسميات** | `roles_catalog` | مسميات وظيفية عربية/إنجليزية |
| **ربط مسمى↔مستخدم** | `user_role_assignments` | `role_code` → `roles_catalog`؛ يُدمج في `has_any_role()` |
| **مناصب تنظيمية** | `organizational_positions` | هيكل الكلية (dean, registrar_department, …) — **مُزروع** |
| **إسناد منصب** | `position_assignments` | user ↔ position؛ **فارغ حالياً** (0 صفوف في Pilot) |
| **ربط منصب↔مسمى** | `position_role_mapping` | position ↔ roles_catalog |

### 4.3 معالجة طلبات الطلاب (جديد — migrations غير مطبقة)

| الطبقة | الجدول | الحالة |
|--------|--------|--------|
| وحدات المعالجة | `request_processing_units` | schema فقط — **لا seed** |
| مسميات المعالجة | `request_processing_roles` | schema فقط |
| تعيينات المعالجة | `request_processing_assignments` | schema فقط |
| workflow runtime | `student_request_workflow_steps/events` | schema + RPCs — **لا بيانات** |

### 4.4 المجالس الأكاديمية

| العنصر | الجدول | ملاحظة |
|--------|--------|--------|
| العضوية | `academic_council_members` | `user_id` → `auth.users` **ON DELETE RESTRICT** |
| الموضوعات | `academic_council_topics` | `submitted_by`, `reviewed_by` → RESTRICT |
| الاجتماعات/أجندة/محاضر | جداول `academic_council_*` | مراجع `created_by` / `approved_by` → RESTRICT |

### 4.5 آليات التعطيل الموجودة في الكود (لا حذف)

| RPC | التأثير |
|-----|---------|
| `admin_set_faculty_status(profile_id, active)` | `faculty_profiles.status` → `active` / `inactive` + audit |
| `admin_set_staff_status(profile_id, active)` | `staff_profiles.status` → `active` / `inactive` + audit |
| `admin_unlink_portal_login(kind, profile_id)` | `user_id = NULL` على profile مع الإبقاء على السجل |

---

## 5. Tables Impacted by Cleanup

| الجدول | مستوى الخطورة | عند حذف/تعطيل مستخدم | التوصية |
|--------|---------------|----------------------|---------|
| `auth.users` | **عالي** | CASCADE على `user_roles`؛ يعطل الدخول | **تعطيل** أو unlink؛ حذف فقط لـ demo معزول |
| `user_roles` | **متوسط** | فقدان صلاحية فوري | **إزالة أدوار تشغيلية** لا حذف مستخدم |
| `user_role_assignments` | **منخفض** | فقدان mapping مسمى | حذف صفوف assignment آمن إن لم تُستخدم |
| `staff_profiles` | **متوسط** | فقدان هوية موظف | **inactive** + unlink؛ لا DELETE إن وُجد audit |
| `faculty_profiles` | **متوسط–عالي** | مجالس + طلبات + مناصب | **inactive**؛ chair/dean يحتاج إعادة إسناد مجلس أولاً |
| `student_profiles` | **عالي جداً** | خارج نطاق تنظيف موظفين | **لا تلمس** في هذه المرحلة |
| `position_assignments` | **منخفض** | فارغ حالياً | إنهاء عبر `is_active=false` / `assigned_to` عند الإنشاء لاحقاً |
| `organizational_positions` | **منخفض** | master data مُزروع | **لا حذف** — تعديل فقط بقرار |
| `request_processing_assignments` | **منخفض** | فارغ (migration غير مطبق) | آمن بعد apply إن بقي فارغاً |
| `academic_council_members` | **عالي** | RESTRICT على user | **تعطيل عضوية** `is_active=false` لا حذف user |
| `academic_council_topics` | **عالي** | submitted_by محفوظ | لا حذف مُقدّم الموضوع |
| `student_requests` | **عالي** | `reviewed_by`؛ workflow | لا حذف معالج له سجل طلبات |
| `student_service_request_steps` | **متوسط** | `assigned_to`, `acted_by` | لا حذف؛ إعادة إسناد لاحقاً |
| `student_request_workflow_steps` | **منخفض–متوسط** | غير مطبق بعد | مراقبة بعد RUNTIME-01 |
| `student_request_workflow_events` | **عالي** | `actor_user_id` SET NULL | **لا حذف events** |
| `audit_logs` | **عالي جداً** | `actor_user_id` بدون FK إلزامي | **ممنوع المساس** — يُبقى للتاريخ |
| `notifications` | **متوسط** | `user_id` NOT NULL | حذف إشعارات demo اختياري؛ ليس أولوية |
| `staff_profile_departments` | **متوسط** | CASCADE من staff | يتبع قرار staff profile |

---

## 6. Deletion Risk Assessment

### 6.1 ما يمكن حذفه (بشروط صارمة)

| الهدف | الشرط |
|-------|--------|
| `user_role_assignments` لحساب demo | لا audit ولا مجلس ولا طلبات مرتبطة |
| `user_roles` لدور تشغيلي زائد | بعد استبدال الدور الفعلي — **ليس** حذف المستخدم |
| `auth.users` demo معزول | **صفر** مراجع في council/topics/requests/audit كـ actor |

### 6.2 ما يجب تعطيله فقط

| الهدف | الآلية |
|-------|--------|
| موظف سابق/تجريبي | `admin_set_staff_status(false)` + `admin_unlink_portal_login('staff', …)` |
| faculty تجريبي | `admin_set_faculty_status(false)` + unlink |
| عضو مجلس | `academic_council_members.is_active = false` (عبر UI أدمن) |
| منصب (مستقبلاً) | `position_assignments.is_active = false`, `assigned_to` |
| تعيين processing (مستقبلاً) | `request_processing_assignments.is_active = false`, `ends_at` |

### 6.3 ما لا يجب لمسه

| الهدف | السبب |
|-------|--------|
| `audit_logs` | امتثال وتدقيق |
| `organizational_positions` seed | هيكل الكلية |
| `roles_catalog` | master data |
| `student_profiles` / طلاب Pilot | خارج نطاق موظفين |
| سجلات `student_requests` وevents | تاريخ تشغيلي |
| موضوعات/اجتماعات مجلس موجودة | 2 موضوع `submitted` في Pilot |

### 6.4 ما يحتاج فحص read-only من DB

**إلزامي قبل أي cleanup:**

| الاستعلام / الجرد | الغرض |
|-------------------|--------|
| قائمة `staff_profiles` + `user_id` + `status` + `job_title` | تمييز demo vs فعلي |
| قائمة `faculty_profiles` + ربط `academic_council_members` | chair/secretary/member |
| `user_roles` GROUP BY role | تعدد registrar (3) / admin (4) |
| `audit_logs` GROUP BY `actor_user_id` | من له تاريخ يمنع الحذف |
| `student_requests.reviewed_by` / workflow actors | ارتباط معالجة |
| `auth.users` email/metadata | تحديد حسابات اختبار بالبريد |

**لم يُنفَّذ في هذه المرحلة** — يتطلب موافقة + `.env` / Supabase read-only (انظر §9).

### 6.5 بيانات Pilot المعروفة (من تقرير 2026-07-06 — قد تتغير)

| الكيان | العدد | ملاحظة تنظيف |
|--------|-------|--------------|
| staff | 5 (4 بحساب) | 4 registrar + 1 hr — **على الأرجح pilot** لكن يحتاج تأكيد |
| faculty | 34 (33 بحساب) | مرتبطون بمجالس — **لا حذف جماعي** |
| admin/system_admin | 4 | يحتاج تحديد من يبقى |
| registrar (role) | 3 | قد يُدمَج لمسجل عام واحد لاحقاً |
| dean (role) | 1 | قد يكون chair الكلية — **قرار مستخدم** |
| position_assignments | 0 | لا تعارض |
| council memberships | 11 نشطة | **تعطيل عضوية** وليس حذف أشخاص بلا بديل |

---

## 7. Recommended Cleanup Strategy

### المرحلة 0 — قبل أي كتابة

1. **Backup / restore point** (staging ثم production).
2. **STAFF-ROLES-READONLY-DB-AUDIT-01** — جرد كامل بمعرّفات (email، employee_number، user_id).
3. **موافقة المستخدم** على قائمة «يُعطّل» / «يبقى» / «يُحذف» (§8).

### المرحلة 1 — تعطيل (الافتراضي)

```text
1. إنهاء/تعطيل position_assignments القديمة (عند وجودها)
2. تعطيل request_processing_assignments التجريبية (عند وجودها)
3. academic_council_members.is_active = false للحسابات المستبدلة
4. admin_set_*_status(false) للموظفين/أكاديميين السابقين
5. admin_unlink_portal_login ل فك ربط auth دون حذف profile
6. حذف صفوف user_roles الزائدة (مثلاً registrar×3 → 1) بعد تعيين البديل
7. الإبقاء على audit_logs وevents وtopics كما هي
```

### المرحلة 2 — hard delete (محدود)

- فقط حسابات **ثبت** عبر READONLY-DB-AUDIT أنها:
  - لا `actor_user_id` في audit
  - لا عضوية مجلس
  - لا موضوعات/طلبات
  - لا workflow steps
- يُفضَّل على **staging أولاً**.

### المرحلة 3 — إنشاء الموظفين الفعليين

```text
1. apply migrations 160000–180000 (بموافقة) — أساس processing + actor RPCs
2. seed/config processing_units + roles (بموافقة صريحة — ليس في migrations الحالية)
3. إنشاء staff_profiles عبر /admin (createStaffMember) أو import
4. ربط user_roles + user_role_assignments
5. position_assignments لـ dean + department chairs (faculty)
6. request_processing_assignments لكل وحدة طلبات
```

### ترتيب إنشاء أدوار طلبات الطلاب (مقترح)

| # | الدور/الوحدة | النوع | البوابة |
|---|--------------|-------|---------|
| 1 | processing units/roles (master) | config | admin |
| 2 | المسجل العام | staff + registrar role | admin |
| 3 | شؤون الطلاب (مدير + مختص) | staff | staff |
| 4 | شؤون الخريجين | staff | staff |
| 5 | الإرشيف | staff | staff |
| 6 | المالية | staff | staff |
| 7 | المكتبة | staff | staff |
| 8 | المعامل | staff | staff |
| 9 | رؤساء الأقسام | faculty + position_assignment | faculty-portal |
| 10 | العميد | faculty + position `dean` | faculty-portal |

---

## 8. Impact on Student Requests

| سؤال | الجواب |
|------|--------|
| assignments قبل تنظيف الموظفين؟ | **ممكن** إن بقي الجدول فارغاً — لا تعارض |
| إنشاء موظفين أولاً؟ | **يُفضَّل** قبل `request_processing_assignments` الفعلية |
| processing units/roles أولاً؟ | **نعم** — يتطلب apply migration 160000 + seed بموافقة |
| dean/chair من faculty + position_assignments؟ | **نعم** — per DESIGN + RPC 180000 |
| شؤون الطلاب/مالية/… من staff_profiles؟ | **نعم** |
| خطر إنشاء طلبات قبل ضبط الموظفين؟ | **منخفض على البيانات** — inbox فارغ؛ **عالي على الاختبار** — لا معالجين |
| تنظيف يكسر workflow؟ | إن وُجدت خطوات runtime بـ `assigned_user_id` — نعم؛ حالياً **لا خطوات جديدة** (migrations غير مطبقة) |
| registrar×3 | يُفضَّى توحيد قبل go-live؛ التنظيف **لا يحذف** إلا بعد بديل |

---

## 9. Required User Decisions

| # | القرار |
|---|--------|
| 1 | حذف كامل للحسابات التجريبية أم **تعطيل** فقط؟ |
| 2 | أسماء/إيميلات **يجب الإبقاء عليها** (admin، dean، chairs)؟ |
| 3 | حسابات العميد ورؤساء الأقسام الحالية — **حقيقية أم pilot**؟ |
| 4 | التنظيف على **staging أولاً**؟ |
| 5 | **backup** إلزامي قبل production؟ |
| 6 | البدء بـ **موظفي طلبات الطلاب فقط** أم كل staff/faculty؟ |
| 7 | هل الـ **3 registrar** يُدمَجون لحساب مسجل عام واحد؟ |
| 8 | هل **faculty** المرتبطون بمجالس يُستثون من أي حذف؟ (موصى: نعم) |
| 9 | هل نُطبّق migrations **160000–180000** قبل إنشاء أدوار الطلبات؟ |

---

## 10. Recommended Next Phase

### **STAFF-ROLES-READONLY-DB-AUDIT-01**

**لماذا:**

1. التقرير الحالي يعتمد على **schema + Pilot report قديم نسبياً** — لا جرد fresh بـ `user_id`/email.
2. لا يمكن تأكيد «demo معزول» بدون استعلامات read-only.
3. CLEANUP-PLAN/STAGING **ممنوع** قبل READONLY-DB-AUDIT.

**بعد READONLY-DB-AUDIT:**

- إن وُجدت حسابات معزولة واضحة → **STAFF-ROLES-CLEANUP-PLAN-01**
- ثم **STAFF-ROLES-CLEANUP-STAGING-01** بموافقة + backup

---

## 11. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| حذف بيانات | ❌ |
| تعديل بيانات | ❌ |
| إنشاء مستخدمين | ❌ |
| تعديل أدوار | ❌ |
| تشغيل migration | ❌ |
| service role | ❌ |
| commit / push / PR | ❌ |

**الملف الوحيد المُنشأ/المعدّل:**

`docs/STAFF-ROLES-CLEANUP-READINESS-AUDIT-01-REPORT.md`

---

*نهاية التقرير — STAFF-ROLES-CLEANUP-READINESS-AUDIT-01*
