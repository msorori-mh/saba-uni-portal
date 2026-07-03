# COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01 — دوال خادم لإدارة عضويات المجالس

> **كود فقط.** لا migrations، لا تعديل DB/RLS/Storage، لا seed/import، لا إيميل، لا cron، لا كتابة من الواجهة.

---

## 1. القرار النهائي

### **PASS**

---

## 2. الملفات المعدَّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/admin-councils.functions.ts` | إضافة 4 دوال server + أنواع + ثوابت صلاحيات وأدوار |
| `docs/COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01-REPORT.md` | هذا التقرير |

**لم تُعدَّل:** `src/routes/admin/academic-councils.tsx` (ما زالت قراءة فقط مع أزرار معطَّلة).

---

## 3. الدوال المُضافة

| الدالة | الغرض |
|--------|-------|
| `getCouncilMemberships` | قراءة عضويات مجلس محدد (الحالية والسابقة) مع بيانات العرض |
| `searchAcademicsForCouncilLink` | بحث عن أكاديميين قابلين للربط (حد أدنى حرفان) |
| `linkAcademicToCouncil` | ربط أكاديمي بعضوية مجلس أو إعادة تفعيل عضوية معطّلة |
| `deactivateCouncilMembership` | تعطيل عضوية دون حذف |

**ثوابت مُصدَّرة للمرحلة التالية:**

- `COUNCILS_MEMBERSHIP_WRITE_ROLES`
- `COUNCIL_LINK_MEMBER_ROLES`
- `CouncilMembershipItem`, `AcademicLinkCandidate`, `CouncilLinkMemberRole`

---

## 4. التحقق من الصلاحيات

كل الدوال الجديدة تمر عبر:

1. `requireSupabaseAuth` — جلسة المستخدم الحالية (Bearer token، مفتاح Supabase العام فقط على الخادم).
2. `assertCouncilsMembershipManager` → `assertAnyRole` للأدوار:
   - `system_admin`
   - `admin`
   - `dean`

رسالة الرفض الموحَّدة عند غياب الدور: *«ليس لديك صلاحية إدارة عضويات المجالس الأكاديمية»*.

**عمليات الكتابة** (`linkAcademicToCouncil`, `deactivateCouncilMembership`) تستخدم **`context.supabase`** (جلسة المستخدم) وليس `supabaseAdmin` — أي **لا تجاوز RLS**.

**قراءة الملخص العام** (`getCouncilsSummary`) بقيت على `supabaseAdmin` كما كانت (server-only، لم تُفعَّل كتابة منها).

---

## 5. مصدر الأكاديميين للربط

المصدر الفعلي في النظام:

| الجدول | الاستخدام |
|--------|-----------|
| `faculty_profiles` | هوية العضو الأكاديمي + `user_id` (حساب الدخول) |
| `faculty` | البريد عبر `faculty_id` (للبحث بالبريد) |
| `/portal-login` (`type=faculty`) | بوابة دخول أعضاء هيئة التدريس |

**شروط الربط:**

- `faculty_profiles.status = 'active'`
- `faculty_profiles.user_id IS NOT NULL` (حساب دخول موجود مسبقاً)
- لا إنشاء حساب أو ملف جديد

**البحث:** الاسم العربي/الإنجليزي، `employee_number`، أو بريد `faculty.email` — حد أدنى **حرفان**، حد أقصى **25** نتيجة.

**البيانات المُرجعة للواجهة:** `faculty_profile_id`, `user_id`, `name`, `email`, `employee_number`, `status` — بدون حقول حساسة إضافية.

---

## 6. منع التكرار (`linkAcademicToCouncil`)

1. التحقق من وجود المجلس و`is_active = true`.
2. التحقق من ملف العضو وربطه بحساب دخول.
3. جلب كل صفوف `(council_id, user_id)`.
4. إذا وُجدت عضوية **فعّالة** (`is_active = true` **و** `active_to IS NULL`) → رفض: *«يوجد عضوية فعّالة لهذا العضو في المجلس بالفعل»*.
5. إذا وُجدت عضوية **غير فعّالة** → **إعادة تفعيل** بنفس الصف (UPDATE): `is_active=true`, `active_to=null`, `member_role` جديد, `updated_by` — **بدون DELETE** وبدون كسر السجل التاريخي.
6. وإلا → INSERT صف جديد مع `created_by` / `updated_by`.

