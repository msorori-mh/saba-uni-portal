# COUNCILS-MEMBERSHIP-ADMIN-LINKING-DESIGN-01 — تصميم ربط عضويات المجالس من لوحة الإدارة

- التاريخ: 2026-07-03
- النمط: **تصميم وتحليل فقط** — لا كتابة، لا migration، لا RLS، لا Storage، لا Email، لا Cron، لا نشر.
- المراجع: `COUNCILS-OPTION-A-SEED-VERIFY-01` (PASS), `COUNCILS-MEMBERSHIP-INPUT-PLANNING-01` (PASS WITH NOTES).

---

## 1. مصدر حسابات الأكاديميين في النظام

بوابة دخول الأكاديميين (`/faculty-portal`) تعتمد على جدول **`faculty_profiles`** (وليس `staff_profiles` ولا `faculty` المرجعي للعرض العام).

### الحقول المتاحة للبحث والربط

| الحقل | النوع | متوفر | الفائدة |
|-------|------|--------|---------|
| `user_id` | uuid → `auth.users` | نعم (33 من 34) | مفتاح الربط الوحيد المطلوب لعضوية `academic_council_members.user_id` |
| `employee_number` | text (UNIQUE) | نعم (34/34) | الرقم الأكاديمي / الوظيفي — بحث دقيق |
| `full_name_ar` | text (NOT NULL) | نعم | بحث بالاسم العربي (ILIKE) |
| `full_name_en` | text | جزئي | بحث ثانوي بالاسم الإنجليزي |
| `department_id` | uuid → `departments` | نعم (33/34) | يسمح بفلترة أكاديميي القسم لمجالس الأقسام |
| `academic_rank` / `position_title` | text | جزئي | عرض إعلامي في نتائج البحث |
| `status` | text (`active`/…) | نعم | استبعاد غير النشطين |

**البريد** غير موجود على `faculty_profiles` مباشرة؛ يقع على `auth.users.email` ويحتاج قراءة عبر `supabaseAdmin.auth.admin.getUserById(user_id)` أو JOIN عبر view آمنة على السيرفر فقط. `faculty.email` (الجدول المرجعي العام) قد يُستخدم للعرض فقط، لكن **مصدر الحقيقة للبريد التسجيلي هو `auth.users`**.

### التغطية الفعلية
- 34 سجلاً في `faculty_profiles` — 33 مرتبط بـ `user_id` و`department_id`.
- سجل واحد بلا `user_id` → لا يصلح لعضوية مجلس (FK إلى `auth.users`) وسيُستبعد من نتائج البحث تلقائياً.

**الخلاصة:** المصدر جاهز وكافٍ للربط دون أي schema change.

---

## 2. schema الحالي لـ `academic_council_members` — تقييم الكفاية

| المتطلب | العمود | الحالة |
|---------|--------|--------|
| council_id | `council_id` uuid FK | متوفر |
| user_id | `user_id` uuid FK → auth.users | متوفر |
| الدور | `member_role` enum (`chair`/`vice_chair`/`secretary`/`member`/`viewer`) | متوفر |
| نشط/غير نشط | `is_active` boolean + `active_from`/`active_to` | متوفر — تعطيل بتاريخ نهاية بدل الحذف |
| منع التكرار | UNIQUE(council_id, user_id, member_role, active_from) | متوفر |
| تتبع | `created_by` / `updated_by` / `created_at` / `updated_at` + trigger touch | متوفر |
| RLS كتابة | `council_members_insert/update` عبر `can_manage_council(auth.uid(), council_id)` | متوفر ومطلوب احترامه من server functions |

**التقييم:** schema **كافٍ تماماً**. لا حاجة لتعديل بنيوي في هذه المرحلة.

**ملاحظة:** لا يوجد policy `DELETE` — بالتصميم؛ يجب على الشاشة استخدام تعطيل عبر `UPDATE` (`is_active=false`, `active_to=CURRENT_DATE`).

---

## 3. تصميم شاشة "إدارة عضويات المجالس"

الموقع: تبويب جديد داخل `/admin/academic-councils` باسم **"إدارة العضويات"**.