**الأدوار المسموحة:** `chair`, `secretary`, `member`, `viewer` فقط (تحقق Zod).

---

## 7. التعطيل بدون حذف (`deactivateCouncilMembership`)

حسب schema الفعلي `academic_council_members`:

```sql
is_active = false
active_to = <تاريخ اليوم>
updated_by = auth.uid()
```

- **لا** `DELETE`.
- إذا كانت العضوية معطّلة مسبقاً → رسالة واضحة دون تعديل.

---

## 8. قراءة العضويات (`getCouncilMemberships`)

- تعرض **الحالية والسابقة** مرتبة (`is_active` تنازلياً ثم `created_at`).
- `is_active` في الاستجابة = منطق فعّالية مركّب (`is_active && active_to IS NULL`).
- إثراء الأسماء/البريد/الرقم من `faculty_profiles` + `faculty.email`.

---

## 9. نتائج التحقق

| الفحص | النتيجة |
|-------|---------|
| `bunx tsgo --noEmit` | **لم يُشغَّل** — الحزمة `tsgo` غير متوفرة في npm (404) |
| `bun run build` | **لم يُشغَّل** — `node_modules` غير موجودة في بيئة التنفيذ المحلية |
| Linter (`admin-councils.functions.ts`) | **PASS** — لا أخطاء |
| migrations جديدة | **لا** — `git diff` يقتصر على ملف الدوال + التقرير |
| service role في المتصفح | **لا** — `client.server.ts` server-only؛ الكتابة عبر `context.supabase` |
| كتابة من UI | **لا** — الصفحة لا تستورد الدوال الجديدة؛ الأزرار ما زالت `disabled` |
| نطاق التغيير | **مجالس فقط** (+ تقرير docs) |

---

## 10. تأكيدات عدم التوسع

| البند | الحالة |
|-------|--------|
| migrations | **لا** |
| DB schema changes | **لا** |
| RLS changes | **لا** |
| Storage | **لا** |
| Email | **لا** |
| Cron | **لا** |
| seed / import | **لا** |
| service role في المتصفح | **لا** |
| حذف عضويات | **لا** |

---

## 11. ملاحظات وعوائق (RLS)

### R1 — فجوة RLS لدور `dean` على الكتابة

سياسات `council_members_insert` / `council_members_update` تتطلب `can_manage_council` = `is_council_admin` (admin/system_admin) **أو** `chair` في المجلس.

- **`dean`** مُصرَّح له على مستوى التطبيق (`assertAnyRole`) لكن **قد تفشل** INSERT/UPDATE عبر RLS ما لم يكن dean أيضاً `admin`/`system_admin` أو `chair` في ذلك المجلس.
- الدوال **لا تتجاوز RLS**؛ عند الفشل تُرجع رسالة عامة: *«تعذّر تنفيذ العملية. تحقق من صلاحياتك على هذا المجلس.»*

**توصية المرحلة التالية:** `COUNCILS-RLS-DEAN-MEMBERSHIP-01` — توسيع سياسة الكتابة لـ dean أو الاعتماد على RPC SECURITY DEFINER بموافقة Lovable.

### R2 — قراءة العضويات لـ `dean`

`council_members_select` يسمح بـ `is_council_admin` أو عضوية في المجلس. dean بدون عضوية قد لا يرى قائمة العضويات عبر `context.supabase` — نفس الفجوة المتوقعة حتى تُحدَّث RLS أو يُمنح dean عضوية إدارية.

### R3 — `getCouncilsSummary` ما زال على `supabaseAdmin`

لم يُغيَّر في هذه المرحلة (قراءة ملخص فقط، نمط سابق). دوال العضويات الجديدة تستخدم جلسة المستخدم.

---

## 12. التوصية التالية

### **READY_FOR_MEMBERSHIP_ADMIN_UI**

الخطوات المقترحة:

1. واجهة إدارة عضويات داخل `/admin/academic-councils` (قائمة + بحث + ربط + تعطيل) باستخدام الدوال المُصدَّرة.
2. معالجة فجوة RLS لـ `dean` قبل تفعيل الكتابة للعميد في الإنتاج (`COUNCILS-RLS-DEAN-MEMBERSHIP-01`).
3. تشغيل `bun install && bun run build` في بيئة CI/Lovable للتحقق النهائي من البناء.

---

*Generated: COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01 — server functions only, no DB changes.*