### التخطيط
```text
┌─ اختيار المجلس ──────────────────────────────────────┐
│  [Dropdown: مجلس الكلية | مجلس قسم IT | … ]         │
└──────────────────────────────────────────────────────┘

┌─ الأعضاء الحاليون (is_active=true) ──────────────────┐
│  الاسم | الرقم الأكاديمي | الدور | منذ | [تعطيل] [تغيير الدور] │
└──────────────────────────────────────────────────────┘

┌─ إضافة عضو ──────────────────────────────────────────┐
│  حقل بحث: [الاسم / البريد / الرقم الأكاديمي]         │
│  نتائج (max 20): بطاقات فيها الاسم + القسم + الرتبة  │
│  [اختيار] → [الدور: chair/secretary/member/viewer]   │
│  [تنبيه إذا كان مجلس قسم والقسم لا يطابق]           │
│  [إضافة]                                             │
└──────────────────────────────────────────────────────┘
```

### قواعد الشاشة
- **مجالس الأقسام:** فلترة افتراضية `faculty_profiles.department_id = council.department_id`؛ يمكن تجاوز الفلتر مع عرض شارة تنبيه: *"لم يتم التحقق من ارتباط هذا الأكاديمي بالقسم."*
- **مجلس الكلية:** لا فلترة قسم.
- **منع التكرار:** قبل الإرسال، فحص وجود صف نشط بنفس `(council_id, user_id)` (بغض النظر عن الدور) وإظهار خطأ ودّي.
- **تغيير الدور:** يُنفَّذ بتعطيل الصف القديم + إدراج صف جديد بالدور الجديد (حفاظاً على السجل التاريخي والقيد الفريد).
- **لا زر حذف** — فقط زر "تعطيل" يستدعي `deactivateCouncilMember`.
- **إظهار البريد** في نتائج البحث اختيارياً (يُقرأ سيرفر-سايد فقط، لا يُخزَّن في العميل).

### الصلاحيات (طبقة UI + server)
| الدور | يرى الشاشة | يضيف/يعدّل/يعطّل |
|-------|-----------|-------------------|
| `system_admin` | نعم | نعم |
| `admin` | نعم | نعم |
| `dean` | نعم | نعم (لمجالس ضمن نطاقه عبر `can_manage_council`) |
| باقي الأدوار | لا | لا |

يتم فرضها في `AdminShell` عبر `canAccessAdminRoute` + في كل server function عبر `assertAnyRole`، ثم على مستوى السطر عبر RLS الحالية.

---

## 4. server functions المقترحة (تنفّذ لاحقاً — لا تُنشأ الآن)

جميعها داخل `src/lib/admin-councils-membership.functions.ts`، تستخدم `requireSupabaseAuth` + `assertAnyRole(['system_admin','admin','dean'])`، ولا تستخدم `supabaseAdmin` للكتابة (لضمان سريان RLS وتسجيل `created_by = auth.uid()`).

| الوظيفة | Method | المدخلات | المخرجات | ملاحظات |
|---------|--------|---------|----------|---------|
| `searchAcademicUsersForCouncil` | POST | `{ query: string; councilId: string; limit?: number }` | `Array<{ user_id, employee_number, full_name_ar, full_name_en, department_id, email, rank }>` | ILIKE على `full_name_ar/en` + `employee_number`; بحث البريد عبر `auth.admin` بـ service role **داخل الهاندلر فقط** بعد التحقق من الدور. فلترة قسم إن كان `council_type='department'`. |
| `listCouncilMembers` | POST | `{ councilId: string; includeInactive?: boolean }` | `Array<Member>` مع اسم/رقم أكاديمي | JOIN مع `faculty_profiles`. |
| `addCouncilMember` | POST | `{ councilId, userId, memberRole }` | `{ id }` | يستخدم client المُصادَق (RLS تفرض `can_manage_council`). فحص عدم التكرار أولاً. `created_by = auth.uid()`. |
| `updateCouncilMemberRole` | POST | `{ memberId, newRole }` | `{ oldId, newId }` | تعطيل القديم + إدراج جديد ذرّياً (transaction عبر RPC). |
| `deactivateCouncilMember` | POST | `{ memberId }` | `{ ok: true }` | `UPDATE set is_active=false, active_to=CURRENT_DATE, updated_by=auth.uid()`. |

**بديل transaction:** إنشاء دالة SQL SECURITY DEFINER لاحقاً (`fn_replace_council_member_role`) بدل تنفيذ خطوتين من التطبيق — يُقرَّر في مرحلة الكتابة.

---

## 5. الأمان

- **لا `supabaseAdmin` في المتصفح** إطلاقاً (مطبق بالفعل عبر `client.server.ts`).
- الكتابة تمر بـ `requireSupabaseAuth` → `supabase` المُصادَق → RLS الحالية.
- `supabaseAdmin` يُستخدم فقط داخل `searchAcademicUsersForCouncil` لقراءة البريد من `auth.users`، وبعد `assertAnyRole` صارم.
- تسجيل `created_by`/`updated_by` مضمون بالسياسات (`created_by = auth.uid()`).
- لا حذف مباشر — فقط تعطيل.
- تنبيه UI عند تجاوز فلتر القسم لمجالس الأقسام (audit trail عبر `notes` اختياري).

---

## 6. المخاطر

| المخاطرة | الشدة | التخفيف |
|----------|-------|---------|
| ربط أكاديمي خطأ بمجلس قسم آخر | متوسطة | فلترة افتراضية + تنبيه صريح عند التجاوز |
| تكرار العضوية بأدوار متعددة (chair + member) | منخفضة | القيد الفريد يشمل `member_role`؛ فحص تطبيقي إضافي للعضوية النشطة |
| كشف بريد المستخدم لأدوار لا تحتاجه | منخفضة | قراءة البريد فقط عند الحاجة، وبعد فحص الدور |
| `can_manage_council` قد يحدّ صلاحية `dean` على مجالس أقسام غير تابعة له | منخفضة | التحقق من سلوك الدالة قبل عرض الشاشة للـ dean؛ في أسوأ الأحوال يقتصر الوصول الفعلي على system_admin/admin |
| فقدان السجل التاريخي عند تغيير الدور بحذف بدل تعطيل | متوسطة | التصميم يفرض `deactivate + insert` |
| البريد الحساس يمر عبر السيرفر — احتمال log عرضي | منخفضة | عدم تسجيله في أي console/log |

---

## 7. خطة التنفيذ اللاحقة (مرحلتان)

### المرحلة 1 — وظائف كتابة آمنة (`COUNCILS-MEMBERSHIP-WRITE-FUNCTIONS-01`)
- إنشاء `src/lib/admin-councils-membership.functions.ts` مع الخمس دوال أعلاه.
- (اختياري) دالة SQL `fn_replace_council_member_role` SECURITY DEFINER.
- اختبارات: أدوار مسموحة/ممنوعة، تكرار، تعطيل، بحث.
- لا UI بعد.

### المرحلة 2 — واجهة إدارة العضويات (`COUNCILS-MEMBERSHIP-ADMIN-UI-01`)
- تبويب جديد داخل `/admin/academic-councils`.
- مكوّنات: `CouncilPicker`, `MembersTable`, `AcademicUserSearch`, `AddMemberDialog`, `RoleChangeDialog`, `DeactivateConfirm`.
- ربط بـ TanStack Query.
- QA يدوي بأدوار: system_admin, admin, dean, faculty (مرفوض).

---

## 8. الإجابات المطلوبة

- **مصدر حسابات الأكاديميين:** `faculty_profiles` (+ `auth.users` للبريد).
- **user_id مؤكد لكل أكاديمي؟** 33/34.
- **رقم أكاديمي؟** نعم (`employee_number` UNIQUE, 34/34).
- **اسم؟** نعم (`full_name_ar` NOT NULL).
- **بريد؟** نعم على `auth.users` (يُقرأ سيرفر-سايد).
- **department_id؟** نعم (33/34).
- **schema الحالي كافٍ؟** نعم — لا تعديلات مطلوبة.
- **هل يمكن الآن كتابة عضويات آمنة من UI؟** لا — يلزم أولاً بناء server functions ثم UI (لا كتابة في هذه المرحلة إطلاقاً).

---

## القرار

**PASS** — التصميم مكتمل، schema كافٍ، مصدر البيانات جاهز.

**التوصية:** `READY_FOR_MEMBERSHIP_WRITE_FUNCTIONS` — الانتقال إلى المرحلة 1 (وظائف كتابة آمنة) عند موافقتك.
